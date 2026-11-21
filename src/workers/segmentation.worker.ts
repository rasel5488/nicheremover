/// <reference lib="webworker" />

import { AutoModel, env, Tensor } from '@huggingface/transformers';
import {
  bilinearResizeMask,
  compositeRegion,
  computeDSLRBlur,
  renderBlobsFromRGBA,
} from '../engine/compositor';
import { cleanupConfidenceMask } from '../engine/maskPostProcess';
import { applyStudioRetouch } from '../engine/photoRetouch';
import { compressMask, putStoredImage } from '../engine/storage';
import {
  MAX_IMAGE_DIMENSION,
  THUMBNAIL_MAX_DIMENSION,
  type BackgroundConfig,
  type RetouchConfig,
} from '../types';

const MODEL_ID = 'briaai/RMBG-1.4';
const MODEL_INPUT_SIZE = 1024;

// Cache model weights permanently in browser Cache Storage & enable safe WASM multithreading
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends?.onnx?.wasm) {
  const canMultiThread = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  env.backends.onnx.wasm.numThreads = canMultiThread
    ? Math.min(4, Math.max(1, (self.navigator?.hardwareConcurrency || 2) - 1))
    : 1;
}

type InitMessage = {
  type: 'init';
  isMobile: boolean;
};

type ProcessMessage = {
  type: 'process';
  id: string;
  blob: Blob;
  edgeRefine: number;
  defringe: boolean;
  bgConfig: BackgroundConfig;
  retouch: RetouchConfig;
};

type WorkerInMessage = InitMessage | ProcessMessage;

interface LoadedSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  backend: 'webgpu' | 'wasm';
  dtype: string;
}

let session: LoadedSession | null = null;
let loadingPromise: Promise<LoadedSession> | null = null;
let workerIsMobile = false;

function post(msg: unknown) {
  self.postMessage(msg);
}

async function detectWebGPU(): Promise<{ available: boolean; hasF16: boolean }> {
  try {
    const nav = self.navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<{ features?: Set<string> } | null> };
    };
    if (!nav?.gpu) return { available: false, hasF16: false };
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return { available: false, hasF16: false };
    const hasF16 = Boolean(adapter.features?.has?.('shader-f16'));
    return { available: true, hasF16 };
  } catch {
    return { available: false, hasF16: false };
  }
}

async function disposeCurrentSession() {
  if (!session) return;
  try {
    if (typeof session.model?.dispose === 'function') {
      await session.model.dispose();
    }
  } catch {
    // ignore
  }
  session = null;
}

