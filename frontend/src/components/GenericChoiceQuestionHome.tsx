import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, RefreshCw } from 'lucide-react';
import SubAppArrangements from './SubAppArrangements';
import SubAppHomeTemplate from './SubAppHomeTemplate';
import { apiJson } from '../lib/api';
import type { SubAppDeclaration } from '../lib/subAppRegistry';

interface Overview {
  practiced_count: number; correct_count: number; accuracy: number;
  due_count: number; mistake_count: number;
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
      const next = await apiJson<{ has_item: boolean }>(`/api/${app.id}/review/next`);
      window.location.hash = `/${app.id}/practice`;
      void next;
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
    { label: '已练习', value: overview ? String(overview.practiced_count) : '--', detail: 'articles' },
    { label: '正确率', value: overview ? `${accuracy}%` : '--', detail: 'accuracy' },
    { label: '错题', value: overview ? String(overview.mistake_count) : '--', detail: 'mistakes' },
  ];

  const primaryLabel = overview && overview.practiced_count > 0 ? '继续练习' : '开始练习';

  const managedTasks = [{
    id: fw.type,
    name: fw.label,
    focusWorkName: fw.label,
    isInitialized: true,
    isSynced: false,
    showSyncToggle: false,
    state: overview ? 'ready' as const : 'uninitialized' as const,
    statusLabel: overview ? 'ready' : 'uninitialized',
    primaryActionLabel: overview && overview.practiced_count > 0 ? '继续' : '开始',
    primaryActionDisabled: busy,
    onPrimaryAction: startFocus,
    disabledReason: null,
  }];

  const assetContent = overview ? (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to={`/${app.id}/practice`}
          className="ark-subapp-asset-card rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-[var(--ark-text-muted)]">题库进度</div>
              <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.practiced_count} 题</div>
            </div>
            <BookOpen className="ark-subapp-asset-accent h-5 w-5" />
          </div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">正确 {overview.correct_count} 题</div>
          <div className="ark-subapp-asset-accent mt-4 text-sm font-medium">进入练习</div>
        </Link>

        <Link
          to={`/${app.id}/mistakes`}
          className="ark-subapp-asset-card rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-[var(--ark-text-muted)]">错题资产</div>
              <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.mistake_count} 题</div>
            </div>
            <RefreshCw className="ark-subapp-asset-accent h-5 w-5" />
          </div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">今日到期 {overview.due_count} 题</div>
          <div className="ark-subapp-asset-accent mt-4 text-sm font-medium">查看错题</div>
        </Link>
      </div>

      <div className="ark-subapp-asset-soft rounded-lg border border-dashed p-5">
        <div className="text-sm text-[var(--ark-text-muted)]">今日推荐练习</div>
        <div className="mt-2 text-sm text-[var(--ark-text-faint)]">
          {overview.due_count > 0
            ? `有 ${overview.due_count} 道题目等待复习`
            : '暂无待复习题目，开始新的练习吧'}
        </div>
      </div>
    </div>
  ) : (
    <p className="text-sm text-[var(--ark-text-muted)]">学习资产加载中…</p>
  );

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
      assetEyebrow="Learning Assets"
      assetTitle="长期积累"
      assetDescription="题库进度、错题资产和推荐练习都集中在这里。"
      assetContent={assetContent}
      arrangements={<SubAppArrangements tasks={managedTasks} isBusy={busy} />}
      feedback={error ? <p className="text-sm text-rose-200">{error}</p> : null}
      modals={null}
    />
  );
}
