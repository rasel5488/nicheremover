import {
  compositeRegion,
  computeDSLRBlur,
  renderBlobsFromRGBA,
} from './compositor';
import { applyStudioRetouch } from './photoRetouch';
import {
  clearAllStoredImages,
  compressMask,
  decodeBlobToRGBA,
  decompressMask,
  deleteStoredImage,
  getStoredImage,
  putStoredImage,
} from './storage';
import {
  DEFAULT_RETOUCH_CONFIG,
  THUMBNAIL_MAX_DIMENSION,
  type BackgroundConfig,
  type EngineInfo,
  type HydratedImageData,
  type RetouchConfig,
} from '../types';

export interface WorkerDonePayload {
  id: string;
  width: number;
  height: number;
  thumbBlob: Blob;
  durationMs: number;
  edgeRefine: number;
  defringe: boolean;
  bgConfig: BackgroundConfig;
  retouch: RetouchConfig;
}

export interface QueueCallbacks {
  onEngineUpdate: (info: EngineInfo) => void;
  onItemStart: (id: string) => void;
  onItemDone: (payload: WorkerDonePayload) => void;
  onItemError: (id: string, error: string) => void;
}

interface PendingTask {
  id: string;
  file: File;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
  currentId: string | null;
}

export function detectIsMobile(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const touchMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const narrowTouch = window.innerWidth <= 820 && navigator.maxTouchPoints > 1;
  return touchMobile || narrowTouch;
}

/**
 * Memory-safe Batch Queue Manager:
 * - Processes 1 to 100+ HD photos sequentially inside a dedicated Web Worker (zero OOM, zero UI lag)
 * - Stores compressed masks + HD PNGs in IndexedDB; hydrates full Float32Array only for the open Studio photo
 */
export class SegmentationQueueManager {
  private slots: WorkerSlot[] = [];
  private queue: PendingTask[] = [];
  private paused = false;
  private isMobile: boolean;
  private callbacks: QueueCallbacks;
  private globalEdgeRefine: number;
  private globalDefringe: boolean;
  private globalBgConfig: BackgroundConfig;
  private globalRetouch: RetouchConfig;

  constructor(
    callbacks: QueueCallbacks,
    initialEdgeRefine: number,
    initialDefringe: boolean,
    initialBgConfig: BackgroundConfig,
    initialRetouch: RetouchConfig
  ) {
    this.callbacks = callbacks;
    this.globalEdgeRefine = initialEdgeRefine;
    this.globalDefringe = initialDefringe;
    this.globalBgConfig = { ...initialBgConfig };
    this.globalRetouch = { ...initialRetouch };
    this.isMobile = detectIsMobile();
  }

  public setGlobalSettings(
    edgeRefine: number,
    defringe: boolean,
    bgConfig: BackgroundConfig,
    retouch: RetouchConfig
  ): void {
    this.globalEdgeRefine = edgeRefine;
    this.globalDefringe = defringe;
    this.globalBgConfig = { ...bgConfig };
    this.globalRetouch = { ...retouch };
  }

  private spawnWorker(): WorkerSlot {
    const worker = new Worker(
      new URL('../workers/segmentation.worker.ts', import.meta.url),
      { type: 'module' }
    );
    const slot: WorkerSlot = { worker, busy: false, currentId: null };

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'model-status') {
        this.callbacks.onEngineUpdate({
          status: msg.status,
          backend: msg.backend ?? null,
          loadProgress: typeof msg.progress === 'number' ? msg.progress : 0,
          loadMessage: msg.message || '',
          error: msg.error,
        });
        return;
      }

      if (msg.type === 'process-done') {
        slot.busy = false;
        slot.currentId = null;
        this.callbacks.onItemDone({
          id: msg.id,
          width: msg.width,
          height: msg.height,
          thumbBlob: msg.thumbBlob,
          durationMs: msg.durationMs,
          edgeRefine: msg.edgeRefine,
          defringe: msg.defringe ?? true,
          bgConfig: msg.bgConfig,
          retouch: msg.retouch ?? { ...DEFAULT_RETOUCH_CONFIG },
        });
        this.pump();
        return;
      }

