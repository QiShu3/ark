import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, RefreshCw, Settings } from 'lucide-react';

import SubAppArrangements, { type SubAppTaskItemState } from '../../components/SubAppArrangements';
import { apiJson } from '../../lib/api';
import { fetchERCConfigStatus, fetchERCOverview, saveERCConfig } from '../../lib/erc/api';
import type { ERCConfigStatus, ERCModuleStatus, ERCOverview } from '../../lib/erc/types';

type ReviewScope = 'due' | 'mistakes' | 'all';

const DEFAULT_CONFIG: ERCConfigStatus = {
  event_id: null,
  event_name: null,
  practice: {
    enabled: false,
    state: 'event_not_configured',
    task_id: null,
    config_id: null,
    completion_state: null,
    blocked_reason: null,
    config: {},
    confirmation_needed: false,
  },
  review: {
    enabled: false,
    state: 'event_not_configured',
    task_id: null,
    config_id: null,
    completion_state: null,
    blocked_reason: null,
    config: {},
    confirmation_needed: false,
  },
};

function numberConfig(config: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = config?.[key];
  return typeof value === 'number' ? value : fallback;
}

function booleanConfig(config: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = config?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function reviewScopeConfig(config: Record<string, unknown> | undefined): ReviewScope {
  const value = config?.review_scope;
  return value === 'mistakes' || value === 'all' || value === 'due' ? value : 'due';
}

function isConfigured(module: ERCModuleStatus): boolean {
  return module.enabled && !['no_primary_event', 'event_not_configured', 'uninitialized', 'config_invalid'].includes(module.state);
}

function moduleArrangementState(module: ERCModuleStatus): SubAppTaskItemState {
  if (!module.enabled) return 'unconfigured';
  if (module.state === 'completed_today') return 'completed';
  if (module.state === 'ready') return 'ready';
  if (module.state === 'uninitialized') return 'uninitialized';
  if (module.state === 'event_not_configured') return 'unconfigured';
  if (module.state === 'config_invalid') return 'config_invalid';
  return 'blocked';
}

function moduleStatusLabel(module: ERCModuleStatus): string {
  if (!module.enabled) return '未启用';
  if (module.state === 'completed_today') return 'completed';
  if (module.state === 'ready') return 'ready';
  if (module.state === 'uninitialized') return '未初始化';
  if (module.state === 'event_not_configured') return '未配置';
  if (module.state === 'config_invalid') return '配置异常';
  if (module.state === 'no_primary_event') return '需要主事件';
  return 'blocked';
}

function eventStatusLabel(configStatus: ERCConfigStatus): string {
  const modules = [configStatus.practice, configStatus.review];
  if (modules.some((module) => module.state === 'no_primary_event')) return '未绑定计划事件';
  if (modules.every((module) => !module.enabled || module.state === 'event_not_configured')) return '待配置计划事件';
  if (modules.some(isConfigured)) return '已绑定计划事件';
  return '待初始化计划事件';
}

function reviewScopeLabel(scope: ReviewScope): string {
  if (scope === 'all') return '全部做错题目';
  if (scope === 'mistakes') return '未掌握错题';
  return '仅到期错题';
}

function moduleDisabledReason(module: ERCModuleStatus): string | null {
  if (module.state === 'no_primary_event') return '请先创建或设置主事件。';
  return module.blocked_reason;
}

export default function ERCHome() {
  const [overview, setOverview] = useState<ERCOverview | null>(null);
  const [configStatus, setConfigStatus] = useState<ERCConfigStatus>(DEFAULT_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const [appTaskError, setAppTaskError] = useState<string | null>(null);
  const [appTaskBusy, setAppTaskBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [practiceEnabled, setPracticeEnabled] = useState(true);
  const [reviewEnabled, setReviewEnabled] = useState(true);
  const [dailyArticleTarget, setDailyArticleTarget] = useState(1);
  const [practiceDuration, setPracticeDuration] = useState(25);
  const [practiceAddToTodayPlan, setPracticeAddToTodayPlan] = useState(true);
  const [dailyQuestionTarget, setDailyQuestionTarget] = useState(10);
  const [reviewScope, setReviewScope] = useState<ReviewScope>('due');
  const [reviewDuration, setReviewDuration] = useState(25);
  const [reviewAddToTodayPlan, setReviewAddToTodayPlan] = useState(true);

  const practiceTaskStatus = configStatus.practice;
  const reviewTaskStatus = configStatus.review;
  const currentEventName = configStatus.event_name;
  const appConfigNotice = currentEventName ? `该配置会同步到当前主事件「${currentEventName}」。` : null;
  const accuracy = overview ? Math.round(overview.accuracy * 100) : 0;
  const hasNoPrimaryEvent = practiceTaskStatus.state === 'no_primary_event' || reviewTaskStatus.state === 'no_primary_event';
  const hasNoConfig =
    (!practiceTaskStatus.enabled || practiceTaskStatus.state === 'event_not_configured') &&
    (!reviewTaskStatus.enabled || reviewTaskStatus.state === 'event_not_configured');
  const eventLabel = hasNoPrimaryEvent
    ? '计划事件：未绑定'
    : currentEventName ? `计划事件：${currentEventName}` : '计划事件：当前主事件';
  const noConfigMessage = currentEventName
    ? `当前主事件「${currentEventName}」尚未配置阅读训练，请通过右上角“配置”完成初始化。`
    : '当前主事件尚未配置阅读训练，请通过右上角“配置”完成初始化。';

  useEffect(() => {
    let cancelled = false;
    fetchERCOverview()
      .then((payload) => {
        if (cancelled) return;
        setOverview(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '阅读训练加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchERCConfigStatus()
      .then((payload) => {
        if (cancelled) return;
        setConfigStatus(payload);
        setAppTaskError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAppTaskError(err instanceof Error ? err.message : 'ERC 配置状态加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPracticeEnabled(practiceTaskStatus.enabled);
    setReviewEnabled(reviewTaskStatus.enabled);
    setDailyArticleTarget(numberConfig(practiceTaskStatus.config, 'daily_article_target', 1));
    setPracticeDuration(Math.round(numberConfig(practiceTaskStatus.config, 'default_focus_duration', 1500) / 60));
    setPracticeAddToTodayPlan(booleanConfig(practiceTaskStatus.config, 'add_to_today_plan', true));
    setDailyQuestionTarget(numberConfig(reviewTaskStatus.config, 'daily_question_target', 10));
    setReviewScope(reviewScopeConfig(reviewTaskStatus.config));
    setReviewDuration(Math.round(numberConfig(reviewTaskStatus.config, 'default_focus_duration', 1500) / 60));
    setReviewAddToTodayPlan(booleanConfig(reviewTaskStatus.config, 'add_to_today_plan', true));
  }, [practiceTaskStatus, reviewTaskStatus]);

  async function persistConfig(next?: {
    practiceEnabled?: boolean;
    reviewEnabled?: boolean;
    practiceAddToTodayPlan?: boolean;
    reviewAddToTodayPlan?: boolean;
  }) {
    const payload = await saveERCConfig({
      event_id: configStatus.event_id,
      practice_enabled: next?.practiceEnabled ?? practiceEnabled,
      review_enabled: next?.reviewEnabled ?? reviewEnabled,
      practice: {
        daily_article_target: dailyArticleTarget,
        default_focus_duration: practiceDuration * 60,
        add_to_today_plan: next?.practiceAddToTodayPlan ?? practiceAddToTodayPlan,
      },
      review: {
        review_scope: reviewScope,
        daily_question_target: dailyQuestionTarget,
        default_focus_duration: reviewDuration * 60,
        add_to_today_plan: next?.reviewAddToTodayPlan ?? reviewAddToTodayPlan,
      },
    });
    setConfigStatus(payload);
    setAppTaskError(null);
    if (payload.practice.confirmation_needed || payload.review.confirmation_needed) {
      const modules = [
        payload.practice.confirmation_needed ? '真题练习' : null,
        payload.review.confirmation_needed ? '错题复习' : null,
      ].filter(Boolean).join('、');
      setAppTaskError(`检测到${modules}已有手动今日安排，系统已保留该安排。`);
    }
    return payload;
  }

  async function handleSaveSettings() {
    setSettingsSaving(true);
    setAppTaskError(null);
    try {
      await persistConfig();
      setSettingsOpen(false);
      const freshOverview = await fetchERCOverview();
      setOverview(freshOverview);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '保存配置失败');
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleInitializePractice() {
    setAppTaskBusy(true);
    try {
      setPracticeEnabled(true);
      await persistConfig({ practiceEnabled: true });
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '初始化真题练习失败');
    } finally {
      setAppTaskBusy(false);
    }
  }

  async function handleInitializeReview() {
    setAppTaskBusy(true);
    try {
      setReviewEnabled(true);
      await persistConfig({ reviewEnabled: true });
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '初始化错题复习失败');
    } finally {
      setAppTaskBusy(false);
    }
  }

  async function startReviewFocusWork() {
    if (!reviewTaskStatus.task_id) return;
    setAppTaskBusy(true);
    try {
      await apiJson(`/todo/tasks/${reviewTaskStatus.task_id}/focus/start`, { method: 'POST' });
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      setAppTaskError(null);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '开始 ERC 复习失败');
    } finally {
      setAppTaskBusy(false);
    }
  }

  async function startPracticeFocusWork() {
    if (!practiceTaskStatus.task_id) return;
    setAppTaskBusy(true);
    try {
      await apiJson(`/todo/tasks/${practiceTaskStatus.task_id}/focus/start`, { method: 'POST' });
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      setAppTaskError(null);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '开始 ERC 真题练习失败');
    } finally {
      setAppTaskBusy(false);
    }
  }

  function taskAction(module: ERCModuleStatus, onInitialize: () => Promise<void>, onStart: () => Promise<void>) {
    if (module.state === 'no_primary_event') {
      return { label: '不可用', disabled: true, action: undefined };
    }
    if (!module.enabled || module.state === 'event_not_configured' || module.state === 'config_invalid' || module.state === 'completed_today' || module.state === 'blocked') {
      return { label: '配置', disabled: appTaskBusy, action: () => setSettingsOpen(true) };
    }
    if (module.state === 'uninitialized') {
      return { label: '初始化', disabled: appTaskBusy, action: onInitialize };
    }
    return {
      label: module.completion_state?.completed_count_in_period ? '继续' : '开始',
      disabled: !module.task_id || appTaskBusy,
      action: onStart,
    };
  }

  const practiceAction = taskAction(practiceTaskStatus, handleInitializePractice, startPracticeFocusWork);
  const reviewAction = taskAction(reviewTaskStatus, handleInitializeReview, startReviewFocusWork);
  const overviewMetrics = [
    { label: '今日待复习', value: overview ? overview.due_review_count : '--', detail: 'due' },
    { label: '已练文章', value: overview ? overview.practiced_article_count : '--', detail: 'articles' },
    { label: '正确率', value: overview ? `${accuracy}%` : '--', detail: 'accuracy' },
    { label: '错题', value: overview ? overview.mistake_count : '--', detail: 'mistakes' },
  ];
  const ercTasks = [
    {
      id: 'erc_practice',
      name: '真题练习',
      focusWorkName: '真题练习',
      isInitialized: isConfigured(practiceTaskStatus),
      isSynced: practiceTaskStatus.enabled ? practiceAddToTodayPlan : false,
      onSyncToggle: async (nextSynced: boolean) => {
        setPracticeAddToTodayPlan(nextSynced);
        await persistConfig({ practiceAddToTodayPlan: nextSynced });
      },
      state: moduleArrangementState(practiceTaskStatus),
      statusLabel: moduleStatusLabel(practiceTaskStatus),
      primaryActionLabel: practiceAction.label,
      primaryActionDisabled: practiceAction.disabled,
      onPrimaryAction: practiceAction.action,
      disabledReason: moduleDisabledReason(practiceTaskStatus),
    },
    {
      id: 'erc_review',
      name: '错题复习',
      focusWorkName: '错题复习',
      isInitialized: isConfigured(reviewTaskStatus),
      isSynced: reviewTaskStatus.enabled ? reviewAddToTodayPlan : false,
      onSyncToggle: async (nextSynced: boolean) => {
        setReviewAddToTodayPlan(nextSynced);
        await persistConfig({ reviewAddToTodayPlan: nextSynced });
      },
      state: moduleArrangementState(reviewTaskStatus),
      statusLabel: moduleStatusLabel(reviewTaskStatus),
      primaryActionLabel: reviewAction.label,
      primaryActionDisabled: reviewAction.disabled,
      onPrimaryAction: reviewAction.action,
      disabledReason: moduleDisabledReason(reviewTaskStatus),
    },
  ];

  return (
    <div className="ark-page relative z-10 h-full w-full overflow-y-auto px-6 pb-10 pt-20 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="ark-panel-card rounded-lg p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.24em] text-[var(--ark-text-faint)]">ERC</div>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--ark-text)]">阅读训练</h1>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex rounded-full border border-ark-border bg-ark-surface-subtle px-3 py-1 text-[var(--ark-text-muted)]">
                  {eventStatusLabel(configStatus)}
                </span>
                <span className="text-[var(--ark-text-muted)]">{eventLabel}</span>
                <span className="text-[var(--ark-text-muted)]">托管任务：真题练习 / 错题复习</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-ark-border bg-white px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Settings className="h-4 w-4" />
              配置
            </button>
          </div>

          {error ? <p className="mt-5 text-sm text-rose-200">{error}</p> : null}
          {appTaskError ? <p className="ark-annotation mt-5 rounded-lg px-3 py-2">{appTaskError}</p> : null}
          {hasNoPrimaryEvent ? (
            <p className="ark-annotation mt-5 rounded-lg px-3 py-2">请先创建或设置主事件，再配置阅读训练。</p>
          ) : hasNoConfig ? (
            <p className="ark-annotation mt-5 rounded-lg px-3 py-2">{noConfigMessage}</p>
          ) : appConfigNotice ? (
            <p className="ark-annotation mt-5 rounded-lg px-3 py-2">{appConfigNotice}</p>
          ) : null}
        </section>

        <section className="ark-panel-card rounded-lg p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-[var(--ark-text-faint)]">Overview</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ark-text)]">总览</h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {overviewMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-lg border border-ark-border bg-ark-surface-subtle px-4 py-4 transition-colors hover:border-[var(--ark-border-strong)] hover:bg-[var(--ark-surface)]"
              >
                <div className="text-sm text-[var(--ark-text-muted)]">{metric.label}</div>
                <div className="mt-2 text-3xl font-semibold text-[var(--ark-text)]">{metric.value}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--ark-text-faint)]">{metric.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="ark-panel-card rounded-lg p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-[var(--ark-text-faint)]">Business Data</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ark-text)]">业务数据</h2>
            </div>
          </div>

          {overview ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Link
                  to="/erc/library"
                  className="rounded-lg border border-ark-border bg-ark-surface-subtle p-5 text-left transition hover:border-[var(--ark-border-strong)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm text-[var(--ark-text-muted)]">题库进度</div>
                      <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.practiced_article_count} 篇文章</div>
                    </div>
                    <BookOpen className="h-5 w-5 text-[var(--ark-accent)]" />
                  </div>
                  <div className="mt-2 text-sm text-[var(--ark-text-muted)]">已练 {overview.practiced_question_count} 道题</div>
                  <div className="mt-4 text-sm font-medium text-[var(--ark-accent)]">进入题库</div>
                </Link>

                <Link
                  to="/erc/mistakes"
                  className="rounded-lg border border-ark-border bg-ark-surface-subtle p-5 text-left transition hover:border-[var(--ark-border-strong)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm text-[var(--ark-text-muted)]">错题资产</div>
                      <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.mistake_count} 道错题</div>
                    </div>
                    <RefreshCw className="h-5 w-5 text-[var(--ark-accent)]" />
                  </div>
                  <div className="mt-2 text-sm text-[var(--ark-text-muted)]">今日到期 {overview.due_review_count} 道</div>
                  <div className="mt-4 text-sm font-medium text-[var(--ark-accent)]">查看错题</div>
                </Link>
              </div>

              {overview.recommended_article ? (
                <Link
                  to={`/erc/articles/${overview.recommended_article.article_id}/practice`}
                  className="block rounded-lg border border-ark-border bg-ark-surface-subtle p-5 text-left transition hover:border-[var(--ark-border-strong)]"
                >
                  <div className="text-sm text-[var(--ark-text-muted)]">今日推荐练习</div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">
                    {overview.recommended_article.year} 年 Text {overview.recommended_article.text_no}
                  </div>
                  <div className="mt-2 text-sm text-[var(--ark-text-muted)]">
                    {overview.recommended_article.title || '无标题文章'}
                  </div>
                </Link>
              ) : (
                <div className="rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle p-5">
                  <div className="text-sm text-[var(--ark-text-muted)]">今日推荐练习</div>
                  <div className="mt-2 text-sm text-[var(--ark-text-faint)]">暂无推荐文章</div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--ark-text-muted)]">业务数据加载中…</p>
          )}
        </section>

        <SubAppArrangements tasks={ercTasks} isBusy={appTaskBusy} />
      </div>

      {settingsOpen ? (
        <div className="ark-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="ERC 配置">
          <div className="ark-modal max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg p-6 shadow-2xl shadow-black/20">
            <div className="flex items-start justify-between gap-4 border-b border-ark-border pb-5">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-[var(--ark-text-faint)]">Configuration</div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--ark-text)]">配置阅读训练</h2>
                <p className="mt-2 text-xs text-[var(--ark-text-muted)]">
                  保存后会更新真题练习与错题复习的托管任务。
                </p>
                {appConfigNotice ? <p className="ark-annotation mt-3 rounded-lg px-3 py-2">{appConfigNotice}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="ark-button-secondary rounded-lg px-4 py-2 text-sm transition"
              >
                关闭
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div className="space-y-4 rounded-lg border border-ark-border bg-ark-surface-subtle p-5">
                <div className="flex items-center justify-between gap-4 border-b border-ark-border pb-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-[var(--ark-accent)]" />
                    <h3 className="text-base font-semibold text-[var(--ark-text)]">真题练习</h3>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[var(--ark-text-muted)]">
                    <input
                      type="checkbox"
                      checked={practiceEnabled}
                      onChange={(event) => setPracticeEnabled(event.target.checked)}
                    />
                    启用
                  </label>
                </div>

                <div className={`grid gap-4 sm:grid-cols-2 ${practiceEnabled ? '' : 'opacity-50'}`}>
                  <div>
                    <label htmlFor="erc-practice-daily-article-target" className="mb-2 block text-xs text-[var(--ark-text-muted)]">每日目标 (文章篇数)</label>
                    <input
                      id="erc-practice-daily-article-target"
                      type="number"
                      min={1}
                      max={10}
                      value={dailyArticleTarget}
                      disabled={!practiceEnabled}
                      onChange={(e) => setDailyArticleTarget(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded-lg border border-ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)] disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label htmlFor="erc-practice-duration" className="mb-2 block text-xs text-[var(--ark-text-muted)]">默认专注时长 (分钟)</label>
                    <input
                      id="erc-practice-duration"
                      type="number"
                      min={5}
                      max={120}
                      value={practiceDuration}
                      disabled={!practiceEnabled}
                      onChange={(e) => setPracticeDuration(Math.max(5, Number(e.target.value)))}
                      className="w-full rounded-lg border border-ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)] disabled:opacity-60"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[var(--ark-text-muted)] sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={practiceAddToTodayPlan}
                      disabled={!practiceEnabled}
                      onChange={(event) => setPracticeAddToTodayPlan(event.target.checked)}
                    />
                    同步到今日安排
                  </label>
                </div>
              </div>

              <div className="space-y-4 rounded-lg border border-ark-border bg-ark-surface-subtle p-5">
                <div className="flex items-center justify-between gap-4 border-b border-ark-border pb-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-[var(--ark-accent)]" />
                    <h3 className="text-base font-semibold text-[var(--ark-text)]">错题复习</h3>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[var(--ark-text-muted)]">
                    <input
                      type="checkbox"
                      checked={reviewEnabled}
                      onChange={(event) => setReviewEnabled(event.target.checked)}
                    />
                    启用
                  </label>
                </div>

                <div className={`space-y-4 ${reviewEnabled ? '' : 'opacity-50'}`}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="erc-review-daily-question-target" className="mb-2 block text-xs text-[var(--ark-text-muted)]">每日目标 (复习题数)</label>
                      <input
                        id="erc-review-daily-question-target"
                        type="number"
                        min={1}
                        max={100}
                        value={dailyQuestionTarget}
                        disabled={!reviewEnabled}
                        onChange={(e) => setDailyQuestionTarget(Math.max(1, Number(e.target.value)))}
                        className="w-full rounded-lg border border-ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)] disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label htmlFor="erc-review-duration" className="mb-2 block text-xs text-[var(--ark-text-muted)]">默认专注时长 (分钟)</label>
                      <input
                        id="erc-review-duration"
                        type="number"
                        min={5}
                        max={120}
                        value={reviewDuration}
                        disabled={!reviewEnabled}
                        onChange={(e) => setReviewDuration(Math.max(5, Number(e.target.value)))}
                        className="w-full rounded-lg border border-ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)] disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs text-[var(--ark-text-muted)]">错题复习范围</label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(['due', 'mistakes', 'all'] as const).map((scope) => {
                        const isSelected = reviewScope === scope;
                        const label = reviewScopeLabel(scope);
                        const desc = scope === 'due' ? '按记忆遗忘算法智能调度' : scope === 'all' ? '随机挑选所有做错题目' : '过滤已熟练掌握的题目';
                        return (
                          <button
                            key={scope}
                            type="button"
                            disabled={!reviewEnabled}
                            onClick={() => setReviewScope(scope)}
                            className={`rounded-lg border p-4 text-left transition disabled:opacity-60 ${
                              isSelected
                                ? 'border-[var(--ark-accent)] bg-ark-surface-subtle text-[var(--ark-text)]'
                                : 'border-ark-border bg-[var(--ark-surface)] text-[var(--ark-text-muted)] hover:border-[var(--ark-border-strong)]'
                            }`}
                          >
                            <div className="text-sm font-semibold">{label}</div>
                            <div className="mt-1 text-[10px] leading-normal text-[var(--ark-text-faint)]">{desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-[var(--ark-text-muted)]">
                    <input
                      type="checkbox"
                      checked={reviewAddToTodayPlan}
                      disabled={!reviewEnabled}
                      onChange={(event) => setReviewAddToTodayPlan(event.target.checked)}
                    />
                    同步到今日安排
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 border-t border-ark-border pt-5">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="ark-button-secondary rounded-lg px-5 py-3 text-sm transition"
              >
                取消
              </button>
              <button
                type="button"
                disabled={settingsSaving}
                onClick={handleSaveSettings}
                className="rounded-lg border border-ark-border bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-ark-surface-subtle disabled:opacity-60"
              >
                {settingsSaving ? '保存中…' : '保存配置'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
