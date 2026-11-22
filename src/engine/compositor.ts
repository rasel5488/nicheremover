import type { BackgroundConfig } from '../types';
import { estimateDecontaminatedRGB } from './maskPostProcess';

/**
 * Parse a hex color string (#RRGGBB or #RGB) to [r, g, b].
 */
export function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  const num = parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(num)) return [29, 78, 216];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function getSolidColorRGB(bg: BackgroundConfig): [number, number, number] {
  switch (bg.type) {
    case 'white':
      return [255, 255, 255];
    case 'black':
      return [0, 0, 0];
    case 'studio-blue':
      return [29, 78, 216]; // #1D4ED8
    case 'custom':
      return parseHexColor(bg.customColor);
    default:
      return [0, 0, 0];
  }
}

/**
 * Compute exact Hermite smoothstep edge thresholds for Edge Refine t in [0, 1].
 * Default t = 0.32 => lowCut = 0.1296, highCut = 0.656
 */
export function getEdgeCutoffs(t: number): { lowCut: number; highCut: number } {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    lowCut: 0.04 + clamped * 0.28,
    highCut: 0.56 + clamped * 0.30,
  };
}

/**
 * Fast bilinear upsampling of a continuous float32 confidence mask from (srcW x srcH) to (dstW x dstH).
 * Preserves soft hair/fur probabilities strictly in [0.0, 1.0].
 */
