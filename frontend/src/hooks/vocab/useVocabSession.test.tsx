import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVocabSession } from './useVocabSession';

const { submitVocabReview, consumeCurrent, requeueCurrent } = vi.hoisted(() => ({
  submitVocabReview: vi.fn(),
  consumeCurrent: vi.fn(),
  requeueCurrent: vi.fn(),
}));

vi.mock('../../lib/vocab/api', () => ({
  submitVocabReview,
}));

vi.mock('./useVocabReviewQueue', () => ({
  useVocabReviewQueue: () => ({
    currentItem: {
      id: 'word-1',
      deck_id: 'deck-1',
      word: 'abruptly',
      us_pronunciation: null,
      uk_pronunciation: null,
      translations: [],
      phrases: [],
      sentences: [],
      prompt_type: 'en_to_zh',
      review_mode: 'study',
      mastery_score: 0,
    },
    items: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    consumeCurrent,
    requeueCurrent,
  }),
}));

describe('useVocabSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitVocabReview.mockResolvedValue({
      mastery_score: 2,
      next_review_at: '2026-05-06T00:00:00Z',
      wrong_count: 0,
      correct_count: 1,
      interval_days: 3,
      result: 'good',
      should_repeat_today: false,
    });
  });

  it('requeues the current word when the backend asks it to repeat today', async () => {
    submitVocabReview.mockResolvedValueOnce({
      mastery_score: 0,
      next_review_at: '2026-05-06T00:00:00Z',
      wrong_count: 1,
      correct_count: 0,
      interval_days: 0,
      result: 'again',
      should_repeat_today: true,
    });

    const { result } = renderHook(() => useVocabSession('cet6', 'study'));

    await act(async () => {
      await result.current.submit('again');
    });

    await waitFor(() => {
      expect(requeueCurrent).toHaveBeenCalledTimes(1);
    });
    expect(consumeCurrent).not.toHaveBeenCalled();
  });

  it('consumes the current word when the backend marks it complete for today', async () => {
    const { result } = renderHook(() => useVocabSession('cet6', 'study'));

    await act(async () => {
      await result.current.submit('easy');
    });

    await waitFor(() => {
      expect(consumeCurrent).toHaveBeenCalledTimes(1);
    });
    expect(requeueCurrent).not.toHaveBeenCalled();
  });
});
