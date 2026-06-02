import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';

export type SubAppHomeMetric = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
};

export type SubAppHomeAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

type SubAppHomeTemplateProps = {
  eyebrow: string;
  title: string;
  statusLabel: string;
  metaItems: ReactNode[];
  configureAction: SubAppHomeAction;
  heroLabel: string;
  heroValue: ReactNode;
  heroDetail?: ReactNode;
  heroProgressPercent: number;
  heroProgressLabel: string;
  primaryAction?: SubAppHomeAction;
  metrics: SubAppHomeMetric[];
  assetEyebrow: string;
  assetTitle: string;
  assetDescription?: ReactNode;
  assetContent: ReactNode;
  arrangements: ReactNode;
  feedback?: ReactNode;
  modals?: ReactNode;
};

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export default function SubAppHomeTemplate({
  eyebrow,
  title,
  statusLabel,
  metaItems,
  configureAction,
  heroLabel,
  heroValue,
  heroDetail,
  heroProgressPercent,
  heroProgressLabel,
  primaryAction,
  metrics,
  assetEyebrow,
  assetTitle,
  assetDescription,
  assetContent,
  arrangements,
  feedback,
  modals,
}: SubAppHomeTemplateProps) {
  const progressPercent = clampProgress(heroProgressPercent);

  return (
    <div className="ark-page fixed inset-x-1 bottom-1 top-[7.5rem] z-10 overflow-y-auto rounded-[28px] px-6 pb-10 pt-6 md:px-8" style={{ clipPath: "inset(10px round 28px)" }}>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="ark-panel-card overflow-hidden rounded-lg">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:items-stretch">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.24em] text-[var(--ark-text-faint)]">{eyebrow}</div>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--ark-text)]">{title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex rounded-full border border-ark-border bg-ark-surface-subtle px-3 py-1 text-[var(--ark-text-muted)]">
                  {statusLabel}
                </span>
                {metaItems.map((item, index) => (
                  <span key={index} className="text-[var(--ark-text-muted)]">{item}</span>
                ))}
              </div>
              {feedback ? <div className="mt-5 space-y-2">{feedback}</div> : null}
            </div>

            <div className="flex min-h-[180px] flex-col justify-between border-t border-ark-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--ark-text-faint)]">Today Workspace</div>
                <div className="mt-3 text-sm text-[var(--ark-text-muted)]">{heroLabel}</div>
                <div className="mt-2 text-4xl font-semibold tracking-tight text-[var(--ark-text)]">{heroValue}</div>
                {heroDetail ? <div className="mt-2 text-sm text-[var(--ark-text-muted)]">{heroDetail}</div> : null}
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[var(--ark-text-faint)]">
                    <span>{heroProgressLabel}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ark-surface-subtle">
                    <div
                      className="h-full rounded-full bg-ark-accent transition-[width] duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {primaryAction ? (
                  <button
                    type="button"
                    onClick={primaryAction.onClick}
                    disabled={primaryAction.disabled}
                    className="inline-flex w-full items-center justify-center rounded-lg border border-ark-border bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {primaryAction.label}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-t border-ark-border bg-ark-surface-subtle px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="min-w-0">
                  <div className="text-sm text-[var(--ark-text-muted)]">{metric.label}</div>
                  <div className="mt-1 truncate text-2xl font-semibold text-[var(--ark-text)]">{metric.value}</div>
                  {metric.detail ? <div className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--ark-text-faint)]">{metric.detail}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 px-1">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-[var(--ark-text-faint)]">{assetEyebrow}</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ark-text)]">{assetTitle}</h2>
              {assetDescription ? <div className="mt-2 text-sm text-[var(--ark-text-muted)]">{assetDescription}</div> : null}
            </div>
            <button
              type="button"
              onClick={configureAction.onClick}
              disabled={configureAction.disabled}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-ark-border bg-white px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Settings className="h-4 w-4" />
              {configureAction.label}
            </button>
          </div>
          {assetContent}
        </section>

        {arrangements}
      </div>
      {modals}
    </div>
  );
}
