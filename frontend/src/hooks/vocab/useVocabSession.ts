import { useState } from 'react';

import { submitVocabReview } from '../../lib/vocab/api';
import type { VocabReviewSubmitResult } from '../../lib/vocab/types';
import { useVocabReviewQueue } from './useVocabReviewQueue';

type SessionMode = 'study' | 'review';

export function useVocabSession(deckId: string | null, mode: SessionMode = 'review', refreshToken = 0) {
  const queue = useVocabReviewQueue(deckId, mode, 10, refreshToken);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<VocabReviewSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (result: 'again' | 'hard' | 'good' | 'easy') => {
    if (!deckId || !queue.currentItem) return null;

    setSubmitting(true);
    try {
      const payload = await submitVocabReview({
        deck_id: deckId,
        word_id: queue.currentItem.id,
        result,
        review_mode: queue.currentItem.review_mode,
        prompt_type: queue.currentItem.prompt_type,
      });
      setLastResult(payload);
      setError(null);
      if (payload.should_repeat_today) {
        queue.requeueCurrent();
      } else {
        queue.consumeCurrent();
      }
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    ...queue,
    submitting,
    lastResult,
    error: error ?? queue.error,
    submit,
    clearLastResult: () => setLastResult(null),
  };
}
