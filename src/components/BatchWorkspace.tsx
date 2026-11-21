import { useState } from 'react';
import {
  Archive,
  Check,
  Download,
  Loader2,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
  XCircle,
  AlertCircle,
  Paintbrush,
} from 'lucide-react';
import { BackgroundControls } from './BackgroundControls';
import { StudioEnhanceControls } from './StudioEnhanceControls';
import type { BackgroundConfig, QueueItem, RetouchConfig } from '../types';

interface BatchWorkspaceProps {
  items: QueueItem[];
  isPaused: boolean;
  globalEdgeRefine: number;
  globalDefringe: boolean;
  globalBgConfig: BackgroundConfig;
  globalRetouch: RetouchConfig;
  isApplyingAll: boolean;
  applyProgress: { current: number; total: number } | null;
  isExportingZip: boolean;
  zipProgress: { current: number; total: number } | null;
  onSelectItem: (id: string) => void;
  onDownloadItem: (item: QueueItem) => void;
  onRemoveItem: (id: string) => void;
  onPauseToggle: () => void;
  onCancelPending: () => void;
  onClearAll: () => void;
  onAddMore: () => void;
  onDownloadAllZip: () => void;
  onApplyToAll: (
    edgeRefine: number,
    defringe: boolean,
    bgConfig: BackgroundConfig,
    retouch: RetouchConfig
  ) => void;
}

