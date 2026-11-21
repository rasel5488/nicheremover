import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2 sm:bottom-6">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-xs font-medium shadow-[0_12px_32px_rgba(0,0,0,0.55)] backdrop-blur-md sm:text-sm ${
            toast.kind === 'error'
              ? 'border-red-500/40 bg-[#1B0C0E]/95 text-red-200'
              : toast.kind === 'success'
                ? 'border-[#16C784]/50 bg-[#0B1A13]/95 text-[#F2F7F4]'
                : 'border-[#1E4D37] bg-[#0B1410]/95 text-[#F2F7F4]'
          }`}
        >
          {toast.kind === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16C784]" />}
          {toast.kind === 'error' && <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />}
          {toast.kind === 'info' && <Info className="h-4 w-4 shrink-0 text-[#16C784]" />}
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
