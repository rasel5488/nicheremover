import { zip, type Zippable } from 'fflate';
import { getExportPngBlob } from '../engine/queueManager';
import {
  formatSequentialPngName,
  formatSequentialZipName,
  type FileNamingConfig,
} from './fileNaming';
import type { QueueItem } from '../types';

export function buildOutputFilename(baseName: string): string {
  const clean = baseName.trim() || 'image';
  return `${clean}-nobg.png`;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke safely after browser starts download
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadSingleItem(
  item: QueueItem,
  options?: { overrideBlob?: Blob; filename?: string }
): Promise<string> {
  const blob = options?.overrideBlob ?? (await getExportPngBlob(item.id));
  if (!blob) throw new Error('Cutout is not ready yet.');
  const filename = options?.filename || buildOutputFilename(item.baseName);
  triggerBlobDownload(blob, filename);
  return filename;
}

export async function copyCutoutToClipboard(item: QueueItem, overrideBlob?: Blob): Promise<void> {
  const blob = overrideBlob ?? (await getExportPngBlob(item.id));
  if (!blob) throw new Error('Cutout is not ready yet.');

  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image copy is not supported in this browser.');
  }

  const pngBlob = blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
}

export function canUseWebShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  if (typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    const probe = new File([new Uint8Array([0])], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareSingleItem(
  item: QueueItem,
  options?: { overrideBlob?: Blob; filename?: string }
): Promise<{ shared: boolean; filename: string }> {
  const blob = options?.overrideBlob ?? (await getExportPngBlob(item.id));
  if (!blob) throw new Error('Cutout is not ready yet.');

  const filename = options?.filename || buildOutputFilename(item.baseName);
  const file = new File([blob], filename, { type: 'image/png' });
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
    throw new Error('Sharing files is not supported on this device.');
  }
  try {
    await navigator.share({
      files: [file],
      title: filename,
    });
    return { shared: true, filename };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { shared: false, filename }; // User cancelled share sheet
    }
    throw err;
  }
}

/**
 * Export 2 to 100+ completed images as a clean ZIP archive using fflate.
 * Uses STORE level (0) because PNGs are already compressed, making 100-image ZIP creation ~10x faster
 * while avoiding double compression CPU spikes.
 */
export async function downloadBatchAsZip(
  items: QueueItem[],
  options?: {
    fileNaming?: FileNamingConfig;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<{ count: number; zipFilename: string }> {
  const completed = items.filter((item) => item.status === 'done');
  if (completed.length === 0) {
    throw new Error('No completed images ready to export.');
  }

  const customPrefix = options?.fileNaming?.prefix?.trim() || '';
  const startNum = options?.fileNaming?.nextNumber ?? 1;

  const zipEntries: Zippable = {};
  const usedNames = new Map<string, number>();
  let seqIndex = 0;

  for (let i = 0; i < completed.length; i++) {
    const item = completed[i];
    options?.onProgress?.(i + 1, completed.length);

    const blob = await getExportPngBlob(item.id);
    if (!blob) continue;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    let filename: string;

    if (customPrefix) {
      filename = formatSequentialPngName(customPrefix, startNum + seqIndex);
      seqIndex += 1;
    } else {
      const base = item.baseName || `image-${i + 1}`;
      const count = usedNames.get(base.toLowerCase()) ?? 0;
      usedNames.set(base.toLowerCase(), count + 1);
      filename = count === 0 ? `${base}-nobg.png` : `${base}-nobg (${count + 1}).png`;
    }

    // level: 0 (STORE) — instant packing for already-compressed PNGs
    zipEntries[filename] = [bytes, { level: 0 }];
  }

  const count = Object.keys(zipEntries).length;
  if (count === 0) {
    throw new Error('Could not read exported PNG files.');
  }

  const zipBytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(zipEntries, { level: 0 }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const zipBlob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
  const stamp = new Date().toISOString().slice(0, 10);
  const zipFilename = customPrefix
    ? formatSequentialZipName(customPrefix, startNum, count)
    : `niche-remover-batch-${count}-${stamp}.zip`;

  triggerBlobDownload(zipBlob, zipFilename);
  return { count, zipFilename };
}