export function bilinearResizeMask(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Float32Array {
  if (srcW === dstW && srcH === dstH) {
    const copy = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      copy[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return copy;
  }

  const dst = new Float32Array(dstW * dstH);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  const maxSrcX = srcW - 1;
  const maxSrcY = srcH - 1;

  // Precompute x interpolation tables for speed
  const x0Arr = new Int32Array(dstW);
  const x1Arr = new Int32Array(dstW);
  const wxArr = new Float32Array(dstW);
  for (let x = 0; x < dstW; x++) {
    const sx = (x + 0.5) * scaleX - 0.5;
    const clampedX = sx < 0 ? 0 : sx > maxSrcX ? maxSrcX : sx;
    const x0 = clampedX | 0;
    const x1 = x0 < maxSrcX ? x0 + 1 : maxSrcX;
    x0Arr[x] = x0;
    x1Arr[x] = x1;
    wxArr[x] = clampedX - x0;
  }

  for (let y = 0; y < dstH; y++) {
    const sy = (y + 0.5) * scaleY - 0.5;
    const clampedY = sy < 0 ? 0 : sy > maxSrcY ? maxSrcY : sy;
    const y0 = clampedY | 0;
    const y1 = y0 < maxSrcY ? y0 + 1 : maxSrcY;
    const wy = clampedY - y0;
    const invWy = 1 - wy;

    const row0 = y0 * srcW;
    const row1 = y1 * srcW;
    const dstRow = y * dstW;

    for (let x = 0; x < dstW; x++) {
      const x0 = x0Arr[x];
      const x1 = x1Arr[x];
      const wx = wxArr[x];
      const top = src[row0 + x0] * (1 - wx) + src[row0 + x1] * wx;
      const bot = src[row1 + x0] * (1 - wx) + src[row1 + x1] * wx;
      const val = top * invWy + bot * wy;
      dst[dstRow + x] = val < 0 ? 0 : val > 1 ? 1 : val;
    }
  }

  return dst;
}

/**
 * Fast O(N) 3-pass separable box blur approximating a smooth Gaussian DSLR bokeh.
 * Operates on RGB channels of an RGBA Uint8ClampedArray.
 */
export function computeDSLRBlur(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  customRadius?: number
): Uint8ClampedArray {
  const radius =
    customRadius ?? Math.max(6, Math.min(42, Math.round(Math.max(width, height) * 0.017)));

  const totalPixels = width * height;
  const bufA = new Uint8ClampedArray(totalPixels * 4);
  const bufB = new Uint8ClampedArray(totalPixels * 4);
  bufA.set(src);

  // 3 passes of separable horizontal + vertical sliding-window box blur => Gaussian approximation
  const passes = [radius, Math.max(4, Math.round(radius * 0.85)), Math.max(3, Math.round(radius * 0.7))];

  for (let p = 0; p < passes.length; p++) {
    const r = passes[p];
    boxBlurH(bufA, bufB, width, height, r);
    boxBlurV(bufB, bufA, width, height, r);
  }

  return bufA;
}

function boxBlurH(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  r: number
): void {
  const div = r + r + 1;
  const invDiv = 1 / div;
  const wm = w - 1;

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;

    // Left edge initialization
    const firstIdx = rowOffset;
    const fr = src[firstIdx];
    const fg = src[firstIdx + 1];
    const fb = src[firstIdx + 2];
    rSum = fr * (r + 1);
    gSum = fg * (r + 1);
    bSum = fb * (r + 1);

    for (let i = 1; i <= r; i++) {
      const ix = i > wm ? wm : i;
      const idx = rowOffset + ix * 4;
      rSum += src[idx];
      gSum += src[idx + 1];
      bSum += src[idx + 2];
    }

    for (let x = 0; x < w; x++) {
      const outIdx = rowOffset + x * 4;
      dst[outIdx] = (rSum * invDiv + 0.5) | 0;
      dst[outIdx + 1] = (gSum * invDiv + 0.5) | 0;
      dst[outIdx + 2] = (bSum * invDiv + 0.5) | 0;
      dst[outIdx + 3] = 255;

      const addX = x + r + 1;
      const subX = x - r;
      const addIdx = rowOffset + (addX > wm ? wm : addX) * 4;
      const subIdx = rowOffset + (subX < 0 ? 0 : subX) * 4;

      rSum += src[addIdx] - src[subIdx];
      gSum += src[addIdx + 1] - src[subIdx + 1];
      bSum += src[addIdx + 2] - src[subIdx + 2];
    }
  }
}

function boxBlurV(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  r: number
): void {
  const div = r + r + 1;
  const invDiv = 1 / div;
  const hm = h - 1;
  const stride = w * 4;

  for (let x = 0; x < w; x++) {
    const colOffset = x * 4;
    let rSum = src[colOffset] * (r + 1);
    let gSum = src[colOffset + 1] * (r + 1);
    let bSum = src[colOffset + 2] * (r + 1);

    for (let i = 1; i <= r; i++) {
      const iy = i > hm ? hm : i;
      const idx = iy * stride + colOffset;
      rSum += src[idx];
      gSum += src[idx + 1];
      bSum += src[idx + 2];
    }

    for (let y = 0; y < h; y++) {
      const outIdx = y * stride + colOffset;
      dst[outIdx] = (rSum * invDiv + 0.5) | 0;
      dst[outIdx + 1] = (gSum * invDiv + 0.5) | 0;
      dst[outIdx + 2] = (bSum * invDiv + 0.5) | 0;
      dst[outIdx + 3] = 255;

      const addY = y + r + 1;
      const subY = y - r;
      const addIdx = (addY > hm ? hm : addY) * stride + colOffset;
      const subIdx = (subY < 0 ? 0 : subY) * stride + colOffset;

      rSum += src[addIdx] - src[subIdx];
      gSum += src[addIdx + 1] - src[subIdx + 1];
      bSum += src[addIdx + 2] - src[subIdx + 2];
    }
  }
}

/**
 * Composite foreground pixels + continuous Float32 confidence mask into destination RGBA buffer
 * using Hermite Smoothstep Edge Feathering over the chosen background style.
 * Supports optional dirty rect (x0, y0, x1, y1 inclusive) for sub-millisecond interactive brushing.
 */
export function compositeRegion(params: {
  original: Uint8ClampedArray;
  mask: Float32Array;
  output: Uint8ClampedArray;
  width: number;
  height: number;
  edgeRefine: number;
  bgConfig: BackgroundConfig;
  defringe?: boolean;
  blurred?: Uint8ClampedArray | null;
  rect?: { x0: number; y0: number; x1: number; y1: number };
}): void {
  const {
    original,
    mask,
    output,
    width,
    height,
    edgeRefine,
    bgConfig,
    defringe = true,
    blurred,
    rect,
  } = params;

  const { lowCut, highCut } = getEdgeCutoffs(edgeRefine);
  const invRange = 1 / Math.max(1e-5, highCut - lowCut);

  const x0 = rect ? Math.max(0, rect.x0) : 0;
  const y0 = rect ? Math.max(0, rect.y0) : 0;
  const x1 = rect ? Math.min(width - 1, rect.x1) : width - 1;
  const y1 = rect ? Math.min(height - 1, rect.y1) : height - 1;

  const cleanRGB: [number, number, number] = [0, 0, 0];

  if (bgConfig.type === 'transparent') {
    for (let y = y0; y <= y1; y++) {
      let maskIdx = y * width + x0;
      let pxIdx = maskIdx * 4;
      for (let x = x0; x <= x1; x++, maskIdx++, pxIdx += 4) {
        const conf = mask[maskIdx];
        if (conf <= lowCut) {
          output[pxIdx] = 0;
          output[pxIdx + 1] = 0;
          output[pxIdx + 2] = 0;
          output[pxIdx + 3] = 0;
        } else if (conf >= highCut) {
          output[pxIdx] = original[pxIdx];
          output[pxIdx + 1] = original[pxIdx + 1];
          output[pxIdx + 2] = original[pxIdx + 2];
          output[pxIdx + 3] = 255;
        } else {
          const u = (conf - lowCut) * invRange;
          const alpha = u * u * (3 - 2 * u);
          if (defringe && alpha > 0.02 && alpha < 0.96) {
            estimateDecontaminatedRGB(
              original,
              mask,
              width,
              height,
              x,
              y,
              alpha,
              original[pxIdx],
              original[pxIdx + 1],
              original[pxIdx + 2],
              cleanRGB
            );
            output[pxIdx] = cleanRGB[0];
            output[pxIdx + 1] = cleanRGB[1];
            output[pxIdx + 2] = cleanRGB[2];
          } else {
            output[pxIdx] = original[pxIdx];
            output[pxIdx + 1] = original[pxIdx + 1];
            output[pxIdx + 2] = original[pxIdx + 2];
          }
          output[pxIdx + 3] = (alpha * 255 + 0.5) | 0;
        }
      }
    }
    return;
  }

  if (bgConfig.type === 'dslr-blur' && blurred) {
    for (let y = y0; y <= y1; y++) {
      let maskIdx = y * width + x0;
      let pxIdx = maskIdx * 4;
      for (let x = x0; x <= x1; x++, maskIdx++, pxIdx += 4) {
        const conf = mask[maskIdx];
        if (conf <= lowCut) {
          output[pxIdx] = blurred[pxIdx];
          output[pxIdx + 1] = blurred[pxIdx + 1];
          output[pxIdx + 2] = blurred[pxIdx + 2];
          output[pxIdx + 3] = 255;
        } else if (conf >= highCut) {
          output[pxIdx] = original[pxIdx];
          output[pxIdx + 1] = original[pxIdx + 1];
          output[pxIdx + 2] = original[pxIdx + 2];
          output[pxIdx + 3] = 255;
        } else {
          const u = (conf - lowCut) * invRange;
          const alpha = u * u * (3 - 2 * u);
          const invA = 1 - alpha;
          let fgR = original[pxIdx];
          let fgG = original[pxIdx + 1];
          let fgB = original[pxIdx + 2];
          if (defringe && alpha > 0.02 && alpha < 0.96) {
            estimateDecontaminatedRGB(
              original,
              mask,
              width,
              height,
              x,
              y,
              alpha,
              fgR,
              fgG,
              fgB,
              cleanRGB
            );
            fgR = cleanRGB[0];
            fgG = cleanRGB[1];
            fgB = cleanRGB[2];
          }
          output[pxIdx] = (fgR * alpha + blurred[pxIdx] * invA + 0.5) | 0;
          output[pxIdx + 1] = (fgG * alpha + blurred[pxIdx + 1] * invA + 0.5) | 0;
          output[pxIdx + 2] = (fgB * alpha + blurred[pxIdx + 2] * invA + 0.5) | 0;
          output[pxIdx + 3] = 255;
        }
      }
    }
    return;
  }

  // Solid color background (White, Black, Studio Blue, Custom)
  const [bgR, bgG, bgB] = getSolidColorRGB(bgConfig);
  for (let y = y0; y <= y1; y++) {
    let maskIdx = y * width + x0;
    let pxIdx = maskIdx * 4;
    for (let x = x0; x <= x1; x++, maskIdx++, pxIdx += 4) {
      const conf = mask[maskIdx];
      if (conf <= lowCut) {
        output[pxIdx] = bgR;
        output[pxIdx + 1] = bgG;
        output[pxIdx + 2] = bgB;
        output[pxIdx + 3] = 255;
      } else if (conf >= highCut) {
        output[pxIdx] = original[pxIdx];
        output[pxIdx + 1] = original[pxIdx + 1];
        output[pxIdx + 2] = original[pxIdx + 2];
        output[pxIdx + 3] = 255;
      } else {
        const u = (conf - lowCut) * invRange;
        const alpha = u * u * (3 - 2 * u);
        const invA = 1 - alpha;
        let fgR = original[pxIdx];
        let fgG = original[pxIdx + 1];
        let fgB = original[pxIdx + 2];
        if (defringe && alpha > 0.02 && alpha < 0.96) {
          estimateDecontaminatedRGB(
            original,
            mask,
            width,
            height,
            x,
            y,
            alpha,
            fgR,
            fgG,
            fgB,
            cleanRGB
          );
          fgR = cleanRGB[0];
          fgG = cleanRGB[1];
          fgB = cleanRGB[2];
        }
        output[pxIdx] = (fgR * alpha + bgR * invA + 0.5) | 0;
        output[pxIdx + 1] = (fgG * alpha + bgG * invA + 0.5) | 0;
        output[pxIdx + 2] = (fgB * alpha + bgB * invA + 0.5) | 0;
        output[pxIdx + 3] = 255;
      }
    }
  }
}

/**
 * Stamp a soft feathered radial brush stroke along a segment (x0,y0) -> (x1,y1)
 * onto the continuous Float32Array confidence mask.
 * - Inner radius = 68% of brush radius (full strength 1.0)
 * - Outer falloff (68% -> 100%) = Hermite smoothstep from 1.0 to 0.0
 * - Restore: mask[i] = max(cur, strength)
 * - Erase:   mask[i] = min(cur, 1 - strength)
 * Returns the affected integer bounding box { x0, y0, x1, y1 } for incremental canvas updates.
 */
export function paintBrushSegment(params: {
  mask: Float32Array;
  width: number;
  height: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  radius: number;
  mode: 'restore' | 'erase';
}): { x0: number; y0: number; x1: number; y1: number } | null {
  const { mask, width, height, x0, y0, x1, y1, radius, mode } = params;
  if (radius <= 0.5) return null;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(1, radius * 0.18);
  const steps = Math.max(1, Math.ceil(dist / step));

  const rOuter = radius;
  const rInner = radius * 0.72;
  const rOuterSq = rOuter * rOuter;
  const rInnerSq = rInner * rInner;
  const invFalloff = 1 / Math.max(1e-5, rOuter - rInner);

  let dirtyMinX = width;
  let dirtyMinY = height;
  let dirtyMaxX = -1;
  let dirtyMaxY = -1;

  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const cx = x0 + dx * t;
    const cy = y0 + dy * t;

    const minX = Math.max(0, Math.floor(cx - rOuter));
    const maxX = Math.min(width - 1, Math.ceil(cx + rOuter));
    const minY = Math.max(0, Math.floor(cy - rOuter));
    const maxY = Math.min(height - 1, Math.ceil(cy + rOuter));

    if (minX > maxX || minY > maxY) continue;

    if (minX < dirtyMinX) dirtyMinX = minX;
    if (minY < dirtyMinY) dirtyMinY = minY;
    if (maxX > dirtyMaxX) dirtyMaxX = maxX;
    if (maxY > dirtyMaxY) dirtyMaxY = maxY;

    for (let y = minY; y <= maxY; y++) {
      const py = y - cy;
      const pySq = py * py;
      const rowOff = y * width;

      for (let x = minX; x <= maxX; x++) {
        const px = x - cx;
        const dSq = px * px + pySq;
        if (dSq >= rOuterSq) continue;

        let strength: number;
        if (dSq <= rInnerSq) {
          strength = 1.0;
        } else {
          const d = Math.sqrt(dSq);
          const u = (d - rInner) * invFalloff;
          strength = 1.0 - u * u * (3 - 2 * u);
        }

        const idx = rowOff + x;
        const cur = mask[idx];
        if (mode === 'restore') {
          if (strength > cur) mask[idx] = strength;
        } else {
          const target = 1.0 - strength;
          if (target < cur) mask[idx] = target;
        }
      }
    }
  }

  if (dirtyMaxX < dirtyMinX || dirtyMaxY < dirtyMinY) return null;
  return { x0: dirtyMinX, y0: dirtyMinY, x1: dirtyMaxX, y1: dirtyMaxY };
}

