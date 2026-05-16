import type React from 'react';

type FocusWorkModalShellProps = {
  title: string;
  subtitle: string;
  recordFocus: boolean;
  isPaused?: boolean;
  busy?: boolean;
  onPause: () => void;
  onResume: () => void;
  onAbandon: () => void;
  children: React.ReactNode;
};

export default function FocusWorkModalShell({
  title,
  subtitle,
  recordFocus,
  isPaused = false,
  busy = false,
  onPause,
  onResume,
  onAbandon,
  children,
}: FocusWorkModalShellProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-40" aria-live="polite">
      <div className="absolute inset-0 bg-black/58 backdrop-blur-[2px]" aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-work-modal-title"
        className="absolute left-1/2 top-1/2 flex h-[calc((100vh-4rem)*0.9)] w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[2.25rem] border border-white/14 bg-[#080b10]/95 shadow-[0_28px_100px_rgba(0,0,0,0.55)]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-white/[0.04] px-6 py-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.24em] text-white/38">{subtitle}</div>
            <h2 id="focus-work-modal-title" className="mt-1 truncate text-xl font-semibold text-white">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {!recordFocus ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
                本次工作将不记录在专注时间中
              </span>
            ) : isPaused ? (
              <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs text-sky-100">
                已暂停
              </span>
            ) : (
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
                正在记录专注
              </span>
            )}
            <button
              type="button"
              onClick={isPaused ? onResume : onPause}
              disabled={busy}
              className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-white/72 transition hover:border-white/24 hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPaused ? '继续专注' : '暂停专注'}
            </button>
            <button
              type="button"
              onClick={onAbandon}
              disabled={busy}
              className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-white/72 transition hover:border-white/24 hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              放弃本阶段
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );
}
