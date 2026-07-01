import { useEffect, useState } from 'react';
import { useVocabDeck } from '../hooks/vocab/useVocabDeck';
import { fetchVocabOverview, fetchVocabToday } from '../lib/vocab/api';
import type { VocabOverview, VocabTodaySummary } from '../lib/vocab/types';
import type { FocusWorkDeclaration } from '../lib/appRegistry';
import type { FocusWorkAdapter } from './types';

export function useFlashcardAdapter(
  fw: FocusWorkDeclaration,
  appId: string,
): FocusWorkAdapter {
  void fw;
  void appId;
  const {
    decks, activeDeck, activeDeckVersion,
    setActiveDeck,
  } = useVocabDeck();
  const activeDeckId = activeDeck?.id ?? null;

  const [today, setToday] = useState<VocabTodaySummary | null>(null);
  const [ltOverview, setLtOverview] = useState<VocabOverview | null>(null);

  useEffect(() => {
    let c = false;
    if (!activeDeckId) {
      queueMicrotask(() => { if (!c) setToday(null); });
      return () => { c = true; };
    }
    fetchVocabToday(activeDeckId).then((s) => { if (!c) setToday(s); }).catch(() => {});
    return () => { c = true; };
  }, [activeDeckId, activeDeckVersion]);

  useEffect(() => {
    let c = false;
    if (!activeDeckId) {
      queueMicrotask(() => { if (!c) setLtOverview(null); });
      return () => { c = true; };
    }
    fetchVocabOverview(activeDeckId).then((o) => { if (!c) setLtOverview(o); }).catch(() => {});
    return () => { c = true; };
  }, [activeDeckId, activeDeckVersion]);

  const todayPct = today && today.total_count > 0
    ? Math.round((today.completed_count / today.total_count) * 100) : 0;

  const metrics = [
    { label: '今日进度', value: today ? `${today.completed_count} / ${today.total_count}` : '--', detail: `${todayPct}%` },
    { label: '待完成', value: today ? today.pending_count : '--', detail: 'remaining' },
    { label: '新词', value: today ? today.new_count : '--', detail: 'new' },
    { label: '复习', value: today ? today.review_count : '--', detail: 'review' },
  ];

  const deckMasteryPct = ltOverview && ltOverview.current_deck.total_word_count > 0
    ? Math.round((ltOverview.current_deck.mastered_word_count / ltOverview.current_deck.total_word_count) * 100) : 0;

  const assetContent = ltOverview ? (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="ark-subapp-asset-card rounded-lg p-5">
          <div className="text-sm text-[var(--ark-text-muted)]">已完成词书</div>
          <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{ltOverview.completed_deck_count} / {ltOverview.total_deck_count} 本</div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">全部单词都已进入 Review 状态的词书数量。</div>
        </div>
        <div className="ark-subapp-asset-card rounded-lg p-5">
          <div className="text-sm text-[var(--ark-text-muted)]">累计掌握单词</div>
          <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{ltOverview.mastered_word_count}</div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">按 FSRS Review 口径统计的全局已掌握单词总数。</div>
        </div>
      </div>
      <div className="ark-subapp-asset-card w-full rounded-lg p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm text-[var(--ark-text-muted)]">当前词书掌握度</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">{ltOverview.current_deck.deck_name}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-sm text-[var(--ark-text-muted)]">已掌握</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">{ltOverview.current_deck.mastered_word_count} / {ltOverview.current_deck.total_word_count}</div>
          </div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-ark-surface-subtle">
          <div className="ark-subapp-asset-progress h-full rounded-full transition-[width] duration-300"
            style={{ width: `${deckMasteryPct}%` }} />
        </div>
      </div>
    </div>
  ) : null;

  return {
    contentBank: {
      type: 'word_deck',
      selected: activeDeck?.id ?? null,
      options: decks.map((d) => ({ id: d.id, name: d.name })),
      onChange: (id) => {
        const deck = decks.find((d) => d.id === id);
        if (deck) setActiveDeck(deck);
      },
    },
    metrics,
    assetContent,
  };
}
