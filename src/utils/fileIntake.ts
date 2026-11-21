const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|avif|gif|bmp|tiff?|ico|heic|heif)$/i;

export function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  if (file.name && IMAGE_EXT_REGEX.test(file.name)) return true;
  return false;
}

export function getCleanBaseName(filename: string, fallbackIndex?: number): string {
  const trimmed = (filename || '').trim();
  if (!trimmed) {
    return fallbackIndex !== undefined ? `image-${fallbackIndex + 1}` : 'image';
  }
  const withoutExt = trimmed.replace(/\.[^/.]+$/, '');
  const sanitized = withoutExt
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized || 'image';
}

/**
 * Extract ALL pasted image files from a ClipboardEvent.
 * Reads BOTH `clipboardData.files` AND `clipboardData.items` with smart occurrence-preserving
 * deduplication so pasting 1 screenshot OR 50-100 copied files from Windows Explorer / macOS Finder
 * captures every single file without duplicates.
 */
export function extractFilesFromClipboard(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return [];

  const result: File[] = [];
  const filesCountMap = new Map<string, number>();

  const signature = (f: File) => `${f.name}::${f.size}::${f.type}`;

  // 1. Read clipboardData.files first
  if (clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const file = clipboardData.files[i];
      if (!file || !isImageFile(file)) continue;
      const key = signature(file);
      filesCountMap.set(key, (filesCountMap.get(key) ?? 0) + 1);
      result.push(file);
    }
  }

  // 2. Also read clipboardData.items (catches screenshots, copied web images, and multi-file items)
  if (clipboardData.items && clipboardData.items.length > 0) {
    const itemsSeenMap = new Map<string, number>();
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (!file || !isImageFile(file)) continue;

      const key = signature(file);
      const seenSoFar = (itemsSeenMap.get(key) ?? 0) + 1;
      itemsSeenMap.set(key, seenSoFar);

      // Only add if items contains more instances of this file signature than already captured in .files
      const alreadyInFiles = filesCountMap.get(key) ?? 0;
      if (seenSoFar > alreadyInFiles) {
        // Give unnamed pasted screenshots a clean timestamped name
        const namedFile =
          !file.name || file.name === 'image.png'
            ? new File([file], `pasted-${Date.now()}-${result.length + 1}.png`, {
                type: file.type || 'image/png',
                lastModified: file.lastModified || Date.now(),
              })
            : file;
        result.push(namedFile);
      }
    }
  }

  return result;
}

/**
 * Recursively read all image files from a DragEvent, supporting single files,
 * 50-100+ multi-selected files, and entire dropped folders (looping readEntries to capture 100+ files).
 */
export async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items;

  // Prefer webkitGetAsEntry when available to support whole folder drops
  if (items && items.length > 0) {
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const entry =
        typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
      if (entry) {
        entries.push(entry);
      }
    }

    if (entries.length > 0) {
      const collected: File[] = [];
      for (const entry of entries) {
        await traverseEntry(entry, collected);
      }
      if (collected.length > 0) {
        return collected.filter(isImageFile);
      }
    }
  }

  // Fallback to dataTransfer.files
  const fallback: File[] = [];
  if (dataTransfer.files) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const f = dataTransfer.files[i];
      if (f && isImageFile(f)) fallback.push(f);
    }
  }
  return fallback;
}

async function traverseEntry(entry: FileSystemEntry, acc: File[]): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File | null>((resolve) => {
      fileEntry.file(
        (f) => resolve(f),
        () => resolve(null)
      );
    });
    if (file) acc.push(file);
    return;
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    // Chrome returns at most 100 entries per readEntries() call — loop until empty!
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve) => {
        reader.readEntries(
          (entries) => resolve(entries),
          () => resolve([])
        );
      });
      if (!batch.length) break;
      for (const child of batch) {
        await traverseEntry(child, acc);
      }
    }
  }
}

/**
 * Create a lightweight quick preview ObjectURL from a raw File so cards render instantly
 * while waiting in the AI queue without decoding full 3072px bitmaps into DOM memory.
 */
export function createFastInitialPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}
