import React from 'react';
import { useToastStore } from '../lib/toast';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

const TYPE_ICONS = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />,
  error: <XCircle className="h-4 w-4 text-rose-400 shrink-0" />,
  warning: <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />,
  info: <Info className="h-4 w-4 text-blue-400 shrink-0" />,
};

const TYPE_CLASSES = {
  success: 'border-emerald-500/20 text-ark-text bg-ark-overlay backdrop-blur-lg shadow-emerald-950/10 dark:shadow-emerald-950/20',
  error: 'border-rose-500/20 text-ark-text bg-ark-overlay backdrop-blur-lg shadow-rose-950/10 dark:shadow-rose-950/20',
  warning: 'border-amber-500/20 text-ark-text bg-ark-overlay backdrop-blur-lg shadow-amber-950/10 dark:shadow-amber-950/20',
  info: 'border-blue-500/20 text-ark-text bg-ark-overlay backdrop-blur-lg shadow-blue-950/10 dark:shadow-blue-950/20',
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="通知提示"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[180] flex flex-col gap-2.5 pointer-events-none w-full max-w-[420px] px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center justify-between gap-3.5 px-4.5 py-3 rounded-2xl border shadow-xl transition-all duration-300 animate-[slide-in-top_0.35s_cubic-bezier(0.16,1,0.3,1)] ${TYPE_CLASSES[t.type]}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {TYPE_ICONS[t.type]}
            <p className="text-xs font-semibold tracking-wide leading-relaxed truncate-2-lines break-all text-ark-text">
              {t.message}
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => removeToast(t.id)}
            className="text-ark-text-faint hover:text-ark-text transition-colors p-1 rounded-full hover:bg-ark-surface-subtle"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
};
export default ToastContainer;
