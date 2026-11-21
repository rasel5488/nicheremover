import { Aperture, Palette, RotateCcw } from 'lucide-react';
import { EdgeFeatherIcon } from './BrandIcons';
import {
  DEFAULT_EDGE_REFINE,
  type BackgroundConfig,
  type BackgroundStyleType,
} from '../types';

interface BackgroundControlsProps {
  edgeRefine: number;
  defringe: boolean;
  bgConfig: BackgroundConfig;
  onEdgeRefineChange: (val: number) => void;
  onDefringeChange: (val: boolean) => void;
  onBgConfigChange: (bg: BackgroundConfig) => void;
  compact?: boolean;
  showEdgeRefine?: boolean;
  showBackground?: boolean;
}

const PRESETS: Array<{
  type: BackgroundStyleType;
  label: string;
  swatchClass?: string;
  swatchStyle?: React.CSSProperties;
}> = [
  { type: 'transparent', label: 'Transparent', swatchClass: 'checkerboard-swatch' },
  { type: 'white', label: 'White', swatchStyle: { backgroundColor: '#FFFFFF' } },
  { type: 'black', label: 'Black', swatchStyle: { backgroundColor: '#000000' } },
  { type: 'studio-blue', label: 'Studio Blue', swatchStyle: { backgroundColor: '#1D4ED8' } },
  { type: 'dslr-blur', label: 'DSLR Blur' },
];

export function BackgroundControls({
  edgeRefine,
  defringe,
  bgConfig,
  onEdgeRefineChange,
  onDefringeChange,
  onBgConfigChange,
  compact = false,
  showEdgeRefine = true,
  showBackground = true,
}: BackgroundControlsProps) {
  const isDefaultEdge = Math.abs(edgeRefine - DEFAULT_EDGE_REFINE) < 0.005;

  return (
    <div className={compact ? 'space-y-3' : 'space-y-5'}>
      {/* Edge Refine Slider */}
      {showEdgeRefine && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#93B3A3]">
              Edge Refine
            </label>
            <div className="flex items-center gap-1.5">
              {!isDefaultEdge && (
                <button
                  type="button"
                  onClick={() => onEdgeRefineChange(DEFAULT_EDGE_REFINE)}
                  title="Reset to default (0.32)"
                  className="rounded-md p-1 text-[#93B3A3] transition hover:bg-[#1E4D37]/40 hover:text-[#F2F7F4]"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
              <span className="tabular-nums rounded-md border border-[#1E4D37] bg-[#050907] px-2 py-0.5 text-xs font-semibold text-[#16C784]">
                {edgeRefine.toFixed(2)}
              </span>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={edgeRefine}
            onChange={(e) => onEdgeRefineChange(parseFloat(e.target.value))}
            className="emerald-slider w-full"
            aria-label="Edge Refine"
          />

          <div className="mt-1.5 flex justify-between text-[10px] text-[#6E8F7E]">
            <span>Soft Hair</span>
            <span>Balanced (0.32)</span>
            <span>Crisp Cut</span>
          </div>

          {/* Anti-Halo Color Decontamination Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={defringe}
            onClick={() => onDefringeChange(!defringe)}
            className={`mt-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
              defringe
                ? 'border-[#16C784]/60 bg-[#16C784]/10 text-[#F2F7F4]'
                : 'border-[#1E4D37]/70 bg-[#050907]/70 text-[#93B3A3] hover:border-[#16C784]/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <EdgeFeatherIcon className={`h-3.5 w-3.5 ${defringe ? 'text-[#16C784]' : 'text-[#6E8F7E]'}`} />
              <div>
                <div className="text-xs font-semibold leading-tight">Anti-Halo (De-fringe)</div>
                <div className="text-[10px] text-[#7FA090]">Strips old bg spill on hair &amp; edges</div>
              </div>
            </div>
            <div
              className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                defringe ? 'bg-[#16C784]' : 'bg-[#172B22]'
              }`}
            >
              <div
                className={`h-4 w-4 rounded-full bg-[#050907] shadow transition-transform ${
                  defringe ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </button>
        </div>
      )}

      {/* Background Style Swatches */}
      {showBackground && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#93B3A3]">
              Background
            </span>
            <span className="text-[11px] capitalize text-[#6E8F7E]">
              {bgConfig.type === 'dslr-blur'
                ? 'DSLR Bokeh'
                : bgConfig.type === 'studio-blue'
                  ? 'Studio Blue'
                  : bgConfig.type === 'custom'
                    ? bgConfig.customColor.toUpperCase()
                    : bgConfig.type}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((preset) => {
              const active = bgConfig.type === preset.type;
              return (
                <button
                  key={preset.type}
                  type="button"
                  onClick={() => onBgConfigChange({ ...bgConfig, type: preset.type })}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition ${
                    active
                      ? 'border-[#16C784] bg-[#16C784]/12 text-[#F2F7F4] shadow-[0_0_16px_rgba(22,199,132,0.14)]'
                      : 'border-[#1E4D37]/70 bg-[#050907]/70 text-[#93B3A3] hover:border-[#16C784]/50 hover:text-[#F2F7F4]'
                  }`}
                >
                  {preset.type === 'dslr-blur' ? (
                    <div className="flex h-6 w-full items-center justify-center rounded-md bg-gradient-to-br from-[#16C784]/30 via-[#1D4ED8]/30 to-[#0B1410] border border-[#1E4D37]">
                      <Aperture className="h-3.5 w-3.5 text-[#16C784]" />
                    </div>
                  ) : (
                    <div
                      className={`h-6 w-full rounded-md border border-white/15 ${preset.swatchClass || ''}`}
                      style={preset.swatchStyle}
                    />
                  )}
                  <span className="text-[11px] font-medium leading-none">{preset.label}</span>
                </button>
              );
            })}

            {/* Custom Color Picker Swatch */}
            <label
              className={`relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition ${
                bgConfig.type === 'custom'
                  ? 'border-[#16C784] bg-[#16C784]/12 text-[#F2F7F4] shadow-[0_0_16px_rgba(22,199,132,0.14)]'
                  : 'border-[#1E4D37]/70 bg-[#050907]/70 text-[#93B3A3] hover:border-[#16C784]/50 hover:text-[#F2F7F4]'
              }`}
            >
              <input
                type="color"
                value={bgConfig.customColor}
                onChange={(e) =>
                  onBgConfigChange({ type: 'custom', customColor: e.target.value })
                }
                onClick={() => {
                  if (bgConfig.type !== 'custom') {
                    onBgConfigChange({ ...bgConfig, type: 'custom' });
                  }
                }}
                className="sr-only"
                aria-label="Pick custom background color"
              />
              <div
                className="flex h-6 w-full items-center justify-center rounded-md border border-white/20"
                style={{ backgroundColor: bgConfig.customColor }}
              >
                <Palette className="h-3.5 w-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
              </div>
              <span className="text-[11px] font-medium leading-none">Custom</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
