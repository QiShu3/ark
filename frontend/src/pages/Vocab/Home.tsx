import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import OverviewDetailModal, { type OverviewDetailTab } from '../../components/Vocab/OverviewDetailModal';
import TodayPlanModal from '../../components/Vocab/TodayPlanModal';
import { START_FOCUS_WORK_EVENT } from '../../components/focus-work/focusWorkTypes';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { fetchVocabOverview, fetchVocabToday, updateVocabTodaySettings } from '../../lib/vocab/api';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [overviewDetailOpen, setOverviewDetailOpen] = useState(false);
  const [overviewDetailTab, setOverviewDetailTab] = useState<OverviewDetailTab>('completed');
  const [overviewDetailDeckId, setOverviewDetailDeckId] = useState<string | null>(null);
  const isTodayComplete = !!summary && summary.total_count > 0 && summary.pending_count === 0;
  const modalInitialTarget = summary ? (isTodayComplete ? summary.total_count + summary.daily_target_count : summary.daily_target_count) : 20;

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

  const handleSaveSettings = async (totalTargetCount: number) => {
    if (!activeDeck) return;
    setSettingsSaving(true);
    try {
      const payload = await updateVocabTodaySettings(activeDeck.id, { total_target_count: totalTargetCount });
      setSummary(payload);
      setSummaryError(null);
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

  const startTodayFocusWork = () => {
    window.dispatchEvent(new CustomEvent(START_FOCUS_WORK_EVENT, { detail: { focusWorkType: 'vocab_today' } }));
  };

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-8 pb-10 pt-20">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-[2rem] border border-white/10 bg-black/30 p-8 backdrop-blur-md">
            <div className="text-sm uppercase tracking-[0.32em] text-white/45">Vocabulary</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">背单词</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/68">
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

            {loading ? <p className="mt-6 text-sm text-white/55">词书加载中…</p> : null}
            {error ? <p className="mt-6 text-sm text-rose-200">{error}</p> : null}

            {summary ? (
              <div className="mt-8 space-y-6">
                <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-emerald-400/18 via-sky-400/10 to-transparent p-7 backdrop-blur-md">
                  <div className="text-sm uppercase tracking-[0.28em] text-white/45">Today</div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight">今日单词</div>
                  <p className="mt-3 text-sm leading-6 text-white/65">今天这本词书要完成的学习任务，系统会先带你完成复习，再进入新词。</p>

                  <div className="mt-6 flex flex-wrap items-end gap-6">
                    <div>
                      <div className="text-sm text-white/55">剩余</div>
                      <div className="mt-2 text-5xl font-semibold text-white">{summary.pending_count}</div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-white/40">今日总量</div>
                        <div className="mt-2 text-2xl font-semibold text-white">{summary.total_count}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-white/40">已完成</div>
                        <div className="mt-2 text-2xl font-semibold text-white">{summary.completed_count}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-white/40">Learning</div>
                        <div className="mt-2 text-2xl font-semibold text-white">{summary.learning_count}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-white/40">新词</div>
                        <div className="mt-2 text-2xl font-semibold text-white">{summary.new_count}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-white/40">复习</div>
                        <div className="mt-2 text-2xl font-semibold text-white">{summary.review_count}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    {isTodayComplete ? (
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
                        className="inline-flex items-center rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90"
                      >
                        {summary.completed_count > 0 ? '继续今日单词' : '开始今日单词'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-5 py-3 text-sm text-white/80 transition hover:border-white/25 hover:bg-white/12"
                    >
                      调整今日单词
                    </button>
                    <div className="text-sm text-white/60">已完成 {summary.completed_count} / {summary.total_count}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {summaryError ? <p className="mt-6 text-sm text-rose-200">{summaryError}</p> : null}
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/6 p-8 backdrop-blur-md">
            <div className="text-sm uppercase tracking-[0.32em] text-white/45">总览</div>

            {overview ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => openOverviewDetail('completed')}
                    className="rounded-2xl border border-white/10 bg-black/20 p-5 text-left transition hover:border-white/25 hover:bg-black/30"
                  >
                    <div className="text-sm text-white/50">已完成词书</div>
                    <div className="mt-3 text-3xl font-semibold text-white">{overview.completed_deck_count} / {overview.total_deck_count} 本</div>
                    <div className="mt-2 text-sm text-white/55">全部单词都已进入 Review 状态的词书数量。</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => openOverviewDetail('mastered')}
                    className="rounded-2xl border border-white/10 bg-black/20 p-5 text-left transition hover:border-white/25 hover:bg-black/30"
                  >
                    <div className="text-sm text-white/50">累计掌握单词</div>
                    <div className="mt-3 text-3xl font-semibold text-white">{overview.mastered_word_count}</div>
                    <div className="mt-2 text-sm text-white/55">按 FSRS Review 口径统计的全局已掌握单词总数。</div>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => openOverviewDetail('current', activeDeck?.id)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 p-5 text-left transition hover:border-white/25 hover:bg-black/30"
                >
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-sm text-white/50">当前词书掌握度</div>
                      <div className="mt-2 text-2xl font-semibold text-white">{overview.current_deck.deck_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-white/50">已掌握</div>
                      <div className="mt-2 text-2xl font-semibold text-white">
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
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-sm text-white/50">未开始</div>
                      <div className="mt-2 text-xl font-semibold text-white">{overview.current_deck.unstarted_word_count}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-sm text-white/50">学习中</div>
                      <div className="mt-2 text-xl font-semibold text-white">{overview.current_deck.learning_word_count}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-sm text-white/50">已掌握</div>
                      <div className="mt-2 text-xl font-semibold text-white">{overview.current_deck.mastered_word_count}</div>
                    </div>
                  </div>
                </button>

                <div>
                  <div className="text-sm uppercase tracking-[0.24em] text-white/40">快捷入口</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <a href="#/vocab/study" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white/80 transition hover:border-white/25 hover:bg-white/10">
                      <div className="text-base font-medium text-white">新词</div>
                      <div className="mt-1 text-sm text-white/55">单独进入新词队列</div>
                    </a>
                    <a href="#/vocab/review" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white/80 transition hover:border-white/25 hover:bg-white/10">
                      <div className="text-base font-medium text-white">复习</div>
                      <div className="mt-1 text-sm text-white/55">单独清理到期复习</div>
                    </a>
                    <a href="#/vocab/mistakes" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white/80 transition hover:border-white/25 hover:bg-white/10">
                      <div className="text-base font-medium text-white">错题</div>
                      <div className="mt-1 text-sm text-white/55">快速查看薄弱词</div>
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
          isCompleted={isTodayComplete}
          isSaving={settingsSaving}
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
