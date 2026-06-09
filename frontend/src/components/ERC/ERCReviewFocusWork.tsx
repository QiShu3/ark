import { useEffect, useRef, useState } from 'react';
import { BarChart3, BookOpen, Clock, ChevronRight, Trophy } from 'lucide-react';

import { fetchERCArticle, fetchERCArticles, fetchERCMistakes, fetchERCReviewNext, submitERCReview } from '../../lib/erc/api';
import type { ERCArticleDetail, ERCArticleListItem, ERCQuestion, ERCReviewNext, ERCReviewSubmitResult } from '../../lib/erc/types';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';

type OptionKey = 'A' | 'B' | 'C' | 'D';
type ERCReviewFocusWorkProps = FocusWorkRendererProps;

export default function ERCReviewFocusWork({
  run,
  disabled,
  onContentCompleted,
}: ERCReviewFocusWorkProps) {
  const targetQuestionCount = questionTargetCountFromRun(run);
  const [item, setItem] = useState<ERCReviewNext | null>(null);
  const [selected, setSelected] = useState<OptionKey | null>(null);
  const [result, setResult] = useState<ERCReviewSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const completedRef = useRef(false);
  const answeredQuestionIdsRef = useRef<Set<string>>(new Set());
  const isPaused = disabled;

  const [answeredCount, setAnsweredCount] = useState(0);

  useEffect(() => {
    if (completedRef.current) return;
    if (answeredCount >= targetQuestionCount) {
      completedRef.current = true;
      onContentCompleted({ answered_count: answeredCount, target_question_count: targetQuestionCount });
    }
  }, [answeredCount, onContentCompleted, targetQuestionCount]);

  useEffect(() => {
    if (completedRef.current) return;
    if (item && !item.has_item) {
      completedRef.current = true;
      onContentCompleted({
        answered_count: answeredCount,
        target_question_count: targetQuestionCount,
        no_available_content: answeredCount === 0,
      });
    }
  }, [answeredCount, item, onContentCompleted, targetQuestionCount]);

  useEffect(() => {
    let cancelled = false;

    void loadNextReviewItem(() => !cancelled);

    return () => {
      cancelled = true;
    };
  }, []);

  const loadNextReviewItem = async (active: () => boolean = () => true) => {
    setSelected(null);
    setResult(null);
    try {
      const payload = await resolveReviewItem(run, answeredQuestionIdsRef.current);
      if (!active()) return;
      setItem(payload);
      setError(null);
    } catch (err: unknown) {
      if (!active()) return;
      setError(err instanceof Error ? err.message : '复习题加载失败');
    }
  };

  const handleSubmit = async () => {
    if (isPaused) return;
    if (!item?.question || !selected) return;
    try {
      const nextResult = await submitERCReview(item.question.question_id, selected);
      setResult(nextResult);
      setError(null);
      answeredQuestionIdsRef.current.add(item.question.question_id);
      setAnsweredCount((c) => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-1 pb-2">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden">
        {/* Header Section */}
        <div className="mb-4 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--focus-work-text)] lg:text-4xl">
              ERC REVIEW
            </h1>
            {item?.article ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm text-[var(--focus-work-text-muted)]">
                <span className="font-medium">
                  {item.article.year} 年 Text {item.article.text_no} · {item.article.title || 'Untitled Article'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-3 py-1 text-xs font-medium text-[var(--focus-work-text)]">
                  <Clock className="h-3.5 w-3.5 text-[var(--focus-work-text-muted)]" />
                  预计用时：自适应
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-3 py-1 text-xs font-medium text-[var(--focus-work-text)]">
                  <BarChart3 className="h-3.5 w-3.5 text-[var(--focus-work-text-muted)]" />
                  错题复习
                </span>
              </div>
            ) : (
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm text-[var(--focus-work-text-muted)]">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-3 py-1 text-xs font-medium text-[var(--focus-work-text)]">
                  <BarChart3 className="h-3.5 w-3.5 text-[var(--focus-work-text-muted)]" />
                  错题复习
                </span>
              </div>
            )}
          </div>
        </div>

        {error ? <p className="mb-4 text-sm text-rose-200">{error}</p> : null}

        {item && !item.has_item ? (
          <div className="flex h-full w-full items-center justify-center p-8">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                <Trophy className="h-8 w-8" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-[var(--focus-work-text)]">暂无可复习内容</h2>
              <p className="mt-2 text-sm text-[var(--focus-work-text-muted)]">
                当前没有可用的 ERC 复习内容。
              </p>
            </div>
          </div>
        ) : null}

        {item?.has_item && item.question ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            {/* Reading Passage Card */}
            <article
              aria-label="阅读原文"
              className="flex min-h-0 flex-1 flex-col rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-6 shadow-sm lg:p-8"
            >
              <div className="mb-5 flex shrink-0 items-center justify-between gap-4 border-b border-[var(--focus-work-border)] pb-4">
                <h2 className="flex items-center gap-2.5 text-xl font-bold text-[var(--focus-work-text)] font-serif lg:text-2xl">
                  <BookOpen className="h-5.5 w-5.5 text-[var(--focus-work-blue-text)]" />
                  Reading Passage
                </h2>
              </div>
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-3">
                {item.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph.paragraph_no}
                    className="grid grid-cols-[2rem_minmax(0,1fr)] gap-6 text-[1.02rem] leading-8 text-[var(--focus-work-text)] lg:text-[1.08rem] lg:leading-9"
                  >
                    <span className="select-none text-left text-base font-bold text-[var(--focus-work-text)]">
                      {paragraph.paragraph_no}
                    </span>
                    <span className="font-serif tracking-normal">{paragraph.text}</span>
                  </p>
                ))}
              </div>
            </article>

            {/* Current Question Card */}
            <section className="rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-[var(--focus-work-text)] font-serif">Current Question</h2>
                      </div>
                      <div className="mt-1 text-xs text-[var(--focus-work-text-muted)] font-medium">
                        复习题
                      </div>
                    </div>
                  </div>

                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-4 py-1 text-sm font-semibold text-[var(--focus-work-text)]">
                    Q{item.question.question_no}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 z-10">
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isPaused || !selected || !!result}
                      className="inline-flex rounded-lg bg-[var(--focus-work-blue-text)] px-4 py-1.5 text-xs font-semibold text-[var(--focus-work-primary-button-text)] shadow-sm hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      提交答案
                    </button>

                    {result ? (
                      <button
                        type="button"
                        disabled={isPaused}
                        onClick={() => void loadNextReviewItem()}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] px-2.5 py-1.5 text-xs font-semibold text-[var(--focus-work-blue-text)] hover:bg-[var(--focus-work-blue-bg)] transition disabled:opacity-30 disabled:pointer-events-none"
                      >
                        下一题
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-base font-bold leading-6 text-[var(--focus-work-text)] lg:text-[1.05rem] lg:leading-7">
                    {item.question.stem}
                  </h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {(Object.keys(item.question.options) as OptionKey[]).map((key) => {
                      const isSelected = selected === key;
                      const isCorrect = result?.correct_option === key;

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
                          key={key}
                          type="button"
                          disabled={isPaused || !!result}
                          onClick={() => setSelected(key)}
                          className={`flex min-h-[2.5rem] items-center gap-4 rounded-xl border px-4 py-1.5 text-left text-sm transition ${btnStyle}`}
                        >
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-sm font-semibold transition ${badgeStyle}`}>
                            {key}
                          </span>
                          <span className="font-medium">{item.question.options[key]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>


            </section>
          </div>
        ) : null}

        {!item ? <p className="text-sm text-[var(--focus-work-text-muted)]">复习题加载中...</p> : null}
      </div>


    </div>
  );
}

function questionTargetCountFromRun(run: FocusWorkRendererProps['run']) {
  const rawTarget = Number(run.config_snapshot?.target_question_count ?? run.config_snapshot?.daily_question_target ?? 10);
  if (!Number.isFinite(rawTarget)) return 10;
  return Math.max(1, Math.min(200, Math.floor(rawTarget)));
}

async function resolveReviewItem(run: FocusWorkRendererProps['run'], answeredQuestionIds: Set<string>): Promise<ERCReviewNext> {
  const dueItem = await fetchERCReviewNext();
  if (run.counts_for_task_completion || dueItem.has_item) {
    if (!dueItem.question || !answeredQuestionIds.has(dueItem.question.question_id)) return dueItem;
  }
  return resolveExtraReviewItem(run, answeredQuestionIds);
}

async function resolveExtraReviewItem(run: FocusWorkRendererProps['run'], answeredQuestionIds: Set<string>): Promise<ERCReviewNext> {
  const mistakeItem = await resolveMistakeReviewItem(answeredQuestionIds);
  if (mistakeItem) return mistakeItem;

  const articles = sortReviewArticles(await fetchERCArticles(articleFiltersFromRun(run)));
  for (const article of articles) {
    const detail = await fetchERCArticle(article.article_id);
    const question = selectQuestion(detail.questions, answeredQuestionIds);
    if (question) return reviewItemFromArticle(detail, question);
  }

  return emptyReviewItem();
}

async function resolveMistakeReviewItem(answeredQuestionIds: Set<string>) {
  const mistakes = await fetchERCMistakes();
  const mistake = mistakes.find((item) => !answeredQuestionIds.has(item.question_id)) ?? mistakes[0];
  if (!mistake) return null;
  const detail = await fetchERCArticle(mistake.article_id);
  const question = detail.questions.find((item) => item.question_id === mistake.question_id) ?? selectQuestion(detail.questions, answeredQuestionIds);
  return question ? reviewItemFromArticle(detail, question) : null;
}

function sortReviewArticles(articles: ERCArticleListItem[]) {
  const rank: Record<ERCArticleListItem['status'], number> = {
    has_due_review: 0,
    practiced: 1,
    unstarted: 2,
  };
  return [...articles].sort((a, b) => rank[a.status] - rank[b.status]);
}

function selectQuestion(questions: ERCQuestion[], answeredQuestionIds: Set<string>) {
  return questions.find((question) => !answeredQuestionIds.has(question.question_id)) ?? questions[0] ?? null;
}

function reviewItemFromArticle(article: ERCArticleDetail, question: ERCQuestion): ERCReviewNext {
  return {
    has_item: true,
    next_due_at: null,
    article: {
      article_id: article.article_id,
      year: article.year,
      text_no: article.text_no,
      title: article.title,
    },
    paragraphs: article.paragraphs,
    question,
  };
}

function emptyReviewItem(): ERCReviewNext {
  return {
    has_item: false,
    next_due_at: null,
    article: null,
    paragraphs: [],
    question: null,
  };
}

function articleFiltersFromRun(run: FocusWorkRendererProps['run']) {
  const setId = stringConfig(run.config_snapshot?.set_id ?? run.config_snapshot?.article_set_id);
  const exam = stringConfig(run.config_snapshot?.exam);
  return {
    ...(setId ? { setId } : {}),
    ...(exam ? { exam } : {}),
  };
}

function stringConfig(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
