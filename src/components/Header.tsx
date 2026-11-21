import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { NicheLogoIcon } from './BrandIcons';
import { FileNameControl } from './FileNameControl';
import type { EngineInfo } from '../types';
import type { FileNamingConfig } from '../utils/fileNaming';

interface HeaderProps {
  engine: EngineInfo;
  hasItems: boolean;
  fileNaming: FileNamingConfig;
  onSaveFileName: (prefix: string) => void;
  onResetFileCounter: () => void;
  onClearFileName: () => void;
  onAddMore: () => void;
  onLogoClick?: () => void;
}

export function Header({
  engine,
  hasItems,
  fileNaming,
  onSaveFileName,
  onResetFileCounter,
  onClearFileName,
  onAddMore,
  onLogoClick,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#1E4D37]/60 bg-[#050907]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-5">
        {/* Brand: Niche Remover (clean geometric SVG logo, no Studio AI label) */}
        <button
          type="button"
          onClick={onLogoClick}
          className="group flex items-center gap-2.5 text-left focus:outline-none"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#16C784]/40 bg-[#16C784]/12 text-[#16C784] transition-transform group-hover:scale-105">
            <NicheLogoIcon className="h-5 w-5" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-[#F2F7F4] sm:text-base">
            Niche <span className="text-[#16C784]">Remover</span>
          </span>
        </button>

        {/* Right side: File Name + Status + Add More */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Custom Sequential File Name Control */}
          <FileNameControl
            config={fileNaming}
            onSave={onSaveFileName}
            onResetCounter={onResetFileCounter}
            onClear={onClearFileName}
          />

          {/* Compact Engine Status */}
          {engine.status === 'loading' && (
            <div className="flex items-center gap-2 rounded-full border border-[#1E4D37] bg-[#0B1410] px-2.5 py-1.5 text-xs text-[#F2F7F4]">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#16C784]" />
              <span className="hidden max-w-[190px] truncate md:inline">
                {engine.loadMessage || 'Preparing…'}
              </span>
              <span className="tabular-nums font-semibold text-[#16C784]">
                {engine.loadProgress}%
              </span>
            </div>
          )}

          {engine.status === 'ready' && (
            <div className="hidden items-center gap-1.5 rounded-full border border-[#1E4D37]/80 bg-[#0B1410] px-2.5 py-1 text-[11px] font-medium text-[#93B3A3] md:flex">
              <span className="h-2 w-2 rounded-full bg-[#16C784] shadow-[0_0_8px_#16C784]" />
              <span className="uppercase text-[#F2F7F4]">{engine.backend || 'HD'}</span>
              <span className="text-[#5E8070]">·</span>
              <span>HD Ready</span>
            </div>
          )}

          {engine.status === 'error' && (
            <div className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-950/40 px-2.5 py-1 text-[11px] font-medium text-red-300">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="max-w-[160px] truncate">Load Error</span>
            </div>
          )}

          {engine.status === 'idle' && (
            <div className="hidden items-center gap-1.5 rounded-full border border-[#1E4D37]/60 bg-[#0B1410] px-2.5 py-1 text-[11px] text-[#93B3A3] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16C784]/80" />
              <span>On-Device · Private</span>
            </div>
          )}

          {hasItems && (
            <button
              type="button"
              onClick={onAddMore}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#16C784]/50 bg-[#16C784]/15 px-3 py-1.5 text-xs font-semibold text-[#16C784] transition hover:bg-[#16C784] hover:text-[#050907] active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add More</span>
            </button>
          )}
        </div>
      </div>

      {/* Slim top loading progress bar while MediaPipe downloads once */}
      {engine.status === 'loading' && (
        <div className="h-[2px] w-full bg-[#0B1410]">
          <div
            className="h-full bg-[#16C784] transition-all duration-300"
            style={{ width: `${Math.max(5, engine.loadProgress)}%` }}
          />
        </div>
      )}
    </header>
  );
}