      if (msg.type === 'process-error') {
        slot.busy = false;
        slot.currentId = null;
        this.callbacks.onItemError(msg.id, msg.error || 'Processing failed');
        this.pump();
      }
    };

    worker.onerror = (err) => {
      const failedId = slot.currentId;
      slot.busy = false;
      slot.currentId = null;
      if (failedId) {
        this.callbacks.onItemError(failedId, err.message || 'Worker runtime error');
      }
      this.pump();
    };

    this.slots.push(slot);
    worker.postMessage({ type: 'init', isMobile: this.isMobile });
    return slot;
  }

  public enqueue(tasks: Array<{ id: string; file: File }>): void {
    if (tasks.length === 0) return;
    if (this.slots.length === 0) {
      this.spawnWorker();
    }
    this.queue.push(...tasks);
    this.pump();
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
    this.pump();
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public cancelPending(): string[] {
    const cancelledIds = this.queue.map((t) => t.id);
    this.queue = [];
    this.paused = false;
    return cancelledIds;
  }

  public removeFromQueue(id: string): void {
    this.queue = this.queue.filter((t) => t.id !== id);
    void deleteStoredImage(id);
  }

  public async clearAll(): Promise<void> {
    this.queue = [];
    this.paused = false;
    await clearAllStoredImages();
  }

  public dispose(): void {
    this.queue = [];
    for (const slot of this.slots) {
      slot.worker.terminate();
    }
    this.slots = [];
  }

  private pump(): void {
    if (this.paused || this.queue.length === 0) return;

    for (const slot of this.slots) {
      if (slot.busy) continue;
      const next = this.queue.shift();
      if (!next) break;

      slot.busy = true;
      slot.currentId = next.id;
      this.callbacks.onItemStart(next.id);
      slot.worker.postMessage({
        type: 'process',
        id: next.id,
        blob: next.file,
        edgeRefine: this.globalEdgeRefine,
        defringe: this.globalDefringe,
        bgConfig: { ...this.globalBgConfig },
        retouch: { ...this.globalRetouch },
      });
    }
  }
}

export async function hydrateImageForStudio(id: string): Promise<HydratedImageData | null> {
  const rec = await getStoredImage(id);
  if (!rec) return null;

  const originalData = await decodeBlobToRGBA(rec.originalBlob, rec.width, rec.height);
  const mask = decompressMask(rec.compressedMask, rec.width * rec.height);
  const retouch = rec.retouch ?? { ...DEFAULT_RETOUCH_CONFIG };
  const retouchedData = applyStudioRetouch(originalData, mask, rec.width, rec.height, retouch);

  return {
    id: rec.id,
    width: rec.width,
    height: rec.height,
    originalData,
    mask,
    retouchedData,
    blurredData: null,
  };
}

export async function persistStudioChanges(params: {
  id: string;
  width: number;
  height: number;
  originalData: Uint8ClampedArray;
  mask: Float32Array;
  retouchedData: Uint8ClampedArray;
  blurredData: Uint8ClampedArray | null;
  edgeRefine: number;
  defringe: boolean;
  bgConfig: BackgroundConfig;
  retouch: RetouchConfig;
  maskModified: boolean;
}): Promise<{ pngBlob: Blob; thumbBlob: Blob }> {
  const {
    id,
    width,
    height,
    originalData,
    mask,
    retouchedData,
    edgeRefine,
    defringe,
    bgConfig,
    retouch,
    maskModified,
  } = params;
  const rec = await getStoredImage(id);
  if (!rec) {
    throw new Error('Cached image record not found');
  }

  const blurred =
    bgConfig.type === 'dslr-blur'
      ? params.blurredData ?? computeDSLRBlur(originalData, width, height)
      : null;

  const composited = new Uint8ClampedArray(width * height * 4);
  compositeRegion({
    original: retouchedData,
    mask,
    output: composited,
    width,
    height,
    edgeRefine,
    bgConfig,
    defringe,
    blurred,
  });

  const { pngBlob, thumbBlob } = await renderBlobsFromRGBA(
    composited,
    width,
    height,
    THUMBNAIL_MAX_DIMENSION
  );

  const compressedMask = maskModified ? compressMask(mask) : rec.compressedMask;

  await putStoredImage({
    ...rec,
    compressedMask,
    outputBlob: pngBlob,
    edgeRefine,
    defringe,
    bgConfig: { ...bgConfig },
    retouch: { ...retouch },
  });

  return { pngBlob, thumbBlob };
}

export async function recompositeStoredImage(
  id: string,
  edgeRefine: number,
  defringe: boolean,
  bgConfig: BackgroundConfig,
  retouch: RetouchConfig
): Promise<{ thumbBlob: Blob } | null> {
  const rec = await getStoredImage(id);
  if (!rec) return null;

  const originalData = await decodeBlobToRGBA(rec.originalBlob, rec.width, rec.height);
  const mask = decompressMask(rec.compressedMask, rec.width * rec.height);
  const retouched = applyStudioRetouch(originalData, mask, rec.width, rec.height, retouch);
  const blurred =
    bgConfig.type === 'dslr-blur' ? computeDSLRBlur(originalData, rec.width, rec.height) : null;

  const composited = new Uint8ClampedArray(rec.width * rec.height * 4);
  compositeRegion({
    original: retouched,
    mask,
    output: composited,
    width: rec.width,
    height: rec.height,
    edgeRefine,
    bgConfig,
    defringe,
    blurred,
  });

  const { pngBlob, thumbBlob } = await renderBlobsFromRGBA(
    composited,
    rec.width,
    rec.height,
    THUMBNAIL_MAX_DIMENSION
  );

  await putStoredImage({
    ...rec,
    outputBlob: pngBlob,
    edgeRefine,
    defringe,
    bgConfig: { ...bgConfig },
    retouch: { ...retouch },
  });

  return { thumbBlob };
}

export async function getExportPngBlob(id: string): Promise<Blob | null> {
  const rec = await getStoredImage(id);
  return rec?.outputBlob ?? null;
}
