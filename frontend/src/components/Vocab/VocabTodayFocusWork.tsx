import React from 'react';

import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { fetchVocabFocusQueue, submitVocabContentReview } from '../../lib/vocab/api';
import type { VocabReviewItem } from '../../lib/vocab/types';
import { computeFsrsStage, extractRunConfigNumber, formatDueLabel, toErrorMessage } from '../focus-work/focusWorkUtils';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import FlashcardFocusTemplate from '../focus-work/templates/FlashcardFocusTemplate';
import type { FlashcardItem, FlashcardMeta, FlashcardRating, FlashcardSubmitResult } from '../focus-work/templates/flashcardTypes';

const FOCUS_ROUND_LIMIT = 500;

type VocabTodayFocusWorkProps = FocusWorkRendererProps;

type VocabMode = 'learning' | 'review' | 'study';

function vocabItemToFlashcardItem(item: VocabReviewItem, mode: VocabMode, fsrs: boolean): FlashcardItem {
  const meta: FlashcardMeta[] = [
    { label: mode === 'study' ? '新词' : mode === 'learning' ? '学习中' : '复习', tone: mode === 'study' ? 'blue' : 'emerald' },
  ];

  if (fsrs) {
    const stage = computeFsrsStage(item.fsrs_card_json, item.next_review_at);
    const stageLabel = stage === 'new' ? '新卡' : stage === 'learning' ? '学习中' : '复习中';
    const stageTone = stage === 'new' ? 'blue' : stage === 'learning' ? 'amber' : 'emerald';
    meta.push({ label: stageLabel, tone: stageTone, fsrsStage: stage, dueLabel: formatDueLabel(item.next_review_at) });
  }

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
    meta,
  };
}

export default function VocabTodayFocusWork({
  run,
  disabled,
  onContentCompleted,
}: VocabTodayFocusWorkProps) {
  const { activeDeck, activeDeckVersion, loading: deckLoading } = useVocabDeck();
  void activeDeckVersion;
  const configuredDeckId = typeof run.config_snapshot?.deck_id === 'string' ? run.config_snapshot.deck_id : null;
  const activeDeckId = configuredDeckId ?? activeDeck?.id ?? null;
  const isPaused = disabled;
  const isExtraRun = !run.counts_for_task_completion;
  const isFsrsMode = run.config_snapshot?.scheduling_mode === 'fsrs';
  const roundTargetCount = React.useMemo(() => extractRunConfigNumber(run, ['target_word_count', 'daily_target_count'], 10, FOCUS_ROUND_LIMIT), [run]);
  const [items, setItems] = React.useState<VocabReviewItem[]>([]);
  const [loadedRunId, setLoadedRunId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [completedCount, setCompletedCount] = React.useState(0);
  const currentItem = items[0] ?? null;
  const plannedCount = completedCount + items.length;

  React.useEffect(() => {
    if (!activeDeckId) {
      if (deckLoading) return;
      setItems([]);
      setLoadedRunId(null);
      setLoading(false);
      setError(null);
      setSubmitting(false);
      setCompletedCount(0);
      return;
    }

    let cancelled = false;
    setItems([]);
    setLoadedRunId(null);
    setLoading(true);
    setError(null);
    setSubmitting(false);
    setCompletedCount(0);

    fetchVocabFocusQueue(activeDeckId, roundTargetCount)
      .then((queueItems) => {
        if (cancelled) return;
        setItems(queueItems);
        setLoadedRunId(run.id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(toErrorMessage(err, '词卡加载失败'));
        setLoadedRunId(run.id);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeDeckId, deckLoading, roundTargetCount, run.id]);

  const handleFlashcardSubmit = React.useCallback(async (flashcardItem: FlashcardItem, rating: FlashcardRating): Promise<FlashcardSubmitResult> => {
    if (!activeDeckId || !currentItem || submitting) {
      return { shouldRepeat: false };
    }

    const item = currentItem;
    setSubmitting(true);
    try {
      const payload = await submitVocabContentReview({
        deck_id: activeDeckId,
        word_id: item.id,
        result: rating,
        review_mode: item.review_mode,
        prompt_type: item.prompt_type,
      });
      setError(null);
      if (payload.should_repeat_today) {
        setItems((prev) => {
          const index = prev.findIndex((candidate) => candidate.id === item.id);
          if (index < 0) return prev;
          const next = [...prev];
          const [current] = next.splice(index, 1);
          return [...next, current];
        });
        return { shouldRepeat: true, nextDueAt: payload.next_review_at ?? null };
      }
      setCompletedCount((prev) => prev + 1);
      setItems((prev) => prev.filter((candidate) => candidate.id !== item.id));
      return { shouldRepeat: false, nextDueAt: payload.next_review_at ?? null };
    } catch (err) {
      setError(toErrorMessage(err, '提交失败'));
      return { shouldRepeat: false };
    } finally {
      setSubmitting(false);
    }
  }, [activeDeckId, currentItem, submitting]);

  const handleLoadNext = React.useCallback(async (): Promise<FlashcardItem | null> => {
    if (currentItem) {
      return vocabItemToFlashcardItem(currentItem, currentItem.review_mode as VocabMode, isFsrsMode);
    }
    return null;
  }, [currentItem, isFsrsMode]);

  const handleContentCompleted = React.useCallback((progressSnapshot?: Record<string, unknown>) => {
    onContentCompleted({
      completed_word_count: completedCount,
      target_word_count: plannedCount || roundTargetCount,
      ...(isExtraRun ? { extra_round: true } : {}),
      ...progressSnapshot,
      run_summary: {
        total_words: plannedCount || roundTargetCount,
        reviewed_count: completedCount,
        memorized_count: completedCount,
        new_count: 0,
        correct_rate: 0,
        duration_seconds: 0,
      },
    });
  }, [completedCount, isExtraRun, onContentCompleted, plannedCount, roundTargetCount]);

  const currentFlashcardItem = currentItem ? vocabItemToFlashcardItem(currentItem, currentItem.review_mode as VocabMode, isFsrsMode) : null;

  const emptyTitle = isFsrsMode ? '今日已无待复习' : '暂无可练习词卡';
  const emptyDescription = isFsrsMode
    ? '所有到期卡片已完成,请明天再来。'
    : loadedRunId === run.id
      ? '当前词库暂时没有可练习的词卡。'
      : '正在准备词卡。';

  return (
    <FlashcardFocusTemplate
      title="背单词"
      subtitle="背单词"
      statusLabel={isExtraRun ? '额外轮次' : currentItem?.review_mode === 'study' ? '新词学习' : currentItem?.review_mode === 'learning' ? '学习中' : '复习'}
      item={currentFlashcardItem}
      loading={loading}
      error={error}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      completedCount={completedCount}
      targetCount={roundTargetCount}
      completeOnEmpty={isFsrsMode ? true : undefined}
      disabled={isPaused}
      onSubmitRating={handleFlashcardSubmit}
      onLoadNext={handleLoadNext}
      onContentCompleted={handleContentCompleted}
    />
  );
}
