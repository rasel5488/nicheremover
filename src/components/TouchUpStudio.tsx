import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eraser,
  Eye,
  Hand,
  Loader2,
  Maximize,
  Minimize,
  Paintbrush,
  RotateCcw,
  Share2,
  Sliders,
  Layers,
  Undo2,
  ZoomIn,
  ZoomOut,
  Trash2,
} from 'lucide-react';
import { StudioToneIcon } from './BrandIcons';
import {
  compositeRegion,
  computeDSLRBlur,
  paintBrushSegment,
} from '../engine/compositor';
import { applyStudioRetouch } from '../engine/photoRetouch';
import {
  hydrateImageForStudio,
  persistStudioChanges,
} from '../engine/queueManager';
import {
  canUseWebShareFiles,
  copyCutoutToClipboard,
  downloadSingleItem,
  shareSingleItem,
} from '../utils/exportUtils';
import { BackgroundControls } from './BackgroundControls';
import { StudioEnhanceControls } from './StudioEnhanceControls';
import {
  MAX_UNDO_STEPS,
  type BackgroundConfig,
  type EngineInfo,
  type HydratedImageData,
  type QueueItem,
  type RetouchConfig,
  type ToolMode,
  type UndoPatch,
} from '../types';

interface TouchUpStudioProps {
  item: QueueItem;
  engine: EngineInfo;
  batchNav?: {
    index: number;
    total: number;
    onBack: () => void;
    onPrev: () => void;
    onNext: () => void;
  };
  onItemPersisted: (
    id: string,
    thumbUrl: string,
    edgeRefine: number,
    defringe: boolean,
    bgConfig: BackgroundConfig,
    retouch: RetouchConfig,
    hasManualEdits: boolean
  ) => void;
  getNextFilename: (baseName: string) => { filename: string; commit: () => void };
  onClearSingle?: () => void;
  onToast: (text: string, kind?: 'info' | 'success' | 'error') => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

export function TouchUpStudio({
  item,
  engine,
  batchNav,
  onItemPersisted,
  getNextFilename,
  onClearSingle,
  onToast,
}: TouchUpStudioProps) {
  const studioContainerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);

