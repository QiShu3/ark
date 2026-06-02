import { useEffect, useState } from 'react';

import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { fetchVocabMistakes } from '../../lib/vocab/api';
import type { VocabMistakeItem } from '../../lib/vocab/types';

export default function VocabMistakes() {
  const { decks, activeDeck, activeDeckVersion, inheritancePrompt, setActiveDeck, confirmInheritance, dismissInheritance } = useVocabDeck();
  const [items, setItems] = useState<VocabMistakeItem[]>([]);
  const [loadedDeckId, setLoadedDeckId] = useState<string | null>(null);
  const [error, setError] = useState<{ deckId: string; message: string } | null>(null);
  const displayedItems = activeDeck && loadedDeckId === activeDeck.id ? items : [];
  const isLoading = Boolean(activeDeck) && loadedDeckId !== activeDeck?.id && error?.deckId !== activeDeck?.id;

  useEffect(() => {
    let cancelled = false;

    if (!activeDeck) {
      return;
    }

    fetchVocabMistakes(activeDeck.id)
      .then((payload) => {
        if (cancelled) return;
        setItems(payload);
        setLoadedDeckId(activeDeck.id);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError({
          deckId: activeDeck.id,
          message: err instanceof Error ? err.message : '错题加载失败',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeDeck, activeDeckVersion]);

  return (
    <div className="fixed inset-x-1 bottom-1 top-[7.5rem] z-10 overflow-y-auto rounded-[28px] px-8 pb-10 pt-6" style={{ clipPath: "inset(10px round 28px)" }}>
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">错题池</h1>
        <p className="mt-3 text-ark-text-muted">这里保留最近答错的词，适合做快速回捞和集中补洞。</p>

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

        <div className="mt-8 space-y-4">
          {isLoading ? <p className="text-sm text-ark-text-muted">错题加载中…</p> : null}
          {error?.deckId === activeDeck?.id ? <p className="text-sm text-rose-200">{error.message}</p> : null}

          {displayedItems.map((item) => (
            <a
              key={item.id}
              href={`#/vocab/words/${item.id}`}
              className="block rounded-3xl border border-ark-border bg-ark-surface-subtle p-5 transition hover:bg-ark-surface-subtle"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-medium">{item.word}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-ark-text-muted">
                    {item.translations.slice(0, 3).map((translation, index) => (
                      <span key={`${translation.translation}-${index}`}>{translation.translation}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-full bg-rose-500/12 px-3 py-1 text-sm text-rose-100">
                  错 {item.wrong_count} 次
                </div>
              </div>
            </a>
          ))}

          {!isLoading && error?.deckId !== activeDeck?.id && !displayedItems.length ? (
            <div className="rounded-[2rem] border border-ark-border bg-ark-surface-subtle p-8 text-ark-text-muted">当前没有错题。</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
