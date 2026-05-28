import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, BookOpen, RefreshCw } from 'lucide-react';

import SubAppArrangements from '../../components/SubAppArrangements';
import type { AppTaskStatus } from '../../components/taskTypes';
import { apiJson } from '../../lib/api';
import {
  fetchERCAppTaskStatus,
  fetchERCPracticeAppTaskStatus,
  fetchERCOverview,
  initializeERCAppTask,
  initializeERCPracticeAppTask,
} from '../../lib/erc/api';
import type { ERCOverview } from '../../lib/erc/types';

export default function ERCHome() {
  const [overview, setOverview] = useState<ERCOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Status of the tasks
  const [appTaskStatus, setAppTaskStatus] = useState<AppTaskStatus | null>(null); // Review task status
  const [practiceTaskStatus, setPracticeTaskStatus] = useState<AppTaskStatus | null>(null); // Practice task status
  
  const [appTaskBusy, setAppTaskBusy] = useState(false);
  const [appTaskError, setAppTaskError] = useState<string | null>(null);

  // Settings Modal states
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Settings values (Practice)
  const [dailyArticleTarget, setDailyArticleTarget] = useState(1);
  const [practiceDuration, setPracticeDuration] = useState(25); // In minutes

  // Settings values (Review)
  const [dailyQuestionTarget, setDailyQuestionTarget] = useState(10);
  const [reviewScope, setReviewScope] = useState<'due' | 'mistakes' | 'all'>('due');
  const [reviewDuration, setReviewDuration] = useState(25); // In minutes

  const isConfiguredForCurrentEvent = (status: AppTaskStatus | null): boolean => (
    !!status && !['no_primary_event', 'event_not_configured', 'uninitialized', 'config_invalid'].includes(status.state)
  );
  const currentEventName = practiceTaskStatus?.event_name || appTaskStatus?.event_name || null;
  const appConfigNotice = currentEventName ? `该配置会同步到当前主事件「${currentEventName}」。` : null;

  // Load overview data
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

  // Load Review app-managed task status
  useEffect(() => {
    let cancelled = false;
    fetchERCAppTaskStatus()
      .then((payload) => {
        if (cancelled) return;
        setAppTaskStatus(payload);
        setAppTaskError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAppTaskError(err instanceof Error ? err.message : 'ERC 复习任务状态加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load Practice app-managed task status
  useEffect(() => {
    let cancelled = false;
    fetchERCPracticeAppTaskStatus()
      .then((payload) => {
        if (cancelled) return;
        setPracticeTaskStatus(payload);
        setAppTaskError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAppTaskError(err instanceof Error ? err.message : 'ERC 真题练习任务状态加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize form states from loaded task statuses
  useEffect(() => {
    if (appTaskStatus?.config) {
      if (appTaskStatus.config.review_scope) {
        setReviewScope(appTaskStatus.config.review_scope as 'due' | 'mistakes' | 'all');
      }
      if (typeof appTaskStatus.config.daily_question_target === 'number') {
        setDailyQuestionTarget(appTaskStatus.config.daily_question_target);
      }
      if (typeof appTaskStatus.config.default_focus_duration === 'number') {
        setReviewDuration(Math.round(appTaskStatus.config.default_focus_duration / 60));
      }
    }
  }, [appTaskStatus]);

  useEffect(() => {
    if (practiceTaskStatus?.config) {
      if (typeof practiceTaskStatus.config.daily_article_target === 'number') {
        setDailyArticleTarget(practiceTaskStatus.config.daily_article_target);
      }
      if (typeof practiceTaskStatus.config.default_focus_duration === 'number') {
        setPracticeDuration(Math.round(practiceTaskStatus.config.default_focus_duration / 60));
      }
    }
  }, [practiceTaskStatus]);

  const accuracy = overview ? Math.round(overview.accuracy * 100) : 0;

  const initializeReviewTask = async () => {
    setAppTaskBusy(true);
    try {
      const payload = await initializeERCAppTask({
        review_scope: 'due',
        daily_question_target: 10,
        default_focus_duration: 1500,
        add_to_today_plan: true,
      });
      setAppTaskStatus(payload);
      setAppTaskError(null);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '初始化 ERC 复习失败');
    } finally {
      setAppTaskBusy(false);
    }
  };

  const initializePracticeTask = async () => {
    setAppTaskBusy(true);
    try {
      const payload = await initializeERCPracticeAppTask({
        daily_article_target: 1,
        default_focus_duration: 1500,
        add_to_today_plan: true,
      });
      setPracticeTaskStatus(payload);
      setAppTaskError(null);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '初始化 ERC 真题练习失败');
    } finally {
      setAppTaskBusy(false);
    }
  };

  // Start Focus Work functions
  const startReviewFocusWork = async () => {
    if (!appTaskStatus?.task_id) return;
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
  };

  const startPracticeFocusWork = async () => {
    if (!practiceTaskStatus?.task_id) return;
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
  };

  // Save Settings Modal functions
  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setAppTaskError(null);
    try {
      // 1. Save Practice config & task
      const newPracticeStatus = await initializeERCPracticeAppTask({
        daily_article_target: dailyArticleTarget,
        default_focus_duration: practiceDuration * 60,
        add_to_today_plan: typeof practiceTaskStatus?.config?.add_to_today_plan === 'boolean' ? practiceTaskStatus.config.add_to_today_plan : true,
      });
      setPracticeTaskStatus(newPracticeStatus);

      // 2. Save Review config & task
      const newReviewStatus = await initializeERCAppTask({
        review_scope: reviewScope,
        daily_question_target: dailyQuestionTarget,
        default_focus_duration: reviewDuration * 60,
        add_to_today_plan: typeof appTaskStatus?.config?.add_to_today_plan === 'boolean' ? appTaskStatus.config.add_to_today_plan : true,
      });
      setAppTaskStatus(newReviewStatus);

      setSettingsOpen(false);
      
      // Refresh Overview
      const freshOverview = await fetchERCOverview();
      setOverview(freshOverview);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '保存设置失败');
    } finally {
      setSettingsSaving(false);
    }
  };

  const ercTasks = [
    {
      id: 'erc_practice',
      name: '真题练习',
      focusWorkName: '真题练习',
      isInitialized: isConfiguredForCurrentEvent(practiceTaskStatus),
      isSynced: typeof practiceTaskStatus?.config?.add_to_today_plan === 'boolean' ? practiceTaskStatus.config.add_to_today_plan : true,
      onSyncToggle: async (nextSynced: boolean) => {
        const payload = await initializeERCPracticeAppTask({
          daily_article_target: typeof practiceTaskStatus?.config?.daily_article_target === 'number' ? practiceTaskStatus.config.daily_article_target : 1,
          default_focus_duration: typeof practiceTaskStatus?.config?.default_focus_duration === 'number' ? practiceTaskStatus.config.default_focus_duration : 1500,
          add_to_today_plan: nextSynced,
        });
        setPracticeTaskStatus(payload);
        setAppTaskError(null);
      },
    },
    {
      id: 'erc_review',
      name: '错题复习',
      focusWorkName: '开始复习',
      isInitialized: isConfiguredForCurrentEvent(appTaskStatus),
      isSynced: typeof appTaskStatus?.config?.add_to_today_plan === 'boolean' ? appTaskStatus.config.add_to_today_plan : true,
      onSyncToggle: async (nextSynced: boolean) => {
        const payload = await initializeERCAppTask({
          review_scope: (appTaskStatus?.config?.review_scope as any) || 'due',
          daily_question_target: typeof appTaskStatus?.config?.daily_question_target === 'number' ? appTaskStatus.config.daily_question_target : 10,
          default_focus_duration: typeof appTaskStatus?.config?.default_focus_duration === 'number' ? appTaskStatus.config.default_focus_duration : 1500,
          add_to_today_plan: nextSynced,
        });
        setAppTaskStatus(payload);
        setAppTaskError(null);
      },
    },
  ];

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
            <Link to="/erc/library" className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 hover:bg-white/90 transition shadow-lg shadow-white/5">
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
        {appTaskError ? <p className="mt-6 text-sm text-rose-200">{appTaskError}</p> : null}
        {practiceTaskStatus?.state === 'no_primary_event' || appTaskStatus?.state === 'no_primary_event' ? (
          <p className="mt-6 text-sm text-amber-100">请先创建或设置主事件，再配置阅读训练应用。</p>
        ) : practiceTaskStatus?.state === 'event_not_configured' || appTaskStatus?.state === 'event_not_configured' ? (
          <p className="mt-6 text-sm text-amber-100">
            当前主事件「{currentEventName}」尚未完整配置阅读训练，请先在“安排管理与设置”中保存配置。
          </p>
        ) : null}

        {/* Overview Stats */}
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

        {/* Task Cards Container */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {/* Card 1: ERCPractice */}
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
              
              {/* Config details */}
              <div className="ark-surface-subtle mt-5 space-y-2 rounded-2xl border p-4">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--ark-text-faint)]">主页计划</span>
                  <span className="font-medium text-[var(--ark-text)]">
                    {practiceTaskStatus?.config?.add_to_today_plan ? '已同步' : '未同步'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--ark-text-faint)]">每日目标</span>
                  <span className="font-medium text-[var(--ark-text)]">
                    {(practiceTaskStatus?.config?.daily_article_target as number) ?? 1} 篇文章
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--ark-text-faint)]">专注时长</span>
                  <span className="font-medium text-[var(--ark-text)]">
                    {practiceTaskStatus?.config?.default_focus_duration
                      ? Math.round((practiceTaskStatus.config.default_focus_duration as number) / 60)
                      : 25}{' '}
                    分钟
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              {practiceTaskStatus?.state === 'no_primary_event' ? (
                <button
                  type="button"
                  disabled
                  className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 opacity-60"
                >
                  请先设置主事件
                </button>
              ) : practiceTaskStatus?.state === 'event_not_configured' ? (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  disabled={appTaskBusy}
                  className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                >
                  配置当前事件真题练习
                </button>
              ) : practiceTaskStatus?.state === 'uninitialized' ? (
                <button
                  type="button"
                  onClick={initializePracticeTask}
                  disabled={appTaskBusy}
                  className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                >
                  启用真题练习
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startPracticeFocusWork}
                  disabled={!practiceTaskStatus?.task_id || appTaskBusy || practiceTaskStatus?.state === 'completed_today'}
                  className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                >
                  {practiceTaskStatus?.state === 'completed_today' ? '今日练习已完成' : '开始真题练习'}
                </button>
              )}
            </div>
          </div>

          {/* Card 2: ERCReview */}
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
              
              {/* Config details */}
              <div className="ark-surface-subtle mt-5 space-y-2 rounded-2xl border p-4">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--ark-text-faint)]">主页计划</span>
                  <span className="font-medium text-[var(--ark-text)]">
                    {appTaskStatus?.config?.add_to_today_plan ? '已同步' : '未同步'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--ark-text-faint)]">每日目标</span>
                  <span className="font-medium text-[var(--ark-text)]">
                    {(appTaskStatus?.config?.daily_question_target as number) ?? 10} 道题目
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--ark-text-faint)]">复习范围</span>
                  <span className="font-medium text-[var(--ark-text)]">
                    {appTaskStatus?.config?.review_scope === 'due'
                      ? '仅到期错题'
                      : appTaskStatus?.config?.review_scope === 'all'
                        ? '全部做错题目'
                        : '未掌握错题'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              {appTaskStatus?.state === 'no_primary_event' ? (
                <button
                  type="button"
                  disabled
                  className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 opacity-60"
                >
                  请先设置主事件
                </button>
              ) : appTaskStatus?.state === 'event_not_configured' ? (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  disabled={appTaskBusy}
                  className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                >
                  配置当前事件错题复习
                </button>
              ) : appTaskStatus?.state === 'uninitialized' ? (
                <button
                  type="button"
                  onClick={initializeReviewTask}
                  disabled={appTaskBusy}
                  className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                >
                  启用错题复习
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startReviewFocusWork}
                  disabled={!appTaskStatus?.task_id || appTaskBusy || appTaskStatus?.state === 'completed_today'}
                  className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                >
                  {appTaskStatus?.state === 'completed_today' ? '今日复习已完成' : '开始复习'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Recommended Article */}
        {overview?.recommended_article ? (
          <section className="mt-8 border-t border-white/10 pt-6">
            <div className="text-sm text-white/55">今日推荐练习</div>
            <Link
              to={`/erc/articles/${overview.recommended_article.article_id}/practice`}
              className="mt-3 inline-flex rounded-full border border-white/15 px-6 py-3 text-sm text-indigo-200 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition"
            >
              {overview.recommended_article.year} 年 Text {overview.recommended_article.text_no} · {overview.recommended_article.title || '无标题文章'}
            </Link>
          </section>
        ) : null}

        <div className="mt-8">
          <SubAppArrangements tasks={ercTasks} isBusy={appTaskBusy} />
        </div>
      </div>

      {/* Settings Modal */}
      {settingsOpen ? (
        <div className="ark-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="ERC 安排与设置">
          <div className="ark-modal max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2.5rem] p-8 shadow-2xl shadow-black/20">
            <div className="flex items-start justify-between gap-4 border-b ark-border pb-5">
              <div>
                <div className="text-sm uppercase tracking-[0.28em] text-indigo-400 font-semibold">Settings</div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">ERC 阅读训练安排与设置</h2>
                <p className="mt-2 text-xs text-[var(--ark-text-muted)]">
                  配置两个独立的子任务，系统将根据您的设定自动添加并同步至主页今日计划。
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
              {/* Section 1: 真题练习 */}
              <div className="ark-surface-subtle space-y-4 rounded-3xl border p-6">
                <div className="flex items-center justify-between border-b ark-border pb-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-indigo-400" />
                    <h3 className="text-base font-semibold text-[var(--ark-text)]">真题练习 (Practice Task)</h3>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs text-[var(--ark-text-muted)]">每日目标 (文章篇数)</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={dailyArticleTarget}
                      onChange={(e) => setDailyArticleTarget(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded-2xl border ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs text-[var(--ark-text-muted)]">默认专注时长 (分钟)</label>
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={practiceDuration}
                      onChange={(e) => setPracticeDuration(Math.max(5, Number(e.target.value)))}
                      className="w-full rounded-2xl border ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)]"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: 错题复习 */}
              <div className="ark-surface-subtle space-y-4 rounded-3xl border p-6">
                <div className="flex items-center justify-between border-b ark-border pb-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-emerald-400" />
                    <h3 className="text-base font-semibold text-[var(--ark-text)]">错题复习 (Review Task)</h3>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs text-[var(--ark-text-muted)]">每日目标 (复习题数)</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={dailyQuestionTarget}
                        onChange={(e) => setDailyQuestionTarget(Math.max(1, Number(e.target.value)))}
                        className="w-full rounded-2xl border ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)]"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs text-[var(--ark-text-muted)]">默认专注时长 (分钟)</label>
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={reviewDuration}
                        onChange={(e) => setReviewDuration(Math.max(5, Number(e.target.value)))}
                        className="w-full rounded-2xl border ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-[var(--ark-text)] outline-none transition focus:border-[var(--ark-border-strong)]"
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
                            onClick={() => setReviewScope(scope)}
                            className={`rounded-2xl border p-4 text-left transition ${
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
                className="rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
              >
                {settingsSaving ? '保存中…' : '保存设置并同步'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
