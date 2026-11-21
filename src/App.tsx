import { useCallback, useEffect, useRef, useState } from 'react';
import { BatchWorkspace } from './components/BatchWorkspace';
import { DropOverlay } from './components/DropOverlay';
import { Header } from './components/Header';
import { ToastContainer } from './components/ToastContainer';
import { TouchUpStudio } from './components/TouchUpStudio';
import { UploadHero } from './components/UploadHero';
import {
  recompositeStoredImage,
  SegmentationQueueManager,
} from './engine/queueManager';
import { clearAllStoredImages } from './engine/storage';
import {
  buildOutputFilename,
  downloadBatchAsZip,
  downloadSingleItem,
} from './utils/exportUtils';
import {
  formatSequentialPngName,
  loadFileNamingConfig,
  sanitizePrefix,
  saveFileNamingConfig,
  type FileNamingConfig,
} from './utils/fileNaming';
import {
  createFastInitialPreviewUrl,
  extractFilesFromClipboard,
  extractFilesFromDataTransfer,
  getCleanBaseName,
  isImageFile,
} from './utils/fileIntake';
import {
  DEFAULT_BG_CONFIG,
  DEFAULT_DEFRINGE,
  DEFAULT_EDGE_REFINE,
  DEFAULT_RETOUCH_CONFIG,
  type BackgroundConfig,
  type EngineInfo,
  type QueueItem,
  type RetouchConfig,
  type ToastMessage,
} from './types';

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<SegmentationQueueManager | null>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  const dragDepthRef = useRef(0);

  const [items, setItems] = useState<QueueItem[]>([]);
  itemsRef.current = items;

  const [activeStudioId, setActiveStudioId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [globalEdgeRefine, setGlobalEdgeRefine] = useState(DEFAULT_EDGE_REFINE);
  const [globalDefringe, setGlobalDefringe] = useState(DEFAULT_DEFRINGE);
  const [globalBgConfig, setGlobalBgConfig] = useState<BackgroundConfig>(DEFAULT_BG_CONFIG);
  const [globalRetouch, setGlobalRetouch] = useState<RetouchConfig>(DEFAULT_RETOUCH_CONFIG);

  const [fileNaming, setFileNaming] = useState<FileNamingConfig>(() => loadFileNamingConfig());
  const fileNamingRef = useRef<FileNamingConfig>(fileNaming);
  fileNamingRef.current = fileNaming;

  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [engine, setEngine] = useState<EngineInfo>({
    status: 'idle',
    backend: null,
    loadProgress: 0,
    loadMessage: '',
  });

  const pushToast = useCallback((text: string, kind: 'info' | 'success' | 'error' = 'info') => {
    const id = makeId();
    setToasts((prev) => [...prev.slice(-2), { id, text, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  // Initialize queue manager & clean fresh IndexedDB session cache on mount
  useEffect(() => {
    void clearAllStoredImages();

    const manager = new SegmentationQueueManager(
      {
        onEngineUpdate: (info) => setEngine(info),
        onItemStart: (id) => {
          setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, status: 'processing' } : item))
          );
        },
        onItemDone: ({
          id,
          width,
          height,
          thumbBlob,
          durationMs,
          edgeRefine,
          defringe,
          bgConfig,
          retouch,
        }) => {
          const thumbUrl = URL.createObjectURL(thumbBlob);
          setItems((prev) =>
            prev.map((item) => {
              if (item.id !== id) return item;
              if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
              return {
                ...item,
                width,
                height,
                status: 'done',
                previewUrl: thumbUrl,
                durationMs,
                edgeRefine,
                defringe,
                bgConfig,
                retouch,
              };
            })
          );
        },
        onItemError: (id, error) => {
          setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, status: 'error', error } : item))
          );
        },
      },
      DEFAULT_EDGE_REFINE,
      DEFAULT_DEFRINGE,
      DEFAULT_BG_CONFIG,
      DEFAULT_RETOUCH_CONFIG
    );

    queueRef.current = manager;
    return () => {
      manager.dispose();
      for (const item of itemsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  // Add incoming images from Upload, Drag & Drop, or Ctrl+V Paste
  const addImageFiles = useCallback(
    (rawFiles: File[], sourceLabel?: string) => {
      const validFiles = rawFiles.filter(isImageFile);
      if (validFiles.length === 0) {
        if (rawFiles.length > 0) {
          pushToast('No supported image files found.', 'error');
        }
        return;
      }

      const existingCount = itemsRef.current.length;
      const newQueueItems: QueueItem[] = [];
      const tasks: Array<{ id: string; file: File }> = [];

      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        const id = makeId();
        const baseName = getCleanBaseName(file.name, existingCount + i);
        const previewUrl = createFastInitialPreviewUrl(file);

        newQueueItems.push({
          id,
          name: file.name || `${baseName}.png`,
          baseName,
          sizeBytes: file.size,
          width: 0,
          height: 0,
          status: 'queued',
          previewUrl,
          edgeRefine: globalEdgeRefine,
          defringe: globalDefringe,
          bgConfig: { ...globalBgConfig },
          retouch: { ...globalRetouch },
          hasManualEdits: false,
        });

        tasks.push({ id, file });
      }

      setItems((prev) => [...prev, ...newQueueItems]);

      // Smoothly open Single Studio when uploading 1 image to an empty workspace;
      // switch to Batch Grid whenever 2+ images are present
      if (existingCount === 0 && newQueueItems.length === 1) {
        setActiveStudioId(newQueueItems[0].id);
      } else if (existingCount + newQueueItems.length > 1 && existingCount <= 1) {
        setActiveStudioId(null);
      }

      queueRef.current?.enqueue(tasks);

      if (sourceLabel) {
        const plural = validFiles.length === 1 ? 'image' : 'images';
        pushToast(`${sourceLabel} ${validFiles.length} ${plural}`, 'success');
      }
    },
    [globalBgConfig, globalDefringe, globalEdgeRefine, globalRetouch, pushToast]
  );

  // Global window Clipboard Paste listener (Ctrl+V / Cmd+V for 1 or 100+ files/screenshots)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'TEXTAREA' ||
          (target.tagName === 'INPUT' &&
            (target as HTMLInputElement).type === 'text'))
      ) {
        return;
      }

      const files = extractFilesFromClipboard(e.clipboardData);
      if (files.length > 0) {
        e.preventDefault();
        addImageFiles(files, 'Pasted');
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImageFiles]);

  // Global window Drag & Drop listeners (1 image, 100 images, or whole folders)
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Boolean(e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files'));

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragging(false);
      }
    };

    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);
      if (!e.dataTransfer) return;

      const files = await extractFilesFromDataTransfer(e.dataTransfer);
      addImageFiles(files, 'Added');
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [addImageFiles]);

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      addImageFiles(Array.from(fileList), 'Added');
    }
    e.target.value = '';
  };

  const handlePauseToggle = () => {
    const q = queueRef.current;
    if (!q) return;
    if (q.isPaused()) {
      q.resume();
      setIsPaused(false);
      pushToast('Queue resumed', 'info');
    } else {
      q.pause();
      setIsPaused(true);
      pushToast('Queue paused', 'info');
    }
  };

  const handleCancelPending = () => {
    const q = queueRef.current;
    if (!q) return;
    const cancelledIds = new Set(q.cancelPending());
    setIsPaused(false);
    if (cancelledIds.size > 0) {
      setItems((prev) =>
        prev.map((item) =>
          cancelledIds.has(item.id) ? { ...item, status: 'cancelled' } : item
        )
      );
      pushToast(`Cancelled ${cancelledIds.size} queued image(s)`, 'info');
    }
  };

  const handleRemoveItem = (id: string) => {
    queueRef.current?.removeFromQueue(id);
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
    if (activeStudioId === id) {
      setActiveStudioId(null);
    }
  };

  const handleClearAll = async () => {
    for (const item of itemsRef.current) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    setItems([]);
    setActiveStudioId(null);
    setIsPaused(false);
    await queueRef.current?.clearAll();
  };

  const updateFileNaming = useCallback((next: FileNamingConfig) => {
    fileNamingRef.current = next;
    setFileNaming(next);
    saveFileNamingConfig(next);
  }, []);

  const handleSaveFileName = useCallback(
    (rawPrefix: string) => {
      const cleaned = sanitizePrefix(rawPrefix);
      if (!cleaned) {
        updateFileNaming({ prefix: '', nextNumber: 1 });
        pushToast('File Name cleared — using original names', 'info');
        return;
      }
      const isSamePrefix = cleaned === fileNamingRef.current.prefix;
      const nextNum = isSamePrefix ? fileNamingRef.current.nextNumber : 1;
      updateFileNaming({ prefix: cleaned, nextNumber: nextNum });
      pushToast(
        `Saved File Name "${cleaned}" (Next: ${formatSequentialPngName(cleaned, nextNum)})`,
        'success'
      );
    },
    [pushToast, updateFileNaming]
  );

  const handleResetFileCounter = useCallback(() => {
    const cur = fileNamingRef.current;
    if (!cur.prefix) return;
    updateFileNaming({ prefix: cur.prefix, nextNumber: 1 });
    pushToast(`Counter reset — next download: ${formatSequentialPngName(cur.prefix, 1)}`, 'info');
  }, [pushToast, updateFileNaming]);

  const handleClearFileName = useCallback(() => {
    updateFileNaming({ prefix: '', nextNumber: 1 });
    pushToast('Custom File Name cleared', 'info');
  }, [pushToast, updateFileNaming]);

  const getNextSingleFilename = useCallback(
    (baseName: string): { filename: string; commit: () => void } => {
      const cur = fileNamingRef.current;
      if (!cur.prefix) {
        return {
          filename: buildOutputFilename(baseName),
          commit: () => {},
        };
      }
      const num = cur.nextNumber;
      const filename = formatSequentialPngName(cur.prefix, num);
      return {
        filename,
        commit: () => {
          updateFileNaming({
            prefix: cur.prefix,
            nextNumber: num + 1,
          });
        },
      };
    },
    [updateFileNaming]
  );

  const handleDownloadSingle = async (item: QueueItem) => {
    try {
      const { filename, commit } = getNextSingleFilename(item.baseName);
      const savedName = await downloadSingleItem(item, { filename });
      commit();
      pushToast(`Downloaded ${savedName}`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Download failed', 'error');
    }
  };

  const handleDownloadAllZip = async () => {
    setIsExportingZip(true);
    setZipProgress(null);
    try {
      const namingSnapshot = { ...fileNamingRef.current };
      const { count, zipFilename } = await downloadBatchAsZip(itemsRef.current, {
        fileNaming: namingSnapshot,
        onProgress: (current, total) => {
          setZipProgress({ current, total });
        },
      });
      if (namingSnapshot.prefix && count > 0) {
        updateFileNaming({
          prefix: namingSnapshot.prefix,
          nextNumber: namingSnapshot.nextNumber + count,
        });
      }
      pushToast(`Downloaded ${zipFilename} (${count} HD PNGs)`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'ZIP export failed', 'error');
    } finally {
      setIsExportingZip(false);
      setZipProgress(null);
    }
  };

  const handleApplyToAll = async (
    edgeRefine: number,
    defringe: boolean,
    bgConfig: BackgroundConfig,
    retouch: RetouchConfig
  ) => {
    setGlobalEdgeRefine(edgeRefine);
    setGlobalDefringe(defringe);
    setGlobalBgConfig(bgConfig);
    setGlobalRetouch(retouch);
    queueRef.current?.setGlobalSettings(edgeRefine, defringe, bgConfig, retouch);

    const completed = itemsRef.current.filter((i) => i.status === 'done');
    if (completed.length === 0) {
      pushToast('Updated default style for incoming images', 'success');
      return;
    }

    setIsApplyingAll(true);
    setApplyProgress({ current: 0, total: completed.length });

    try {
      for (let idx = 0; idx < completed.length; idx++) {
        const target = completed[idx];
        setApplyProgress({ current: idx + 1, total: completed.length });
        const result = await recompositeStoredImage(
          target.id,
          edgeRefine,
          defringe,
          bgConfig,
          retouch
        );
        if (!result) continue;

        const newUrl = URL.createObjectURL(result.thumbBlob);
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== target.id) return item;
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            return {
              ...item,
              previewUrl: newUrl,
              edgeRefine,
              defringe,
              bgConfig: { ...bgConfig },
              retouch: { ...retouch },
            };
          })
        );
      }
      pushToast(`Applied style to all ${completed.length} images`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to apply style', 'error');
    } finally {
      setIsApplyingAll(false);
      setApplyProgress(null);
    }
  };

  const handleStudioItemPersisted = useCallback(
    (
      id: string,
      thumbUrl: string,
      edgeRefine: number,
      defringe: boolean,
      bgConfig: BackgroundConfig,
      retouch: RetouchConfig,
      hasManualEdits: boolean
    ) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          return {
            ...item,
            previewUrl: thumbUrl,
            edgeRefine,
            defringe,
            bgConfig,
            retouch,
            hasManualEdits,
          };
        })
      );
    },
    []
  );

  // Determine current view: Upload Hero | Touch-Up Studio | Batch Grid
  const activeItem = activeStudioId ? items.find((i) => i.id === activeStudioId) ?? null : null;
  const completedItems = items.filter((i) => i.status === 'done');
  const activeCompletedIndex = activeItem
    ? completedItems.findIndex((i) => i.id === activeItem.id)
    : -1;

  const showBatchNav =
    activeItem && items.length > 1
      ? {
          index: activeCompletedIndex >= 0 ? activeCompletedIndex : 0,
          total: completedItems.length || items.length,
          onBack: () => setActiveStudioId(null),
          onPrev: () => {
            if (activeCompletedIndex > 0) {
              setActiveStudioId(completedItems[activeCompletedIndex - 1].id);
            }
          },
          onNext: () => {
            if (activeCompletedIndex >= 0 && activeCompletedIndex < completedItems.length - 1) {
              setActiveStudioId(completedItems[activeCompletedIndex + 1].id);
            }
          },
        }
      : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-[#050907] text-[#F2F7F4]">
      {/* Hidden universal multi-file input (Desktop Explorer + Mobile Photo Gallery) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      <Header
        engine={engine}
        hasItems={items.length > 0}
        fileNaming={fileNaming}
        onSaveFileName={handleSaveFileName}
        onResetFileCounter={handleResetFileCounter}
        onClearFileName={handleClearFileName}
        onAddMore={handleOpenFilePicker}
        onLogoClick={() => {
          if (items.length > 1) setActiveStudioId(null);
        }}
      />

      {items.length === 0 ? (
        <UploadHero onPickFiles={handleOpenFilePicker} />
      ) : activeItem ? (
        <TouchUpStudio
          item={activeItem}
          engine={engine}
          batchNav={showBatchNav}
          onItemPersisted={handleStudioItemPersisted}
          getNextFilename={getNextSingleFilename}
          onClearSingle={items.length === 1 ? () => void handleClearAll() : undefined}
          onToast={pushToast}
        />
      ) : (
        <BatchWorkspace
          items={items}
          isPaused={isPaused}
          globalEdgeRefine={globalEdgeRefine}
          globalDefringe={globalDefringe}
          globalBgConfig={globalBgConfig}
          globalRetouch={globalRetouch}
          isApplyingAll={isApplyingAll}
          applyProgress={applyProgress}
          isExportingZip={isExportingZip}
          zipProgress={zipProgress}
          onSelectItem={(id) => setActiveStudioId(id)}
          onDownloadItem={(item) => void handleDownloadSingle(item)}
          onRemoveItem={handleRemoveItem}
          onPauseToggle={handlePauseToggle}
          onCancelPending={handleCancelPending}
          onClearAll={() => void handleClearAll()}
          onAddMore={handleOpenFilePicker}
          onDownloadAllZip={() => void handleDownloadAllZip()}
          onApplyToAll={(edge, defringe, bg, retouch) =>
            void handleApplyToAll(edge, defringe, bg, retouch)
          }
        />
      )}

      <footer className="flex items-center justify-center border-t border-[#1E4D37]/40 bg-[#050907] px-4 py-5">
        <div className="google-spin-badge">
          <div className="google-spin-badge-inner text-sm tracking-wide sm:text-base">
            <span className="font-medium text-[#B8D2C5]">Made By</span>
            <span className="font-bold text-[#F2F7F4]">RM Rasel Hossain</span>
          </div>
        </div>
      </footer>

      <DropOverlay visible={isDragging} />
      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default App;
