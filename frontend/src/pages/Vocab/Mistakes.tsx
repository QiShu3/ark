import { useEffect, useState } from 'react';

import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { fetchVocabMistakes } from '../../lib/vocab/api';
import type { VocabMistakeItem } from '../../lib/vocab/types';

export default function VocabMistakes() {
  const { decks, activeDeck, activeDeckVersion, inheritancePrompt, setActiveDeck, confirmInheritance, dismissInheritance } = useVocabDeck();
  const [items, setItems] = useState<VocabMistakeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!activeDeck) {
      setItems([]);
      return;
    }

    setLoading(true);
    fetchVocabMistakes(activeDeck.id)
      .then((payload) => {
        if (cancelled) return;
        setItems(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '错题加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeDeck, activeDeckVersion]);

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-8 pb-10 pt-20">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">错题池</h1>
        <p className="mt-3 text-white/65">这里保留最近答错的词，适合做快速回捞和集中补洞。</p>

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
          {loading ? <p className="text-sm text-white/55">错题加载中…</p> : null}
          {error ? <p className="text-sm text-rose-200">{error}</p> : null}

          {items.map((item) => (
            <a
              key={item.id}
              href={`#/vocab/words/${item.id}`}
              className="block rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:bg-black/28"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-medium">{item.word}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/65">
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

          {!loading && !error && !items.length ? (
            <div className="rounded-[2rem] border border-white/10 bg-black/20 p-8 text-white/65">当前没有错题。</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
