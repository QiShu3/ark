import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, RefreshCw } from 'lucide-react';

import SubAppConfigModal from '../../components/SubAppConfigModal';
import type { FocusWorkConfigFields } from '../../components/SubAppConfigModal';
import SubAppArrangements, { type SubAppTaskItemState } from '../../components/SubAppArrangements';
import SubAppHomeTemplate from '../../components/SubAppHomeTemplate';
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
      return { label: undefined, disabled: true, action: undefined };
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
  const isAllCompleted =
    (practiceTaskStatus.enabled || reviewTaskStatus.enabled) &&
    (!practiceTaskStatus.enabled || practiceTaskStatus.state === 'completed_today') &&
    (!reviewTaskStatus.enabled || reviewTaskStatus.state === 'completed_today');

  const primaryAction = reviewTaskStatus.state === 'ready'
    ? {
        label: reviewAction.label === '继续' ? '继续错题复习' : '开始错题复习',
        disabled: reviewAction.disabled,
        onClick: reviewAction.action,
      }
    : practiceTaskStatus.state === 'ready'
      ? {
          label: practiceAction.label === '继续' ? '继续真题练习' : '开始真题练习',
          disabled: practiceAction.disabled,
          onClick: practiceAction.action,
        }
      : isAllCompleted
        ? {
            label: '今日任务已全部完成',
            disabled: true,
            onClick: undefined,
          }
        : {
            label: '配置阅读训练',
            disabled: appTaskBusy,
            onClick: () => setSettingsOpen(true),
          };
  const assetContent = overview ? (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to="/erc/library"
          className="ark-subapp-asset-card rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-[var(--ark-text-muted)]">题库进度</div>
              <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.practiced_article_count} 篇文章</div>
            </div>
            <BookOpen className="ark-subapp-asset-accent h-5 w-5" />
          </div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">已练 {overview.practiced_question_count} 道题</div>
          <div className="ark-subapp-asset-accent mt-4 text-sm font-medium">进入题库</div>
        </Link>

        <Link
          to="/erc/mistakes"
          className="ark-subapp-asset-card rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-[var(--ark-text-muted)]">错题资产</div>
              <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.mistake_count} 道错题</div>
            </div>
            <RefreshCw className="ark-subapp-asset-accent h-5 w-5" />
          </div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">今日到期 {overview.due_review_count} 道</div>
          <div className="ark-subapp-asset-accent mt-4 text-sm font-medium">查看错题</div>
        </Link>
      </div>

      {overview.recommended_article ? (
        <Link
          to={`/erc/articles/${overview.recommended_article.article_id}/practice`}
          className="ark-subapp-asset-card block rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]"
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
        <div className="ark-subapp-asset-soft rounded-lg border border-dashed p-5">
          <div className="text-sm text-[var(--ark-text-muted)]">今日推荐练习</div>
          <div className="mt-2 text-sm text-[var(--ark-text-faint)]">暂无推荐文章</div>
        </div>
      )}
    </div>
  ) : (
    <p className="text-sm text-[var(--ark-text-muted)]">学习资产加载中…</p>
  );

  return (
    <SubAppHomeTemplate
      eyebrow="ERC"
      title="阅读训练"
      statusLabel={eventStatusLabel(configStatus)}
      metaItems={[eventLabel, '托管任务：真题练习 / 错题复习']}
      configureAction={{ label: '配置', onClick: () => setSettingsOpen(true) }}
      heroLabel="今日优先任务"
      heroValue={overview ? `${overview.due_review_count} 道` : '--'}
      heroDetail="先处理到期错题，再进入真题练习。"
      heroProgressPercent={accuracy}
      heroProgressLabel="历史正确率"
      primaryAction={primaryAction}
      metrics={overviewMetrics}
      assetEyebrow="Learning Assets"
      assetTitle="长期积累"
      assetDescription="题库进度、错题资产和推荐练习都集中在这里。"
      assetContent={assetContent}
      arrangements={<SubAppArrangements tasks={ercTasks} isBusy={appTaskBusy} />}
      feedback={(
        <>
          {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          {appTaskError ? <p className="ark-annotation rounded-lg px-3 py-2">{appTaskError}</p> : null}
          {hasNoPrimaryEvent ? (
            <p className="ark-annotation rounded-lg px-3 py-2">请先创建或设置主事件，再配置阅读训练。</p>
          ) : hasNoConfig ? (
            <p className="ark-annotation rounded-lg px-3 py-2">{noConfigMessage}</p>
          ) : appConfigNotice ? (
            <p className="ark-annotation rounded-lg px-3 py-2">{appConfigNotice}</p>
          ) : null}
        </>
      )}
      modals={(
        <SubAppConfigModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
          isSaving={settingsSaving}
          appName="阅读训练"
          eventName={currentEventName}
          description="保存后会更新真题练习与错题复习的托管任务。"
          saveError={appTaskError}
          focusWorks={[
            {
              id: 'erc_practice',
              label: '真题练习',
              enabled: practiceEnabled,
              onEnabledChange: (v) => setPracticeEnabled(v),
              contentConfig: (
                <div className="grid gap-4 sm:grid-cols-1">
                  <div>
                    <label htmlFor="erc-practice-daily-article-target" className="mb-2 block text-xs text-ark-text-muted">
                      每日目标 (文章篇数)
                    </label>
                    <input
                      id="erc-practice-daily-article-target"
                      type="number"
                      min={1}
                      max={10}
                      value={dailyArticleTarget}
                      onChange={(e) => setDailyArticleTarget(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded-lg border border-ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-ark-text outline-none transition focus:border-[var(--ark-border-strong)]"
                    />
                  </div>
                </div>
              ),
              defaultFocusDuration: practiceDuration,
              onFocusDurationChange: setPracticeDuration,
              addToTodayPlan: practiceAddToTodayPlan,
              onAddToTodayPlanChange: setPracticeAddToTodayPlan,
            } as FocusWorkConfigFields,
            {
              id: 'erc_review',
              label: '错题复习',
              enabled: reviewEnabled,
              onEnabledChange: (v) => setReviewEnabled(v),
              contentConfig: (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="erc-review-daily-question-target" className="mb-2 block text-xs text-ark-text-muted">
                      每日目标 (复习题数)
                    </label>
                    <input
                      id="erc-review-daily-question-target"
                      type="number"
                      min={1}
                      max={100}
                      value={dailyQuestionTarget}
                      onChange={(e) => setDailyQuestionTarget(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded-lg border border-ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-ark-text outline-none transition focus:border-[var(--ark-border-strong)]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs text-ark-text-muted">错题复习范围</label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(['due', 'mistakes', 'all'] as ReviewScope[]).map((scope) => {
                        const isSelected = reviewScope === scope;
                        const label = reviewScopeLabel(scope);
                        const desc = scope === 'due' ? '按记忆遗忘算法智能调度' : scope === 'all' ? '随机挑选所有做错题目' : '过滤已熟练掌握的题目';
                        return (
                          <button
                            key={scope}
                            type="button"
                            onClick={() => setReviewScope(scope)}
                            className={`rounded-lg border p-4 text-left transition ${
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
                </div>
              ),
              defaultFocusDuration: reviewDuration,
              onFocusDurationChange: setReviewDuration,
              addToTodayPlan: reviewAddToTodayPlan,
              onAddToTodayPlanChange: setReviewAddToTodayPlan,
            } as FocusWorkConfigFields,
          ]}
        />
      )}
    />
  );
}