export function BatchWorkspace({
  items,
  isPaused,
  globalEdgeRefine,
  globalDefringe,
  globalBgConfig,
  globalRetouch,
  isApplyingAll,
  applyProgress,
  isExportingZip,
  zipProgress,
  onSelectItem,
  onDownloadItem,
  onRemoveItem,
  onPauseToggle,
  onCancelPending,
  onClearAll,
  onAddMore,
  onDownloadAllZip,
  onApplyToAll,
}: BatchWorkspaceProps) {
  const [showApplyPanel, setShowApplyPanel] = useState(false);
  const [draftEdge, setDraftEdge] = useState(globalEdgeRefine);
  const [draftDefringe, setDraftDefringe] = useState(globalDefringe);
  const [draftBg, setDraftBg] = useState<BackgroundConfig>(globalBgConfig);
  const [draftRetouch, setDraftRetouch] = useState<RetouchConfig>(globalRetouch);

  const totalCount = items.length;
  const doneCount = items.filter((i) => i.status === 'done').length;
  const queuedCount = items.filter((i) => i.status === 'queued').length;
  const processingCount = items.filter((i) => i.status === 'processing').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const isQueueActive = queuedCount > 0 || processingCount > 0;
  const progressPct = totalCount > 0 ? Math.round(((doneCount + errorCount) / totalCount) * 100) : 0;

  const handleToggleApplyPanel = () => {
    if (!showApplyPanel) {
      setDraftEdge(globalEdgeRefine);
      setDraftDefringe(globalDefringe);
      setDraftBg({ ...globalBgConfig });
      setDraftRetouch({ ...globalRetouch });
    }
    setShowApplyPanel((v) => !v);
  };

  const handleConfirmApplyAll = () => {
    onApplyToAll(draftEdge, draftDefringe, { ...draftBg }, { ...draftRetouch });
  };

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-3 pb-10 pt-4 sm:px-5 sm:pt-5">
      {/* Top Action & Progress Bar */}
      <section className="sticky top-14 z-20 mb-4 rounded-2xl border border-[#1E4D37]/80 bg-[#0B1410]/95 p-3 shadow-[0_12px_36px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Progress Status & Queue Controls */}
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#F2F7F4]">
                {isQueueActive && !isPaused ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#16C784]" />
                ) : (
                  <Check className="h-4 w-4 text-[#16C784]" />
                )}
                <span className="tabular-nums">
                  Processed {doneCount} / {totalCount}
                </span>
              </div>

              {isPaused && queuedCount > 0 && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  Paused
                </span>
              )}

              {errorCount > 0 && (
                <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300">
                  {errorCount} failed
                </span>
              )}

              {/* Pause / Resume & Cancel while queue is active */}
              {isQueueActive && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onPauseToggle}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#1E4D37] bg-[#050907] px-2.5 py-1 text-xs font-medium text-[#F2F7F4] transition hover:border-[#16C784] hover:text-[#16C784]"
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-3 w-3" />
                        <span>Resume</span>
                      </>
                    ) : (
                      <>
                        <Pause className="h-3 w-3" />
                        <span>Pause</span>
                      </>
                    )}
                  </button>

                  {queuedCount > 0 && (
                    <button
                      type="button"
                      onClick={onCancelPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-950/30 px-2.5 py-1 text-xs font-medium text-red-300 transition hover:border-red-400/60 hover:bg-red-950/60"
                    >
                      <XCircle className="h-3 w-3" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-[#050907] border border-[#1E4D37]/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#16C784] to-[#4ADE80] transition-all duration-300"
                style={{ width: `${Math.max(isQueueActive ? 4 : 0, progressPct)}%` }}
              />
            </div>
          </div>

          {/* Primary Batch Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleApplyPanel}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition sm:text-[13px] ${
                showApplyPanel
                  ? 'border-[#16C784] bg-[#16C784]/15 text-[#16C784]'
                  : 'border-[#1E4D37] bg-[#050907] text-[#F2F7F4] hover:border-[#16C784]/70'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Apply to All</span>
            </button>

            <button
              type="button"
              disabled={doneCount === 0 || isExportingZip}
              onClick={onDownloadAllZip}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#16C784] px-4 py-2 text-xs font-semibold text-[#050907] shadow-[0_6px_20px_rgba(22,199,132,0.22)] transition hover:bg-[#22DE96] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:text-[13px]"
            >
              {isExportingZip ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="tabular-nums">
                    {zipProgress
                      ? `Packing ZIP ${zipProgress.current}/${zipProgress.total}…`
                      : 'Packing ZIP…'}
                  </span>
                </>
              ) : (
                <>
                  <Archive className="h-3.5 w-3.5" />
                  <span className="tabular-nums">Download All ZIP ({doneCount})</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onAddMore}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#1E4D37] bg-[#050907] px-3 py-2 text-xs font-medium text-[#F2F7F4] transition hover:border-[#16C784]/70 hover:text-[#16C784] sm:text-[13px]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>

            <button
              type="button"
              onClick={onClearAll}
              title="Clear all images"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#1E4D37]/70 bg-[#050907] px-3 py-2 text-xs font-medium text-[#93B3A3] transition hover:border-red-500/50 hover:bg-red-950/30 hover:text-red-300 sm:text-[13px]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear All</span>
            </button>
          </div>
        </div>

        {/* Expandable "Apply to All" Global Style & Retouch Panel */}
        {showApplyPanel && (
          <div className="mt-3.5 border-t border-[#1E4D37]/60 pt-3.5">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr_1.3fr_auto] lg:items-end">
              <StudioEnhanceControls
                retouch={draftRetouch}
                onRetouchChange={setDraftRetouch}
                compact
                batchMode
              />

              <BackgroundControls
                edgeRefine={draftEdge}
                defringe={draftDefringe}
                bgConfig={draftBg}
                onEdgeRefineChange={setDraftEdge}
                onDefringeChange={setDraftDefringe}
                onBgConfigChange={setDraftBg}
                compact
                showEdgeRefine
                showBackground={false}
              />

              <BackgroundControls
                edgeRefine={draftEdge}
                defringe={draftDefringe}
                bgConfig={draftBg}
                onEdgeRefineChange={setDraftEdge}
                onDefringeChange={setDraftDefringe}
                onBgConfigChange={setDraftBg}
                compact
                showEdgeRefine={false}
                showBackground
              />

              <div className="flex items-center gap-2 md:flex-col md:items-stretch">
                <button
                  type="button"
                  disabled={isApplyingAll}
                  onClick={handleConfirmApplyAll}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#16C784] px-4 py-2.5 text-xs font-semibold text-[#050907] transition hover:bg-[#22DE96] disabled:opacity-50"
                >
                  {isApplyingAll ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="tabular-nums">
                        {applyProgress
                          ? `Updating ${applyProgress.current}/${applyProgress.total}`
                          : 'Updating…'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Apply to All ({totalCount})</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowApplyPanel(false)}
                  className="rounded-xl border border-[#1E4D37] px-3 py-2.5 text-xs font-medium text-[#93B3A3] transition hover:text-[#F2F7F4]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Subtle hint */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#7FA090]">
        <span>Click any finished image to open the interactive Touch-Up Studio (Restore / Erase brush &amp; zoom)</span>
        <span className="hidden sm:inline">Tip: Press Ctrl+V or drop more files anytime to append</span>
      </div>

      {/* Responsive Thumbnail Grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
        {items.map((item) => {
          const isDone = item.status === 'done';
          const isProcessing = item.status === 'processing';
          const isQueued = item.status === 'queued';
          const isError = item.status === 'error';
          const isCancelled = item.status === 'cancelled';

          return (
            <article
              key={item.id}
              onClick={() => {
                if (isDone) onSelectItem(item.id);
              }}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-[#0B1410] transition-all duration-150 ${
                isDone
                  ? 'cursor-pointer border-[#1E4D37]/80 hover:-translate-y-0.5 hover:border-[#16C784] hover:shadow-[0_12px_30px_rgba(22,199,132,0.12)]'
                  : isProcessing
                    ? 'border-[#16C784]/60 shadow-[0_0_20px_rgba(22,199,132,0.1)]'
                    : isError
                      ? 'border-red-500/40'
                      : 'border-[#1E4D37]/50'
              }`}
            >
              {/* Remove button */}
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveItem(item.id);
                }}
                className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-[#1E4D37]/80 bg-[#050907]/85 text-[#93B3A3] backdrop-blur-sm transition hover:border-red-500/60 hover:bg-red-950/90 hover:text-red-200 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>

              {/* Preview Box */}
              <div className="checkerboard-bg-sm relative aspect-square w-full overflow-hidden">
                <img
                  src={item.previewUrl}
                  alt={item.name}
                  loading="lazy"
                  decoding="async"
                  className={`h-full w-full object-contain p-1.5 transition duration-200 ${
                    isQueued || isCancelled ? 'opacity-45 grayscale-[30%]' : ''
                  } ${isDone ? 'group-hover:scale-[1.03]' : ''}`}
                />

                {/* Status Overlays */}
                {isQueued && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#050907]/35">
                    <span className="rounded-full border border-[#1E4D37] bg-[#050907]/90 px-2.5 py-1 text-[11px] font-medium text-[#93B3A3]">
                      Queued
                    </span>
                  </div>
                )}

                {isProcessing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#050907]/55 backdrop-blur-[1px]">
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-[#16C784]/20 to-transparent ai-shimmer" />
                    <Loader2 className="h-6 w-6 animate-spin text-[#16C784]" />
                    <span className="rounded-full bg-[#050907]/85 px-2.5 py-0.5 text-[11px] font-medium text-[#16C784]">
                      Removing BG…
                    </span>
                  </div>
                )}

                {isCancelled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#050907]/55">
                    <span className="rounded-full border border-[#1E4D37] bg-[#050907]/90 px-2.5 py-1 text-[11px] font-medium text-[#93B3A3]">
                      Cancelled
                    </span>
                  </div>
                )}

                {isError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-950/75 p-3 text-center">
                    <AlertCircle className="h-5 w-5 text-red-300" />
                    <span className="line-clamp-2 text-[11px] text-red-200">
                      {item.error || 'Failed'}
                    </span>
                  </div>
                )}

                {/* Hover Refine Badge when done */}
                {isDone && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-[#050907]/90 via-[#050907]/40 to-transparent px-2.5 pb-2 pt-6 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[#16C784]/90 px-2 py-0.5 text-[10px] font-semibold text-[#050907]">
                      <Paintbrush className="h-2.5 w-2.5" />
                      Touch Up
                    </span>
                    {item.hasManualEdits && (
                      <span className="rounded-md bg-[#050907]/80 px-1.5 py-0.5 text-[10px] font-medium text-[#16C784]">
                        Edited
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="flex items-center justify-between gap-2 border-t border-[#1E4D37]/50 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-[#F2F7F4]" title={item.name}>
                    {item.name}
                  </p>
                  <p className="tabular-nums text-[10px] text-[#789988]">
                    {item.width > 0 ? `${item.width}×${item.height}` : `${(item.sizeBytes / 1024).toFixed(0)} KB`}
                  </p>
                </div>

                {isDone && (
                  <button
                    type="button"
                    title="Download HD PNG"
                    aria-label={`Download ${item.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownloadItem(item);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#1E4D37] bg-[#050907] text-[#16C784] transition hover:border-[#16C784] hover:bg-[#16C784] hover:text-[#050907] active:scale-95"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
