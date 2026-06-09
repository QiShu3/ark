import React from 'react';

import QuizRenderer from './QuizRenderer';
import StudyCard from './StudyCard';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { useVocabTodaySession } from '../../hooks/vocab/useVocabTodaySession';
import { fetchVocabOverviewCurrentWords, submitVocabContentReview } from '../../lib/vocab/api';
import type { VocabOverviewCurrentWord, VocabReviewItem } from '../../lib/vocab/types';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import { Frown, Meh, CheckCircle2, Rocket } from 'lucide-react';

type RatingValue = 'again' | 'hard' | 'good' | 'easy';

const EXTRA_ROUND_LIMIT = 50;

const actions = [
  {
    label: '没记住',
    hint: '今天稍后再看',
    value: 'again' as RatingValue,
    icon: Frown,
    bgClass: 'hover:bg-[var(--focus-work-rose-bg)] hover:border-[var(--focus-work-rose-border)] focus-visible:bg-[var(--focus-work-rose-bg)] focus-visible:border-[var(--focus-work-rose-border)]',
    iconColor: 'text-[var(--focus-work-rose-text)]',
    shortcut: '1',
  },
  {
    label: '有点难',
    hint: '进入较短间隔',
    value: 'hard' as RatingValue,
    icon: Meh,
    bgClass: 'hover:bg-[var(--focus-work-amber-bg)] hover:border-[var(--focus-work-amber-border)] focus-visible:bg-[var(--focus-work-amber-bg)] focus-visible:border-[var(--focus-work-amber-border)]',
    iconColor: 'text-[var(--focus-work-amber-text)]',
    shortcut: '2',
  },
  {
    label: '记住了',
    hint: '进入正常间隔',
    value: 'good' as RatingValue,
    icon: CheckCircle2,
    bgClass: 'hover:bg-[var(--focus-work-emerald-bg)] hover:border-[var(--focus-work-emerald-border)] focus-visible:bg-[var(--focus-work-emerald-bg)] focus-visible:border-[var(--focus-work-emerald-border)]',
    iconColor: 'text-[var(--focus-work-emerald-text)]',
    shortcut: '3',
  },
  {
    label: '很轻松',
    hint: '延后更久再看',
    value: 'easy' as RatingValue,
    icon: Rocket,
    bgClass: 'hover:bg-[var(--focus-work-sky-bg)] hover:border-[var(--focus-work-sky-border)] focus-visible:bg-[var(--focus-work-sky-bg)] focus-visible:border-[var(--focus-work-sky-border)]',
    iconColor: 'text-[var(--focus-work-sky-text)]',
    shortcut: '4',
  },
];

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

