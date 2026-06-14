import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import SubAppHomeTemplate from '../components/SubAppHomeTemplate';
import { loadDynamicRegistry, type SubAppDeclaration } from '../lib/subAppRegistry';
import { apiJson } from '../lib/api';

async function getBuiltInPage(appId: string): Promise<React.ComponentType | null> {
  if (appId === 'vocab') return (await import('./Vocab/Home')).default;
  if (appId === 'erc') return (await import('./ERC/Home')).default;
  return null;
}

export default function DynamicSubAppHome() {
  const { appId } = useParams<{ appId: string }>();
  const [page, setPage] = useState<React.ReactNode>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!appId) return;
      const BuiltIn = await getBuiltInPage(appId);
      if (BuiltIn && !cancelled) { setPage(<BuiltIn />); return; }
      const apps = await loadDynamicRegistry();
      const app = apps.find((a) => a.id === appId);
      if (!cancelled) setPage(app ? <GenericChoiceQuestionHome app={app} /> : null);
    })();
    return () => { cancelled = true; };
  }, [appId]);

  return <>{page}</>;
}

interface Overview {
  practiced_count: number;
  correct_count: number;
  accuracy: number;
  due_count: number;
  mistake_count: number;
}

interface ReviewNext {
  has_item: boolean;
  question?: { question_id: string; stem: string; options: { label: string; content: string }[]; meta?: Record<string, unknown> };
}

function GenericChoiceQuestionHome({ app }: { app: SubAppDeclaration }) {
  const fw = app.focusWorks[0];
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchOverview = () => apiJson<Overview>(`/api/${app.id}/overview`);
  const startFocus = async () => {
    setBusy(true);
    try {
      const next = await apiJson<ReviewNext>(`/api/${app.id}/review/next`);
      if (next.has_item && next.question) {
        window.location.hash = `/${app.id}/practice?q=${next.question.question_id}`;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '开始练习失败');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    fetchOverview().then(setOverview).catch(() => setError('加载失败'));
  }, [app.id]);

  const accuracy = overview ? Math.round(overview.accuracy * 100) : 0;
  const canStart = overview && (overview.practiced_count === 0 || overview.due_count > 0);

  return (
    <SubAppHomeTemplate
      eyebrow={app.id.toUpperCase()}
      title={app.name}
      statusLabel={overview ? '已就绪' : '加载中...'}
      metaItems={[
        `题库: 已导入`,
        overview ? `已练习: ${overview.practiced_count} 题` : '',
      ].filter(Boolean)}
      configureAction={{ label: '配置', disabled: true }}
      heroLabel={fw?.label ?? '专注工作'}
      heroValue={overview ? `${overview.due_count} 题` : '—'}
      heroDetail={app.description}
      heroProgressPercent={accuracy}
      heroProgressLabel="正确率"
      primaryAction={{
        label: canStart ? '开始练习' : overview ? '今日已完成' : '加载中...',
        disabled: !canStart || busy,
        onClick: startFocus,
      }}
      metrics={[
        { label: '待复习', value: overview ? String(overview.due_count) : '—', detail: 'due' },
        { label: '已练习', value: overview ? String(overview.practiced_count) : '—', detail: 'practiced' },
        { label: '正确率', value: overview ? `${accuracy}%` : '—', detail: 'accuracy' },
        { label: '错题', value: overview ? String(overview.mistake_count) : '—', detail: 'mistakes' },
      ]}
      assetEyebrow="题库状态"
      assetTitle="练习进度"
      assetDescription="FSRS 间隔重复系统自动调度复习。"
      assetContent={(
        <div className="space-y-3 rounded-lg border border-ark-border bg-ark-surface-subtle p-6">
          {overview ? (
            <>
              <ProgressRow label="已练习" value={overview.practiced_count} />
              <ProgressRow label="待复习" value={overview.due_count} />
              <ProgressRow label="正确率" value={`${accuracy}%`} />
              <ProgressRow label="错题数" value={overview.mistake_count} />
            </>
          ) : (
            <p className="text-sm text-ark-text-muted">加载中...</p>
          )}
        </div>
      )}
      arrangements={null}
      feedback={error ? <p className="text-sm text-rose-200">{error}</p> : null}
      modals={null}
    />
  );
}

function ProgressRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ark-text-muted">{label}</span>
      <span className="text-sm font-semibold text-ark-text">{value}</span>
    </div>
  );
}
