import { useEffect, useRef, useState } from 'react';

import { fetchVocabDecks, fetchVocabInheritancePreview, fetchVocabOverview, inheritVocabMasteredWords } from '../../lib/vocab/api';
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

type InheritancePromptState = {
  deck: VocabDeck;
  inheritableWordCount: number;
  submitting: boolean;
};

export function useVocabDeck() {
  const [decks, setDecks] = useState<VocabDeck[]>([]);
  const [activeDeck, setActiveDeckState] = useState<VocabDeck | null>(null);
  const [activeDeckVersion, setActiveDeckVersion] = useState(0);
  const [inheritancePrompt, setInheritancePrompt] = useState<InheritancePromptState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const switchRequestRef = useRef(0);

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

  const maybeOpenInheritancePrompt = async (deck: VocabDeck, requestId: number) => {
    try {
      const overview = await fetchVocabOverview(deck.id);
      if (requestId !== switchRequestRef.current) return;
      if (overview.current_deck.mastered_word_count > 0) {
        setInheritancePrompt(null);
        return;
      }

      const preview = await fetchVocabInheritancePreview(deck.id);
      if (requestId !== switchRequestRef.current) return;
      if (preview.inheritable_word_count <= 0) {
        setInheritancePrompt(null);
        return;
      }

      setInheritancePrompt({
        deck,
        inheritableWordCount: preview.inheritable_word_count,
        submitting: false,
      });
    } catch {
      if (requestId !== switchRequestRef.current) return;
      setInheritancePrompt(null);
    }
  };

  const setActiveDeck = (deck: VocabDeck | null) => {
    if (deck?.id === activeDeck?.id) {
      return;
    }
    setActiveDeckState(deck);
    setInheritancePrompt(null);
    if (deck) {
      window.localStorage.setItem(ACTIVE_DECK_KEY, deck.key);
      const requestId = ++switchRequestRef.current;
      void maybeOpenInheritancePrompt(deck, requestId);
    } else {
      window.localStorage.removeItem(ACTIVE_DECK_KEY);
      switchRequestRef.current += 1;
    }
  };

  const confirmInheritance = async () => {
    if (!inheritancePrompt) return;
    setInheritancePrompt((prev) => (prev ? { ...prev, submitting: true } : prev));
    try {
      await inheritVocabMasteredWords(inheritancePrompt.deck.id);
      setInheritancePrompt(null);
      setActiveDeckVersion((prev) => prev + 1);
    } catch (error) {
      setInheritancePrompt((prev) => (prev ? { ...prev, submitting: false } : prev));
      throw error;
    }
  };

  const dismissInheritance = () => {
    setInheritancePrompt(null);
  };

  return {
    decks,
    activeDeck,
    activeDeckVersion,
    inheritancePrompt,
    setActiveDeck,
    confirmInheritance,
    dismissInheritance,
    loading,
    error,
  };
}
