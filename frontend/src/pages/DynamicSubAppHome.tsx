import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import SubAppConfigModal from '../components/SubAppConfigModal';
import type { FocusWorkConfigFields } from '../components/SubAppConfigModal';
import SubAppArrangements, { type SubAppTaskItemState } from '../components/SubAppArrangements';
import SubAppHomeTemplate from '../components/SubAppHomeTemplate';
import type { AppTaskRuntimeState, AppTaskStatus } from '../components/taskTypes';
import { useSubAppHome } from '../hooks/useSubAppHome';
import { loadDynamicRegistry, type SubAppDeclaration } from '../lib/subAppRegistry';
import { apiJson } from '../lib/api';

// ---- helpers ----

async function getBuiltInPage(appId: string): Promise<React.ComponentType | null> {
  if (appId === 'vocab') return (await import('./Vocab/Home')).default;
  if (appId === 'erc') return (await import('./ERC/Home')).default;
  return null;
}

interface Overview {
  practiced_count: number; correct_count: number; accuracy: number;
  due_count: number; mistake_count: number;
}

function stateToArrangementState(state: AppTaskRuntimeState | undefined): SubAppTaskItemState {
  if (state === 'completed_today') return 'completed';
  if (state === 'ready') return 'ready';
  if (state === 'uninitialized') return 'uninitialized';
  if (state === 'event_not_configured') return 'unconfigured';
  if (state === 'config_invalid') return 'config_invalid';
  return 'blocked';
}

// ---- main ----

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
      if (!cancelled) setPage(app ? <TemplateSubAppHome app={app} /> : null);
    })();
    return () => { cancelled = true; };
  }, [appId]);

  return <>{page}</>;
}

// ---- Template-based sub-app home ----