  // Hydrated full-resolution data for the single active image
  const hydratedRef = useRef<HydratedImageData | null>(null);
  const outputImageDataRef = useRef<ImageData | null>(null);
  const maskModifiedRef = useRef(false);
  const dirtyPersistRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);

  // Interactive studio UI state
  const [hydrating, setHydrating] = useState(false);
  const [hydratedDims, setHydratedDims] = useState<{ w: number; h: number } | null>(null);
  const [tool, setTool] = useState<ToolMode>('pan');
  const [brushSize, setBrushSize] = useState(26); // 4..100 visual scale
  const [edgeRefine, setEdgeRefine] = useState(item.edgeRefine);
  const [defringe, setDefringe] = useState(item.defringe);
  const [bgConfig, setBgConfig] = useState<BackgroundConfig>(item.bgConfig);
  const [retouch, setRetouch] = useState<RetouchConfig>(item.retouch);

  const edgeRefineRef = useRef(edgeRefine);
  edgeRefineRef.current = edgeRefine;
  const defringeRef = useRef(defringe);
  defringeRef.current = defringe;
  const bgConfigRef = useRef(bgConfig);
  bgConfigRef.current = bgConfig;
  const retouchRef = useRef(retouch);
  retouchRef.current = retouch;

  const [showOriginal, setShowOriginal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'tools' | 'enhance' | 'edges' | 'bg'>('tools');
  const [undoCount, setUndoCount] = useState(0);
  const [isBusyExport, setIsBusyExport] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [showBrushPreviewCenter, setShowBrushPreviewCenter] = useState(false);

  // Zoom / Pan state
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // Live cursor preview for Restore / Erase brush
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });

  // Undo stack & active stroke state (stored in refs for 60fps zero-re-render painting)
  const undoStackRef = useRef<UndoPatch[]>([]);
  const strokeStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startedAt: number;
    lastImgX: number;
    lastImgY: number;
    preMask: Float32Array | null;
    dirty: { x0: number; y0: number; x1: number; y1: number } | null;
  }>({
    active: false,
    pointerId: -1,
    startedAt: 0,
    lastImgX: 0,
    lastImgY: 0,
    preMask: null,
    dirty: null,
  });

  // Multi-touch pointer tracking for pinch-to-zoom & 2-finger pan
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const panStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
  });

  const pinchStateRef = useRef<{
    active: boolean;
    startDist: number;
    startScale: number;
    startMidX: number;
    startMidY: number;
    startTx: number;
    startTy: number;
  }>({
    active: false,
    startDist: 0,
    startScale: 1,
    startMidX: 0,
    startMidY: 0,
    startTx: 0,
    startTy: 0,
  });

  // Double-tap / hold-before-after trackers
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  const beforeAfterPressRef = useRef<{ downAt: number; wasShowing: boolean }>({
    downAt: 0,
    wasShowing: false,
  });

  const canShare = canUseWebShareFiles();
  const effectiveTool: ToolMode = isSpacePressed ? 'pan' : tool;

  const getBrushRadiusInImagePx = useCallback((w: number, h: number, sizeVal: number) => {
    const base = Math.min(w, h);
    return Math.max(3, (sizeVal / 100) * base * 0.14);
  }, []);

  // Render full composited canvas
  const renderFullComposite = useCallback(
    (
      edgeVal: number,
      defringeVal: boolean,
      bg: BackgroundConfig,
      rect?: { x0: number; y0: number; x1: number; y1: number }
    ) => {
      const hydrated = hydratedRef.current;
      const canvas = canvasRef.current;
      const imgData = outputImageDataRef.current;
      if (!hydrated || !canvas || !imgData) return;

      // Lazily compute DSLR bokeh blur once per hydrated image
      if (bg.type === 'dslr-blur' && !hydrated.blurredData) {
        hydrated.blurredData = computeDSLRBlur(
          hydrated.originalData,
          hydrated.width,
          hydrated.height
        );
      }

      compositeRegion({
        original: hydrated.retouchedData,
        mask: hydrated.mask,
        output: imgData.data,
        width: hydrated.width,
        height: hydrated.height,
        edgeRefine: edgeVal,
        defringe: defringeVal,
        bgConfig: bg,
        blurred: hydrated.blurredData,
        rect,
      });

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (rect) {
        const dx = Math.max(0, rect.x0);
        const dy = Math.max(0, rect.y0);
        const dw = Math.min(hydrated.width - dx, rect.x1 - dx + 1);
        const dh = Math.min(hydrated.height - dy, rect.y1 - dy + 1);
        if (dw > 0 && dh > 0) {
          ctx.putImageData(imgData, 0, 0, dx, dy, dw, dh);
        }
      } else {
        ctx.putImageData(imgData, 0, 0);
      }
    },
    []
  );

  // Flush changes to IndexedDB & update batch thumbnail
  const flushPersist = useCallback(async (): Promise<Blob | undefined> => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const hydrated = hydratedRef.current;
    if (!hydrated || !dirtyPersistRef.current) return undefined;

    dirtyPersistRef.current = false;
    const activeEdge = edgeRefineRef.current;
    const activeDefringe = defringeRef.current;
    const activeBg = bgConfigRef.current;
    const activeRetouch = retouchRef.current;
    const wasBrushed = maskModifiedRef.current;

    const { pngBlob, thumbBlob } = await persistStudioChanges({
      id: hydrated.id,
      width: hydrated.width,
      height: hydrated.height,
      originalData: hydrated.originalData,
      mask: hydrated.mask,
      retouchedData: hydrated.retouchedData,
      blurredData: hydrated.blurredData,
      edgeRefine: activeEdge,
      defringe: activeDefringe,
      bgConfig: activeBg,
      retouch: activeRetouch,
      maskModified: wasBrushed,
    });

    const newThumbUrl = URL.createObjectURL(thumbBlob);
    onItemPersisted(
      hydrated.id,
      newThumbUrl,
      activeEdge,
      activeDefringe,
      { ...activeBg },
      { ...activeRetouch },
      item.hasManualEdits || wasBrushed
    );
    maskModifiedRef.current = false;
    return pngBlob;
  }, [item.hasManualEdits, onItemPersisted]);

  const schedulePersist = useCallback(() => {
    dirtyPersistRef.current = true;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      void flushPersist();
    }, 280);
  }, [flushPersist]);

  // Flush any pending edits if Studio unmounts (e.g. clicking Header logo or pasting more files)
  useEffect(() => {
    return () => {
      if (dirtyPersistRef.current) {
        void flushPersist();
      }
    };
  }, [flushPersist]);

  // Hydrate full-resolution image + Float32Array confidence mask when item becomes done or switches
  useEffect(() => {
    let cancelled = false;
    setEdgeRefine(item.edgeRefine);
    setDefringe(item.defringe);
    setBgConfig(item.bgConfig);
    setRetouch(item.retouch);
    setView({ scale: 1, tx: 0, ty: 0 });
    setShowOriginal(false);
    undoStackRef.current = [];
    setUndoCount(0);
    maskModifiedRef.current = false;
    dirtyPersistRef.current = false;

    if (item.status !== 'done') {
      hydratedRef.current = null;
      outputImageDataRef.current = null;
      setHydratedDims(null);
      return;
    }

    setHydrating(true);
    void (async () => {
      try {
        const data = await hydrateImageForStudio(item.id);
        if (cancelled || !data) return;

        hydratedRef.current = data;
        outputImageDataRef.current = new ImageData(data.width, data.height);
        setHydratedDims({ w: data.width, h: data.height });
      } catch (err) {
        if (!cancelled) {
          onToast(
            err instanceof Error ? err.message : 'Failed to load full-HD image data',
            'error'
          );
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [item.id, item.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw canvases once hydratedDims is mounted
  useEffect(() => {
    const hydrated = hydratedRef.current;
    const canvas = canvasRef.current;
    const origCanvas = originalCanvasRef.current;
    if (!hydrated || !hydratedDims || !canvas || !origCanvas) return;

    canvas.width = hydrated.width;
    canvas.height = hydrated.height;
    origCanvas.width = hydrated.width;
    origCanvas.height = hydrated.height;

    const origCtx = origCanvas.getContext('2d');
    if (origCtx) {
      const origImgData = new ImageData(
        new Uint8ClampedArray(
          hydrated.originalData.buffer as ArrayBuffer,
          hydrated.originalData.byteOffset,
          hydrated.originalData.byteLength
        ),
        hydrated.width,
        hydrated.height
      );
      origCtx.putImageData(origImgData, 0, 0);
    }

    renderFullComposite(edgeRefine, defringe, bgConfig);
  }, [hydratedDims]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-composite smoothly when Edge Refine, Anti-Halo, Retouch, or Background changes
  const rafRef = useRef<number | null>(null);
  const handleEdgeChange = useCallback(
    (val: number) => {
      setEdgeRefine(val);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        renderFullComposite(val, defringeRef.current, bgConfigRef.current);
        rafRef.current = null;
      });
      schedulePersist();
    },
    [renderFullComposite, schedulePersist]
  );

  const handleDefringeChange = useCallback(
    (val: boolean) => {
      setDefringe(val);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        renderFullComposite(edgeRefineRef.current, val, bgConfigRef.current);
        rafRef.current = null;
      });
      schedulePersist();
    },
    [renderFullComposite, schedulePersist]
  );

  const handleBgChange = useCallback(
    (bg: BackgroundConfig) => {
      setBgConfig(bg);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        renderFullComposite(edgeRefineRef.current, defringeRef.current, bg);
        rafRef.current = null;
      });
      schedulePersist();
    },
    [renderFullComposite, schedulePersist]
  );

  const handleRetouchChange = useCallback(
    (next: RetouchConfig) => {
      setRetouch(next);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const hydrated = hydratedRef.current;
        if (!hydrated) return;
        hydrated.retouchedData = applyStudioRetouch(
          hydrated.originalData,
          hydrated.mask,
          hydrated.width,
          hydrated.height,
          next
        );
        renderFullComposite(edgeRefineRef.current, defringeRef.current, bgConfigRef.current);
        rafRef.current = null;
      });
      schedulePersist();
    },
    [renderFullComposite, schedulePersist]
  );

  // Undo handler
  const handleUndo = useCallback(() => {
    const hydrated = hydratedRef.current;
    const patch = undoStackRef.current.pop();
    if (!hydrated || !patch) return;

    const { x, y, w, h, prevMask } = patch;
    for (let row = 0; row < h; row++) {
      const dstOff = (y + row) * hydrated.width + x;
      const srcOff = row * w;
      hydrated.mask.set(prevMask.subarray(srcOff, srcOff + w), dstOff);
    }

    setUndoCount(undoStackRef.current.length);
    maskModifiedRef.current = true;
    renderFullComposite(edgeRefineRef.current, defringeRef.current, bgConfigRef.current, {
      x0: x,
      y0: y,
      x1: x + w - 1,
      y1: y + h - 1,
    });
    schedulePersist();
  }, [renderFullComposite, schedulePersist]);

  // Keyboard shortcuts (Ctrl+Z undo, Space temporary pan, B peek original, Esc exit fullscreen)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTextField = tag === 'INPUT' || tag === 'TEXTAREA';

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isTextField) return;
        e.preventDefault();
        handleUndo();
      } else if (e.code === 'Space' && !e.repeat) {
        if (!isTextField && tag !== 'BUTTON') {
          e.preventDefault();
          setIsSpacePressed(true);
        }
      } else if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey && !e.repeat) {
        if (!isTextField) {
          setShowOriginal(true);
        }
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
      if (e.key.toLowerCase() === 'b') setShowOriginal(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleUndo, isFullscreen]);

  // Sync native fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    try {
      if (next && studioContainerRef.current?.requestFullscreen) {
        await studioContainerRef.current.requestFullscreen();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback CSS fixed fullscreen already active (works on iOS Safari!)
    }
  };

  // Zoom around a point relative to viewport center
  const zoomAtPoint = useCallback((nextScale: number, clientX?: number, clientY?: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextScale));
    if (clamped <= 1.01) {
      setView({ scale: 1, tx: 0, ty: 0 });
      return;
    }

    const vp = viewportRef.current;
    const cur = viewRef.current;
    if (!vp || clientX === undefined || clientY === undefined) {
      const ratio = clamped / cur.scale;
      setView({ scale: clamped, tx: cur.tx * ratio, ty: cur.ty * ratio });
      return;
    }

    const rect = vp.getBoundingClientRect();
    const cx = clientX - (rect.left + rect.width / 2);
    const cy = clientY - (rect.top + rect.height / 2);
    const ratio = clamped / cur.scale;
    setView({
      scale: clamped,
      tx: cx - (cx - cur.tx) * ratio,
      ty: cy - (cy - cur.ty) * ratio,
    });
  }, []);

  // Mouse wheel zoom on viewport (passive: false so page never scrolls)
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.16 : 1 / 1.16;
      zoomAtPoint(viewRef.current.scale * factor, e.clientX, e.clientY);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoomAtPoint, hydratedDims]);

  const clientToImageCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    const hydrated = hydratedRef.current;
    if (!canvas || !hydrated) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * hydrated.width,
      y: ((clientY - rect.top) / rect.height) * hydrated.height,
    };
  };

  const finalizeBrushStroke = useCallback(() => {
    const st = strokeStateRef.current;
    const hydrated = hydratedRef.current;
    if (!st.active) return;

    if (hydrated && st.preMask && st.dirty) {
      const { x0, y0, x1, y1 } = st.dirty;
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      if (w > 0 && h > 0) {
        const patchBuf = new Float32Array(w * h);
        for (let row = 0; row < h; row++) {
          const srcOff = (y0 + row) * hydrated.width + x0;
          patchBuf.set(st.preMask.subarray(srcOff, srcOff + w), row * w);
        }
        undoStackRef.current.push({ x: x0, y: y0, w, h, prevMask: patchBuf });
        if (undoStackRef.current.length > MAX_UNDO_STEPS) {
          undoStackRef.current.shift();
        }
        setUndoCount(undoStackRef.current.length);
        maskModifiedRef.current = true;
        schedulePersist();
      }
    }

    st.active = false;
    st.pointerId = -1;
    st.preMask = null;
    st.dirty = null;
  }, [schedulePersist]);

  const rollbackRecentBrushStroke = useCallback(() => {
    const st = strokeStateRef.current;
    const hydrated = hydratedRef.current;
    if (!st.active || !hydrated || !st.preMask) return;
    if (st.dirty) {
      hydrated.mask.set(st.preMask);
      renderFullComposite(edgeRefineRef.current, defringeRef.current, bgConfigRef.current, st.dirty);
    }
    st.active = false;
    st.pointerId = -1;
    st.preMask = null;
    st.dirty = null;
  }, [renderFullComposite]);

  // Unified Pointer Handlers (Mouse + Touch + Stylus)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (!vp) return;
    vp.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 2 pointers => Pinch-to-Zoom & 2-Finger Pan
    if (pointersRef.current.size === 2) {
      // Cancel accidental brush dot if 2nd finger landed right after 1st finger
      if (strokeStateRef.current.active && performance.now() - strokeStateRef.current.startedAt < 180) {
        rollbackRecentBrushStroke();
      } else if (strokeStateRef.current.active) {
        finalizeBrushStroke();
      }
      panStateRef.current.active = false;

      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;

      pinchStateRef.current = {
        active: true,
        startDist: Math.max(10, dist),
        startScale: viewRef.current.scale,
        startMidX: midX,
        startMidY: midY,
        startTx: viewRef.current.tx,
        startTy: viewRef.current.ty,
      };
      return;
    }

    if (pointersRef.current.size > 2) return;

    // Middle mouse button or Pan tool => Pan / Double-Tap Zoom
    const wantsPan = effectiveTool === 'pan' || e.button === 1;
    if (wantsPan) {
      // Check double-tap / double-click (1x <-> 2.5x)
      const now = performance.now();
      const dt = now - lastTapRef.current.time;
      const dist = Math.hypot(e.clientX - lastTapRef.current.x, e.clientY - lastTapRef.current.y);
      if (dt < 300 && dist < 24 && e.button === 0) {
        lastTapRef.current = { time: 0, x: 0, y: 0 };
        const nextScale = viewRef.current.scale > 1.05 ? 1 : 2.5;
        zoomAtPoint(nextScale, e.clientX, e.clientY);
        return;
      }
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };

      panStateRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTx: viewRef.current.tx,
        startTy: viewRef.current.ty,
      };
      return;
    }

    // Brush Mode (Restore or Erase)
    if (e.button !== 0 || showOriginal) return;
    const hydrated = hydratedRef.current;
    if (!hydrated) return;

    const pt = clientToImageCoords(e.clientX, e.clientY);
    if (!pt) return;

    const preMask = new Float32Array(hydrated.mask);
    const radius = getBrushRadiusInImagePx(hydrated.width, hydrated.height, brushSize);
    const dirty = paintBrushSegment({
      mask: hydrated.mask,
      width: hydrated.width,
      height: hydrated.height,
      x0: pt.x,
      y0: pt.y,
      x1: pt.x,
      y1: pt.y,
      radius,
      mode: effectiveTool,
    });

    strokeStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startedAt: performance.now(),
      lastImgX: pt.x,
      lastImgY: pt.y,
      preMask,
      dirty,
    };

    if (dirty) {
      renderFullComposite(edgeRefineRef.current, defringeRef.current, bgConfigRef.current, dirty);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (vp && e.pointerType !== 'touch') {
      const vpRect = vp.getBoundingClientRect();
      setCursorPos({
        x: e.clientX - vpRect.left,
        y: e.clientY - vpRect.top,
        visible: true,
      });
    }

    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Active 2-finger pinch-to-zoom & pan
    if (pinchStateRef.current.active && pointersRef.current.size === 2 && vp) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;

      const p = pinchStateRef.current;
      const nextScale = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, p.startScale * (dist / p.startDist))
      );

      if (nextScale <= 1.01) {
        setView({ scale: 1, tx: 0, ty: 0 });
        return;
      }

      const rect = vp.getBoundingClientRect();
      const startRelX = p.startMidX - (rect.left + rect.width / 2);
      const startRelY = p.startMidY - (rect.top + rect.height / 2);
      const ratio = nextScale / p.startScale;
      const dxMid = midX - p.startMidX;
      const dyMid = midY - p.startMidY;

      setView({
        scale: nextScale,
        tx: startRelX - (startRelX - p.startTx) * ratio + dxMid,
        ty: startRelY - (startRelY - p.startTy) * ratio + dyMid,
      });
      return;
    }

    // Active Pan
    if (panStateRef.current.active && panStateRef.current.pointerId === e.pointerId) {
      const dx = e.clientX - panStateRef.current.startX;
      const dy = e.clientY - panStateRef.current.startY;
      setView({
        scale: viewRef.current.scale,
        tx: panStateRef.current.startTx + dx,
        ty: panStateRef.current.startTy + dy,
      });
      return;
    }

    // Active Brush Painting
    const st = strokeStateRef.current;
    const hydrated = hydratedRef.current;
    if (
      st.active &&
      st.pointerId === e.pointerId &&
      hydrated &&
      (effectiveTool === 'restore' || effectiveTool === 'erase')
    ) {
      const pt = clientToImageCoords(e.clientX, e.clientY);
      if (!pt) return;

      const radius = getBrushRadiusInImagePx(hydrated.width, hydrated.height, brushSize);
      const segDirty = paintBrushSegment({
        mask: hydrated.mask,
        width: hydrated.width,
        height: hydrated.height,
        x0: st.lastImgX,
        y0: st.lastImgY,
        x1: pt.x,
        y1: pt.y,
        radius,
        mode: effectiveTool,
      });

      st.lastImgX = pt.x;
      st.lastImgY = pt.y;

      if (segDirty) {
        if (!st.dirty) {
          st.dirty = { ...segDirty };
        } else {
          st.dirty.x0 = Math.min(st.dirty.x0, segDirty.x0);
          st.dirty.y0 = Math.min(st.dirty.y0, segDirty.y0);
          st.dirty.x1 = Math.max(st.dirty.x1, segDirty.x1);
          st.dirty.y1 = Math.max(st.dirty.y1, segDirty.y1);
        }
        renderFullComposite(edgeRefineRef.current, defringeRef.current, bgConfigRef.current, segDirty);
      }
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size < 2) {
      pinchStateRef.current.active = false;
    }
    if (panStateRef.current.pointerId === e.pointerId) {
      panStateRef.current.active = false;
    }
    if (strokeStateRef.current.pointerId === e.pointerId) {
      finalizeBrushStroke();
    }
  };

  // Before / After press-and-hold OR quick-tap toggle
  const handleBeforeAfterDown = () => {
    beforeAfterPressRef.current = {
      downAt: performance.now(),
      wasShowing: showOriginal,
    };
    setShowOriginal(true);
  };

  const handleBeforeAfterUp = () => {
    const heldMs = performance.now() - beforeAfterPressRef.current.downAt;
    if (heldMs >= 220) {
      // Momentary hold release -> return to cutout
      setShowOriginal(false);
    } else {
      // Quick click/tap -> toggle state cleanly
      setShowOriginal(!beforeAfterPressRef.current.wasShowing);
    }
  };

  // Export handlers (always flush unsaved studio edits first!)
  const handleDownload = async () => {
    if (item.status !== 'done') return;
    setIsBusyExport(true);
    try {
      const freshBlob = await flushPersist();
      const { filename, commit } = getNextFilename(item.baseName);
      const savedName = await downloadSingleItem(item, {
        overrideBlob: freshBlob,
        filename,
      });
      commit();
      onToast(`Downloaded ${savedName}`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Download failed', 'error');
    } finally {
      setIsBusyExport(false);
    }
  };

  const handleCopy = async () => {
    if (item.status !== 'done') return;
    setIsBusyExport(true);
    try {
      const freshBlob = await flushPersist();
      await copyCutoutToClipboard(item, freshBlob);
      onToast('Copied lossless HD PNG to clipboard', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Copy to clipboard failed', 'error');
    } finally {
      setIsBusyExport(false);
    }
  };

  const handleShare = async () => {
    if (item.status !== 'done') return;
    setIsBusyExport(true);
    try {
      const freshBlob = await flushPersist();
      const { filename, commit } = getNextFilename(item.baseName);
      const { shared, filename: sharedName } = await shareSingleItem(item, {
        overrideBlob: freshBlob,
        filename,
      });
      if (shared) {
        commit();
        onToast(`Shared ${sharedName}`, 'success');
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Share failed', 'error');
    } finally {
      setIsBusyExport(false);
    }
  };

  const handleNavigate = async (action: () => void) => {
    await flushPersist();
    action();
  };

  // Compute exact brush ring diameter on screen matching current canvas zoom
  const getBrushScreenDiameter = () => {
    const canvas = canvasRef.current;
    const hydrated = hydratedRef.current;
    if (!canvas || !hydrated) return 32;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return 32;
    const radiusPx = getBrushRadiusInImagePx(hydrated.width, hydrated.height, brushSize);
    return Math.max(8, radiusPx * 2 * (rect.width / hydrated.width));
  };

  const isBrushTool = effectiveTool === 'restore' || effectiveTool === 'erase';
  const brushScreenDiameter = isBrushTool || showBrushPreviewCenter ? getBrushScreenDiameter() : 0;

  return (
    <div
      ref={studioContainerRef}
      className={`flex flex-1 flex-col bg-[#050907] ${
        isFullscreen ? 'fixed inset-0 z-50 h-dvh w-screen' : 'min-h-[calc(100dvh-3.5rem)]'
      }`}
    >
      {/* Top Studio Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E4D37]/60 bg-[#0B1410]/95 px-2.5 py-2 sm:px-4">
        {/* Left: Back / Navigation / File Info */}
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
          {batchNav ? (
            <>
              <button
                type="button"
                onClick={() => void handleNavigate(batchNav.onBack)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#1E4D37] bg-[#050907] px-2.5 py-1.5 text-xs font-semibold text-[#F2F7F4] transition hover:border-[#16C784] hover:text-[#16C784]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Batch ({batchNav.total})</span>
              </button>

              <div className="flex items-center rounded-xl border border-[#1E4D37]/70 bg-[#050907]">
                <button
                  type="button"
                  onClick={() => void handleNavigate(batchNav.onPrev)}
                  disabled={batchNav.index <= 0}
                  title="Previous image"
                  className="p-1.5 text-[#93B3A3] transition hover:text-[#F2F7F4] disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="tabular-nums px-1.5 text-[11px] font-medium text-[#93B3A3]">
                  {batchNav.index + 1}/{batchNav.total}
                </span>
                <button
                  type="button"
                  onClick={() => void handleNavigate(batchNav.onNext)}
                  disabled={batchNav.index >= batchNav.total - 1}
                  title="Next image"
                  className="p-1.5 text-[#93B3A3] transition hover:text-[#F2F7F4] disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          ) : (
            onClearSingle && (
              <button
                type="button"
                onClick={onClearSingle}
                title="Start over"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#1E4D37]/70 bg-[#050907] px-2.5 py-1.5 text-xs font-medium text-[#93B3A3] transition hover:border-red-500/50 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New</span>
              </button>
            )
          )}

          <div className="min-w-0">
            <p className="max-w-[120px] truncate text-xs font-semibold text-[#F2F7F4] sm:max-w-[240px] sm:text-sm">
              {item.name}
            </p>
            {item.width > 0 && (
              <p className="tabular-nums text-[10px] text-[#7FA090]">
                {item.width} × {item.height} px
                {item.durationMs ? ` · ${(item.durationMs / 1000).toFixed(2)}s` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Center/Right: Before/After, Undo, Zoom, Fullscreen, Export */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Before / After Original button (hold or click toggle) */}
          <button
            type="button"
            disabled={item.status !== 'done'}
            onContextMenu={(e) => e.preventDefault()}
            style={{ touchAction: 'none' }}
            onPointerDown={handleBeforeAfterDown}
            onPointerUp={handleBeforeAfterUp}
            onPointerLeave={() => {
              if (performance.now() - beforeAfterPressRef.current.downAt >= 220 && beforeAfterPressRef.current.downAt > 0) {
                setShowOriginal(false);
                beforeAfterPressRef.current.downAt = 0;
              }
            }}
            title="Hold or click to compare Original (shortcut: B)"
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition select-none disabled:opacity-40 ${
              showOriginal
                ? 'border-[#16C784] bg-[#16C784] text-[#050907]'
                : 'border-[#1E4D37] bg-[#050907] text-[#F2F7F4] hover:border-[#16C784]/70'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{showOriginal ? 'Original' : 'Before / After'}</span>
          </button>

          {/* Undo */}
          <button
            type="button"
            disabled={undoCount === 0}
            onClick={handleUndo}
            title="Undo brush stroke (Ctrl+Z)"
            className="inline-flex items-center gap-1 rounded-xl border border-[#1E4D37] bg-[#050907] px-2.5 py-1.5 text-xs font-medium text-[#F2F7F4] transition hover:border-[#16C784] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Undo2 className="h-3.5 w-3.5" />
            {undoCount > 0 && <span className="tabular-nums text-[11px] text-[#16C784]">{undoCount}</span>}
          </button>

          {/* Zoom Controls (Desktop compact) */}
          <div className="hidden items-center rounded-xl border border-[#1E4D37] bg-[#050907] sm:flex">
            <button
              type="button"
              onClick={() => zoomAtPoint(view.scale / 1.3)}
              disabled={view.scale <= MIN_ZOOM}
              title="Zoom out"
              className="p-1.5 text-[#93B3A3] transition hover:text-[#F2F7F4] disabled:opacity-30"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
              title="Reset zoom to 100%"
              className="tabular-nums min-w-[46px] px-1 text-center text-[11px] font-semibold text-[#F2F7F4] hover:text-[#16C784]"
            >
              {Math.round(view.scale * 100)}%
            </button>
            <button
              type="button"
              onClick={() => zoomAtPoint(view.scale * 1.3)}
              disabled={view.scale >= MAX_ZOOM}
              title="Zoom in"
              className="p-1.5 text-[#93B3A3] transition hover:text-[#F2F7F4] disabled:opacity-30"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="rounded-xl border border-[#1E4D37] bg-[#050907] p-1.5 text-[#93B3A3] transition hover:border-[#16C784] hover:text-[#F2F7F4]"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>

          {/* Copy Cutout to Clipboard */}
          <button
            type="button"
            disabled={item.status !== 'done' || isBusyExport}
            onClick={() => void handleCopy()}
            title="Copy cutout PNG to clipboard"
            className="hidden items-center gap-1.5 rounded-xl border border-[#1E4D37] bg-[#050907] px-2.5 py-1.5 text-xs font-medium text-[#F2F7F4] transition hover:border-[#16C784] hover:text-[#16C784] disabled:opacity-40 md:inline-flex"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy</span>
          </button>

          {/* Mobile Share (Web Share API) */}
          {canShare && (
            <button
              type="button"
              disabled={item.status !== 'done' || isBusyExport}
              onClick={() => void handleShare()}
              title="Share HD PNG"
              className="inline-flex items-center justify-center rounded-xl border border-[#1E4D37] bg-[#050907] p-1.5 text-[#F2F7F4] transition hover:border-[#16C784] hover:text-[#16C784] disabled:opacity-40"
            >
              <Share2 className="h-4 w-4" />
            </button>
          )}

          {/* Primary Download HD PNG */}
          <button
            type="button"
            disabled={item.status !== 'done' || isBusyExport}
            onClick={() => void handleDownload()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#16C784] px-3 py-1.5 text-xs font-semibold text-[#050907] shadow-[0_4px_16px_rgba(22,199,132,0.25)] transition hover:bg-[#22DE96] active:scale-[0.98] disabled:opacity-45 sm:px-3.5"
          >
            {isBusyExport ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>Download PNG</span>
          </button>
        </div>
      </div>

      {/* Main Studio Body: Canvas + Desktop Right Sidebar / Mobile Bottom Controls */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Interactive Canvas Viewport */}
        <div
          ref={viewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
          onPointerLeave={() => setCursorPos((p) => ({ ...p, visible: false }))}
          style={{ touchAction: 'none' }}
          className={`checkerboard-bg relative flex flex-1 select-none items-center justify-center overflow-hidden min-h-[48dvh] lg:min-h-0 ${
            effectiveTool === 'pan'
              ? 'cursor-grab active:cursor-grabbing'
              : isBrushTool && !showOriginal
                ? 'cursor-none'
                : 'cursor-default'
          }`}
        >
          {/* Processing or Hydrating State */}
          {item.status !== 'done' ? (
            <div className="relative flex h-full w-full flex-col items-center justify-center p-6">
              <img
                src={item.previewUrl}
                alt={item.name}
                className="max-h-[65dvh] max-w-full rounded-xl object-contain opacity-65 blur-[1px]"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#050907]/45 p-4">
                <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-[#1E4D37] bg-[#0B1410]/95 px-6 py-5 text-center shadow-2xl backdrop-blur-md">
                  <Loader2 className="h-8 w-8 animate-spin text-[#16C784]" />
                  <div>
                    <p className="text-sm font-semibold text-[#F2F7F4]">
                      {engine.status === 'loading'
                        ? engine.loadMessage || 'Loading HD Engine…'
                        : item.status === 'error'
                          ? item.error || 'Processing failed'
                          : 'Removing Background…'}
                    </p>
                    <p className="mt-1 text-xs text-[#93B3A3]">
                      {engine.status === 'loading'
                        ? 'Cached locally after first run for instant cutouts'
                        : 'Refining hair & soft edges on your device'}
                    </p>
                  </div>
                  {engine.status === 'loading' && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#050907]">
                      <div
                        className="h-full bg-[#16C784] transition-all duration-300"
                        style={{ width: `${Math.max(5, engine.loadProgress)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Hardware-accelerated Zoom & Pan Layer */}
              <div
                style={{
                  transform: `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${view.scale})`,
                  transformOrigin: 'center center',
                }}
                className="relative flex h-full w-full items-center justify-center p-3 sm:p-6 will-change-transform"
              >
                <div className="relative flex max-h-full max-w-full items-center justify-center">
                  {/* Composited Output Canvas */}
                  <canvas
                    ref={canvasRef}
                    className={`max-h-[calc(100dvh-19rem)] max-w-full rounded-sm shadow-[0_12px_40px_rgba(0,0,0,0.5)] lg:max-h-[calc(100dvh-9rem)] ${
                      showOriginal ? 'hidden' : 'block'
                    }`}
                  />
                  {/* Instant 0ms Original Canvas for Before / After */}
                  <canvas
                    ref={originalCanvasRef}
                    className={`max-h-[calc(100dvh-19rem)] max-w-full rounded-sm shadow-[0_12px_40px_rgba(0,0,0,0.5)] lg:max-h-[calc(100dvh-9rem)] ${
                      showOriginal ? 'block' : 'hidden'
                    }`}
                  />
                </div>
              </div>

              {/* Hydrating Spinner */}
              {hydrating && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#050907]/50 backdrop-blur-[2px]">
                  <div className="flex items-center gap-2 rounded-full border border-[#1E4D37] bg-[#0B1410] px-4 py-2 text-xs font-medium text-[#F2F7F4]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#16C784]" />
                    <span>Hydrating Full HD mask…</span>
                  </div>
                </div>
              )}

              {/* Before/After Indicator Pill */}
              {showOriginal && (
                <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-[#16C784]/60 bg-[#050907]/90 px-3 py-1 text-xs font-semibold text-[#16C784] shadow-lg">
                  Showing Original
                </div>
              )}

              {/* Mobile Floating Reset Zoom Pill */}
              {view.scale > 1.05 && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-[#1E4D37] bg-[#0B1410]/90 px-3 py-1.5 text-xs font-semibold text-[#F2F7F4] shadow-lg backdrop-blur-md transition hover:border-[#16C784] hover:text-[#16C784]"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="tabular-nums">Reset {Math.round(view.scale * 100)}%</span>
                </button>
              )}

              {/* Live Circular Brush Cursor Ring (Green = Restore, Red = Erase) */}
              {isBrushTool && !showOriginal && cursorPos.visible && (
                <div
                  aria-hidden="true"
                  style={{
                    width: `${brushScreenDiameter}px`,
                    height: `${brushScreenDiameter}px`,
                    transform: `translate3d(${cursorPos.x - brushScreenDiameter / 2}px, ${cursorPos.y - brushScreenDiameter / 2}px, 0)`,
                  }}
                  className={`pointer-events-none absolute left-0 top-0 rounded-full border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.7)] ${
                    effectiveTool === 'restore'
                      ? 'border-[#16C784] bg-[#16C784]/10'
                      : 'border-red-500 bg-red-500/10'
                  }`}
                >
                  {/* 68% Inner Hardness Ring */}
                  <div
                    className={`absolute left-1/2 top-1/2 h-[68%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed ${
                      effectiveTool === 'restore' ? 'border-[#16C784]/75' : 'border-red-400/75'
                    }`}
                  />
                </div>
              )}

              {/* Centered Brush Size Live Ring Preview while dragging Brush Size Slider */}
              {showBrushPreviewCenter && (
                <div
                  aria-hidden="true"
                  style={{
                    width: `${brushScreenDiameter}px`,
                    height: `${brushScreenDiameter}px`,
                  }}
                  className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.7)] ${
                    tool === 'erase'
                      ? 'border-red-500 bg-red-500/12'
                      : 'border-[#16C784] bg-[#16C784]/12'
                  }`}
                >
                  <div
                    className={`absolute left-1/2 top-1/2 h-[68%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed ${
                      tool === 'erase' ? 'border-red-400/75' : 'border-[#16C784]/75'
                    }`}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* DESKTOP RIGHT SIDEBAR (Clean Studio Inspector) */}
        <aside className="hidden w-[300px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-[#1E4D37]/60 bg-[#0B1410] p-4 lg:flex">
          {/* Tools Section */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#93B3A3]">
                Touch-Up Tool
              </span>
              <span className="text-[10px] text-[#6E8F7E]">Hold Space to Pan</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTool('pan')}
                className={`flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition ${
                  tool === 'pan'
                    ? 'border-[#16C784] bg-[#16C784]/15 text-[#16C784]'
                    : 'border-[#1E4D37]/70 bg-[#050907] text-[#93B3A3] hover:text-[#F2F7F4]'
                }`}
              >
                <Hand className="h-4 w-4" />
                <span>Zoom/Pan</span>
              </button>

              <button
                type="button"
                onClick={() => setTool('restore')}
                className={`flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition ${
                  tool === 'restore'
                    ? 'border-[#16C784] bg-[#16C784]/15 text-[#16C784]'
                    : 'border-[#1E4D37]/70 bg-[#050907] text-[#93B3A3] hover:border-[#16C784]/50 hover:text-[#F2F7F4]'
                }`}
              >
                <Paintbrush className="h-4 w-4" />
                <span>Restore</span>
              </button>

              <button
                type="button"
                onClick={() => setTool('erase')}
                className={`flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition ${
                  tool === 'erase'
                    ? 'border-red-500 bg-red-500/15 text-red-400'
                    : 'border-[#1E4D37]/70 bg-[#050907] text-[#93B3A3] hover:border-red-500/50 hover:text-[#F2F7F4]'
                }`}
              >
                <Eraser className="h-4 w-4" />
                <span>Erase</span>
              </button>
            </div>

            {/* Brush Size Slider */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-[#93B3A3]">Brush Size</label>
                <span className="tabular-nums text-xs font-semibold text-[#F2F7F4]">
                  {brushSize}%
                </span>
              </div>
              <input
                type="range"
                min={4}
                max={100}
                step={1}
                value={brushSize}
                onPointerDown={() => setShowBrushPreviewCenter(true)}
                onPointerUp={() => setShowBrushPreviewCenter(false)}
                onPointerCancel={() => setShowBrushPreviewCenter(false)}
                onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                className="emerald-slider w-full"
                aria-label="Brush Size"
              />
            </div>
          </div>

          <hr className="border-[#1E4D37]/50" />

          {/* Studio Retouch */}
          <StudioEnhanceControls
            retouch={retouch}
            onRetouchChange={handleRetouchChange}
          />

          <hr className="border-[#1E4D37]/50" />

          {/* Edge Refine + Anti-Halo + Background Styles */}
          <BackgroundControls
            edgeRefine={edgeRefine}
            defringe={defringe}
            bgConfig={bgConfig}
            onEdgeRefineChange={handleEdgeChange}
            onDefringeChange={handleDefringeChange}
            onBgConfigChange={handleBgChange}
          />

          <hr className="border-[#1E4D37]/50" />

          {/* Quick Zoom & Tips */}
          <div className="rounded-xl border border-[#1E4D37]/60 bg-[#050907]/70 p-3 text-[11px] leading-relaxed text-[#7FA090]">
            <p className="font-medium text-[#F2F7F4]/90">Quick Controls</p>
            <ul className="mt-1 space-y-0.5">
              <li>• Scroll wheel to zoom up to 6×</li>
              <li>• Double-click in Zoom/Pan for 1× ↔ 2.5×</li>
              <li>• Soft 68% feathered brush preserves hair</li>
              <li>• Press Ctrl+Z to undo (up to {MAX_UNDO_STEPS} steps)</li>
            </ul>
          </div>
        </aside>

        {/* MOBILE THUMB-FRIENDLY BOTTOM CONTROL SHEET */}
        <section className="flex flex-col border-t border-[#1E4D37]/70 bg-[#0B1410] pb-[env(safe-area-inset-bottom)] lg:hidden">
          {/* Active Tab Content */}
          <div className="px-3.5 py-3">
            {mobileTab === 'tools' && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTool('pan')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold ${
                      tool === 'pan'
                        ? 'border-[#16C784] bg-[#16C784]/15 text-[#16C784]'
                        : 'border-[#1E4D37]/70 bg-[#050907] text-[#93B3A3]'
                    }`}
                  >
                    <Hand className="h-4 w-4" />
                    <span>Zoom/Pan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTool('restore')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold ${
                      tool === 'restore'
                        ? 'border-[#16C784] bg-[#16C784]/15 text-[#16C784]'
                        : 'border-[#1E4D37]/70 bg-[#050907] text-[#93B3A3]'
                    }`}
                  >
                    <Paintbrush className="h-4 w-4" />
                    <span>Restore</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTool('erase')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold ${
                      tool === 'erase'
                        ? 'border-red-500 bg-red-500/15 text-red-400'
                        : 'border-[#1E4D37]/70 bg-[#050907] text-[#93B3A3]'
                    }`}
                  >
                    <Eraser className="h-4 w-4" />
                    <span>Erase</span>
                  </button>
                </div>

                {tool !== 'pan' && (
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-xs font-medium text-[#93B3A3]">Size</span>
                    <input
                      type="range"
                      min={4}
                      max={100}
                      step={1}
                      value={brushSize}
                      onPointerDown={() => setShowBrushPreviewCenter(true)}
                      onPointerUp={() => setShowBrushPreviewCenter(false)}
                      onPointerCancel={() => setShowBrushPreviewCenter(false)}
                      onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                      className="emerald-slider flex-1"
                      aria-label="Brush Size"
                    />
                    <span className="tabular-nums w-9 text-right text-xs font-semibold text-[#16C784]">
                      {brushSize}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {mobileTab === 'enhance' && (
              <StudioEnhanceControls
                retouch={retouch}
                onRetouchChange={handleRetouchChange}
                compact
              />
            )}

            {mobileTab === 'edges' && (
              <BackgroundControls
                edgeRefine={edgeRefine}
                defringe={defringe}
                bgConfig={bgConfig}
                onEdgeRefineChange={handleEdgeChange}
                onDefringeChange={handleDefringeChange}
                onBgConfigChange={handleBgChange}
                compact
                showEdgeRefine
                showBackground={false}
              />
            )}

            {mobileTab === 'bg' && (
              <BackgroundControls
                edgeRefine={edgeRefine}
                defringe={defringe}
                bgConfig={bgConfig}
                onEdgeRefineChange={handleEdgeChange}
                onDefringeChange={handleDefringeChange}
                onBgConfigChange={handleBgChange}
                compact
                showEdgeRefine={false}
                showBackground
              />
            )}
          </div>

          {/* Bottom Tab Bar */}
          <div className="grid grid-cols-5 border-t border-[#1E4D37]/50 bg-[#050907]">
            <button
              type="button"
              onClick={() => setMobileTab('tools')}
              className={`flex flex-col items-center gap-1 py-2 text-[10px] font-medium ${
                mobileTab === 'tools' ? 'text-[#16C784]' : 'text-[#7FA090]'
              }`}
            >
              <Paintbrush className="h-4 w-4" />
              <span>Brush</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileTab('enhance')}
              className={`flex flex-col items-center gap-1 py-2 text-[10px] font-medium ${
                mobileTab === 'enhance' ? 'text-[#16C784]' : 'text-[#7FA090]'
              }`}
            >
              <StudioToneIcon className="h-4 w-4" />
              <span>Retouch</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileTab('edges')}
              className={`flex flex-col items-center gap-1 py-2 text-[10px] font-medium ${
                mobileTab === 'edges' ? 'text-[#16C784]' : 'text-[#7FA090]'
              }`}
            >
              <Sliders className="h-4 w-4" />
              <span>Edges</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileTab('bg')}
              className={`flex flex-col items-center gap-1 py-2 text-[10px] font-medium ${
                mobileTab === 'bg' ? 'text-[#16C784]' : 'text-[#7FA090]'
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>BG</span>
            </button>

            <button
              type="button"
              disabled={item.status !== 'done' || isBusyExport}
              onClick={() => void handleCopy()}
              className="flex flex-col items-center gap-1 py-2 text-[10px] font-medium text-[#7FA090] active:text-[#16C784] disabled:opacity-40"
            >
              <Copy className="h-4 w-4" />
              <span>Copy</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
