import { useCallback, useEffect, useState } from 'react';

import { fetchVocabLearningQueue, fetchVocabReviewQueue, fetchVocabStudyQueue } from '../../lib/vocab/api';
import type { VocabReviewItem } from '../../lib/vocab/types';

type QueueMode = 'study' | 'review' | 'learning';

export function useVocabReviewQueue(deckId: string | null, mode: QueueMode = 'review', limit = 10, refreshToken = 0) {
  const [items, setItems] = useState<VocabReviewItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadedDeckId, setLoadedDeckId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!deckId) {
      setItems([]);
      setActiveIndex(0);
      setHasLoaded(true);
      setLoadedDeckId(null);
      return;
    }

    setLoading(true);
    setHasLoaded(false);
    setLoadedDeckId(null);
    try {
      const data =
        mode === 'study'
          ? await fetchVocabStudyQueue(deckId, limit)
          : mode === 'learning'
            ? await fetchVocabLearningQueue(deckId, limit)
            : await fetchVocabReviewQueue(deckId, limit);
      setItems(data);
      setActiveIndex(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '队列加载失败');
      setItems([]);
      setActiveIndex(0);
    } finally {
      setLoading(false);
      setHasLoaded(true);
      setLoadedDeckId(deckId);
    }
  }, [deckId, mode, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  const consumeCurrent = () => {
    const shouldRefetch = items.length <= 1 && !!deckId;
    setItems((prev) => {
      const next = [...prev];
      next.splice(activeIndex, 1);
      return next;
    });
    setActiveIndex((prev) => {
      const newLen = items.length - 1;
      if (newLen <= 0) return 0;
      if (prev >= newLen) return newLen - 1;
      return prev;
    });
    if (shouldRefetch) {
      void refresh();
    }
  };

  const requeueCurrent = () => {
    const shouldRefetch = items.length <= 1 && !!deckId;
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      const [current] = next.splice(activeIndex, 1);
      return [...next, current];
    });
    setActiveIndex((prev) => {
      const newLen = items.length;
      if (prev >= newLen - 1) return newLen - 1;
      return prev;
    });
    if (shouldRefetch) {
      void refresh();
    }
  };

  const goToNext = () => {
    setActiveIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev));
  };

  const goToPrev = () => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  return {
    items,
    currentItem: items[activeIndex] ?? null,
    activeIndex,
    setActiveIndex,
    loading,
    hasLoaded,
    loadedDeckId,
    error,
    refresh,
    consumeCurrent,
    requeueCurrent,
    goToNext,
    goToPrev,
  };
}
