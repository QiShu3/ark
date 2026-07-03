import type React from 'react';

type FocusWorkModalShellProps = {
  title: string;
  subtitle: string;
  recordFocus: boolean;
  isPaused?: boolean;
  busy?: boolean;
  headerRight?: React.ReactNode;
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
  headerRight,
  onPause,
  onResume,
  onAbandon,
  children,
}: FocusWorkModalShellProps) {
  const contentClassName = isPaused ? 'h-full pointer-events-none select-none opacity-35' : 'h-full';

  return (
    <div className="ark-focus-work-shell fixed inset-x-1 bottom-1 top-[7.5rem] z-[90] p-4" aria-live="polite">
      <div className="flex h-full w-full">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="focus-work-modal-title"
          className="ark-focus-work-dialog flex h-full w-full flex-col overflow-hidden rounded-[26px] border shadow-[0_28px_100px_rgba(0,0,0,0.55)]"
        >
        <header className="ark-focus-work-header flex items-center justify-between gap-4 border-b px-6 py-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">{subtitle}</div>
            <h2 id="focus-work-modal-title" className="mt-1 truncate text-xl font-semibold text-[var(--focus-work-text)]">
              {title}
            </h2>
          </div>
          {headerRight && (
            <div className="flex shrink-0 items-center gap-2">{headerRight}</div>
          )}
          <div className="flex items-center gap-3">
            {!recordFocus ? (
              <span className="rounded-full border border-[var(--focus-work-amber-border)] bg-[var(--focus-work-amber-bg)] px-3 py-1 text-xs text-[var(--focus-work-amber-text)]">
                本次工作将不记录在专注时间中
              </span>
            ) : isPaused ? (
              <span className="rounded-full border border-[var(--focus-work-sky-border)] bg-[var(--focus-work-sky-bg)] px-3 py-1 text-xs text-[var(--focus-work-sky-text)]">
                已暂停
              </span>
            ) : (
              <span className="rounded-full border border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] px-3 py-1 text-xs text-[var(--focus-work-emerald-text)]">
                正在记录专注
              </span>
            )}
            <button
              type="button"
              onClick={isPaused ? onResume : onPause}
              disabled={busy}
              className="rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-4 py-2 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] hover:text-[var(--focus-work-text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPaused ? '继续专注' : '暂停专注'}
            </button>
            <button
              type="button"
              onClick={onAbandon}
              disabled={busy}
              data-onboarding-anchor="focus-work-abandon-phase"
              className="rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-4 py-2 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] hover:text-[var(--focus-work-text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              放弃本阶段
            </button>
          </div>
        </header>
        <div className="relative min-h-0 flex-1 overflow-y-auto p-5">
          <div className={contentClassName} aria-hidden={isPaused ? true : undefined}>
            {children}
          </div>
          {isPaused ? (
            <div className="ark-focus-work-pause-backdrop absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
              <div className="ark-focus-work-pause-card w-[min(28rem,92vw)] rounded-[2rem] border p-8 text-center shadow-2xl">
                <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Paused</div>
                <h3 className="mt-4 text-3xl font-semibold text-[var(--focus-work-text)]">专注已暂停</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">继续后会从当前阶段接着计时，暂停期间不会提交业务动作。</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
      </div>
    </div>
  );
}
