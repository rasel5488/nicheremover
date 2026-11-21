export type BackgroundStyleType =
  | 'transparent'
  | 'white'
  | 'black'
  | 'studio-blue'
  | 'custom'
  | 'dslr-blur';

export interface BackgroundConfig {
  type: BackgroundStyleType;
  customColor: string; // Hex string e.g. '#16C784'
}

export type RetouchPreset = 'off' | 'studio' | 'portrait' | 'crisp';

export interface RetouchConfig {
  preset: RetouchPreset;
  brightness: number; // 0..100
  skinSmooth: number; // 0..100
  clarity: number; // 0..100
  vibrance: number; // 0..100
}

export type ItemStatus = 'queued' | 'processing' | 'done' | 'error' | 'cancelled';

export type ToolMode = 'pan' | 'restore' | 'erase';

export interface QueueItem {
  id: string;
  name: string;
  baseName: string;
  sizeBytes: number;
  width: number;
  height: number;
  status: ItemStatus;
  error?: string;
  /** Lightweight preview ObjectURL (original preview before done, composited thumbnail after done) */
  previewUrl: string;
  /** Applied settings snapshot for this item */
  edgeRefine: number;
  defringe: boolean;
  bgConfig: BackgroundConfig;
  retouch: RetouchConfig;
  /** True if user manually touched up the confidence mask */
  hasManualEdits: boolean;
  /** Processing duration in milliseconds */
  durationMs?: number;
}

export interface EngineInfo {
  status: 'idle' | 'loading' | 'ready' | 'error';
  backend: 'webgpu' | 'wasm' | null;
  loadProgress: number; // 0..100
  loadMessage: string;
  error?: string;
}

export interface HydratedImageData {
  id: string;
  width: number;
  height: number;
  originalData: Uint8ClampedArray;
  mask: Float32Array;
  retouchedData: Uint8ClampedArray;
  blurredData: Uint8ClampedArray | null;
}

export interface UndoPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  prevMask: Float32Array;
}

export interface ToastMessage {
  id: string;
  text: string;
  kind: 'info' | 'success' | 'error';
}

export const DEFAULT_EDGE_REFINE = 0.32;
export const DEFAULT_DEFRINGE = true;

export const DEFAULT_BG_CONFIG: BackgroundConfig = {
  type: 'transparent',
  customColor: '#10B981',
};

export const DEFAULT_RETOUCH_CONFIG: RetouchConfig = {
  preset: 'studio',
  brightness: 26,
  skinSmooth: 32,
  clarity: 28,
  vibrance: 22,
};

export const MAX_IMAGE_DIMENSION = 3072;
export const THUMBNAIL_MAX_DIMENSION = 480;
export const MAX_UNDO_STEPS = 8;
