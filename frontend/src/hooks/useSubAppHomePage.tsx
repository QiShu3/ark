import { useState } from 'react';
import { useFocusWorkAdapter } from '../adapters/useFocusWorkAdapter';
import { apiJson } from '../lib/api';
import type { AppDeclaration, FocusWorkDeclaration, TemplateSection } from '../lib/appRegistry';
import type { SubAppHomeAction, SubAppHomeMetric } from '../components/SubAppHomeTemplate';

export interface SubAppHomePageData {
  sections: TemplateSection[];
  // hero
  eyebrow: string;
  title: string;
  statusLabel: string;
  metaItems: string[];
  configureAction: SubAppHomeAction;
  heroLabel: string;
  heroValue: string;
  heroDetail: string;
  heroProgressPercent: number;
  heroProgressLabel: string;
  primaryAction: SubAppHomeAction;
  // sections
  metrics: SubAppHomeMetric[];
  assetEyebrow: string;
  assetTitle: string;
  assetDescription: string;
  assetContent: React.ReactNode;
  arrangements: React.ReactNode;
  feedback: React.ReactNode;
  modals: React.ReactNode;
}

export function useSubAppHomePage(app: AppDeclaration): SubAppHomePageData {
  const sections = app.sections ?? ['hero', 'asset', 'arrangements'];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic sub-app declarations provide one adapter per configured focus work.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const adapters = app.focusWorks.map((fw) => useFocusWorkAdapter(fw as FocusWorkDeclaration, app.id));

  const allMetrics = adapters.flatMap((a) => a.metrics);

  const assetContent = (
    <div className="space-y-6">
      {app.focusWorks.map((fw, i) => {
        const a = adapters[i];
        return (
          <div key={fw.type}>
            {app.focusWorks.length > 1 && (
              <h3 className="mb-3 text-sm font-medium text-[var(--ark-text-muted)]">{fw.label}</h3>
            )}
            {a.assetContent ?? <p className="text-sm text-[var(--ark-text-muted)]">加载中…</p>}
          </div>
        );
      })}
    </div>
  );

  const primaryFw = app.focusWorks[0];

  const startFocus = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/${app.id}/review/next`);
      window.location.hash = `/${app.id}/practice`;
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动失败');
    } finally {
      setBusy(false);
    }
  };

  return {
    sections,
    eyebrow: app.id.toUpperCase(),
    title: app.name,
    statusLabel: '已就绪',
    metaItems: [app.description],
    configureAction: { label: '配置', disabled: true },
    heroLabel: `${primaryFw.label}任务`,
    heroValue: '--',
    heroDetail: '',
    heroProgressPercent: 0,
    heroProgressLabel: '',
    primaryAction: { label: '开始练习', disabled: busy, onClick: startFocus },
    metrics: allMetrics,
    assetEyebrow: 'Learning Assets',
    assetTitle: '长期积累',
    assetDescription: '学习进度和积累的资产都在这里。',
    assetContent: sections.includes('asset') ? assetContent : null,
    arrangements: null,
    feedback: error ? <p className="text-sm text-rose-200">{error}</p> : null,
    modals: null,
  };
}
