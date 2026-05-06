import { useEffect, useMemo, useState } from 'react';

import { submitVocabReview } from '../../lib/vocab/api';
import type { VocabReviewItem, VocabReviewSubmitResult } from '../../lib/vocab/types';
import { useVocabReviewQueue } from './useVocabReviewQueue';

const BATCH_REVIEW_SIZE = 10;
const RESULT_ORDER = ['again', 'hard', 'good', 'easy'] as const;
const RESULT_LABELS = {
  again: '没记住',
  hard: '有点难',
  good: '记住了',
  easy: '很轻松',
} as const;
const RESULT_PRIORITY = {
  again: 0,
  hard: 1,
  good: 2,
  easy: 3,
} as const;

type ReviewResult = (typeof RESULT_ORDER)[number];

type BatchReviewEntry = {
  id: string;
  word: string;
  translations: VocabReviewItem['translations'];
  result: ReviewResult;
};

function mergeBatchReviewEntry(
  currentItem: VocabReviewItem,
  result: ReviewResult,
  previous?: BatchReviewEntry,
): BatchReviewEntry {
  if (!previous) {
    return {
      id: currentItem.id,
      word: currentItem.word,
      translations: currentItem.translations,
      result,
    };
  }

  const nextResult = RESULT_PRIORITY[result] < RESULT_PRIORITY[previous.result] ? result : previous.result;
  return {
    ...previous,
    word: currentItem.word,
    translations: currentItem.translations,
    result: nextResult,
  };
}

export function useVocabTodaySession(deckId: string | null) {
  const learningQueue = useVocabReviewQueue(deckId, 'learning');
  const reviewQueue = useVocabReviewQueue(deckId, 'review');
  const studyQueue = useVocabReviewQueue(deckId, 'study');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<VocabReviewSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBatchReview, setIsBatchReview] = useState(false);
  const [completedBatchWordIds, setCompletedBatchWordIds] = useState<string[]>([]);
  const [batchReviewEntries, setBatchReviewEntries] = useState<Record<string, BatchReviewEntry>>({});

  const currentMode = learningQueue.currentItem ? 'learning' : reviewQueue.currentItem ? 'review' : studyQueue.currentItem ? 'study' : null;
  const activeQueue = currentMode === 'learning' ? learningQueue : currentMode === 'review' ? reviewQueue : studyQueue;
  const currentItem = activeQueue.currentItem;
  const loading = learningQueue.loading || reviewQueue.loading || studyQueue.loading;
  const batchReviewGroups = useMemo(
    () =>
      RESULT_ORDER.map((key) => ({
        key,
        title: RESULT_LABELS[key],
        items: completedBatchWordIds
          .map((wordId) => batchReviewEntries[wordId])
          .filter((item): item is BatchReviewEntry => !!item && item.result === key),
      })).filter((group) => group.items.length > 0),
    [batchReviewEntries, completedBatchWordIds],
  );
  const batchReviewCount = completedBatchWordIds.length;

  useEffect(() => {
    if (deckId) return;
    setIsBatchReview(false);
    setCompletedBatchWordIds([]);
    setBatchReviewEntries({});
    setLastResult(null);
  }, [deckId]);

  useEffect(() => {
    if (isBatchReview) return;
    if (completedBatchWordIds.length >= BATCH_REVIEW_SIZE) {
      setIsBatchReview(true);
    }
  }, [completedBatchWordIds.length, isBatchReview]);

  useEffect(() => {
    if (isBatchReview || loading || currentItem || completedBatchWordIds.length === 0) return;
    setIsBatchReview(true);
  }, [completedBatchWordIds.length, currentItem, isBatchReview, loading]);

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
      setBatchReviewEntries((prev) => ({
        ...prev,
        [currentItem.id]: mergeBatchReviewEntry(currentItem, result, prev[currentItem.id]),
      }));
      if (payload.should_repeat_today) {
        activeQueue.requeueCurrent();
      } else {
        setCompletedBatchWordIds((prev) => (prev.includes(currentItem.id) ? prev : [...prev, currentItem.id]));
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

  const continueBatchReview = () => {
    setIsBatchReview(false);
    setCompletedBatchWordIds([]);
    setBatchReviewEntries({});
    setLastResult(null);
  };

  return {
    currentItem,
    currentMode,
    loading,
    error: error ?? learningQueue.error ?? reviewQueue.error ?? studyQueue.error,
    submitting,
    lastResult,
    submit,
    learningRemaining: learningQueue.items.length,
    reviewRemaining: reviewQueue.items.length,
    studyRemaining: studyQueue.items.length,
    totalRemaining: learningQueue.items.length + reviewQueue.items.length + studyQueue.items.length,
    isBatchReview,
    batchReviewCount,
    batchReviewGroups,
    batchReviewActionLabel: loading || currentItem ? '进入下一批' : '今日已完成',
    continueBatchReview,
  };
}
