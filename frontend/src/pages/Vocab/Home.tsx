import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import ProgressSummary from '../../components/Vocab/ProgressSummary';
import TodayPlanModal from '../../components/Vocab/TodayPlanModal';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { fetchVocabToday, updateVocabTodaySettings } from '../../lib/vocab/api';
import type { VocabTodaySummary } from '../../lib/vocab/types';

export default function VocabHome() {
  const navigate = useNavigate();
  const { decks, activeDeck, setActiveDeck, loading, error } = useVocabDeck();
  const [summary, setSummary] = useState<VocabTodaySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const isTodayComplete = !!summary && summary.total_count > 0 && summary.pending_count === 0;
  const modalInitialTarget = summary ? (isTodayComplete ? summary.total_count + summary.daily_target_count : summary.daily_target_count) : 20;

  useEffect(() => {
    let cancelled = false;

    if (!activeDeck) {
      setSummary(null);
      return;
    }

    fetchVocabToday(activeDeck.id)
      .then((payload) => {
        if (cancelled) return;
        setSummary(payload);
        setSummaryError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSummaryError(err instanceof Error ? err.message : '今日概览加载失败');
      });

    return () => {
      cancelled = true;
    };
  }, [activeDeck]);

  const handleSaveSettings = async (totalTargetCount: number) => {
    if (!activeDeck) return;
    setSettingsSaving(true);
    try {
      const payload = await updateVocabTodaySettings(activeDeck.id, { total_target_count: totalTargetCount });
      setSummary(payload);
      setSummaryError(null);
      setSettingsOpen(false);
      if (payload.pending_count > 0 && isTodayComplete) {
        navigate('/vocab/today');
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : '今日单词参数更新失败');
    } finally {
      setSettingsSaving(false);
    }
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
              <DeckSwitcher decks={decks} activeDeck={activeDeck} onChange={setActiveDeck} />
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
                      <a
                        href="#/vocab/today"
                        className="inline-flex items-center rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90"
                      >
                        {summary.completed_count > 0 ? '继续今日单词' : '开始今日单词'}
                      </a>
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

                <ProgressSummary summary={summary} />
              </div>
            ) : null}

            {summaryError ? <p className="mt-6 text-sm text-rose-200">{summaryError}</p> : null}
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/6 p-8 backdrop-blur-md">
            <div className="text-sm uppercase tracking-[0.32em] text-white/45">Flow</div>
            <div className="mt-5 space-y-4">
              <a href="#/vocab/study" className="block rounded-3xl border border-white/10 bg-white/8 p-5 transition hover:bg-white/12">
                <div className="text-lg font-medium">新词学习</div>
                <div className="mt-2 text-sm text-white/60">单独查看今天的新词部分，适合想集中先过新词时使用。</div>
              </a>
              <a href="#/vocab/review" className="block rounded-3xl border border-white/10 bg-white/8 p-5 transition hover:bg-white/12">
                <div className="text-lg font-medium">今日复习</div>
                <div className="mt-2 text-sm text-white/60">单独处理今天到期的复习词，适合只想清空复习时使用。</div>
              </a>
              <a href="#/vocab/mistakes" className="block rounded-3xl border border-white/10 bg-white/8 p-5 transition hover:bg-white/12">
                <div className="text-lg font-medium">错题回捞</div>
                <div className="mt-2 text-sm text-white/60">集中看最近失误词，快速定位薄弱点。</div>
              </a>
            </div>

            {activeDeck ? (
              <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="text-sm text-white/50">当前词书</div>
                <div className="mt-2 text-2xl font-medium">{activeDeck.name}</div>
                <div className="mt-2 text-sm text-white/55">{activeDeck.description || `${activeDeck.word_count} 个单词`}</div>
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
    </div>
  );
}
