import { useEffect, useState } from 'react';

import { fetchVocabDecks } from '../../lib/vocab/api';
import type { VocabDeck } from '../../lib/vocab/types';

const ACTIVE_DECK_KEY = 'ark-vocab-active-deck';

export function useVocabDeck() {
  const [decks, setDecks] = useState<VocabDeck[]>([]);
  const [activeDeck, setActiveDeckState] = useState<VocabDeck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchVocabDecks()
      .then((items) => {
        if (cancelled) return;
        setDecks(items);
        const savedKey = window.localStorage.getItem(ACTIVE_DECK_KEY);
        const fallbackDeck = items[0] ?? null;
        const matched = items.find((item) => item.key === savedKey) ?? fallbackDeck;
        setActiveDeckState(matched);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '词书加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setActiveDeck = (deck: VocabDeck | null) => {
    setActiveDeckState(deck);
    if (deck) {
      window.localStorage.setItem(ACTIVE_DECK_KEY, deck.key);
    } else {
      window.localStorage.removeItem(ACTIVE_DECK_KEY);
    }
  };

  return { decks, activeDeck, setActiveDeck, loading, error };
}