async function loadModelWithStrategy(
  backend: 'webgpu' | 'wasm',
  dtype: 'fp16' | 'fp32' | 'q8'
): Promise<LoadedSession> {
  post({
    type: 'model-status',
    status: 'loading',
    backend,
    progress: 3,
    message: 'Initializing HD engine…',
  });

  const fileProgress = new Map<string, { loaded: number; total: number }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = await AutoModel.from_pretrained(MODEL_ID, {
    config: { model_type: 'custom' } as Record<string, unknown>,
    device: backend,
    dtype,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    progress_callback: (info: any) => {
      if (!info) return;
      if (info.status === 'progress' || info.status === 'download') {
        const key = String(info.file || 'model');
        if (typeof info.loaded === 'number' && typeof info.total === 'number' && info.total > 0) {
          fileProgress.set(key, { loaded: info.loaded, total: info.total });
          let sumLoaded = 0;
          let sumTotal = 0;
          for (const entry of fileProgress.values()) {
            sumLoaded += entry.loaded;
            sumTotal += entry.total;
          }
          const pct = Math.min(99, Math.max(3, Math.round((sumLoaded / sumTotal) * 100)));
          const mbLoaded = (sumLoaded / (1024 * 1024)).toFixed(1);
          const mbTotal = (sumTotal / (1024 * 1024)).toFixed(1);
          post({
            type: 'model-status',
            status: 'loading',
            backend,
            progress: pct,
            message: `Loading HD engine (${mbLoaded} / ${mbTotal} MB)…`,
          });
        } else if (typeof info.progress === 'number') {
          post({
            type: 'model-status',
            status: 'loading',
            backend,
            progress: Math.min(99, Math.max(3, Math.round(info.progress))),
            message: 'Loading HD engine…',
          });
        }
      } else if (info.status === 'ready') {
        post({
          type: 'model-status',
          status: 'loading',
          backend,
          progress: 99,
          message: 'Starting HD engine…',
        });
      }
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  return { model, backend, dtype };
}

async function ensureModel(isMobile: boolean, forceWasm = false): Promise<LoadedSession> {
  if (session && (!forceWasm || session.backend === 'wasm')) {
    return session;
  }
  if (loadingPromise && !forceWasm) {
    return loadingPromise;
  }
  if (session && forceWasm) {
    await disposeCurrentSession();
  }

  loadingPromise = (async () => {
    const gpu = forceWasm || isMobile ? { available: false, hasF16: false } : await detectWebGPU();

    const strategies: Array<{ backend: 'webgpu' | 'wasm'; dtype: 'fp16' | 'fp32' | 'q8' }> = [];
    if (gpu.available) {
      if (gpu.hasF16) {
        strategies.push({ backend: 'webgpu', dtype: 'fp16' });
      }
      strategies.push({ backend: 'webgpu', dtype: 'fp32' });
      strategies.push({ backend: 'wasm', dtype: 'q8' });
    } else {
      strategies.push({ backend: 'wasm', dtype: 'q8' });
      strategies.push({ backend: 'wasm', dtype: 'fp32' });
    }

    let lastError: unknown = null;
    for (const strat of strategies) {
      try {
        const loaded = await loadModelWithStrategy(strat.backend, strat.dtype);
        session = loaded;
        post({
          type: 'model-status',
          status: 'ready',
          backend: loaded.backend,
          progress: 100,
          message: 'Ready',
        });
        return loaded;
      } catch (err) {
        lastError = err;
        console.warn(
          `[Niche Remover] Engine ${strat.backend}/${strat.dtype} failed, trying fallback:`,
          err
        );
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Failed to initialize engine';
    post({
      type: 'model-status',
      status: 'error',
      backend: null,
      progress: 0,
      message,
      error: message,
    });
    throw new Error(message);
  })();

  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

async function decodeOrientedHD(blob: Blob): Promise<{
  width: number;
  height: number;
  originalData: Uint8ClampedArray;
  originalBlob: Blob;
  modelInputData: Uint8ClampedArray;
}> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const maxSide = Math.max(width, height);
    if (maxSide > MAX_IMAGE_DIMENSION) {
      const scale = MAX_IMAGE_DIMENSION / maxSide;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const hdCanvas = new OffscreenCanvas(width, height);
    const hdCtx = hdCanvas.getContext('2d', { willReadFrequently: true })!;
    hdCtx.imageSmoothingEnabled = true;
    hdCtx.imageSmoothingQuality = 'high';
    hdCtx.drawImage(bitmap, 0, 0, width, height);
    const originalData = hdCtx.getImageData(0, 0, width, height).data;

    let originalBlob: Blob;
    try {
      originalBlob = await hdCanvas.convertToBlob({ type: 'image/webp', quality: 0.96 });
    } catch {
      originalBlob = await hdCanvas.convertToBlob({ type: 'image/png' });
    }

    const inCanvas = new OffscreenCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const inCtx = inCanvas.getContext('2d', { willReadFrequently: true })!;
    inCtx.imageSmoothingEnabled = true;
    inCtx.imageSmoothingQuality = 'high';
    inCtx.drawImage(hdCanvas, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const modelInputData = inCtx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE).data;

    return { width, height, originalData, originalBlob, modelInputData };
  } finally {
    bitmap.close();
  }
}

async function runInference(
  currentSession: LoadedSession,
  rgba1024: Uint8ClampedArray
): Promise<{ mask: Float32Array; width: number; height: number }> {
  const planeSize = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const chw = new Float32Array(3 * planeSize);
  const inv255 = 1 / 255;

  // RMBG-1.4 exact normalization: pixel / 255.0 - 0.5
  for (let i = 0, p = 0; i < planeSize; i++, p += 4) {
    chw[i] = rgba1024[p] * inv255 - 0.5;
    chw[planeSize + i] = rgba1024[p + 1] * inv255 - 0.5;
    chw[2 * planeSize + i] = rgba1024[p + 2] * inv255 - 0.5;
  }

  const inputTensor = new Tensor('float32', chw, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outputs: Record<string, any> = await currentSession.model({ input: inputTensor });
  const outTensor = outputs.output ?? Object.values(outputs)[0];
  if (!outTensor || !outTensor.data) {
    throw new Error('Empty segmentation output');
  }

  const dims: number[] = Array.isArray(outTensor.dims) ? outTensor.dims : [];
  const outH = dims.length >= 2 ? dims[dims.length - 2] : MODEL_INPUT_SIZE;
  const outW = dims.length >= 1 ? dims[dims.length - 1] : MODEL_INPUT_SIZE;
  const raw = outTensor.data as Float32Array | Float64Array | Uint16Array | number[];
  const len = outW * outH;

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < len; i++) {
    const v = Number(raw[i]);
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }

  const rawMask = new Float32Array(len);
  const isLogits = minVal < -0.05 || maxVal > 1.05;
  if (isLogits) {
    for (let i = 0; i < len; i++) {
      const v = Number(raw[i]);
      rawMask[i] = 1 / (1 + Math.exp(-v));
    }
  } else {
    for (let i = 0; i < len; i++) {
      const v = Number(raw[i]);
      rawMask[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }

  try {
    if (typeof (inputTensor as unknown as { dispose?: () => void }).dispose === 'function') {
      (inputTensor as unknown as { dispose: () => void }).dispose();
    }
    for (const tensor of Object.values(outputs)) {
      if (tensor && typeof tensor.dispose === 'function') {
        tensor.dispose();
      }
    }
  } catch {
    // ignore
  }

  // Strip faint haze & detached leftover background specks cleanly
  const cleanedMask = cleanupConfidenceMask(rawMask, outW, outH);
  return { mask: cleanedMask, width: outW, height: outH };
}

async function handleProcess(msg: ProcessMessage) {
  const startTime = performance.now();
  try {
    let activeSession = await ensureModel(workerIsMobile);

    const { width, height, originalData, originalBlob, modelInputData } = await decodeOrientedHD(
      msg.blob
    );

    let rawResult: { mask: Float32Array; width: number; height: number };
    try {
      rawResult = await runInference(activeSession, modelInputData);
    } catch (err) {
      if (activeSession.backend === 'webgpu') {
        console.warn('[Niche Remover] WebGPU inference failed, retrying on WASM Q8:', err);
        activeSession = await ensureModel(workerIsMobile, true);
        rawResult = await runInference(activeSession, modelInputData);
      } else {
        throw err;
      }
    }

    const fullMask = bilinearResizeMask(
      rawResult.mask,
      rawResult.width,
      rawResult.height,
      width,
      height
    );

    // Apply Studio Retouch strictly to foreground pixels
    const retouched = applyStudioRetouch(originalData, fullMask, width, height, msg.retouch);

    const blurred =
      msg.bgConfig.type === 'dslr-blur' ? computeDSLRBlur(originalData, width, height) : null;

    const composited = new Uint8ClampedArray(width * height * 4);
    compositeRegion({
      original: retouched,
      mask: fullMask,
      output: composited,
      width,
      height,
      edgeRefine: msg.edgeRefine,
      bgConfig: msg.bgConfig,
      defringe: msg.defringe,
      blurred,
    });

    const { pngBlob, thumbBlob } = await renderBlobsFromRGBA(
      composited,
      width,
      height,
      THUMBNAIL_MAX_DIMENSION
    );

    const compressedMask = compressMask(fullMask);

    await putStoredImage({
      id: msg.id,
      width,
      height,
      originalBlob,
      compressedMask,
      outputBlob: pngBlob,
      edgeRefine: msg.edgeRefine,
      defringe: msg.defringe,
      bgConfig: msg.bgConfig,
      retouch: msg.retouch,
    });

    const durationMs = Math.round(performance.now() - startTime);

    post({
      type: 'process-done',
      id: msg.id,
      width,
      height,
      thumbBlob,
      durationMs,
      edgeRefine: msg.edgeRefine,
      defringe: msg.defringe,
      bgConfig: msg.bgConfig,
      retouch: msg.retouch,
    });
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    post({
      type: 'process-error',
      id: msg.id,
      error: errorText,
    });
  }
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'init') {
    workerIsMobile = msg.isMobile;
    void ensureModel(msg.isMobile);
    return;
  }

  if (msg.type === 'process') {
    void handleProcess(msg);
  }
};
