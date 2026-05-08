import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVocabReviewQueue } from './useVocabReviewQueue';

const { fetchVocabLearningQueue, fetchVocabReviewQueue, fetchVocabStudyQueue } = vi.hoisted(() => ({
  fetchVocabLearningQueue: vi.fn(),
  fetchVocabReviewQueue: vi.fn(),
  fetchVocabStudyQueue: vi.fn(),
}));

vi.mock('../../lib/vocab/api', () => ({
  fetchVocabLearningQueue,
  fetchVocabReviewQueue,
  fetchVocabStudyQueue,
}));

const firstItem = {
  id: 'word-1',
  deck_id: 'deck-1',
  word: 'abruptly',
  us_pronunciation: null,
  uk_pronunciation: null,
  translations: [],
  phrases: [],
  sentences: [],
  prompt_type: 'en_to_zh' as const,
  review_mode: 'study' as const,
  mastery_score: 0,
};

const secondItem = {
  ...firstItem,
  id: 'word-2',
  word: 'abandon',
};

describe('useVocabReviewQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refetches the next batch after the current batch is consumed', async () => {
    fetchVocabStudyQueue.mockResolvedValueOnce([firstItem]).mockResolvedValueOnce([secondItem]);

    const { result } = renderHook(() => useVocabReviewQueue('deck-1', 'study', 1));

    await waitFor(() => {
      expect(result.current.currentItem?.id).toBe('word-1');
    });

    await act(async () => {
      result.current.consumeCurrent();
    });

    await waitFor(() => {
      expect(fetchVocabStudyQueue).toHaveBeenCalledTimes(2);
      expect(result.current.currentItem?.id).toBe('word-2');
    });
  });

  it('refetches the queue when the final visible item is requeued', async () => {
    fetchVocabStudyQueue.mockResolvedValueOnce([firstItem]).mockResolvedValueOnce([secondItem]);

    const { result } = renderHook(() => useVocabReviewQueue('deck-1', 'study', 1));

    await waitFor(() => {
      expect(result.current.currentItem?.id).toBe('word-1');
    });

    await act(async () => {
      result.current.requeueCurrent();
    });

    await waitFor(() => {
      expect(fetchVocabStudyQueue).toHaveBeenCalledTimes(2);
      expect(result.current.currentItem?.id).toBe('word-2');
    });
  });
});
