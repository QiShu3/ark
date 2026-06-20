import React from 'react';

import QuizRenderer from './QuizRenderer';
import StudyCard from './StudyCard';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { useVocabTodaySession } from '../../hooks/vocab/useVocabTodaySession';
import { fetchVocabOverviewCurrentWords, submitVocabContentReview } from '../../lib/vocab/api';
import type { VocabOverviewCurrentWord, VocabReviewItem } from '../../lib/vocab/types';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import FlashcardFocusTemplate from '../focus-work/templates/FlashcardFocusTemplate';
import type { FlashcardItem, FlashcardRating, FlashcardSubmitResult } from '../focus-work/templates/flashcardTypes';

type RatingValue = FlashcardRating;

const EXTRA_ROUND_LIMIT = 500;

type VocabTodayFocusWorkProps = FocusWorkRendererProps;

function extraTargetCountFromRun(run: FocusWorkRendererProps['run']) {
  const rawTarget = Number(run.config_snapshot?.target_word_count ?? run.config_snapshot?.daily_target_count ?? 10);
  if (!Number.isFinite(rawTarget)) return 10;
  return Math.max(1, Math.min(EXTRA_ROUND_LIMIT, Math.floor(rawTarget)));
}

function countedTargetCountFromRun(run: FocusWorkRendererProps['run'], fallback: number) {
  const rawTarget = Number(run.config_snapshot?.target_word_count ?? run.config_snapshot?.daily_target_count ?? fallback);
  if (!Number.isFinite(rawTarget)) return fallback;
  return Math.max(0, Math.floor(rawTarget));
}

function toExtraReviewItem(word: VocabOverviewCurrentWord): VocabReviewItem {
  return {
    id: word.id,
    deck_id: word.deck_id,
    word: word.word,
    us_pronunciation: word.us_pronunciation,
    uk_pronunciation: word.uk_pronunciation,
    translations: word.translations,
    phrases: [],
    sentences: [],
    prompt_type: 'en_to_zh',
    review_mode: word.mastery_state === 'unstarted' ? 'study' : 'review',
    mastery_score: word.mastery_state === 'mastered' ? 100 : word.mastery_state === 'learning' ? 50 : 0,
  };
}

function orderExtraWords(words: VocabOverviewCurrentWord[]) {
  const priority: Record<VocabOverviewCurrentWord['mastery_state'], number> = {
    unstarted: 0,
    learning: 1,
    mastered: 2,
  };
  return [...words].sort((a, b) => priority[a.mastery_state] - priority[b.mastery_state]);
}

type VocabMode = 'learning' | 'review' | 'study';

function vocabItemToFlashcardItem(item: VocabReviewItem, mode: VocabMode): FlashcardItem {
  return {
    id: item.id,
    front: item.word,
    back: (
      <div className="space-y-2">
        <div className="flex gap-4 text-sm text-[var(--focus-work-text-muted)]">
          {item.us_pronunciation ? <span>US /{item.us_pronunciation}/</span> : null}
          {item.uk_pronunciation ? <span>UK /{item.uk_pronunciation}/</span> : null}
        </div>
        <div className="text-base text-[var(--focus-work-text)]">
          {item.translations.map((t) => t.translation).join('；')}
        </div>
      </div>
    ),
    meta: [
      { label: mode === 'study' ? '新词' : mode === 'learning' ? '学习中' : '复习', tone: mode === 'study' ? 'blue' : 'emerald' },
    ],
  };
}

