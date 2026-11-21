import type { RetouchConfig, RetouchPreset } from '../types';

export const RETOUCH_PRESETS: Record<RetouchPreset, RetouchConfig> = {
  off: {
    preset: 'off',
    brightness: 0,
    skinSmooth: 0,
    clarity: 0,
    vibrance: 0,
  },
  studio: {
    preset: 'studio',
    brightness: 26,
    skinSmooth: 32,
    clarity: 28,
    vibrance: 22,
  },
  portrait: {
    preset: 'portrait',
    brightness: 34,
    skinSmooth: 54,
    clarity: 18,
    vibrance: 26,
  },
  crisp: {
    preset: 'crisp',
    brightness: 18,
    skinSmooth: 10,
    clarity: 50,
    vibrance: 32,
  },
};

export function isRetouchActive(retouch: RetouchConfig): boolean {
  return (
    retouch.brightness > 0 ||
    retouch.skinSmooth > 0 ||
    retouch.clarity > 0 ||
    retouch.vibrance > 0
  );
}

/**
 * Fast 2-pass separable box blur on RGB channels (small radius for skin smoothing + HD unsharp clarity).
 */
function smallRadiusBlurRGB(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray {
  const r = Math.max(1, Math.min(10, radius));
  const bufA = new Uint8ClampedArray(src.length);
  const bufB = new Uint8ClampedArray(src.length);
  bufA.set(src);

  for (let pass = 0; pass < 2; pass++) {
    // Horizontal sliding window
    const div = r + r + 1;
    const invDiv = 1 / div;
    const wm = width - 1;

    for (let y = 0; y < height; y++) {
      const rowOff = y * width * 4;
      let rSum = bufA[rowOff] * (r + 1);
      let gSum = bufA[rowOff + 1] * (r + 1);
      let bSum = bufA[rowOff + 2] * (r + 1);

      for (let i = 1; i <= r; i++) {
        const idx = rowOff + (i > wm ? wm : i) * 4;
        rSum += bufA[idx];
        gSum += bufA[idx + 1];
        bSum += bufA[idx + 2];
      }

      for (let x = 0; x < width; x++) {
        const outIdx = rowOff + x * 4;
        bufB[outIdx] = (rSum * invDiv + 0.5) | 0;
        bufB[outIdx + 1] = (gSum * invDiv + 0.5) | 0;
        bufB[outIdx + 2] = (bSum * invDiv + 0.5) | 0;
        bufB[outIdx + 3] = 255;

        const addX = x + r + 1;
        const subX = x - r;
        const addIdx = rowOff + (addX > wm ? wm : addX) * 4;
        const subIdx = rowOff + (subX < 0 ? 0 : subX) * 4;

        rSum += bufA[addIdx] - bufA[subIdx];
        gSum += bufA[addIdx + 1] - bufA[subIdx + 1];
        bSum += bufA[addIdx + 2] - bufA[subIdx + 2];
      }
    }

    // Vertical sliding window
    const hm = height - 1;
    const stride = width * 4;
    for (let x = 0; x < width; x++) {
      const colOff = x * 4;
      let rSum = bufB[colOff] * (r + 1);
      let gSum = bufB[colOff + 1] * (r + 1);
      let bSum = bufB[colOff + 2] * (r + 1);

      for (let i = 1; i <= r; i++) {
        const idx = (i > hm ? hm : i) * stride + colOff;
        rSum += bufB[idx];
        gSum += bufB[idx + 1];
        bSum += bufB[idx + 2];
      }

      for (let y = 0; y < height; y++) {
        const outIdx = y * stride + colOff;
        bufA[outIdx] = (rSum * invDiv + 0.5) | 0;
        bufA[outIdx + 1] = (gSum * invDiv + 0.5) | 0;
        bufA[outIdx + 2] = (bSum * invDiv + 0.5) | 0;
        bufA[outIdx + 3] = 255;

        const addY = y + r + 1;
        const subY = y - r;
        const addIdx = (addY > hm ? hm : addY) * stride + colOff;
        const subIdx = (subY < 0 ? 0 : subY) * stride + colOff;

        rSum += bufB[addIdx] - bufB[subIdx];
        gSum += bufB[addIdx + 1] - bufB[subIdx + 1];
        bSum += bufB[addIdx + 2] - bufB[subIdx + 2];
      }
    }
  }

  return bufA;
}

/**
 * Compute soft universal YCbCr skin-tone probability in [0..1]
 * (calibrated smoothly across fair, South Asian, brown, and deep skin tones).
 */
function computeSkinWeight(r: number, g: number, b: number): number {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  // Soft Gaussian-like window centered around Cb ~ 103, Cr ~ 152
  const dCb = (cb - 103) / 22;
  const dCr = (cr - 152) / 20;
  const distSq = dCb * dCb + dCr * dCr;
  if (distSq >= 3.2) return 0;

  // Avoid boosting pure blown-out white or deep black shadows as skin
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma < 28 || luma > 246) return 0;

  return Math.exp(-distSq * 1.15);
}

/**
 * Apply studio-grade portrait & photo enhancement ONLY to foreground subject pixels:
 * 1. Shadow-aware studio fill-light & balanced S-curve contrast (never clips white shirts/highlights)
 * 2. Skin-tone-aware edge-preserving polish (smooths skin grain while keeping eyes, eyebrows & hair razor sharp)
 * 3. Micro-contrast HD clarity on eyes, hair & clothing
 * 4. Natural skin-safe vibrance
 *
 * Returns a fresh RGBA buffer ready for compositing onto any background.
 */
