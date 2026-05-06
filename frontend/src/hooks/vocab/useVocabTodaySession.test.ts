import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVocabTodaySession } from './useVocabTodaySession';

const {
  fetchVocabLearningQueue,
  fetchVocabReviewQueue,
  fetchVocabStudyQueue,
  submitVocabReview,
} = vi.hoisted(() => ({
  fetchVocabLearningQueue: vi.fn(),
  fetchVocabReviewQueue: vi.fn(),
  fetchVocabStudyQueue: vi.fn(),
  submitVocabReview: vi.fn(),
}));

vi.mock('../../lib/vocab/api', () => ({
  fetchVocabLearningQueue,
  fetchVocabReviewQueue,
  fetchVocabStudyQueue,
  submitVocabReview,
}));

function makeWord(index: number) {
  return {
    id: `word-${index}`,
    deck_id: 'deck-1',
    word: `word-${index}`,
    us_pronunciation: null,
    uk_pronunciation: null,
    translations: [{ pos: 'n.', translation: `释义 ${index}` }],
    phrases: [],
    sentences: [],
    prompt_type: 'en_to_zh' as const,
    review_mode: 'study' as const,
    mastery_score: 0,
  };
}

describe('useVocabTodaySession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switches to batch review after ten completed words', async () => {
    fetchVocabLearningQueue.mockResolvedValue([]);
    fetchVocabReviewQueue.mockResolvedValue([]);
    fetchVocabStudyQueue.mockResolvedValueOnce(Array.from({ length: 10 }, (_, index) => makeWord(index + 1))).mockResolvedValueOnce([]);
    submitVocabReview.mockResolvedValue({
      mastery_score: 2,
      next_review_at: '2026-05-06T00:00:00Z',
      wrong_count: 0,
      correct_count: 1,
      interval_days: 1,
      result: 'good',
      should_repeat_today: false,
    });

    const { result } = renderHook(() => useVocabTodaySession('deck-1'));

    await waitFor(() => {
      expect(result.current.currentItem?.id).toBe('word-1');
    });

    for (let index = 1; index <= 10; index += 1) {
      await act(async () => {
        await result.current.submit('good');
      });

      if (index < 10) {
        await waitFor(() => {
          expect(result.current.currentItem?.id).toBe(`word-${index + 1}`);
        });
      }
    }

    await waitFor(() => {
      expect(result.current.isBatchReview).toBe(true);
    });
    expect(result.current.batchReviewGroups.find((group) => group.key === 'good')?.items).toHaveLength(10);
  });
});
