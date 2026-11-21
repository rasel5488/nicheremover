import { zlibSync, unzlibSync } from 'fflate';
import type { BackgroundConfig, RetouchConfig } from '../types';

const DB_NAME = 'niche-remover-cache-v1';
const STORE_NAME = 'images';
const DB_VERSION = 1;

export interface StoredImageRecord {
  id: string;
  width: number;
  height: number;
  /** Original EXIF-oriented HD image (up to 3072px) stored as compact blob */
  originalBlob: Blob;
  /** Deflate-compressed Uint16Array continuous confidence mask (0..65535 -> 0.0..1.0) */
  compressedMask: Uint8Array;
  /** Rendered Full HD output PNG Blob for instant download / ZIP export */
  outputBlob: Blob;
  /** Edge refine value used to produce outputBlob */
  edgeRefine: number;
  /** Anti-halo color decontamination flag */
  defringe: boolean;
  /** Background config used to produce outputBlob */
  bgConfig: BackgroundConfig;
  /** Studio retouch config used to produce outputBlob */
  retouch: RetouchConfig;
}

/**
 * Compress a Float32Array [0..1] continuous confidence mask into a compact Uint8Array
 * via 16-bit quantization (65,535 levels = 0.000015 precision) + fast level-1 zlib.
 */
export function compressMask(mask: Float32Array): Uint8Array {
  const u16 = new Uint16Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    u16[i] = v <= 0 ? 0 : v >= 1 ? 65535 : (v * 65535 + 0.5) | 0;
  }
  const rawBytes = new Uint8Array(u16.buffer, u16.byteOffset, u16.byteLength);
  return zlibSync(rawBytes, { level: 1 });
}

/**
 * Decompress a stored mask back into a continuous Float32Array [0.0..1.0].
 */
export function decompressMask(compressed: Uint8Array, expectedLength: number): Float32Array {
  const rawBytes = unzlibSync(compressed);
  const aligned = new ArrayBuffer(rawBytes.byteLength);
  new Uint8Array(aligned).set(rawBytes);
  const u16 = new Uint16Array(aligned);
  const len = Math.min(u16.length, expectedLength);
  const out = new Float32Array(expectedLength);
  const inv = 1 / 65535;
  for (let i = 0; i < len; i++) {
    out[i] = u16[i] * inv;
  }
  return out;
}

let dbPromise: Promise<IDBDatabase> | null = null;
const fallbackStore = new Map<string, StoredImageRecord>();
let useFallback = false;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      useFallback = true;
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      useFallback = true;
      reject(req.error);
    };
  });
  return dbPromise;
}

export async function clearAllStoredImages(): Promise<void> {
  fallbackStore.clear();
  if (useFallback) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    useFallback = true;
  }
}

export async function putStoredImage(record: StoredImageRecord): Promise<void> {
  if (useFallback) {
    fallbackStore.set(record.id, record);
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    useFallback = true;
    fallbackStore.set(record.id, record);
  }
}

export async function getStoredImage(id: string): Promise<StoredImageRecord | undefined> {
  if (useFallback) {
    return fallbackStore.get(id);
  }
  try {
    const db = await openDB();
    return await new Promise<StoredImageRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result as StoredImageRecord | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return fallbackStore.get(id);
  }
}

export async function deleteStoredImage(id: string): Promise<void> {
  fallbackStore.delete(id);
  if (useFallback) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function decodeBlobToRGBA(
  blob: Blob,
  expectedWidth: number,
  expectedHeight: number
): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const w = expectedWidth || bitmap.width;
    const h = expectedHeight || bitmap.height;
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h).data;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  } finally {
    bitmap.close();
  }
}
