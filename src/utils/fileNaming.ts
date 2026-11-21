export interface FileNamingConfig {
  /** Custom file name prefix (English, Bangla, etc.). Empty string means default original-nobg.png */
  prefix: string;
  /** Next sequential part number (starts at 1, increments automatically after each download) */
  nextNumber: number;
}

const STORAGE_KEY = 'cutouthd-file-naming-v1';

/**
 * Strip only OS-forbidden filename characters while fully preserving Unicode (Bangla, English, etc.).
 */
export function sanitizePrefix(raw: string): string {
  return raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadFileNamingConfig(): FileNamingConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { prefix: '', nextNumber: 1 };
    const parsed = JSON.parse(raw) as Partial<FileNamingConfig>;
    const prefix = typeof parsed.prefix === 'string' ? sanitizePrefix(parsed.prefix) : '';
    const nextNumber =
      typeof parsed.nextNumber === 'number' && Number.isFinite(parsed.nextNumber) && parsed.nextNumber >= 1
        ? Math.floor(parsed.nextNumber)
        : 1;
    return { prefix, nextNumber };
  } catch {
    return { prefix: '', nextNumber: 1 };
  }
}

export function saveFileNamingConfig(config: FileNamingConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage quota / private mode errors
  }
}

export function formatSequentialPngName(prefix: string, num: number): string {
  return `${prefix} ${num}.png`;
}

export function formatSequentialZipName(prefix: string, startNum: number, count: number): string {
  if (count <= 1) {
    return `${prefix} ${startNum}.zip`;
  }
  const endNum = startNum + count - 1;
  return `${prefix} (${startNum}-${endNum}).zip`;
}