export default function VocabTodayFocusWork({
  run,
  disabled,
  onContentCompleted,
}: VocabTodayFocusWorkProps) {
  const { activeDeck, activeDeckVersion, loading: deckLoading } = useVocabDeck();
  const configuredDeckId = typeof run.config_snapshot?.deck_id === 'string' ? run.config_snapshot.deck_id : null;
  const activeDeckId = configuredDeckId ?? activeDeck?.id ?? null;
  const session = useVocabTodaySession(activeDeckId, activeDeckVersion);
  const completedRef = React.useRef(false);
  const isPaused = disabled;
  const isExtraRun = !run.counts_for_task_completion;
  const extraTargetCount = React.useMemo(() => extraTargetCountFromRun(run), [run]);
  const [extraItems, setExtraItems] = React.useState<VocabReviewItem[]>([]);
  const [extraLoadedRunId, setExtraLoadedRunId] = React.useState<string | null>(null);
  const [extraLoading, setExtraLoading] = React.useState(true);
  const [extraError, setExtraError] = React.useState<string | null>(null);
  const [extraSubmitting, setExtraSubmitting] = React.useState(false);
  const [extraCompletedCount, setExtraCompletedCount] = React.useState(0);
  const extraCurrentItem = isExtraRun ? extraItems[0] ?? null : null;
  const extraPlannedCount = extraCompletedCount + extraItems.length;

  React.useEffect(() => {
    completedRef.current = false;
  }, [run.id]);

  React.useEffect(() => {
    if (!isExtraRun || !activeDeckId) {
      if (deckLoading) return;
      setExtraItems([]);
      setExtraLoadedRunId(null);
      setExtraLoading(false);
      setExtraError(null);
      setExtraSubmitting(false);
      setExtraCompletedCount(0);
      return;
    }

    let cancelled = false;
    setExtraItems([]);
    setExtraLoadedRunId(null);
    setExtraLoading(true);
    setExtraError(null);
    setExtraSubmitting(false);
    setExtraCompletedCount(0);

    fetchVocabOverviewCurrentWords(activeDeckId, 'all')
      .then((words) => {
        if (cancelled) return;
        const items = orderExtraWords(words)
          .slice(0, extraTargetCount)
          .map(toExtraReviewItem);
        setExtraItems(items);
        setExtraLoadedRunId(run.id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setExtraError(err instanceof Error ? err.message : '额外词卡加载失败');
        setExtraLoadedRunId(run.id);
      })
      .finally(() => {
        if (!cancelled) setExtraLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeDeckId, extraTargetCount, isExtraRun, run.id]);

  React.useEffect(() => {
    if (!isExtraRun) return;
    if (completedRef.current) return;
    if (isPaused || extraLoading || extraError) return;
    if (extraLoadedRunId !== run.id) return;
    if (extraItems.length > 0 || extraCompletedCount <= 0) return;
    completedRef.current = true;
    onContentCompleted({
      completed_word_count: extraCompletedCount,
      target_word_count: extraPlannedCount || extraTargetCount,
      extra_round: true,
    });
  }, [
    extraCompletedCount,
    extraError,
    extraItems.length,
    extraLoadedRunId,
    extraLoading,
    extraPlannedCount,
    extraTargetCount,
    isExtraRun,
    isPaused,
    onContentCompleted,
    run.id,
  ]);

  const handleFlashcardSubmit = React.useCallback(async (flashcardItem: FlashcardItem, rating: FlashcardRating): Promise<FlashcardSubmitResult> => {
    if (isExtraRun) {
      if (!activeDeckId || !extraCurrentItem || extraSubmitting) {
        return { shouldRepeat: false };
      }
      const item = extraCurrentItem;
      setExtraSubmitting(true);
      try {
        const payload = await submitVocabContentReview({
          deck_id: activeDeckId,
          word_id: item.id,
          result: rating,
          review_mode: item.review_mode,
          prompt_type: item.prompt_type,
        });
        setExtraError(null);
        if (payload.should_repeat_today) {
          setExtraItems((prev) => {
            const index = prev.findIndex((candidate) => candidate.id === item.id);
            if (index < 0) return prev;
            const next = [...prev];
            const [current] = next.splice(index, 1);
            return [...next, current];
          });
          return { shouldRepeat: true };
        } else {
          setExtraCompletedCount((prev) => prev + 1);
          setExtraItems((prev) => prev.filter((candidate) => candidate.id !== item.id));
          return { shouldRepeat: false };
        }
      } catch (err) {
        setExtraError(err instanceof Error ? err.message : '提交失败');
        return { shouldRepeat: false };
      } finally {
        setExtraSubmitting(false);
      }
    }

    const result = await session.submit(rating);
    return {
      shouldRepeat: result?.should_repeat_today ?? false,
    };
  }, [activeDeckId, extraCurrentItem, extraSubmitting, isExtraRun, session]);

  const handleLoadNext = React.useCallback(async (): Promise<FlashcardItem | null> => {
    if (isExtraRun) {
      if (extraItems.length === 0) return null;
      const next = extraItems[0];
      return vocabItemToFlashcardItem(next, 'review');
    }

    if (session.currentItem) {
      const mode: VocabMode = (session.currentMode as VocabMode) ?? 'study';
      return vocabItemToFlashcardItem(session.currentItem, mode);
    }
    return null;
  }, [extraItems, isExtraRun, session.currentItem, session.currentMode]);

  const handleContentCompleted = React.useCallback((progressSnapshot?: Record<string, unknown>) => {
    if (isExtraRun) {
      onContentCompleted({
        completed_word_count: extraCompletedCount,
        target_word_count: extraTargetCount,
        extra_round: true,
        ...progressSnapshot,
      });
    } else {
      onContentCompleted({
        completed_word_count: session.memorizedCount,
        target_word_count: countedTargetCountFromRun(run, session.memorizedCount),
        ...progressSnapshot,
      });
    }
  }, [extraCompletedCount, extraTargetCount, isExtraRun, onContentCompleted, run.config_snapshot, session.memorizedCount]);

  const currentItem = isExtraRun
    ? (extraCurrentItem ? vocabItemToFlashcardItem(extraCurrentItem, 'review') : null)
    : (session.currentItem ? vocabItemToFlashcardItem(session.currentItem, (session.currentMode as VocabMode) ?? 'study') : null);

  const completedCount = isExtraRun ? extraCompletedCount : session.memorizedCount;
  const targetCount = isExtraRun ? extraTargetCount : countedTargetCountFromRun(run, session.memorizedCount);
  const loading = isExtraRun ? extraLoading : session.loading;
  const error = isExtraRun ? extraError : (session.error ?? null);
  const submitting = isExtraRun ? extraSubmitting : session.submitting;

  return (
    <FlashcardFocusTemplate
      title="今日单词"
      subtitle="背单词"
      statusLabel={isExtraRun ? '额外轮次' : session.isBatchReview ? '批次复习' : (session.currentMode as VocabMode) === 'study' ? '新词学习' : '复习'}
      item={currentItem}
      loading={loading}
      error={error}
      emptyTitle="今日单词已完成"
      emptyDescription="所有单词都已复习完毕。"
      completedCount={completedCount}
      targetCount={targetCount}
      batchNumber={isExtraRun ? undefined : session.currentBatchNumber}
      totalBatches={isExtraRun ? undefined : session.totalBatchCount}
      disabled={isPaused}
      onSubmitRating={handleFlashcardSubmit}
      onLoadNext={handleLoadNext}
      onContentCompleted={handleContentCompleted}
    />
  );
}
