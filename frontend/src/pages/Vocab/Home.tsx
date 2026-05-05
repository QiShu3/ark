import { useEffect, useState } from 'react';

import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import ProgressSummary from '../../components/Vocab/ProgressSummary';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { fetchVocabToday } from '../../lib/vocab/api';
import type { VocabTodaySummary } from '../../lib/vocab/types';

export default function VocabHome() {
  const { decks, activeDeck, setActiveDeck, loading, error } = useVocabDeck();
  const [summary, setSummary] = useState<VocabTodaySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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
              <div className="mt-8">
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
                <div className="mt-2 text-sm text-white/60">先过今天的新词卡，建立第一层记忆痕迹。</div>
              </a>
              <a href="#/vocab/review" className="block rounded-3xl border border-white/10 bg-white/8 p-5 transition hover:bg-white/12">
                <div className="text-lg font-medium">今日复习</div>
                <div className="mt-2 text-sm text-white/60">按到期队列做复习提交，结果由后端统一计算。</div>
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
    </div>
  );
}
