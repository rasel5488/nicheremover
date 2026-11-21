import { ClipboardPaste, ShieldCheck, Maximize2, Paintbrush } from 'lucide-react';
import { CutoutFrameIcon, PhotoUploadIcon, PrecisionLayerIcon } from './BrandIcons';

interface UploadHeroProps {
  onPickFiles: () => void;
}

export function UploadHero({ onPickFiles }: UploadHeroProps) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-10 sm:py-16">
      {/* Subtle emerald ambient radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[360px] w-[680px] -translate-x-1/2 rounded-full bg-[#16C784]/8 blur-[120px]"
      />

      <div className="w-full max-w-2xl">
        {/* Heading */}
        <div className="mb-7 text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#1E4D37] bg-[#0B1410] px-3 py-1 text-xs font-medium text-[#16C784]">
            <CutoutFrameIcon className="h-3.5 w-3.5" />
            <span>Instant Full HD Cutouts · Free &amp; No Watermark</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#F2F7F4] sm:text-5xl">
            Remove Backgrounds in{' '}
            <span className="bg-gradient-to-r from-[#16C784] to-[#6EE7B7] bg-clip-text text-transparent">
              Full HD
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-[#93B3A3] sm:text-base">
            Clean hair &amp; edges, studio retouch, DSLR bokeh &amp; touch-up brush — fast and
            private right inside your browser for 1 or 100+ photos.
          </p>
        </div>

        {/* Main Upload / Drop / Paste Card */}
        <div
          role="button"
          tabIndex={0}
          onClick={onPickFiles}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPickFiles();
            }
          }}
          className="group relative flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-[#1E4D37] bg-[#0B1410] px-6 py-12 text-center shadow-[0_20px_60px_rgba(0,0,0,0.45)] transition-all duration-200 hover:border-[#16C784] hover:bg-[#0D1914] hover:shadow-[0_0_45px_rgba(22,199,132,0.12)] focus:outline-none focus:ring-2 focus:ring-[#16C784]/60 sm:px-10 sm:py-16"
        >
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#1E4D37] bg-[#0F1F18] text-[#16C784] shadow-inner transition-transform duration-200 group-hover:scale-105 group-hover:border-[#16C784]/60">
            <PhotoUploadIcon className="h-8 w-8" />
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPickFiles();
            }}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#16C784] px-7 py-3.5 text-sm font-semibold text-[#050907] shadow-[0_8px_28px_rgba(22,199,132,0.28)] transition hover:bg-[#22DE96] active:scale-[0.98] sm:text-base"
          >
            <CutoutFrameIcon className="h-4 w-4" />
            <span>Select Images</span>
          </button>

          {/* Exact required upload hint */}
          <p className="mt-5 text-sm font-medium text-[#F2F7F4]/90 sm:text-[15px]">
            Upload, Drag &amp; Drop, or Press{' '}
            <kbd className="mx-0.5 rounded-md border border-[#1E4D37] bg-[#050907] px-1.5 py-0.5 font-mono text-xs text-[#16C784]">
              Ctrl+V
            </kbd>{' '}
            to paste 1 or 100+ images
          </p>

          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-[#93B3A3]">
            <ClipboardPaste className="h-3.5 w-3.5 text-[#16C784]/80" />
            <span>Supports PNG, JPG, WebP, folders, screenshots &amp; bulk Explorer/Finder copy</span>
          </p>
        </div>

        {/* Minimal Capability Strip (custom clean SVGs, zero AI icons) */}
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="flex items-center gap-2.5 rounded-2xl border border-[#1E4D37]/60 bg-[#0B1410]/80 px-3.5 py-3">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#16C784]" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#F2F7F4]">100% On-Device</div>
              <div className="truncate text-[11px] text-[#93B3A3]">Zero Uploads</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-2xl border border-[#1E4D37]/60 bg-[#0B1410]/80 px-3.5 py-3">
            <Maximize2 className="h-4 w-4 shrink-0 text-[#16C784]" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#F2F7F4]">Up to 3072px</div>
              <div className="truncate text-[11px] text-[#93B3A3]">Lossless PNG</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-2xl border border-[#1E4D37]/60 bg-[#0B1410]/80 px-3.5 py-3">
            <Paintbrush className="h-4 w-4 shrink-0 text-[#16C784]" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#F2F7F4]">Touch-Up Brush</div>
              <div className="truncate text-[11px] text-[#93B3A3]">Restore &amp; Erase</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-2xl border border-[#1E4D37]/60 bg-[#0B1410]/80 px-3.5 py-3">
            <PrecisionLayerIcon className="h-4 w-4 shrink-0 text-[#16C784]" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#F2F7F4]">Bulk 100+ ZIP</div>
              <div className="truncate text-[11px] text-[#93B3A3]">Memory-Safe</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
