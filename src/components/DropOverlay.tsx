import { PhotoUploadIcon } from './BrandIcons';

interface DropOverlayProps {
  visible: boolean;
}

export function DropOverlay({ visible }: DropOverlayProps) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#050907]/85 p-6 backdrop-blur-md">
      <div className="flex w-full max-w-lg flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-[#16C784] bg-[#0B1410]/95 p-10 text-center shadow-[0_0_60px_rgba(22,199,132,0.18)]">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#16C784]/40 bg-[#16C784]/15 text-[#16C784]">
          <PhotoUploadIcon className="h-9 w-9" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-[#F2F7F4]">Drop images or folders</h2>
          <p className="mt-1.5 text-sm text-[#93B3A3]">
            Release to add 1 or 100+ photos directly to the HD processing queue
          </p>
        </div>
      </div>
    </div>
  );
}