export default function VocabTodayFocusWork({
  run,
  disabled,
  onContentCompleted,
}: VocabTodayFocusWorkProps) {
  const { activeDeck, activeDeckVersion } = useVocabDeck();
  const activeDeckId = activeDeck?.id ?? null;
  const session = useVocabTodaySession(activeDeckId, activeDeckVersion);
  const completedRef = React.useRef(false);
  const isPaused = disabled;
  const isExtraRun = !run.counts_for_task_completion;
  const extraTargetCount = React.useMemo(() => extraTargetCountFromRun(run), [run]);
  const [extraItems, setExtraItems] = React.useState<VocabReviewItem[]>([]);
  const [extraLoadedRunId, setExtraLoadedRunId] = React.useState<string | null>(null);
  const [extraLoading, setExtraLoading] = React.useState(false);
  const [extraError, setExtraError] = React.useState<string | null>(null);
  const [extraSubmitting, setExtraSubmitting] = React.useState(false);
  const [extraCompletedCount, setExtraCompletedCount] = React.useState(0);
  const extraCurrentItem = isExtraRun ? extraItems[0] ?? null : null;
  const displayCurrentItem = isExtraRun ? extraCurrentItem : session.currentItem;
  const displayCurrentMode = isExtraRun ? extraCurrentItem?.review_mode ?? null : session.currentMode;
  const displayLoading = isExtraRun ? extraLoading : session.loading;
  const displayError = isExtraRun ? extraError : session.error;
  const displaySubmitting = isExtraRun ? extraSubmitting : session.submitting;
  const displayBatchNumber = isExtraRun ? 1 : session.currentBatchNumber;
  const displayBatchCount = isExtraRun ? 1 : session.totalBatchCount;
  const extraPlannedCount = extraCompletedCount + extraItems.length;

  React.useEffect(() => {
    completedRef.current = false;
  }, [run.id]);

  // Lift revealed state up to allow keyboard control and automatic reset
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    setRevealed(false);
  }, [displayCurrentItem?.id]);

  React.useEffect(() => {
    if (!isExtraRun || !activeDeckId) {
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

  const completeEmptyExtraRun = React.useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onContentCompleted({
      completed_word_count: extraCompletedCount,
      target_word_count: extraTargetCount,
      extra_round: true,
      no_available_content: true,
    });
  }, [extraCompletedCount, extraTargetCount, onContentCompleted]);

  const submitExtraRating = React.useCallback(async (value: RatingValue) => {
    if (!activeDeckId || !extraCurrentItem || extraSubmitting) return;
    const item = extraCurrentItem;
    setExtraSubmitting(true);
    try {
      const payload = await submitVocabContentReview({
        deck_id: activeDeckId,
        word_id: item.id,
        result: value,
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
      } else {
        setExtraCompletedCount((prev) => prev + 1);
        setExtraItems((prev) => prev.filter((candidate) => candidate.id !== item.id));
      }
    } catch (err) {
      setExtraError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setExtraSubmitting(false);
    }
  }, [activeDeckId, extraCurrentItem, extraSubmitting]);

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

  const handleRatingSubmit = React.useCallback(async (value: RatingValue) => {
    if (isPaused) return;
    if (isExtraRun) {
      await submitExtraRating(value);
      return;
    }
    await session.submit(value);
  }, [isExtraRun, isPaused, session, submitExtraRating]);

  // Keyboard shortcut listeners
  React.useEffect(() => {
    if (isPaused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in a form input
      const activeEl = document.activeElement;
      if (activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName)) {
        return;
      }

      if (!displayCurrentItem) return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          if (!displaySubmitting) {
            void handleRatingSubmit('again');
          }
          break;
        case '2':
          e.preventDefault();
          if (!displaySubmitting) {
            void handleRatingSubmit('hard');
          }
          break;
        case '3':
          e.preventDefault();
          if (!displaySubmitting) {
            void handleRatingSubmit('good');
          }
          break;
        case '4':
          e.preventDefault();
          if (!displaySubmitting) {
            void handleRatingSubmit('easy');
          }
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          setRevealed((prev) => !prev);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (!isExtraRun) session.goToPrev?.();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (!isExtraRun) session.goToNext?.();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [displayCurrentItem, displaySubmitting, handleRatingSubmit, isExtraRun, isPaused, session]);

  React.useEffect(() => {
    if (isExtraRun) return;
    if (completedRef.current) return;
    if (isPaused) return;
    if (!activeDeck) return;
    if (!session.ready) return;
    if (session.loading || session.error || session.isBatchReview || session.currentItem) return;
    completedRef.current = true;
    onContentCompleted({
      completed_word_count: session.memorizedCount,
      target_word_count: countedTargetCountFromRun(run, session.memorizedCount),
    });
  }, [
    onContentCompleted,
    activeDeck,
    isPaused,
    isExtraRun,
    run.config_snapshot,
    session.currentBatchNumber,
    session.currentItem,
    session.error,
    session.isBatchReview,
    session.loading,
    session.memorizedCount,
    session.ready,
    session.totalBatchCount,
  ]);

  // Premium progress bars
  const renderProgressBar = () => {
    const total = displayBatchCount;
    const current = displayBatchNumber;

    const getDotPosition = (index: number) => {
      if (total <= 1) return 50;
      return 10 + (index / (total - 1)) * 80;
    };

    const fillWidth = total > 1 ? 10 + ((current - 1) / (total - 1)) * 80 : 100;

    return (
      <div className="relative mt-3 h-4 w-full flex items-center">
        <div className="absolute left-0 right-0 h-1 bg-[var(--focus-work-surface-soft)] rounded-full border border-[var(--focus-work-border)]" />
        <div
          className="absolute left-0 h-1 bg-emerald-500 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]"
          style={{ width: `${fillWidth}%` }}
        />
        {Array.from({ length: total }).map((_, i) => {
          const pos = getDotPosition(i);
          const isNodeActive = i < current;
          const isCurrent = i === current - 1;

          return (
            <div
              key={i}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full border transition-all duration-300 ${
                isNodeActive
                  ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                  : 'bg-[var(--focus-work-surface-muted)] border-[var(--focus-work-border)]'
              } ${isCurrent ? 'scale-125 border-emerald-200' : ''}`}
              style={{ left: `${pos}%` }}
              title={`第 ${i + 1} 批`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-full w-full overflow-y-auto px-4 pb-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="pt-2">
          <div className="text-sm font-medium text-[var(--focus-work-text)] text-center">
            {displayLoading
              ? '批次加载中…'
              : isExtraRun
                ? `额外轮次：已完成 ${extraCompletedCount} / ${extraPlannedCount || extraTargetCount}`
                : `第 ${displayBatchNumber} 批 / 共 ${displayBatchCount} 批`}
          </div>
          {renderProgressBar()}
        </header>

        <>
            <p className="text-sm leading-6 text-[var(--focus-work-text-muted)] text-center">
              {isExtraRun
                ? '这是一轮额外专注，只记录内容进度，不计入任务完成。'
                : session.isBatchReview
                  ? '上一批先简单回顾一下，再继续今天的词。'
                  : '先完成今天这一个词，再进入下一步。'}
            </p>

            {displayLoading ? <p className="text-sm text-[var(--focus-work-text-muted)] text-center">今日单词加载中…</p> : null}
            {displayError ? <p className="text-sm text-rose-200 text-center">{displayError}</p> : null}

            {isExtraRun && !displayLoading && !displayError && extraLoadedRunId === run.id && !displayCurrentItem && extraCompletedCount === 0 ? (
              <section className="rounded-[1.75rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-6 text-center">
                <div className="text-lg font-semibold text-[var(--focus-work-text)]">本轮暂无可练词卡</div>
                <p className="mt-2 text-sm leading-6 text-[var(--focus-work-text-muted)]">
                  当前词书没有可用于额外轮次的内容。你可以结束本轮内容，让工作台继续处理阶段。
                </p>
                <button
                  type="button"
                  disabled={isPaused}
                  onClick={completeEmptyExtraRun}
                  className="mt-5 rounded-full border border-[var(--focus-work-border)] bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-[var(--focus-work-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  结束本轮内容
                </button>
              </section>
            ) : !isExtraRun && session.isBatchReview ? (
              <section className="rounded-[1.75rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-5">
                <div className="text-sm text-[var(--focus-work-text-muted)]">{`上一批已完成 ${session.batchReviewCount} 个单词。`}</div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={isPaused || session.loading || session.submitting}
                    onClick={session.continueBatchReview}
                    className="rounded-full border border-[var(--focus-work-border)] bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-[var(--focus-work-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {session.batchReviewActionLabel}
                  </button>
                </div>
              </section>
            ) : displayCurrentItem ? (
              <div className="space-y-6">
                {displayCurrentMode === 'review' ? (
                  <QuizRenderer item={displayCurrentItem} />
                ) : (
                  <StudyCard
                    key={displayCurrentItem.id}
                    item={displayCurrentItem}
                    revealed={revealed}
                    onToggleRevealed={() => setRevealed((r) => !r)}
                  />
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {actions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.value}
                        type="button"
                        disabled={isPaused || displaySubmitting}
                        onClick={() => void handleRatingSubmit(action.value)}
                        className={`flex items-center gap-4 rounded-[1.5rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${action.bgClass}`}
                      >
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--focus-work-surface-muted)] border border-[var(--focus-work-border)] ${action.iconColor}`}>
                          <Icon className="h-5.5 w-5.5" />
                        </div>
                        <div>
                          <div className="text-base font-semibold text-[var(--focus-work-text)] flex items-center gap-2">
                            <span>{action.label}</span>
                            <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-[var(--focus-work-surface-muted)] border border-[var(--focus-work-border)] text-[10px] font-mono text-[var(--focus-work-text-faint)]">
                              {action.shortcut}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--focus-work-text-muted)] leading-tight">{action.hint}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
        </>

        {/* Premium Shortcuts Info Footer */}
        <footer className="mt-8 flex items-center justify-center border-t border-[var(--focus-work-border)] pt-4 text-xs text-[var(--focus-work-text-faint)]">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--focus-work-surface-soft)] border border-[var(--focus-work-border)] text-[10px] font-mono">💡</span>
            <span>键盘快捷键：[1-4] 选择记忆度并提交，[←/→] 切换单词，[Space/Enter] 显示/隐藏释义</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
