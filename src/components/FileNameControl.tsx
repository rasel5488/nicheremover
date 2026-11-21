import { useEffect, useRef, useState } from 'react';
import { Check, FileText, RotateCcw, X } from 'lucide-react';
import {
  formatSequentialPngName,
  sanitizePrefix,
  type FileNamingConfig,
} from '../utils/fileNaming';

interface FileNameControlProps {
  config: FileNamingConfig;
  onSave: (prefix: string) => void;
  onResetCounter: () => void;
  onClear: () => void;
}

export function FileNameControl({
  config,
  onSave,
  onResetCounter,
  onClear,
}: FileNameControlProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(config.prefix);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasPrefix = config.prefix.length > 0;
  const cleanedDraft = sanitizePrefix(draft);
  const previewNumber =
    cleanedDraft && cleanedDraft === config.prefix ? config.nextNumber : 1;

  // Sync draft when opening popover
  useEffect(() => {
    if (open) {
      setDraft(config.prefix);
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);
    }
  }, [open, config.prefix]);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(draft);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* Compact Trigger Pill in Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={
          hasPrefix
            ? `Custom File Name: ${config.prefix} (Next: #${config.nextNumber})`
            : 'Set custom sequential File Name (e.g. Bhola 1, Bhola 2...)'
        }
        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.98] ${
          hasPrefix
            ? 'border-[#16C784]/70 bg-[#16C784]/12 text-[#F2F7F4] hover:bg-[#16C784]/20'
            : open
              ? 'border-[#16C784] bg-[#0B1410] text-[#F2F7F4]'
              : 'border-[#1E4D37] bg-[#0B1410] text-[#93B3A3] hover:border-[#16C784]/70 hover:text-[#F2F7F4]'
        }`}
      >
        <FileText className={`h-3.5 w-3.5 shrink-0 ${hasPrefix ? 'text-[#16C784]' : ''}`} />
        {hasPrefix ? (
          <>
            <span className="max-w-[78px] truncate font-semibold text-[#F2F7F4] sm:max-w-[120px]">
              {config.prefix}
            </span>
            <span className="tabular-nums rounded-md bg-[#16C784]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#16C784]">
              #{config.nextNumber}
            </span>
          </>
        ) : (
          <span>File Name</span>
        )}
      </button>

      {/* Clean Floating Popover */}
      {open && (
        <div className="fixed left-3 right-3 top-[60px] z-50 rounded-2xl border border-[#1E4D37] bg-[#0B1410] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.75)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[320px]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F2F7F4]">
                File Name
              </h3>
              <p className="mt-0.5 text-[11px] text-[#7FA090]">
                Auto-numbers every download: 1, 2, 3…
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close File Name settings"
              className="rounded-lg p-1 text-[#7FA090] transition hover:bg-[#1E4D37]/40 hover:text-[#F2F7F4]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. ভোলা or Bhola"
                maxLength={64}
                className="min-w-0 flex-1 rounded-xl border border-[#1E4D37] bg-[#050907] px-3 py-2 text-sm text-[#F2F7F4] placeholder-[#567666] outline-none transition focus:border-[#16C784] focus:ring-1 focus:ring-[#16C784]/50"
              />
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[#16C784] px-3.5 py-2 text-xs font-semibold text-[#050907] transition hover:bg-[#22DE96] active:scale-[0.98]"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Save</span>
              </button>
            </div>

            {/* Live Sequential Preview */}
            <div className="rounded-xl border border-[#1E4D37]/60 bg-[#050907]/85 px-3 py-2 text-[11px]">
              {cleanedDraft ? (
                <div className="space-y-0.5">
                  <span className="text-[#7FA090]">Download sequence:</span>
                  <p className="truncate font-medium text-[#16C784]">
                    {formatSequentialPngName(cleanedDraft, previewNumber)},{' '}
                    {formatSequentialPngName(cleanedDraft, previewNumber + 1)},{' '}
                    {formatSequentialPngName(cleanedDraft, previewNumber + 2)}…
                  </p>
                </div>
              ) : (
                <p className="text-[#7FA090]">
                  Default: <span className="text-[#F2F7F4]">original-name-nobg.png</span>
                </p>
              )}
            </div>

            {/* Counter Reset & Clear Controls when a custom name is active */}
            {hasPrefix && (
              <div className="flex items-center justify-between gap-2 border-t border-[#1E4D37]/50 pt-2.5">
                <span className="tabular-nums text-[11px] text-[#93B3A3]">
                  Next number: <strong className="text-[#16C784]">#{config.nextNumber}</strong>
                </span>
                <div className="flex items-center gap-1.5">
                  {config.nextNumber > 1 && (
                    <button
                      type="button"
                      onClick={() => onResetCounter()}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#1E4D37] bg-[#050907] px-2 py-1 text-[11px] font-medium text-[#F2F7F4] transition hover:border-[#16C784] hover:text-[#16C784]"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset #1</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onClear();
                      setDraft('');
                      setOpen(false);
                    }}
                    className="rounded-lg border border-[#1E4D37]/70 bg-[#050907] px-2 py-1 text-[11px] font-medium text-[#93B3A3] transition hover:border-red-500/50 hover:text-red-300"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
