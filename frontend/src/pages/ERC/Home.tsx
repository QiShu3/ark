import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, BookOpen, RefreshCw } from 'lucide-react';

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
  const [practiceEnabled, setPracticeEnabled] = useState(true);
  const [dailyArticleTarget, setDailyArticleTarget] = useState(1);
  const [practiceDuration, setPracticeDuration] = useState(25); // In minutes

  // Settings values (Review)
  const [reviewEnabled, setReviewEnabled] = useState(true);
  const [dailyQuestionTarget, setDailyQuestionTarget] = useState(10);
  const [reviewScope, setReviewScope] = useState<'due' | 'mistakes' | 'all'>('due');
  const [reviewDuration, setReviewDuration] = useState(25); // In minutes

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
      if (typeof appTaskStatus.config.add_to_today_plan === 'boolean') {
        setReviewEnabled(appTaskStatus.config.add_to_today_plan);
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
      if (typeof practiceTaskStatus.config.add_to_today_plan === 'boolean') {
        setPracticeEnabled(practiceTaskStatus.config.add_to_today_plan);
      }
    }
  }, [practiceTaskStatus]);

  const accuracy = overview ? Math.round(overview.accuracy * 100) : 0;

  // Task Initialization functions
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
        event_id: null,
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
        add_to_today_plan: practiceEnabled,
        event_id: null,
      });
      setPracticeTaskStatus(newPracticeStatus);

      // 2. Save Review config & task
      const newReviewStatus = await initializeERCAppTask({
        review_scope: reviewScope,
        daily_question_target: dailyQuestionTarget,
        default_focus_duration: reviewDuration * 60,
        add_to_today_plan: reviewEnabled,
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

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-8 pb-10 pt-20">
      <div className="mx-auto max-w-6xl">
        <section className="border-b border-white/10 pb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-sm uppercase tracking-[0.28em] text-indigo-400 font-semibold">ERC</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">阅读训练</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/68">
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
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-medium text-white/90 shadow-lg shadow-black/10 backdrop-blur-xl transition hover:border-white/25 hover:bg-white/14"
            >
              <Settings className="h-4 w-4 text-indigo-400" />
              安排管理与设置
            </button>
            <Link
              to="/erc/mistakes"
              className="rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm text-white/86 shadow-lg shadow-black/10 backdrop-blur-xl transition hover:border-white/25 hover:bg-white/14"
            >
              查看错题
            </Link>
          </div>
        </section>

        {error ? <p className="mt-6 text-sm text-rose-200">{error}</p> : null}
        {appTaskError ? <p className="mt-6 text-sm text-rose-200">{appTaskError}</p> : null}

        {/* Overview Stats */}
        {overview ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-sm text-white/55">今日待复习</div>
              <div className="mt-3 text-4xl font-semibold text-white">{overview.due_review_count}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-sm text-white/55">已练文章</div>
              <div className="mt-3 text-4xl font-semibold text-white">{overview.practiced_article_count}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-sm text-white/55">正确率</div>
              <div className="mt-3 text-4xl font-semibold text-white">{accuracy}%</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-sm text-white/55">错题</div>
              <div className="mt-3 text-4xl font-semibold text-white">{overview.mistake_count}</div>
            </div>
          </div>
        ) : (
          <p className="mt-8 text-sm text-white/55">阅读训练统计加载中...</p>
        )}

        {/* Task Cards Container */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {/* Card 1: ERCPractice */}
          <div className="rounded-3xl border border-white/10 bg-[#0d1015]/40 p-6 backdrop-blur-md flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-300">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">真题练习</h3>
                  <p className="text-xs text-white/40">ERC Practice</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/65">
                每日进行整篇真题阅读训练，系统会自动带您完成单词预热。熟悉单词后再进入阅读，解答精选真题。
              </p>
              
              {/* Config details */}
              <div className="mt-5 rounded-2xl border border-white/5 bg-white/3 p-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/45">主页计划</span>
                  <span className="font-medium text-white/80">
                    {practiceTaskStatus?.config?.add_to_today_plan ? '已同步' : '未同步'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/45">每日目标</span>
                  <span className="font-medium text-white/80">
                    {(practiceTaskStatus?.config?.daily_article_target as number) ?? 1} 篇文章
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/45">专注时长</span>
                  <span className="font-medium text-white/80">
                    {practiceTaskStatus?.config?.default_focus_duration
                      ? Math.round((practiceTaskStatus.config.default_focus_duration as number) / 60)
                      : 25}{' '}
                    分钟
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              {practiceTaskStatus?.state === 'uninitialized' ? (
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
          <div className="rounded-3xl border border-white/10 bg-[#0d1015]/40 p-6 backdrop-blur-md flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-300">
                  <RefreshCw className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">错题复习</h3>
                  <p className="text-xs text-white/40">ERC Review</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/65">
                根据 FSRS 记忆算法，定时带您重温历史做错的阅读真题，提供单词预热并精准突破难关。
              </p>
              
              {/* Config details */}
              <div className="mt-5 rounded-2xl border border-white/5 bg-white/3 p-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/45">主页计划</span>
                  <span className="font-medium text-white/80">
                    {appTaskStatus?.config?.add_to_today_plan ? '已同步' : '未同步'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/45">每日目标</span>
                  <span className="font-medium text-white/80">
                    {(appTaskStatus?.config?.daily_question_target as number) ?? 10} 道题目
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/45">复习范围</span>
                  <span className="font-medium text-white/80">
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
              {appTaskStatus?.state === 'uninitialized' ? (
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
      </div>

      {/* Settings Modal */}
      {settingsOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="ERC 安排与设置">
          <div className="w-full max-w-2xl rounded-[2.5rem] border border-white/10 bg-[#101218] p-8 text-white shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <div className="text-sm uppercase tracking-[0.28em] text-indigo-400 font-semibold">Settings</div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">ERC 阅读训练安排与设置</h2>
                <p className="mt-2 text-xs text-white/50">
                  配置两个独立的子任务，系统将根据您的设定自动添加并同步至主页今日计划。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/25 hover:text-white"
              >
                关闭
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {/* Section 1: 真题练习 */}
              <div className="rounded-3xl border border-white/6 bg-white/2 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/6 pb-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-indigo-400" />
                    <h3 className="text-base font-semibold text-white">真题练习 (Practice Task)</h3>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={practiceEnabled}
                      onChange={(e) => setPracticeEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/10 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                    <span className="ml-3 text-sm text-white/70">同步到主页</span>
                  </label>
                </div>

                {practiceEnabled && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs text-white/50 mb-2">每日目标 (文章篇数)</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={dailyArticleTarget}
                        onChange={(e) => setDailyArticleTarget(Math.max(1, Number(e.target.value)))}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-2">默认专注时长 (分钟)</label>
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={practiceDuration}
                        onChange={(e) => setPracticeDuration(Math.max(5, Number(e.target.value)))}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: 错题复习 */}
              <div className="rounded-3xl border border-white/6 bg-white/2 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/6 pb-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-emerald-400" />
                    <h3 className="text-base font-semibold text-white">错题复习 (Review Task)</h3>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={reviewEnabled}
                      onChange={(e) => setReviewEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/10 rounded-full peer peer-focus:ring-2 peer-focus:ring-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    <span className="ml-3 text-sm text-white/70">同步到主页</span>
                  </label>
                </div>

                {reviewEnabled && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs text-white/50 mb-2">每日目标 (复习题数)</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={dailyQuestionTarget}
                          onChange={(e) => setDailyQuestionTarget(Math.max(1, Number(e.target.value)))}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/50 mb-2">默认专注时长 (分钟)</label>
                        <input
                          type="number"
                          min={5}
                          max={120}
                          value={reviewDuration}
                          onChange={(e) => setReviewDuration(Math.max(5, Number(e.target.value)))}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-white/50 mb-2">错题复习范围</label>
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
                                  : 'border-white/6 bg-white/4 text-white/70 hover:border-white/15'
                              }`}
                            >
                              <div className="text-sm font-semibold">{label}</div>
                              <div className="mt-1 text-[10px] text-white/40 leading-normal">{desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 border-t border-white/10 pt-5">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/70 transition hover:border-white/25 hover:text-white"
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