function TemplateSubAppHome({ app }: { app: SubAppDeclaration }) {
  const fw = app.focusWorks[0];

  const fallbackStatus = { state: 'uninitialized' as const, task_id: null as string | null, config_id: null as string | null, completion_state: null, blocked_reason: null, config: {} as Record<string, unknown>, event_id: null as string | null, event_name: null as string | null };

  const home = useSubAppHome<Overview, AppTaskStatus>({
    fetchOverview: () => apiJson<Overview>(`/api/${app.id}/overview`),
    fetchConfig: () => apiJson<AppTaskStatus>(`/todo/app-tasks/${app.id}/status`).catch(() => fallbackStatus as AppTaskStatus),
    saveConfig: () => apiJson<AppTaskStatus>(`/todo/app-tasks/${app.id}/status`).catch(() => fallbackStatus as AppTaskStatus),
    initTask: () => apiJson<AppTaskStatus>(`/todo/app-tasks/${app.id}/status`).catch(() => fallbackStatus as AppTaskStatus),
  });

  const overview = home.overview;
  const appTaskStatus = home.config;
  const accuracy = overview ? Math.round(overview.accuracy * 100) : 0;
  const [focusDuration, setFocusDuration] = useState(25);

  const hasEventAppConfig = appTaskStatus
    ? !['no_primary_event', 'event_not_configured', 'uninitialized', 'config_invalid'].includes(appTaskStatus.state)
    : false;

  const taskState = stateToArrangementState(appTaskStatus?.state);

  const startFocusWork = async () => {
    if (!appTaskStatus?.task_id) return;
    try {
      await apiJson(`/todo/tasks/${appTaskStatus.task_id}/focus/start`, { method: 'POST' });
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch { /* error shown in feedback */ }
  };

  const appTaskAction =
    appTaskStatus?.state === 'ready'
      ? { label: '开始', disabled: home.busy, action: startFocusWork }
      : appTaskStatus?.state === 'uninitialized'
        ? { label: '初始化', disabled: home.busy, action: home.init }
        : { label: '配置', disabled: home.busy, action: home.openSettings };

  const primaryLabel =
    appTaskAction.label === '开始' ? `开始${fw.label}`
      : appTaskAction.label === '初始化' ? `初始化${fw.label}`
        : appTaskAction.label === '配置' ? '配置子应用' : appTaskAction.label;

  const overviewMetrics = [
    { label: '待复习', value: overview ? String(overview.due_count) : '--', detail: 'due' },
    { label: '已练习', value: overview ? String(overview.practiced_count) : '--', detail: 'practiced' },
    { label: '正确率', value: overview ? `${accuracy}%` : '--', detail: 'accuracy' },
    { label: '错题', value: overview ? String(overview.mistake_count) : '--', detail: 'mistakes' },
  ];

  const taskStateLabel = appTaskStatus?.state === 'ready' ? 'ready'
    : appTaskStatus?.state === 'completed_today' ? 'completed'
      : appTaskStatus?.state === 'uninitialized' ? '未初始化'
        : appTaskStatus?.state === 'event_not_configured' ? '未配置' : 'blocked';

  const managedTasks = [{
    id: fw.type, name: fw.label, focusWorkName: fw.label,
    isInitialized: hasEventAppConfig, isSynced: true, showSyncToggle: false,
    state: taskState,
    statusLabel: taskStateLabel,
    primaryActionLabel: appTaskAction.label,
    primaryActionDisabled: appTaskAction.disabled,
    onPrimaryAction: appTaskAction.action,
    disabledReason: appTaskStatus?.blocked_reason ?? null,
  }];

  const eventName = appTaskStatus?.event_name ?? null;
  const eventLabel = eventName ? `计划事件: ${eventName}` : '计划事件: 未绑定';

  return (
    <SubAppHomeTemplate
      eyebrow={app.id.toUpperCase()}
      title={app.name}
      statusLabel={hasEventAppConfig ? '已绑定计划事件' : '待配置'}
      metaItems={[eventLabel, `题库: 已导入 · ${overview?.practiced_count ?? '...'} 题已练`]}
      configureAction={{ label: '配置', onClick: home.openSettings }}
      heroLabel={`${fw.label}任务`}
      heroValue={overview ? `${overview.due_count} 题` : '--'}
      heroDetail={app.description}
      heroProgressPercent={accuracy}
      heroProgressLabel="历史正确率"
      primaryAction={{ label: primaryLabel, disabled: appTaskAction.disabled, onClick: appTaskAction.action }}
      metrics={overviewMetrics}
      assetEyebrow="Learning Assets"
      assetTitle="练习进度"
      assetDescription="FSRS 间隔重复系统自动调度复习安排。"
      assetContent={(
        <div className="space-y-3 rounded-lg border border-ark-border bg-ark-surface-subtle p-5">
          {overview ? (
            <>
              <ProgressRow label="已练习" value={String(overview.practiced_count)} />
              <ProgressRow label="待复习" value={String(overview.due_count)} />
              <ProgressRow label="正确率" value={`${accuracy}%`} />
              <ProgressRow label="错题库" value={String(overview.mistake_count)} />
            </>
          ) : (
            <p className="text-sm text-ark-text-muted">加载中...</p>
          )}
        </div>
      )}
      arrangements={<SubAppArrangements tasks={managedTasks} isBusy={home.busy} />}
      feedback={home.error ? <p className="text-sm text-rose-200">{home.error}</p> : null}
      modals={(
        <SubAppConfigModal
          open={home.settingsOpen}
          onClose={home.closeSettings}
          onSave={home.save}
          isSaving={home.isSaving}
          appName={app.name}
          eventName={eventName}
          saveError={home.error}
          focusWorks={[{
            id: fw.type, label: fw.label,
            enabled: true, onEnabledChange: () => {}, showEnableToggle: false,
            contentConfig: null,
            defaultFocusDuration: focusDuration, onFocusDurationChange: setFocusDuration,
            addToTodayPlan: true, onAddToTodayPlanChange: () => {},
            showSyncToggle: false,
          } as FocusWorkConfigFields]}
        />
      )}
    />
  );
}

function ProgressRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ark-text-muted">{label}</span>
      <span className="text-sm font-semibold text-ark-text">{value}</span>
    </div>
  );
}