/**
 * Render an ImageData (Uint8ClampedArray) to a lossless PNG Blob and a lightweight thumbnail Blob.
 */
export async function renderBlobsFromRGBA(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  thumbMaxDim = 480
): Promise<{ pngBlob: Blob; thumbBlob: Blob }> {
  // Full HD lossless PNG
  let pngBlob: Blob;
  let thumbBlob: Blob;

  if (typeof OffscreenCanvas !== 'undefined') {
    const fullCanvas = new OffscreenCanvas(width, height);
    const fullCtx = fullCanvas.getContext('2d')!;
    const imgData = new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.byteLength), width, height);
    fullCtx.putImageData(imgData, 0, 0);
    pngBlob = await fullCanvas.convertToBlob({ type: 'image/png' });

    const scale = Math.min(1, thumbMaxDim / Math.max(width, height));
    const tw = Math.max(1, Math.round(width * scale));
    const th = Math.max(1, Math.round(height * scale));
    const thumbCanvas = new OffscreenCanvas(tw, th);
    const thumbCtx = thumbCanvas.getContext('2d')!;
    thumbCtx.imageSmoothingEnabled = true;
    thumbCtx.imageSmoothingQuality = 'high';
    thumbCtx.drawImage(fullCanvas, 0, 0, tw, th);
    // Use webp for super-tiny thumbnail memory footprint (with png fallback)
    try {
      thumbBlob = await thumbCanvas.convertToBlob({ type: 'image/webp', quality: 0.86 });
    } catch {
      thumbBlob = await thumbCanvas.convertToBlob({ type: 'image/png' });
    }
  } else {
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = width;
    fullCanvas.height = height;
    const fullCtx = fullCanvas.getContext('2d')!;
    const imgData = new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.byteLength), width, height);
    fullCtx.putImageData(imgData, 0, 0);
    pngBlob = await canvasToBlob(fullCanvas, 'image/png');

    const scale = Math.min(1, thumbMaxDim / Math.max(width, height));
    const tw = Math.max(1, Math.round(width * scale));
    const th = Math.max(1, Math.round(height * scale));
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = tw;
    thumbCanvas.height = th;
    const thumbCtx = thumbCanvas.getContext('2d')!;
    thumbCtx.imageSmoothingEnabled = true;
    thumbCtx.imageSmoothingQuality = 'high';
    thumbCtx.drawImage(fullCanvas, 0, 0, tw, th);
    thumbBlob = await canvasToBlob(thumbCanvas, 'image/webp', 0.86);
  }

  return { pngBlob, thumbBlob };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode canvas blob'));
      },
      type,
      quality
    );
  });
}
