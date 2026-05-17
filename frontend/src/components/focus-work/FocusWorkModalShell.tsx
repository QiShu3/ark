import type React from 'react';

type FocusWorkModalShellProps = {
  title: string;
  subtitle: string;
  recordFocus: boolean;
  isPaused?: boolean;
  busy?: boolean;
  onPause: () => void;
  onResume: () => void;
  onCompleteRound: () => void;
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
  onCompleteRound,
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
            <button
              type="button"
              onClick={onCompleteRound}
              disabled={busy}
              className="rounded-full border border-blue-300/20 bg-blue-300/10 px-4 py-2 text-sm text-blue-100 transition hover:border-blue-300/32 hover:bg-blue-300/16 disabled:cursor-not-allowed disabled:opacity-50"
            >
              结束本轮专注
            </button>
          </div>
        </header>
        <div className="relative min-h-0 flex-1 overflow-y-auto p-5">
          <div className={isPaused ? 'pointer-events-none select-none opacity-35' : undefined} aria-hidden={isPaused ? true : undefined}>
            {children}
          </div>
          {isPaused ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 backdrop-blur-sm">
              <div className="w-[min(28rem,92vw)] rounded-[2rem] border border-white/12 bg-[#0c1016]/92 p-8 text-center shadow-2xl">
                <div className="text-xs uppercase tracking-[0.24em] text-white/35">Paused</div>
                <h3 className="mt-4 text-3xl font-semibold text-white">专注已暂停</h3>
                <p className="mt-3 text-sm leading-6 text-white/60">继续后会从当前阶段接着计时，暂停期间不会提交业务动作。</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
