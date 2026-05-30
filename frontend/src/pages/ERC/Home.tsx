import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, BookOpen, RefreshCw } from 'lucide-react';

import SubAppArrangements from '../../components/SubAppArrangements';
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
  return module.enabled && module.state !== 'no_primary_event' && module.state !== 'event_not_configured';
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
  const appTaskStatus = configStatus.review;
  const currentEventName = configStatus.event_name;
  const appConfigNotice = currentEventName ? `这份 ERC 配置会绑定在当前主事件「${currentEventName}」。` : null;
  const accuracy = overview ? Math.round(overview.accuracy * 100) : 0;

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
    setReviewEnabled(appTaskStatus.enabled);
    setDailyArticleTarget(numberConfig(practiceTaskStatus.config, 'daily_article_target', 1));
    setPracticeDuration(Math.round(numberConfig(practiceTaskStatus.config, 'default_focus_duration', 1500) / 60));
    setPracticeAddToTodayPlan(booleanConfig(practiceTaskStatus.config, 'add_to_today_plan', true));
    setDailyQuestionTarget(numberConfig(appTaskStatus.config, 'daily_question_target', 10));
    setReviewScope(reviewScopeConfig(appTaskStatus.config));
    setReviewDuration(Math.round(numberConfig(appTaskStatus.config, 'default_focus_duration', 1500) / 60));
    setReviewAddToTodayPlan(booleanConfig(appTaskStatus.config, 'add_to_today_plan', true));
  }, [practiceTaskStatus, appTaskStatus]);

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
      setAppTaskError(err instanceof Error ? err.message : '保存设置失败');
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleEnablePractice() {
    setAppTaskBusy(true);
    try {
      setPracticeEnabled(true);
      await persistConfig({ practiceEnabled: true });
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '启用真题练习失败');
    } finally {
      setAppTaskBusy(false);
    }
  }

  async function handleEnableReview() {
    setAppTaskBusy(true);
    try {
      setReviewEnabled(true);
      await persistConfig({ reviewEnabled: true });
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '启用错题复习失败');
    } finally {
      setAppTaskBusy(false);
    }
  }

  async function startReviewFocusWork() {
    if (!appTaskStatus.task_id) return;
    setAppTaskBusy(true);
    try {
      await apiJson(`/todo/tasks/${appTaskStatus.task_id}/focus/start`, { method: 'POST' });
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

  const ercTasks = [
    practiceTaskStatus.enabled
      ? {
          id: 'erc_practice',
          name: '真题练习',
          focusWorkName: '真题练习',
          isInitialized: isConfigured(practiceTaskStatus),
          isSynced: practiceAddToTodayPlan,
          onSyncToggle: async (nextSynced: boolean) => {
            setPracticeAddToTodayPlan(nextSynced);
            await persistConfig({ practiceAddToTodayPlan: nextSynced });
          },
        }
      : null,
    appTaskStatus.enabled
      ? {
          id: 'erc_review',
          name: '错题复习',
          focusWorkName: '开始复习',
          isInitialized: isConfigured(appTaskStatus),
          isSynced: reviewAddToTodayPlan,
          onSyncToggle: async (nextSynced: boolean) => {
            setReviewAddToTodayPlan(nextSynced);
            await persistConfig({ reviewAddToTodayPlan: nextSynced });
          },
        }
      : null,
  ].filter((task): task is NonNullable<typeof task> => task !== null);

  const hasNoPrimaryEvent = practiceTaskStatus.state === 'no_primary_event' || appTaskStatus.state === 'no_primary_event';
  const hasNoConfig = practiceTaskStatus.state === 'event_not_configured' && appTaskStatus.state === 'event_not_configured';

  return (
    <div className="ark-page relative z-10 h-full w-full overflow-y-auto px-8 pb-10 pt-20">
      <div className="mx-auto max-w-6xl">
        <section className="flex flex-col gap-6 border-b ark-border pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.28em] text-indigo-400 font-semibold">ERC</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--ark-text)]">阅读训练</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ark-text-muted)]">
              围绕整篇阅读练习和单题复习，将做过的阅读理解沉淀为长期复习资产，通过 FSRS 智能抗忘。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/erc/library" className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 hover:bg-ark-surface-subtle transition shadow-lg shadow-white/5">
              进入题库
            </Link>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="ark-button-secondary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium shadow-lg shadow-black/10 backdrop-blur-xl transition"
            >
              <Settings className="h-4 w-4 text-indigo-400" />
              安排管理与设置
            </button>
            <Link
              to="/erc/mistakes"
              className="ark-button-secondary rounded-full px-5 py-3 text-sm shadow-lg shadow-black/10 backdrop-blur-xl transition"
            >
              查看错题
            </Link>
          </div>
        </section>

        {error ? <p className="mt-6 text-sm text-rose-200">{error}</p> : null}
        {appTaskError ? <p className="mt-6 text-sm text-amber-100">{appTaskError}</p> : null}
        {hasNoPrimaryEvent ? (
          <p className="mt-6 text-sm text-amber-100">请先创建或设置主事件，再配置阅读训练应用。</p>
        ) : hasNoConfig ? (
          <p className="mt-6 text-sm text-amber-100">
            当前主事件尚未配置阅读训练。保存后，这份 ERC 配置会绑定在当前主事件上。
          </p>
        ) : appConfigNotice ? (
          <p className="mt-6 text-sm text-[var(--ark-text-muted)]">{appConfigNotice}</p>
        ) : null}

        {overview ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div className="ark-panel-card rounded-2xl p-5">
              <div className="text-sm text-[var(--ark-text-muted)]">今日待复习</div>
              <div className="mt-3 text-4xl font-semibold text-[var(--ark-text)]">{overview.due_review_count}</div>
            </div>
            <div className="ark-panel-card rounded-2xl p-5">
              <div className="text-sm text-[var(--ark-text-muted)]">已练文章</div>
              <div className="mt-3 text-4xl font-semibold text-[var(--ark-text)]">{overview.practiced_article_count}</div>
            </div>
            <div className="ark-panel-card rounded-2xl p-5">
              <div className="text-sm text-[var(--ark-text-muted)]">正确率</div>
              <div className="mt-3 text-4xl font-semibold text-[var(--ark-text)]">{accuracy}%</div>
            </div>
            <div className="ark-panel-card rounded-2xl p-5">
              <div className="text-sm text-[var(--ark-text-muted)]">错题</div>
              <div className="mt-3 text-4xl font-semibold text-[var(--ark-text)]">{overview.mistake_count}</div>
            </div>
          </div>
        ) : (
          <p className="mt-8 text-sm text-[var(--ark-text-muted)]">阅读训练统计加载中...</p>
        )}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {practiceTaskStatus.enabled ? (
            <div className="ark-panel-card flex flex-col justify-between rounded-3xl p-6">
              <div>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-300">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-[var(--ark-text)]">真题练习</h3>
                    <p className="text-xs text-[var(--ark-text-faint)]">ERC Practice</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-[var(--ark-text-muted)]">
                  每日进行整篇真题阅读训练，系统会自动带您完成单词预热。熟悉单词后再进入阅读，解答精选真题。
                </p>
                <div className="ark-surface-subtle mt-5 space-y-2 rounded-2xl border p-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--ark-text-faint)]">主页计划</span>
                    <span className="font-medium text-[var(--ark-text)]">{practiceAddToTodayPlan ? '已同步' : '未同步'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--ark-text-faint)]">每日目标</span>
                    <span className="font-medium text-[var(--ark-text)]">{dailyArticleTarget} 篇文章</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--ark-text-faint)]">专注时长</span>
                    <span className="font-medium text-[var(--ark-text)]">{practiceDuration} 分钟</span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                {practiceTaskStatus.state === 'no_primary_event' ? (
                  <button type="button" disabled className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 opacity-60">
                    请先设置主事件
                  </button>
                ) : practiceTaskStatus.state === 'uninitialized' || practiceTaskStatus.state === 'event_not_configured' ? (
                  <button
                    type="button"
                    onClick={handleEnablePractice}
                    disabled={appTaskBusy}
                    className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 transition hover:bg-ark-surface-subtle disabled:opacity-60"
                  >
                    启用真题练习
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startPracticeFocusWork}
                    disabled={!practiceTaskStatus.task_id || appTaskBusy || practiceTaskStatus.state === 'completed_today'}
                    className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 transition hover:bg-ark-surface-subtle disabled:opacity-60"
                  >
                    {practiceTaskStatus.state === 'completed_today' ? '今日练习已完成' : '开始真题练习'}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {appTaskStatus.enabled ? (
            <div className="ark-panel-card flex flex-col justify-between rounded-3xl p-6">
              <div>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-300">
                    <RefreshCw className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-[var(--ark-text)]">错题复习</h3>
                    <p className="text-xs text-[var(--ark-text-faint)]">ERC Review</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-[var(--ark-text-muted)]">
                  根据 FSRS 记忆算法，定时带您重温历史做错的阅读真题，提供单词预热并精准突破难关。
                </p>
                <div className="ark-surface-subtle mt-5 space-y-2 rounded-2xl border p-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--ark-text-faint)]">主页计划</span>
                    <span className="font-medium text-[var(--ark-text)]">{reviewAddToTodayPlan ? '已同步' : '未同步'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--ark-text-faint)]">每日目标</span>
                    <span className="font-medium text-[var(--ark-text)]">{dailyQuestionTarget} 道题目</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--ark-text-faint)]">复习范围</span>
                    <span className="font-medium text-[var(--ark-text)]">
                      {reviewScope === 'due' ? '仅到期错题' : reviewScope === 'all' ? '全部做错题目' : '未掌握错题'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                {appTaskStatus.state === 'no_primary_event' ? (
                  <button type="button" disabled className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 opacity-60">
                    请先设置主事件
                  </button>
                ) : appTaskStatus.state === 'uninitialized' || appTaskStatus.state === 'event_not_configured' ? (
                  <button
                    type="button"
                    onClick={handleEnableReview}
                    disabled={appTaskBusy}
                    className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 transition hover:bg-ark-surface-subtle disabled:opacity-60"
                  >
                    启用错题复习
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startReviewFocusWork}
                    disabled={!appTaskStatus.task_id || appTaskBusy || appTaskStatus.state === 'completed_today'}
                    className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 transition hover:bg-ark-surface-subtle disabled:opacity-60"
                  >
                    {appTaskStatus.state === 'completed_today' ? '今日复习已完成' : '开始复习'}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {!practiceTaskStatus.enabled && !appTaskStatus.enabled ? (
            <div className="ark-panel-card rounded-3xl p-6 md:col-span-2">
              <h3 className="text-xl font-semibold text-[var(--ark-text)]">阅读训练尚未启用</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--ark-text-muted)]">
                打开安排管理与设置，选择要启用的训练模块。保存后，这份配置会绑定在当前主事件上。
              </p>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="mt-5 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-ark-surface-subtle"
              >
                配置阅读训练
              </button>
            </div>
          ) : null}
        </div>

        {overview?.recommended_article ? (
          <section className="mt-8 border-t border-ark-border pt-6">
            <div className="text-sm text-ark-text-muted">今日推荐练习</div>
            <Link
              to={`/erc/articles/${overview.recommended_article.article_id}/practice`}
              className="mt-3 inline-flex rounded-full border border-ark-border px-6 py-3 text-sm text-indigo-200 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition"
            >
              {overview.recommended_article.year} 年 Text {overview.recommended_article.text_no} · {overview.recommended_article.title || '无标题文章'}
            </Link>
          </section>
        ) : null}

        <div className="mt-8">
          <SubAppArrangements tasks={ercTasks} isBusy={appTaskBusy} />
        </div>
      </div>

      {settingsOpen ? (
        <div className="ark-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="ERC 安排与设置">
          <div className="ark-modal max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2.5rem] p-8 shadow-2xl shadow-black/20">
            <div className="flex items-start justify-between gap-4 border-b ark-border pb-5">
              <div>
                <div className="text-sm uppercase tracking-[0.28em] text-indigo-400 font-semibold">Settings</div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">ERC 阅读训练配置</h2>
                <p className="mt-2 text-xs text-[var(--ark-text-muted)]">
                  这是一份 ERC 子应用配置。保存后会派生真题练习与错题复习任务，并同步到当前主事件。
                </p>
                {appConfigNotice ? <p className="mt-2 text-xs text-indigo-200">{appConfigNotice}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="ark-button-secondary rounded-full px-4 py-2 text-sm transition"
              >
                关闭
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div className="ark-surface-subtle space-y-4 rounded-3xl border p-6">
                <div className="flex items-center justify-between gap-4 border-b ark-border pb-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-indigo-400" />
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
                      className="w-full rounded-2xl border ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)] disabled:opacity-60"
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
                      className="w-full rounded-2xl border ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)] disabled:opacity-60"
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

              <div className="ark-surface-subtle space-y-4 rounded-3xl border p-6">
                <div className="flex items-center justify-between gap-4 border-b ark-border pb-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-emerald-400" />
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
                        className="w-full rounded-2xl border ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)] disabled:opacity-60"
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
                        className="w-full rounded-2xl border ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)] disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs text-[var(--ark-text-muted)]">错题复习范围</label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(['due', 'mistakes', 'all'] as const).map((scope) => {
                        const isSelected = reviewScope === scope;
                        const label = scope === 'due' ? '仅到期错题' : scope === 'all' ? '全部做错题目' : '未掌握错题';
                        const desc = scope === 'due' ? '按记忆遗忘算法智能调度' : scope === 'all' ? '随机挑选所有做错题目' : '过滤已熟练掌握的题目';
                        return (
                          <button
                            key={scope}
                            type="button"
                            disabled={!reviewEnabled}
                            onClick={() => setReviewScope(scope)}
                            className={`rounded-2xl border p-4 text-left transition disabled:opacity-60 ${
                              isSelected
                                ? 'border-emerald-500/80 bg-emerald-500/10 text-emerald-200'
                                : 'ark-border bg-[var(--ark-surface)] text-[var(--ark-text-muted)] hover:border-[var(--ark-border-strong)]'
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

            <div className="mt-8 flex justify-end gap-3 border-t ark-border pt-5">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="ark-button-secondary rounded-full px-5 py-3 text-sm transition"
              >
                取消
              </button>
              <button
                type="button"
                disabled={settingsSaving}
                onClick={handleSaveSettings}
                className="rounded-full border border-ark-border bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-ark-surface-subtle disabled:opacity-60"
              >
                {settingsSaving ? '保存中…' : '保存 ERC 配置'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
