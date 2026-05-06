import { useState } from 'react';

import { submitVocabReview } from '../../lib/vocab/api';
import type { VocabReviewSubmitResult } from '../../lib/vocab/types';
import { useVocabReviewQueue } from './useVocabReviewQueue';

export function useVocabTodaySession(deckId: string | null) {
  const learningQueue = useVocabReviewQueue(deckId, 'learning');
  const reviewQueue = useVocabReviewQueue(deckId, 'review');
  const studyQueue = useVocabReviewQueue(deckId, 'study');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<VocabReviewSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentMode = learningQueue.currentItem ? 'learning' : reviewQueue.currentItem ? 'review' : studyQueue.currentItem ? 'study' : null;
  const activeQueue = currentMode === 'learning' ? learningQueue : currentMode === 'review' ? reviewQueue : studyQueue;
  const currentItem = activeQueue.currentItem;

  const submit = async (result: 'again' | 'hard' | 'good' | 'easy') => {
    if (!deckId || !currentItem || !currentMode) return null;

    setSubmitting(true);
    try {
      const payload = await submitVocabReview({
        deck_id: deckId,
        word_id: currentItem.id,
        result,
        review_mode: currentItem.review_mode,
        prompt_type: currentItem.prompt_type,
      });
      setLastResult(payload);
      setError(null);
      if (payload.should_repeat_today) {
        activeQueue.requeueCurrent();
      } else {
        activeQueue.consumeCurrent();
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
    currentItem,
    currentMode,
    loading: learningQueue.loading || reviewQueue.loading || studyQueue.loading,
    error: error ?? learningQueue.error ?? reviewQueue.error ?? studyQueue.error,
    submitting,
    lastResult,
    submit,
    learningRemaining: learningQueue.items.length,
    reviewRemaining: reviewQueue.items.length,
    studyRemaining: studyQueue.items.length,
    totalRemaining: learningQueue.items.length + reviewQueue.items.length + studyQueue.items.length,
  };
}
