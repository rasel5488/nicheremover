/**
 * Dual-layer Persistent Model Cache (IndexedDB + Browser Cache Storage) for Transformers.js (`env.customCache`).
 * - Prevents browser eviction of the ~84 MB ONNX model across reloads and sessions
 * - Automatically migrates existing entries from `transformers-cache` if present
 * - Tracks cache hits so the UI never shows a fake "Downloading MB..." bar when reading from local cache
 */

const IDB_NAME = 'niche-remover-permanent-models-v1';
const IDB_STORE = 'files';
const CACHE_STORAGE_NAME = 'niche-remover-models-cache-v1';
const LEGACY_TRANSFORMERS_CACHE = 'transformers-cache';

interface CachedModelRecord {
  key: string;
  bytes: ArrayBuffer;
  contentType: string;
  updatedAt: number;
}

const recentCacheHits = new Set<string>();
let idbPromise: Promise<IDBDatabase | null> | null = null;

function openModelIDB(): Promise<IDBDatabase | null> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbPromise;
}

/**
 * Normalize both local paths (`/models/briaai/RMBG-1.4/onnx/model_fp16.onnx`)
 * and remote HF URLs (`https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model_fp16.onnx`)
 * into a single canonical key (`briaai/RMBG-1.4/onnx/model_fp16.onnx`).
 */
export function canonicalModelKey(requestOrUrl: string): string {
  const raw = String(requestOrUrl || '').trim();
  const hfMatch = raw.match(/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/[^/]+\/(.+)$/);
  if (hfMatch) {
    return `${hfMatch[1]}/${hfMatch[2]}`;
  }
  const localMatch = raw.replace(/^\/+/, '').replace(/^models\/+/, '');
  return localMatch || raw;
}

function toCanonicalHttpsUrl(key: string): string {
  if (/^https?:\/\//i.test(key)) return key;
  return `https://huggingface.co/${key.replace(/^([^/]+\/[^/]+)\//, '$1/resolve/main/')}`;
}

export function wasFileServedFromCache(filename?: string): boolean {
  if (!filename) return recentCacheHits.size > 0;
  for (const hitKey of recentCacheHits) {
    if (hitKey.endsWith(filename) || filename.endsWith(hitKey)) {
      return true;
    }
  }
  return false;
}

async function getFromIDB(key: string): Promise<CachedModelRecord | null> {
  const db = await openModelIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as CachedModelRecord | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putInIDB(record: CachedModelRecord): Promise<void> {
  const db = await openModelIDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function buildResponse(bytes: ArrayBuffer, contentType: string): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
    },
  });
}

export const persistentModelCache = {
  async match(request: string): Promise<Response | undefined> {
    const key = canonicalModelKey(request);

    // 1. Check permanent IndexedDB first
    const idbRecord = await getFromIDB(key);
    if (idbRecord && idbRecord.bytes && idbRecord.bytes.byteLength > 0) {
      recentCacheHits.add(key);
      return buildResponse(idbRecord.bytes, idbRecord.contentType);
    }

    // 2. Check our dedicated Cache Storage AND legacy `transformers-cache` (migrating into IndexedDB if found!)
    if (typeof caches !== 'undefined') {
      const cacheUrl = toCanonicalHttpsUrl(key);
      const cacheNames = [CACHE_STORAGE_NAME, LEGACY_TRANSFORMERS_CACHE];
      for (const cacheName of cacheNames) {
        try {
          const c = await caches.open(cacheName);
          const matched =
            (await c.match(cacheUrl)) ??
            (/^https?:\/\//i.test(request) ? await c.match(request) : undefined);
          if (matched && matched.status === 200) {
            const bytes = await matched.arrayBuffer();
            if (bytes.byteLength > 0) {
              const contentType =
                matched.headers.get('Content-Type') || 'application/octet-stream';
              recentCacheHits.add(key);
              // Persist in IndexedDB in background so it can never be evicted
              void putInIDB({
                key,
                bytes,
                contentType,
                updatedAt: Date.now(),
              });
              return buildResponse(bytes, contentType);
            }
          }
        } catch {
          // ignore
        }
      }
    }

    return undefined;
  },

  async put(request: string, response: Response): Promise<void> {
    try {
      const key = canonicalModelKey(request);
      const clone = response.clone();
      const bytes = await clone.arrayBuffer();
      if (bytes.byteLength === 0) return;

      const contentType =
        response.headers.get('Content-Type') || 'application/octet-stream';

      // Request persistent storage permission from browser if available
      try {
        if (typeof self !== 'undefined' && self.navigator?.storage?.persist) {
          void self.navigator.storage.persist();
        }
      } catch {
        // ignore
      }

      // Save to permanent IndexedDB
      await putInIDB({
        key,
        bytes,
        contentType,
        updatedAt: Date.now(),
      });

      // Also mirror into Cache Storage using canonical HTTPS URL for redundancy
      if (typeof caches !== 'undefined') {
        try {
          const c = await caches.open(CACHE_STORAGE_NAME);
          await c.put(toCanonicalHttpsUrl(key), buildResponse(bytes, contentType));
        } catch {
          // ignore
        }
      }

      recentCacheHits.add(key);
    } catch (err) {
      console.warn('[Niche Remover] Failed to persist model in cache:', err);
    }
  },
};