export function applyStudioRetouch(
  original: Uint8ClampedArray,
  mask: Float32Array,
  width: number,
  height: number,
  retouch: RetouchConfig
): Uint8ClampedArray {
  if (!isRetouchActive(retouch)) {
    return original;
  }

  const out = new Uint8ClampedArray(original.length);
  const brightN = Math.max(0, Math.min(1, retouch.brightness / 100));
  const smoothN = Math.max(0, Math.min(1, retouch.skinSmooth / 100));
  const clarityN = Math.max(0, Math.min(1, retouch.clarity / 100));
  const vibN = Math.max(0, Math.min(1, retouch.vibrance / 100));

  // Precompute 256-entry studio tone LUT (shadow fill light + soft highlight roll-off + gentle contrast)
  const toneLUT = new Float32Array(256);
  const shadowLift = brightN * 0.24;
  const contrastBoost = 1 + brightN * 0.06 + clarityN * 0.10;
  for (let i = 0; i < 256; i++) {
    let v = i / 255;
    // Soft studio fill light lifting dark/midtone face shadows while protecting highlights
    v = v + shadowLift * Math.sin(v * Math.PI) * (1 - 0.42 * v);
    // Gentle studio contrast centered around 0.48
    v = (v - 0.48) * contrastBoost + 0.48;
    // Smooth highlight roll-off
    if (v > 0.92) {
      v = 0.92 + (v - 0.92) * 0.65;
    }
    toneLUT[i] = v < 0 ? 0 : v > 1 ? 255 : v * 255;
  }

  // Only compute small-radius blur when skinSmooth or clarity is active
  const needsBlur = smoothN > 0.01 || clarityN > 0.01;
  const blurRadius = Math.max(2, Math.min(8, Math.round(Math.min(width, height) * 0.0042)));
  const blurred = needsBlur ? smallRadiusBlurRGB(original, width, height, blurRadius) : null;

  // Bilateral edge threshold for preserving eyes/eyelashes/hair during skin smoothing
  const invTwoSigmaSq = 1 / (2 * 34 * 34);
  const totalPixels = width * height;

  for (let i = 0, p = 0; i < totalPixels; i++, p += 4) {
    // Skip pure background pixels completely for speed
    if (mask[i] <= 0.01) {
      out[p] = original[p];
      out[p + 1] = original[p + 1];
      out[p + 2] = original[p + 2];
      out[p + 3] = original[p + 3];
      continue;
    }

    const rawR = original[p];
    const rawG = original[p + 1];
    const rawB = original[p + 2];

    let r = rawR;
    let g = rawG;
    let b = rawB;

    const skinW = smoothN > 0.01 || vibN > 0.01 || brightN > 0.01 ? computeSkinWeight(rawR, rawG, rawB) : 0;

    // 1. Skin-aware edge-preserving smooth + HD clarity (shared single blur pass!)
    if (blurred) {
      const br = blurred[p];
      const bg = blurred[p + 1];
      const bb = blurred[p + 2];

      const diffR = rawR - br;
      const diffG = rawG - bg;
      const diffB = rawB - bb;
      const absDiff = Math.abs(diffR) + Math.abs(diffG) + Math.abs(diffB);
      const edgeKeep = Math.exp(-(absDiff * absDiff) * invTwoSigmaSq);

      if (smoothN > 0.01 && skinW > 0.02) {
        // Smooth flat skin imperfections while keeping eyes, eyebrows, hair & clothes 100% crisp
        const smoothBlend = skinW * edgeKeep * smoothN * 0.72;
        r = r + (br - r) * smoothBlend;
        g = g + (bg - g) * smoothBlend;
        b = b + (bb - b) * smoothBlend;
      }

      if (clarityN > 0.01) {
        // Sharpen eyes, hair, clothes & detail while avoiding amplifying skin pores
        const skinShield = 1 - skinW * edgeKeep * 0.78;
        const sharpGain = clarityN * 0.58 * skinShield;
        r += diffR * sharpGain;
        g += diffG * sharpGain;
        b += diffB * sharpGain;
      }
    }

    // 2. Shadow-aware studio fill-light & contrast via fast LUT + tiny healthy skin warmth
    if (brightN > 0.01 || clarityN > 0.01) {
      const ir = r < 0 ? 0 : r > 255 ? 255 : (r + 0.5) | 0;
      const ig = g < 0 ? 0 : g > 255 ? 255 : (g + 0.5) | 0;
      const ib = b < 0 ? 0 : b > 255 ? 255 : (b + 0.5) | 0;
      r = toneLUT[ir];
      g = toneLUT[ig];
      b = toneLUT[ib];

      if (skinW > 0.05 && brightN > 0.01) {
        // Subtle warm studio complexion lift (prevents cold indoor green/blue cast on faces)
        const skinLift = skinW * brightN;
        r += skinLift * 4.5;
        g += skinLift * 2.2;
      }
    }

    // 3. Skin-safe natural vibrance
    if (vibN > 0.01) {
      const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
      const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
      const sat = maxC > 1 ? (maxC - minC) / maxC : 0;
      const avg = (r + g + b) * 0.333333;
      const vibBoost = vibN * 0.44 * (1 - sat * 0.72) * (1 - skinW * 0.48);
      r += (r - avg) * vibBoost;
      g += (g - avg) * vibBoost;
      b += (b - avg) * vibBoost;
    }

    out[p] = r < 0 ? 0 : r > 255 ? 255 : (r + 0.5) | 0;
    out[p + 1] = g < 0 ? 0 : g > 255 ? 255 : (g + 0.5) | 0;
    out[p + 2] = b < 0 ? 0 : b > 255 ? 255 : (b + 0.5) | 0;
    out[p + 3] = original[p + 3];
  }

  return out;
}
