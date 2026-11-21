import { useState } from 'react';
import { ChevronDown, ChevronUp, Sun } from 'lucide-react';
import { StudioToneIcon } from './BrandIcons';
import { RETOUCH_PRESETS } from '../engine/photoRetouch';
import type { RetouchConfig, RetouchPreset } from '../types';

interface StudioEnhanceControlsProps {
  retouch: RetouchConfig;
  onRetouchChange: (next: RetouchConfig) => void;
  compact?: boolean;
  /** In batch Apply-to-All mode we show the 4 crisp 1-click presets cleanly */
  batchMode?: boolean;
}

const PRESET_OPTIONS: Array<{ id: RetouchPreset; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'studio', label: 'Auto Studio' },
  { id: 'portrait', label: 'Soft Glow' },
  { id: 'crisp', label: 'Crisp HD' },
];

export function StudioEnhanceControls({
  retouch,
  onRetouchChange,
  compact = false,
  batchMode = false,
}: StudioEnhanceControlsProps) {
  const [showFineSliders, setShowFineSliders] = useState(false);

  const handleSelectPreset = (preset: RetouchPreset) => {
    onRetouchChange({ ...RETOUCH_PRESETS[preset] });
  };

  const handleSlider = (key: 'brightness' | 'skinSmooth' | 'clarity' | 'vibrance', val: number) => {
    const next = { ...retouch, [key]: val };
    const allZero =
      next.brightness === 0 &&
      next.skinSmooth === 0 &&
      next.clarity === 0 &&
      next.vibrance === 0;
    onRetouchChange({
      ...next,
      preset: allZero ? 'off' : retouch.preset === 'off' ? 'studio' : retouch.preset,
    });
  };

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#93B3A3]">
            <StudioToneIcon className="h-3.5 w-3.5 text-[#16C784]" />
            <span>Studio Retouch</span>
          </span>
          {!batchMode && (
            <button
              type="button"
              onClick={() => setShowFineSliders((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#7FA090] transition hover:text-[#16C784]"
            >
              <span>Fine-tune</span>
              {showFineSliders ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          )}
        </div>

        {/* 4 Clean 1-Click Studio Presets */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
          {PRESET_OPTIONS.map((opt) => {
            const active = retouch.preset === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectPreset(opt.id)}
                className={`rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
                  active
                    ? 'border-[#16C784] bg-[#16C784]/15 text-[#16C784] shadow-[0_0_12px_rgba(22,199,132,0.12)]'
                    : 'border-[#1E4D37]/70 bg-[#050907]/75 text-[#93B3A3] hover:border-[#16C784]/50 hover:text-[#F2F7F4]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Fine-tune Sliders (Light, Skin Polish, Clarity, Color) */}
        {!batchMode && showFineSliders && (
          <div className="mt-3 space-y-2.5 rounded-xl border border-[#1E4D37]/60 bg-[#050907]/70 p-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="inline-flex items-center gap-1 text-[#93B3A3]">
                  <Sun className="h-3 w-3 text-[#16C784]" />
                  Face Light
                </span>
                <span className="tabular-nums font-semibold text-[#F2F7F4]">
                  {retouch.brightness}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={retouch.brightness}
                onChange={(e) => handleSlider('brightness', parseInt(e.target.value, 10))}
                className="emerald-slider w-full"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-[#93B3A3]">Skin Polish</span>
                <span className="tabular-nums font-semibold text-[#F2F7F4]">
                  {retouch.skinSmooth}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={retouch.skinSmooth}
                onChange={(e) => handleSlider('skinSmooth', parseInt(e.target.value, 10))}
                className="emerald-slider w-full"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-[#93B3A3]">HD Clarity</span>
                <span className="tabular-nums font-semibold text-[#F2F7F4]">
                  {retouch.clarity}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={retouch.clarity}
                onChange={(e) => handleSlider('clarity', parseInt(e.target.value, 10))}
                className="emerald-slider w-full"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-[#93B3A3]">Color Pop</span>
                <span className="tabular-nums font-semibold text-[#F2F7F4]">
                  {retouch.vibrance}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={retouch.vibrance}
                onChange={(e) => handleSlider('vibrance', parseInt(e.target.value, 10))}
                className="emerald-slider w-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
