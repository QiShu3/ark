import React from 'react';
import { BarChart3, BookOpen, ChevronRight, Trophy } from 'lucide-react';

import type {
  ChoiceQuestionFocusTemplateProps,
  ChoiceQuestionItem,
  ChoiceQuestionSubmitResult,
} from './choiceQuestionTypes';
import MarkdownContent from '../../MarkdownContent';
import ContentBlockRenderer from '../ContentBlockRenderer';
import { buildProgressSnapshot, metaClass } from '../focusWorkUtils';

export default function ChoiceQuestionFocusTemplate({
  item,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  answeredCount,
  targetCount,
  disabled,
  onSubmitAnswer,
  onLoadNext,
  onContentCompleted,
}: ChoiceQuestionFocusTemplateProps) {
  const [currentItem, setCurrentItem] = React.useState<ChoiceQuestionItem | null>(item);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ChoiceQuestionSubmitResult | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [loadingNext, setLoadingNext] = React.useState(false);
  const completedRef = React.useRef(false);

  React.useEffect(() => {
    completedRef.current = false;
    setCurrentItem(item);
    setSelected(null);
    setResult(null);
    setLocalError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  React.useEffect(() => {
    if (completedRef.current) return;
    if (answeredCount >= targetCount && targetCount > 0) {
      completedRef.current = true;
      onContentCompleted(buildProgressSnapshot('answered_count', 'target_question_count', answeredCount, targetCount));
    }
  }, [answeredCount, onContentCompleted, targetCount]);

  React.useEffect(() => {
    if (completedRef.current || loading || item || currentItem) return;
    completedRef.current = true;
    onContentCompleted(buildProgressSnapshot('answered_count', 'target_question_count', answeredCount, targetCount, answeredCount === 0));
  }, [answeredCount, currentItem, item, loading, onContentCompleted, targetCount]);

  async function handleSubmit() {
    if (disabled || submitting || !currentItem || !selected || result) return;
    setSubmitting(true);
    try {
      const nextResult = await onSubmitAnswer(currentItem, selected);
      setResult(nextResult);
      setLocalError(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoadNext() {
    if (disabled || loadingNext) return;
    setLoadingNext(true);
    try {
      const nextItem = await onLoadNext();
      setCurrentItem(nextItem);
      setSelected(null);
      setResult(null);
      setLocalError(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '下一题加载失败');
    } finally {
      setLoadingNext(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-1 pb-2">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden">
        {error || localError ? <p className="mb-4 text-sm text-[var(--focus-work-rose-text)]">{error ?? localError}</p> : null}

        {loading ? <p className="text-sm text-[var(--focus-work-text-muted)]">复习题加载中...</p> : null}

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
            {(currentItem.material || currentItem.materialBlocks?.length) ? (
              <article aria-label="阅读原文" className="flex flex-1 flex-col rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-6 shadow-sm lg:p-8">
                <div className="mb-5 flex shrink-0 items-center justify-between gap-4 border-b border-[var(--focus-work-border)] pb-4">
                  <h2 className="flex items-center gap-2.5 text-xl font-bold text-[var(--focus-work-text)] font-serif lg:text-2xl">
                    <BookOpen className="h-5.5 w-5.5 text-[var(--focus-work-blue-text)]" />
                    {currentItem.material?.title ?? '题目'}
                  </h2>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-sm text-[var(--focus-work-text-muted)]">
                    {(currentItem.meta ?? []).map((meta) => (
                      <span key={meta.label} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${metaClass(meta.tone)}`}>
                        <BarChart3 className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-6 overflow-y-auto pr-3">
                  {currentItem.materialBlocks?.length ? (
                    <ContentBlockRenderer blocks={currentItem.materialBlocks} />
                  ) : (
                    currentItem.material?.paragraphs.map((paragraph) => (
                      <p key={paragraph.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-6 text-[1.02rem] leading-8 text-[var(--focus-work-text)] lg:text-[1.08rem] lg:leading-9">
                        <span className="select-none text-left text-base font-bold text-[var(--focus-work-text)]">{paragraph.label}</span>
                        <span className="font-serif tracking-normal">
                          {typeof paragraph.text === 'string' ? (
                            <MarkdownContent content={paragraph.text} inline />
                          ) : (
                            paragraph.text
                          )}
                        </span>
                      </p>
                    )) ?? null
                  )}
                </div>
              </article>
            ) : null}

            <section className="flex flex-col justify-between rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-5 shadow-sm">
              <div>
                <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-[var(--focus-work-text)] font-serif">Current Question</h2>
                    </div>
                  </div>
                  <div className="z-10 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      disabled={disabled || submitting || !selected || !!result}
                      className="inline-flex rounded-lg bg-[var(--focus-work-blue-text)] px-4 py-1.5 text-xs font-semibold text-[var(--focus-work-primary-button-text)] shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? '提交中...' : '提交答案'}
                    </button>
                    {result ? (
                      <button
                        type="button"
                        disabled={disabled || loadingNext}
                        onClick={() => void handleLoadNext()}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] px-2.5 py-1.5 text-xs font-semibold text-[var(--focus-work-blue-text)] transition hover:bg-[var(--focus-work-blue-bg)] disabled:pointer-events-none disabled:opacity-30"
                      >
                        {loadingNext ? '加载中...' : '下一题'}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  {currentItem.stemPlacement !== 'material' ? (
                    currentItem.stemBlocks ? (
                      <div className="space-y-2">
                        <ContentBlockRenderer blocks={currentItem.stemBlocks} />
                      </div>
                    ) : (
                      <div className="text-base font-bold leading-6 text-[var(--focus-work-text)] lg:text-[1.05rem] lg:leading-7">
                        {typeof currentItem.stem === 'string' ? (
                          <MarkdownContent content={currentItem.stem} inline />
                        ) : (
                          currentItem.stem
                        )}
                      </div>
                    )
                  ) : null}
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {currentItem.options.map((option) => {
                      const isSelected = selected === option.key;
                      const isCorrect = result?.correctOptionKey === option.key;
                      let btnStyle = 'border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] text-[var(--focus-work-text)] hover:border-[var(--focus-work-blue-border)] hover:bg-[var(--focus-work-blue-bg)]';
                      let badgeStyle = 'bg-[var(--focus-work-blue-bg)] text-[var(--focus-work-blue-text)] border-[var(--focus-work-blue-border)]';
                      if (result) {
                        if (isCorrect) {
                          btnStyle = 'border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)] shadow-sm';
                          badgeStyle = 'bg-[var(--focus-work-emerald-text)] text-[var(--focus-work-primary-button-text)] border-transparent';
                        } else if (isSelected) {
                          btnStyle = 'border-[var(--focus-work-rose-border)] bg-[var(--focus-work-rose-bg)] text-[var(--focus-work-rose-text)] shadow-sm';
                          badgeStyle = 'bg-[var(--focus-work-rose-text)] text-[var(--focus-work-primary-button-text)] border-transparent';
                        } else {
                          btnStyle = 'border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)]/40 text-[var(--focus-work-text-faint)] opacity-60';
                          badgeStyle = 'bg-[var(--focus-work-surface-soft)] text-[var(--focus-work-text-faint)] border-[var(--focus-work-border)]';
                        }
                      } else if (isSelected) {
                        btnStyle = 'border-[var(--focus-work-blue-border-hover)] bg-[var(--focus-work-blue-bg-hover)] text-[var(--focus-work-text)] shadow-sm';
                        badgeStyle = 'bg-[var(--focus-work-blue-text)] text-[var(--focus-work-primary-button-text)] border-transparent';
                      }
                      return (
                        <button
                          key={option.key}
                          type="button"
                          disabled={disabled || !!result}
                          onClick={() => setSelected(option.key)}
                          className={`flex min-h-[2.5rem] items-center gap-4 rounded-xl border px-4 py-1.5 text-left text-sm transition ${btnStyle}`}
                        >
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-sm font-semibold transition ${badgeStyle}`}>{option.key}</span>
                          <span className="min-w-0 font-medium">
                            <MarkdownContent content={option.text} inline />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {result && (currentItem.explanationBlocks?.length || result.explanationBlocks?.length) && (
                  <div className="mt-4 rounded-xl border border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] p-4">
                    <div className="mb-2 text-xs font-semibold text-[var(--focus-work-emerald-text)]">解析</div>
                    <ContentBlockRenderer blocks={result.explanationBlocks ?? currentItem.explanationBlocks!} />
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
