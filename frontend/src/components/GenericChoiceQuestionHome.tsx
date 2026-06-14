import { useCallback, useEffect, useState } from 'react';
import SubAppArrangements from './SubAppArrangements';
import SubAppHomeTemplate from './SubAppHomeTemplate';
import { apiJson } from '../lib/api';
import type { SubAppDeclaration } from '../lib/subAppRegistry';

interface Overview {
  practiced_count: number; correct_count: number; accuracy: number;
  due_count: number; mistake_count: number;
}

interface ReviewNext {
  has_item: boolean;
  question?: { question_id: string; stem: string; options: { label: string; content: string }[] };
}

export default function GenericChoiceQuestionHome({ app }: { app: SubAppDeclaration }) {
  const fw = app.focusWorks[0];
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchOverview = useCallback(
    () => apiJson<Overview>(`/api/${app.id}/overview`),
    [app.id],
  );

  useEffect(() => {
    fetchOverview().then(setOverview).catch((e) => setError(e instanceof Error ? e.message : '加载失败'));
  }, [fetchOverview]);

  const startFocus = async () => {
    setBusy(true);
    try {
      const next = await apiJson<ReviewNext>(`/api/${app.id}/review/next`);
      if (next.has_item && next.question) {
        window.location.hash = `/${app.id}/practice?q=${next.question.question_id}`;
      } else {
        window.location.hash = `/${app.id}/practice`;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动失败');
    } finally {
      setBusy(false);
    }
  };

  const accuracy = overview ? Math.round(overview.accuracy * 100) : 0;
  const canStart = !!overview;

  const metrics = [
    { label: '待复习', value: overview ? String(overview.due_count) : '--', detail: 'due' },
    { label: '已练习', value: overview ? String(overview.practiced_count) : '--', detail: 'done' },
    { label: '正确率', value: overview ? `${accuracy}%` : '--', detail: 'accuracy' },
    { label: '错题', value: overview ? String(overview.mistake_count) : '--', detail: 'mistakes' },
  ];

  const primaryLabel = overview && overview.practiced_count > 0 ? '继续练习' : '开始练习';

  return (
    <SubAppHomeTemplate
      eyebrow={app.id.toUpperCase()}
      title={app.name}
      statusLabel={overview ? '已就绪' : '加载中'}
      metaItems={[`题库已导入`, overview ? `已练 ${overview.practiced_count} 题` : '']}
      configureAction={{ label: '配置', disabled: true }}
      heroLabel={`${fw.label}任务`}
      heroValue={overview ? `${overview.due_count} 题` : '--'}
      heroDetail={app.description}
      heroProgressPercent={accuracy}
      heroProgressLabel="历史正确率"
      primaryAction={{ label: primaryLabel, disabled: !canStart || busy, onClick: startFocus }}
      metrics={metrics}
      assetEyebrow="Learning Progress"
      assetTitle="练习进度"
      assetDescription="FSRS 间隔重复系统自动调度复习安排。"
      assetContent={
        <div className="space-y-3 rounded-lg border border-ark-border bg-ark-surface-subtle p-5">
          {overview ? (
            <>
              <Row label="已练习" value={`${overview.practiced_count} 题`} />
              <Row label="待复习" value={`${overview.due_count} 题`} />
              <Row label="正确率" value={`${accuracy}%`} />
              <Row label="错题库" value={`${overview.mistake_count} 题`} />
            </>
          ) : <p className="text-sm text-ark-text-muted">加载中...</p>}
        </div>
      }
      arrangements={null}
      feedback={error ? <p className="text-sm text-rose-200">{error}</p> : null}
      modals={null}
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ark-text-muted">{label}</span>
      <span className="text-sm font-semibold text-ark-text">{value}</span>
    </div>
  );
}
