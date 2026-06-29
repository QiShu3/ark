import React from 'react';

import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { fetchVocabOverviewCurrentWords, submitVocabContentReview } from '../../lib/vocab/api';
import type { VocabOverviewCurrentWord, VocabReviewItem } from '../../lib/vocab/types';
import { extractRunConfigNumber, toErrorMessage } from '../focus-work/focusWorkUtils';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import FlashcardFocusTemplate from '../focus-work/templates/FlashcardFocusTemplate';
import type { FlashcardItem, FlashcardRating, FlashcardSubmitResult } from '../focus-work/templates/flashcardTypes';

const EXTRA_ROUND_LIMIT = 500;

type VocabTodayFocusWorkProps = FocusWorkRendererProps;

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
  void activeDeckVersion;
  const configuredDeckId = typeof run.config_snapshot?.deck_id === 'string' ? run.config_snapshot.deck_id : null;
  const activeDeckId = configuredDeckId ?? activeDeck?.id ?? null;
  const completedRef = React.useRef(false);
  const isPaused = disabled;
  const isExtraRun = !run.counts_for_task_completion;
  const [openItems, setOpenItems] = React.useState<VocabReviewItem[]>([]);
  const [openLoadedRunId, setOpenLoadedRunId] = React.useState<string | null>(null);
  const [openLoading, setOpenLoading] = React.useState(true);
  const [openError, setOpenError] = React.useState<string | null>(null);
  const [openSubmitting, setOpenSubmitting] = React.useState(false);
  const [openCompletedCount, setOpenCompletedCount] = React.useState(0);
  const [openReloadToken, setOpenReloadToken] = React.useState(0);
  const extraTargetCount = React.useMemo(() => extractRunConfigNumber(run, ['target_word_count', 'daily_target_count'], 10, EXTRA_ROUND_LIMIT), [run]);
  const [extraItems, setExtraItems] = React.useState<VocabReviewItem[]>([]);
  const [extraLoadedRunId, setExtraLoadedRunId] = React.useState<string | null>(null);
  const [extraLoading, setExtraLoading] = React.useState(true);
  const [extraError, setExtraError] = React.useState<string | null>(null);
  const [extraSubmitting, setExtraSubmitting] = React.useState(false);
  const [extraCompletedCount, setExtraCompletedCount] = React.useState(0);
  const openCurrentItem = !isExtraRun ? openItems[0] ?? null : null;
  const extraCurrentItem = isExtraRun ? extraItems[0] ?? null : null;
  const extraPlannedCount = extraCompletedCount + extraItems.length;

  React.useEffect(() => {
    completedRef.current = false;
  }, [run.id]);

  React.useEffect(() => {
    if (isExtraRun || !activeDeckId) {
      if (deckLoading) return;
      setOpenItems([]);
      setOpenLoadedRunId(null);
      setOpenLoading(false);
      setOpenError(null);
      setOpenSubmitting(false);
      setOpenCompletedCount(0);
      return;
    }

    let cancelled = false;
    setOpenLoading(true);
    setOpenError(null);

    fetchVocabOverviewCurrentWords(activeDeckId, 'all')
      .then((words) => {
        if (cancelled) return;
        setOpenItems(orderExtraWords(words).map(toExtraReviewItem));
        setOpenLoadedRunId(run.id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOpenError(toErrorMessage(err, '词卡加载失败'));
        setOpenLoadedRunId(run.id);
      })
      .finally(() => {
        if (!cancelled) setOpenLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeDeckId, deckLoading, isExtraRun, openReloadToken, run.id]);

  React.useEffect(() => {
    setOpenCompletedCount(0);
    setOpenReloadToken(0);
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
        setExtraError(toErrorMessage(err, '额外词卡加载失败'));
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
        setExtraError(toErrorMessage(err, '提交失败'));
        return { shouldRepeat: false };
      } finally {
        setExtraSubmitting(false);
      }
    }

    if (!activeDeckId || !openCurrentItem || openSubmitting) {
      return { shouldRepeat: false };
    }

    const item = openCurrentItem;
    setOpenSubmitting(true);
    try {
      const payload = await submitVocabContentReview({
        deck_id: activeDeckId,
        word_id: item.id,
        result: rating,
        review_mode: item.review_mode,
        prompt_type: item.prompt_type,
      });
      setOpenError(null);
      if (payload.should_repeat_today) {
        setOpenItems((prev) => {
          const index = prev.findIndex((candidate) => candidate.id === item.id);
          if (index < 0 || prev.length <= 1) return prev;
          const next = [...prev];
          const [current] = next.splice(index, 1);
          return [...next, current];
        });
        return { shouldRepeat: true };
      }
      setOpenCompletedCount((prev) => prev + 1);
      setOpenItems((prev) => {
        const next = prev.filter((candidate) => candidate.id !== item.id);
        if (next.length === 0) {
          window.setTimeout(() => setOpenReloadToken((token) => token + 1), 0);
        }
        return next;
      });
      return { shouldRepeat: false };
    } catch (err) {
      setOpenError(toErrorMessage(err, '提交失败'));
      return { shouldRepeat: false };
    } finally {
      setOpenSubmitting(false);
    }
  }, [activeDeckId, extraCurrentItem, extraSubmitting, isExtraRun, openCurrentItem, openSubmitting]);

  const handleLoadNext = React.useCallback(async (): Promise<FlashcardItem | null> => {
    if (isExtraRun) {
      if (extraItems.length === 0) return null;
      const next = extraItems[0];
      return vocabItemToFlashcardItem(next, 'review');
    }

    if (openCurrentItem) {
      return vocabItemToFlashcardItem(openCurrentItem, openCurrentItem.review_mode as VocabMode);
    }
    return null;
  }, [extraItems, isExtraRun, openCurrentItem]);

  const handleContentCompleted = React.useCallback((progressSnapshot?: Record<string, unknown>) => {
    if (isExtraRun) {
      onContentCompleted({
        completed_word_count: extraCompletedCount,
        target_word_count: extraTargetCount,
        extra_round: true,
        ...progressSnapshot,
        run_summary: {
          total_words: extraTargetCount,
          reviewed_count: extraCompletedCount,
          memorized_count: extraCompletedCount,
          new_count: 0,
          correct_rate: 0,
          duration_seconds: 0,
        },
      });
    } else {
      onContentCompleted({
        completed_word_count: openCompletedCount,
        ...progressSnapshot,
        run_summary: {
          reviewed_count: openCompletedCount,
          memorized_count: openCompletedCount,
          new_count: 0,
          correct_rate: 0,
          duration_seconds: 0,
        },
      });
    }
  }, [extraCompletedCount, extraTargetCount, isExtraRun, onContentCompleted, openCompletedCount]);

  const currentItem = isExtraRun
    ? (extraCurrentItem ? vocabItemToFlashcardItem(extraCurrentItem, 'review') : null)
    : (openCurrentItem ? vocabItemToFlashcardItem(openCurrentItem, openCurrentItem.review_mode as VocabMode) : null);

  const completedCount = isExtraRun ? extraCompletedCount : openCompletedCount;
  const targetCount = isExtraRun ? extraTargetCount : null;
  const loading = isExtraRun ? extraLoading : openLoading;
  const error = isExtraRun ? extraError : openError;
  return (
    <FlashcardFocusTemplate
      title="背单词"
      subtitle="背单词"
      statusLabel={isExtraRun ? '额外轮次' : openCurrentItem?.review_mode === 'study' ? '新词学习' : openCurrentItem?.review_mode === 'learning' ? '学习中' : '复习'}
      item={currentItem}
      loading={loading}
      error={error}
      emptyTitle="暂无可练习词卡"
      emptyDescription={openLoadedRunId === run.id ? '当前词库暂时没有可练习的词卡。' : '正在准备词卡。'}
      completedCount={completedCount}
      targetCount={targetCount}
      disabled={isPaused}
      onSubmitRating={handleFlashcardSubmit}
      onLoadNext={handleLoadNext}
      onContentCompleted={handleContentCompleted}
    />
  );
}
