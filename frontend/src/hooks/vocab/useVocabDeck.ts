import { useEffect, useState } from 'react';

import { fetchVocabDecks } from '../../lib/vocab/api';
import type { VocabDeck } from '../../lib/vocab/types';

const ACTIVE_DECK_KEY = 'ark-vocab-active-deck';
const SERIAL_SUFFIX_RE = /_\d+$/;
let decksCache: VocabDeck[] | null = null;
let decksRequest: Promise<VocabDeck[]> | null = null;

async function loadDecks() {
  if (decksCache) return decksCache;

  if (!decksRequest) {
    decksRequest = fetchVocabDecks()
      .then((items) => {
        decksCache = items;
        return items;
      })
      .catch((error: unknown) => {
        decksRequest = null;
        throw error;
      });
  }

  return decksRequest;
}

function normalizeDeckKey(rawKey: string | null) {
  if (!rawKey) return null;
  return rawKey.replace(SERIAL_SUFFIX_RE, '');
}

export function useVocabDeck() {
  const [decks, setDecks] = useState<VocabDeck[]>([]);
  const [activeDeck, setActiveDeckState] = useState<VocabDeck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadDecks()
      .then((items) => {
        if (cancelled) return;
        setDecks(items);
        const savedKey = normalizeDeckKey(window.localStorage.getItem(ACTIVE_DECK_KEY));
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
