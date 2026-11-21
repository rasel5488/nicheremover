# Niche Remover — HD Background Remover

A fast, clean, responsive **Web HD Background Remover** for both **Desktop (PC/Mac)** and **Mobile (Android/iOS)** powered by a 100% client-side Full HD confidence-mask pipeline — zero server uploads, zero watermarks, completely free.

## Highlights

- **Full HD Client-Side Engine (`RMBG-1.4` ONNX)**: Runs inside a dedicated Web Worker with WebGPU (`fp16` ~84 MiB / `fp32`) acceleration and WASM (`q8` ~44 MB) fallback, cached locally in Browser Cache Storage after the first run.
- **Studio Edge Pipeline (up to `3072px`)**: EXIF-preserving HD decode, Auto Noise & Floating-Island Cleanup, **Anti-Halo Color Decontamination (De-fringe)**, and **Hermite Smoothstep Edge Feathering** (`Edge Refine` `t = 0.00–1.00`, default `0.32`).
- **Studio Retouch & Portrait Polish**: Foreground-only enhancement (shadow-aware face light, skin-tone-aware edge-preserving polish keeping eyes & hair sharp, HD clarity, skin-safe color pop) with 1-click presets (`Off`, `Auto Studio`, `Soft Glow`, `Crisp HD`) + fine-tune sliders.
- **Instant Background Styles**: `Transparent`, `White`, `Black`, `Studio Blue (#1D4ED8)`, custom color picker, and **DSLR Blur** (3-pass separable box blur bokeh).
- **Universal Single & Bulk Input (1 to 100+ Images)**: Global `Ctrl+V` / `Cmd+V` multi-file & screenshot paste, full-page Drag & Drop (files & folders), and multi-select File Picker.
- **Memory-Safe Batch Queue & Custom Sequential File Naming**: IndexedDB-backed compressed mask cache, live progress counter (`Processed X / N`), `Pause / Resume / Cancel`, **Apply to All**, persistent **File Name** sequential numbering (`Name 1.png`, `Name 2.png`, …), and fast `fflate` **Download All ZIP**.
- **Interactive Touch-Up Studio**: Zoom/Pan up to `6×` (wheel, pinch-zoom, double-click/tap `1× ↔ 2.5×`, Reset Zoom), soft `68%` feathered **Restore** (green ring) & **Erase** (red ring) brushes, Undo (`Ctrl+Z`), Before/After hold-or-toggle Original, Fullscreen, Copy PNG, and Mobile Share.

## Local Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```
