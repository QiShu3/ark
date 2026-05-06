import { useEffect, useState } from 'react';

import { fetchVocabLearningQueue, fetchVocabReviewQueue, fetchVocabStudyQueue } from '../../lib/vocab/api';
import type { VocabReviewItem } from '../../lib/vocab/types';

type QueueMode = 'study' | 'review' | 'learning';

export function useVocabReviewQueue(deckId: string | null, mode: QueueMode = 'review', limit = 10) {
  const [items, setItems] = useState<VocabReviewItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!deckId) {
      setItems([]);
      setActiveIndex(0);
      return;
    }

    setLoading(true);
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
    }
  };

  useEffect(() => {
    void refresh();
  }, [deckId, mode, limit]);

  const consumeCurrent = () => {
    const shouldRefetch = items.length <= 1 && !!deckId;
    setItems((prev) => prev.slice(1));
    setActiveIndex(0);
    if (shouldRefetch) {
      void refresh();
    }
  };

  const requeueCurrent = () => {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      const [current, ...rest] = prev;
      return [...rest, current];
    });
    setActiveIndex(0);
  };

  return {
    items,
    currentItem: items[activeIndex] ?? null,
    loading,
    error,
    refresh,
    consumeCurrent,
    requeueCurrent,
  };
}
