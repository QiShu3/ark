import React from 'react';
import { BarChart3, CheckCircle2, Frown, Meh, Rocket, Trophy } from 'lucide-react';

import type {
  FlashcardFocusTemplateProps,
  FlashcardItem,
  FlashcardRating,
} from './flashcardTypes';
import { buildProgressSnapshot, metaClass } from '../focusWorkUtils';

const RATING_ACTIONS: Array<{
  label: string;
  hint: string;
  value: FlashcardRating;
  icon: typeof Frown;
  bgClass: string;
  iconColor: string;
  shortcut: string;
}> = [
  {
    label: '没记住',
    hint: '今天稍后再看',
    value: 'again',
    icon: Frown,
    bgClass: 'hover:bg-[var(--focus-work-rose-bg)] hover:border-[var(--focus-work-rose-border)] focus-visible:bg-[var(--focus-work-rose-bg)] focus-visible:border-[var(--focus-work-rose-border)]',
    iconColor: 'text-[var(--focus-work-rose-text)]',
    shortcut: '1',
  },
  {
    label: '有点难',
    hint: '进入较短间隔',
    value: 'hard',
    icon: Meh,
    bgClass: 'hover:bg-[var(--focus-work-amber-bg)] hover:border-[var(--focus-work-amber-border)] focus-visible:bg-[var(--focus-work-amber-bg)] focus-visible:border-[var(--focus-work-amber-border)]',
    iconColor: 'text-[var(--focus-work-amber-text)]',
    shortcut: '2',
  },
  {
    label: '记住了',
    hint: '进入正常间隔',
    value: 'good',
    icon: CheckCircle2,
    bgClass: 'hover:bg-[var(--focus-work-emerald-bg)] hover:border-[var(--focus-work-emerald-border)] focus-visible:bg-[var(--focus-work-emerald-bg)] focus-visible:border-[var(--focus-work-emerald-border)]',
    iconColor: 'text-[var(--focus-work-emerald-text)]',
    shortcut: '3',
  },
  {
    label: '很轻松',
    hint: '延后更久再看',
    value: 'easy',
    icon: Rocket,
    bgClass: 'hover:bg-[var(--focus-work-sky-bg)] hover:border-[var(--focus-work-sky-border)] focus-visible:bg-[var(--focus-work-sky-bg)] focus-visible:border-[var(--focus-work-sky-border)]',
    iconColor: 'text-[var(--focus-work-sky-text)]',
    shortcut: '4',
  },
];

export default function FlashcardFocusTemplate({
  item,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  completedCount,
  targetCount,
  batchNumber,
  totalBatches,
  disabled,
  onSubmitRating,
  onLoadNext,
  onContentCompleted,
}: FlashcardFocusTemplateProps) {
  const [currentItem, setCurrentItem] = React.useState<FlashcardItem | null>(item);
  const [revealed, setRevealed] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const completedRef = React.useRef(false);

  React.useEffect(() => {
    setCurrentItem(item);
    setRevealed(false);
    setLocalError(null);
  }, [item?.id, item]);

  React.useEffect(() => {
    if (completedRef.current || disabled) return;
    if (completedCount >= targetCount && targetCount > 0) {
      completedRef.current = true;
      onContentCompleted(buildProgressSnapshot('completed_count', 'target_count', completedCount, targetCount));
    }
  }, [completedCount, disabled, onContentCompleted, targetCount]);

  React.useEffect(() => {
    if (completedRef.current || disabled || loading || item || currentItem) return;
    if (completedCount === 0 && !error) return;
    completedRef.current = true;
    onContentCompleted(buildProgressSnapshot('completed_count', 'target_count', completedCount, targetCount, completedCount === 0));
  }, [completedCount, currentItem, disabled, error, item, loading, onContentCompleted, targetCount]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName)) return;
      if (!currentItem) return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          if (!submitting && !disabled) void handleRatingSubmit('again');
          break;
        case '2':
          e.preventDefault();
          if (!submitting && !disabled) void handleRatingSubmit('hard');
          break;
        case '3':
          e.preventDefault();
          if (!submitting && !disabled) void handleRatingSubmit('good');
          break;
        case '4':
          e.preventDefault();
          if (!submitting && !disabled) void handleRatingSubmit('easy');
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          setRevealed((prev) => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentItem, disabled, submitting]);

  async function handleRatingSubmit(rating: FlashcardRating) {
    if (disabled || submitting || !currentItem) return;
    setSubmitting(true);
    try {
      const result = await onSubmitRating(currentItem, rating);
      setLocalError(null);
      if (!result.shouldRepeat) {
        setRevealed(false);
        const nextItem = await onLoadNext();
        setCurrentItem(nextItem);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  const progressLabel = batchNumber != null && totalBatches != null
    ? `第 ${batchNumber} 批 / 共 ${totalBatches} 批`
    : `${completedCount} / ${targetCount}`;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-1 pb-2">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden">
        {(currentItem?.meta?.length || progressLabel) ? (
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {(currentItem?.meta ?? []).map((meta) => (
                <span key={meta.label} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${metaClass(meta.tone)}`}>
                  <BarChart3 className="h-3.5 w-3.5" />
                  {meta.label}
                </span>
              ))}
            </div>
            <div className="shrink-0 text-sm text-[var(--focus-work-text-muted)]">{progressLabel}</div>
          </div>
        ) : null}

        {error || localError ? <p className="mb-4 text-sm text-[var(--focus-work-rose-text)]">{error ?? localError}</p> : null}

        {loading ? (
          <div className="flex h-full w-full items-center justify-center p-8">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[var(--focus-work-border)] border-t-white" />
              <p className="mt-4 text-sm text-[var(--focus-work-text-muted)]">加载中...</p>
            </div>
          </div>
        ) : null}

        {!loading && !currentItem ? (
          <div className="flex h-full w-full items-center justify-center p-8">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)]">
                <Trophy className="h-8 w-8" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-[var(--focus-work-text)]">{emptyTitle}</h2>
              <p className="mt-2 text-sm text-[var(--focus-work-text-muted)]">{emptyDescription}</p>
            </div>
          </div>
        ) : null}

        {currentItem ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            <section className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-8 shadow-sm">
              <div className="text-center">
                <div className="text-4xl font-semibold tracking-tight text-[var(--focus-work-text)]">
                  {currentItem.front}
                </div>
              </div>

              {revealed ? (
                <div className="mt-8 border-t border-[var(--focus-work-border)] pt-6 text-center">
                  <div className="text-lg text-[var(--focus-work-text-muted)]">
                    {currentItem.back}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  className="mt-8 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-6 py-3 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)]"
                >
                  显示答案
                </button>
              )}
            </section>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {RATING_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.value}
                    type="button"
                    disabled={disabled || submitting}
                    onClick={() => void handleRatingSubmit(action.value)}
                    className={`flex items-center gap-4 rounded-2xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${action.bgClass}`}
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

            <footer className="flex items-center justify-center border-t border-[var(--focus-work-border)] pt-4 text-xs text-[var(--focus-work-text-faint)]">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--focus-work-surface-soft)] border border-[var(--focus-work-border)] text-[10px] font-mono">💡</span>
                <span>键盘快捷键：[1-4] 评分，[Space/Enter] 显示/隐藏答案</span>
              </div>
            </footer>
          </div>
        ) : null}
      </div>
    </div>
  );
}
