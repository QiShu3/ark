import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import OverviewDetailModal, { type OverviewDetailTab } from '../../components/Vocab/OverviewDetailModal';
import TodayPlanModal from '../../components/Vocab/TodayPlanModal';
import SubAppArrangements from '../../components/SubAppArrangements';
import type { AppTaskStatus } from '../../components/taskTypes';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { apiJson } from '../../lib/api';
import { fetchVocabAppTaskStatus, fetchVocabOverview, fetchVocabToday, initializeVocabAppTask, updateVocabTodaySettings } from '../../lib/vocab/api';
import type { VocabOverview, VocabTodaySummary } from '../../lib/vocab/types';

export default function VocabHome() {
  const navigate = useNavigate();
  const {
    decks,
    activeDeck,
    activeDeckVersion,
    inheritancePrompt,
    setActiveDeck,
    confirmInheritance,
    dismissInheritance,
    loading,
    error,
  } = useVocabDeck();
  const [summary, setSummary] = useState<VocabTodaySummary | null>(null);
  const [overview, setOverview] = useState<VocabOverview | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [appTaskStatus, setAppTaskStatus] = useState<AppTaskStatus | null>(null);
  const [appTaskBusy, setAppTaskBusy] = useState(false);
  const [appTaskError, setAppTaskError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [overviewDetailOpen, setOverviewDetailOpen] = useState(false);
  const [overviewDetailTab, setOverviewDetailTab] = useState<OverviewDetailTab>('completed');
  const [overviewDetailDeckId, setOverviewDetailDeckId] = useState<string | null>(null);
  const isTodayComplete = !!summary && summary.total_count > 0 && summary.pending_count === 0;
  const modalInitialTarget = summary ? (isTodayComplete ? summary.total_count + summary.daily_target_count : summary.daily_target_count) : 20;
  const hasEventAppConfig = appTaskStatus
    ? !['no_primary_event', 'event_not_configured', 'uninitialized', 'config_invalid'].includes(appTaskStatus.state)
    : false;
  const currentEventName = appTaskStatus?.event_name ?? null;
  const appConfigNotice = currentEventName ? `该配置会同步到当前主事件「${currentEventName}」。` : null;

  useEffect(() => {
    let cancelled = false;

    if (!activeDeck) {
      setSummary(null);
      setOverview(null);
      return;
    }

    Promise.all([fetchVocabToday(activeDeck.id), fetchVocabOverview(activeDeck.id)])
      .then(([todayPayload, overviewPayload]) => {
        if (cancelled) return;
        setSummary(todayPayload);
        setOverview(overviewPayload);
        setSummaryError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSummaryError(err instanceof Error ? err.message : '今日概览加载失败');
      });

    return () => {
      cancelled = true;
    };
  }, [activeDeck, activeDeckVersion]);

  useEffect(() => {
    let cancelled = false;
    fetchVocabAppTaskStatus()
      .then((payload) => {
        if (cancelled) return;
        setAppTaskStatus(payload);
        setAppTaskError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAppTaskError(err instanceof Error ? err.message : '应用任务状态加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveSettings = async (totalTargetCount: number, addToTodayPlan: boolean, focusDuration: number) => {
    if (!activeDeck) return;
    setSettingsSaving(true);
    try {
      // 1. Update deck-specific daily vocabulary target settings
      const payload = await updateVocabTodaySettings(activeDeck.id, { total_target_count: totalTargetCount });
      setSummary(payload);
      setSummaryError(null);

      // 2. Initialize/Sync the Vocab App Task in todo module with add_to_today_plan and focus duration.
      const initPayload = await initializeVocabAppTask({
        deck_id: activeDeck.id,
        daily_target_count: totalTargetCount,
        default_focus_duration: focusDuration,
        add_to_today_plan: addToTodayPlan,
      });
      setAppTaskStatus(initPayload);
      setAppTaskError(null);

      setSettingsOpen(false);
      const overviewPayload = await fetchVocabOverview(activeDeck.id);
      setOverview(overviewPayload);
      if (payload.pending_count > 0 && isTodayComplete) {
        navigate('/vocab/today');
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : '今日单词参数更新失败');
    } finally {
      setSettingsSaving(false);
    }
  };

  const currentDeckMasteryPercent = overview && overview.current_deck.total_word_count > 0
    ? Math.round((overview.current_deck.mastered_word_count / overview.current_deck.total_word_count) * 100)
    : 0;

  const openOverviewDetail = (tab: OverviewDetailTab, targetDeckId?: string | null) => {
    if (!activeDeck) return;
    setOverviewDetailTab(tab);
    setOverviewDetailDeckId(targetDeckId ?? activeDeck.id);
    setOverviewDetailOpen(true);
  };

  const initializeTodayWords = async () => {
    if (!activeDeck) return;
    setAppTaskBusy(true);
    try {
      const payload = await initializeVocabAppTask({
        deck_id: activeDeck.id,
        daily_target_count: summary?.daily_target_count || 20,
        default_focus_duration: 1500,
        add_to_today_plan: true,
      });
      setAppTaskStatus(payload);
      setAppTaskError(null);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '初始化今日单词失败');
    } finally {
      setAppTaskBusy(false);
    }
  };

  const startTodayFocusWork = async () => {
    if (!appTaskStatus?.task_id) return;
    setAppTaskBusy(true);
    try {
      await apiJson(`/todo/tasks/${appTaskStatus.task_id}/focus/start`, { method: 'POST' });
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      setAppTaskError(null);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '开始今日单词失败');
    } finally {
      setAppTaskBusy(false);
    }
  };

  const vocabTasks = [
    {
      id: 'vocab_today',
      name: '今日单词',
      focusWorkName: '今日单词',
      isInitialized: hasEventAppConfig,
      isSynced: typeof appTaskStatus?.config?.add_to_today_plan === 'boolean' ? appTaskStatus.config.add_to_today_plan : true,
      onSyncToggle: async (nextSynced: boolean) => {
        if (!activeDeck) return;
        const payload = await initializeVocabAppTask({
          deck_id: activeDeck.id,
          daily_target_count: summary?.daily_target_count || 20,
          default_focus_duration: typeof appTaskStatus?.config?.default_focus_duration === 'number' ? (appTaskStatus.config.default_focus_duration as number) : 1500,
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
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="ark-panel-card rounded-[2rem] p-8">
            <div className="text-sm uppercase tracking-[0.32em] text-[var(--ark-text-faint)]">Vocabulary</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">背单词</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ark-text-muted)]">
              先切词书，再进入今天的新词、复习和错题。第一期先把完整记忆流跑通，后续再叠更细的调度策略。
            </p>

            <div className="mt-8">
              <DeckSwitcher
                decks={decks}
                activeDeck={activeDeck}
                onChange={setActiveDeck}
                inheritancePrompt={inheritancePrompt}
                onConfirmInheritance={confirmInheritance}
                onDismissInheritance={dismissInheritance}
              />
            </div>

            {loading ? <p className="mt-6 text-sm text-[var(--ark-text-muted)]">词书加载中…</p> : null}
            {error ? <p className="mt-6 text-sm text-rose-200">{error}</p> : null}

            {summary ? (
              <div className="mt-8 space-y-6">
                <div className="rounded-[2rem] border ark-border bg-gradient-to-br from-emerald-400/18 via-sky-400/10 to-transparent p-7 backdrop-blur-md">
                  <div className="text-sm uppercase tracking-[0.28em] text-[var(--ark-text-faint)]">Today</div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight">今日单词</div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ark-text-muted)]">今天这本词书要完成的学习任务，系统会先带你完成复习，再进入新词。</p>

                  <div className="mt-6 flex flex-wrap items-end gap-6">
                    <div>
                      <div className="text-sm text-[var(--ark-text-muted)]">剩余</div>
                      <div className="mt-2 text-5xl font-semibold text-[var(--ark-text)]">{summary.pending_count}</div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="ark-surface-subtle rounded-2xl border px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-[var(--ark-text-faint)]">今日总量</div>
                        <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">{summary.total_count}</div>
                      </div>
                      <div className="ark-surface-subtle rounded-2xl border px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-[var(--ark-text-faint)]">已完成</div>
                        <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">{summary.completed_count}</div>
                      </div>
                      <div className="ark-surface-subtle rounded-2xl border px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-[var(--ark-text-faint)]">Learning</div>
                        <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">{summary.learning_count}</div>
                      </div>
                      <div className="ark-surface-subtle rounded-2xl border px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-[var(--ark-text-faint)]">新词</div>
                        <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">{summary.new_count}</div>
                      </div>
                      <div className="ark-surface-subtle rounded-2xl border px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-[var(--ark-text-faint)]">复习</div>
                        <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">{summary.review_count}</div>
                      </div>
                    </div>
                  </div>

                  {appTaskError ? <p className="mt-5 text-sm text-rose-200">{appTaskError}</p> : null}

                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    {appTaskStatus?.state === 'no_primary_event' ? (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 opacity-60"
                      >
                        请先创建或设置主事件
                      </button>
                    ) : appTaskStatus?.state === 'event_not_configured' ? (
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        disabled={!activeDeck || appTaskBusy}
                        className="inline-flex items-center rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                      >
                        配置当前事件今日单词
                      </button>
                    ) : appTaskStatus?.state === 'uninitialized' ? (
                      <button
                        type="button"
                        onClick={initializeTodayWords}
                        disabled={!activeDeck || appTaskBusy}
                        className="inline-flex items-center rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                      >
                        初始化今日单词
                      </button>
                    ) : appTaskStatus?.state === 'completed_today' || isTodayComplete ? (
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        className="inline-flex items-center rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90"
                      >
                        今日已完成
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startTodayFocusWork}
                        disabled={!appTaskStatus?.task_id || appTaskBusy}
                        className="inline-flex items-center rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                      >
                        {summary.completed_count > 0 ? '继续今日单词' : '开始今日单词'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="ark-button-secondary inline-flex items-center rounded-full px-5 py-3 text-sm transition"
                    >
                      调整今日单词
                    </button>
                    <div className="text-sm text-[var(--ark-text-muted)]">已完成 {summary.completed_count} / {summary.total_count}</div>
                  </div>
                  {appTaskStatus?.state === 'event_not_configured' ? (
                    <p className="mt-4 text-sm text-amber-100">
                      当前主事件「{appTaskStatus.event_name}」尚未配置今日单词，请先在这里完成配置。
                    </p>
                  ) : appTaskStatus?.state === 'no_primary_event' ? (
                    <p className="mt-4 text-sm text-amber-100">请先创建或设置主事件，再配置今日单词。</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-8">
              <SubAppArrangements tasks={vocabTasks} isBusy={appTaskBusy} />
            </div>

            {summaryError ? <p className="mt-6 text-sm text-rose-200">{summaryError}</p> : null}
          </section>

          <section className="ark-panel-card rounded-[2rem] p-8">
            <div className="text-sm uppercase tracking-[0.32em] text-[var(--ark-text-faint)]">总览</div>

            {overview ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => openOverviewDetail('completed')}
                    className="ark-surface-subtle rounded-2xl border p-5 text-left transition hover:border-[var(--ark-border-strong)]"
                  >
                    <div className="text-sm text-[var(--ark-text-muted)]">已完成词书</div>
                    <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.completed_deck_count} / {overview.total_deck_count} 本</div>
                    <div className="mt-2 text-sm text-[var(--ark-text-muted)]">全部单词都已进入 Review 状态的词书数量。</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => openOverviewDetail('mastered')}
                    className="ark-surface-subtle rounded-2xl border p-5 text-left transition hover:border-[var(--ark-border-strong)]"
                  >
                    <div className="text-sm text-[var(--ark-text-muted)]">累计掌握单词</div>
                    <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.mastered_word_count}</div>
                    <div className="mt-2 text-sm text-[var(--ark-text-muted)]">按 FSRS Review 口径统计的全局已掌握单词总数。</div>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => openOverviewDetail('current', activeDeck?.id)}
                  className="ark-surface-subtle w-full rounded-2xl border p-5 text-left transition hover:border-[var(--ark-border-strong)]"
                >
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-sm text-[var(--ark-text-muted)]">当前词书掌握度</div>
                      <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">{overview.current_deck.deck_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-[var(--ark-text-muted)]">已掌握</div>
                      <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">
                        {overview.current_deck.mastered_word_count} / {overview.current_deck.total_word_count}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-sky-300 to-cyan-200 transition-[width] duration-300"
                      style={{ width: `${currentDeckMasteryPercent}%` }}
                    />
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="ark-surface-subtle rounded-2xl border px-4 py-3">
                      <div className="text-sm text-[var(--ark-text-muted)]">未开始</div>
                      <div className="mt-2 text-xl font-semibold text-[var(--ark-text)]">{overview.current_deck.unstarted_word_count}</div>
                    </div>
                    <div className="ark-surface-subtle rounded-2xl border px-4 py-3">
                      <div className="text-sm text-[var(--ark-text-muted)]">学习中</div>
                      <div className="mt-2 text-xl font-semibold text-[var(--ark-text)]">{overview.current_deck.learning_word_count}</div>
                    </div>
                    <div className="ark-surface-subtle rounded-2xl border px-4 py-3">
                      <div className="text-sm text-[var(--ark-text-muted)]">已掌握</div>
                      <div className="mt-2 text-xl font-semibold text-[var(--ark-text)]">{overview.current_deck.mastered_word_count}</div>
                    </div>
                  </div>
                </button>

                <div>
                  <div className="text-sm uppercase tracking-[0.24em] text-[var(--ark-text-faint)]">快捷入口</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <a href="#/vocab/study" className="ark-surface-subtle rounded-2xl border px-4 py-4 transition hover:border-[var(--ark-border-strong)]">
                      <div className="text-base font-medium text-[var(--ark-text)]">新词</div>
                      <div className="mt-1 text-sm text-[var(--ark-text-muted)]">单独进入新词队列</div>
                    </a>
                    <a href="#/vocab/review" className="ark-surface-subtle rounded-2xl border px-4 py-4 transition hover:border-[var(--ark-border-strong)]">
                      <div className="text-base font-medium text-[var(--ark-text)]">复习</div>
                      <div className="mt-1 text-sm text-[var(--ark-text-muted)]">单独清理到期复习</div>
                    </a>
                    <a href="#/vocab/mistakes" className="ark-surface-subtle rounded-2xl border px-4 py-4 transition hover:border-[var(--ark-border-strong)]">
                      <div className="text-base font-medium text-[var(--ark-text)]">错题</div>
                      <div className="mt-1 text-sm text-[var(--ark-text-muted)]">快速查看薄弱词</div>
                    </a>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
      {settingsOpen ? (
        <TodayPlanModal
          initialTargetCount={modalInitialTarget}
          initialAddToTodayPlan={typeof appTaskStatus?.config?.add_to_today_plan === 'boolean' ? appTaskStatus.config.add_to_today_plan : true}
          initialFocusDuration={typeof appTaskStatus?.config?.default_focus_duration === 'number' ? appTaskStatus.config.default_focus_duration : 1500}
          isCompleted={isTodayComplete}
          isSaving={settingsSaving}
          syncNotice={appConfigNotice}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      ) : null}
      {activeDeck ? (
        <OverviewDetailModal
          isOpen={overviewDetailOpen}
          baseDeckId={activeDeck.id}
          initialTab={overviewDetailTab}
          initialTargetDeckId={overviewDetailDeckId}
          onClose={() => setOverviewDetailOpen(false)}
        />
      ) : null}
    </div>
  );
}
