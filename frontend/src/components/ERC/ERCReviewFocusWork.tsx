import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, BookOpen, Clock, Sparkles, ChevronRight } from 'lucide-react';

import { fetchERCReviewNext, submitERCReview } from '../../lib/erc/api';
import type { ERCReviewNext, ERCReviewSubmitResult } from '../../lib/erc/types';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';

type OptionKey = 'A' | 'B' | 'C' | 'D';
type ERCReviewFocusWorkProps = Partial<FocusWorkRendererProps>;

export default function ERCReviewFocusWork({ workflow, onCompleteTaskAndFinish }: ERCReviewFocusWorkProps) {
  const [item, setItem] = useState<ERCReviewNext | null>(null);
  const [selected, setSelected] = useState<OptionKey | null>(null);
  const [result, setResult] = useState<ERCReviewSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPaused = workflow?.is_paused === true;

  useEffect(() => {
    let cancelled = false;

    fetchERCReviewNext()
      .then((payload) => {
        if (cancelled) return;
        setItem(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '复习题加载失败');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadNext = () => {
    setSelected(null);
    setResult(null);
    fetchERCReviewNext()
      .then((payload) => {
        setItem(payload);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '复习题加载失败'));
  };

  const handleSubmit = async () => {
    if (isPaused) return;
    if (!item?.question || !selected) return;
    try {
      const nextResult = await submitERCReview(item.question.question_id, selected);
      setResult(nextResult);
      setError(null);
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
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] px-3 py-1 text-xs font-medium text-[var(--focus-work-blue-text)]">
                  <Clock className="h-3.5 w-3.5 text-[var(--focus-work-blue-text)]" />
                  预计用时：自适应
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] px-3 py-1 text-xs font-medium text-[var(--focus-work-blue-text)]">
                  <BarChart3 className="h-3.5 w-3.5 text-[var(--focus-work-blue-text)]" />
                  模式：今日复习
                </span>
              </div>
            ) : (
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm text-[var(--focus-work-text-muted)]">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] px-3 py-1 text-xs font-medium text-[var(--focus-work-blue-text)]">
                  <BarChart3 className="h-3.5 w-3.5 text-[var(--focus-work-blue-text)]" />
                  模式：今日复习
                </span>
              </div>
            )}
          </div>
        </div>

        {error ? <p className="mb-4 text-sm text-rose-200">{error}</p> : null}

        {item && !item.has_item ? (
          <section className="rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-8">
            <h2 className="text-2xl font-semibold text-[var(--focus-work-text)]">暂无到期复习</h2>
            <p className="mt-3 text-sm text-[var(--focus-work-text-muted)]">今天没有需要复习的阅读题，可以去题库练一篇新的文章。</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {onCompleteTaskAndFinish ? (
                <button
                  type="button"
                  disabled={isPaused}
                  onClick={onCompleteTaskAndFinish}
                  className="inline-flex rounded-full bg-white px-5 py-3 text-sm text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 animate-pulse"
                >
                  完成今日 ERC 复习
                </button>
              ) : null}
              <Link to="/erc/library" className="inline-flex rounded-full border border-[var(--focus-work-border)] px-5 py-3 text-sm text-[var(--focus-work-text)]">
                进入题库
              </Link>
            </div>
          </section>
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

                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] px-4 py-1 text-sm font-semibold text-[var(--focus-work-blue-text)]">
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
                        onClick={loadNext}
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
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={isPaused || !!result}
                          onClick={() => setSelected(key)}
                          className={`flex min-h-[2.5rem] items-center gap-4 rounded-xl border px-4 py-1.5 text-left text-sm transition ${
                            isSelected
                              ? 'border-[var(--focus-work-blue-border-hover)] bg-[var(--focus-work-blue-bg-hover)] text-[var(--focus-work-text)] shadow-sm'
                              : 'border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] text-[var(--focus-work-text)] hover:border-[var(--focus-work-blue-border)] hover:bg-[var(--focus-work-blue-bg)]'
                          }`}
                        >
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-sm font-semibold transition ${
                            isSelected
                              ? 'bg-[var(--focus-work-blue-text)] text-[var(--focus-work-primary-button-text)] border-transparent'
                              : 'bg-[var(--focus-work-blue-bg)] text-[var(--focus-work-blue-text)] border-[var(--focus-work-blue-border)]'
                          }`}>
                            {key}
                          </span>
                          <span className="font-medium">{item.question.options[key]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {result ? (
                  <div className={`mt-5 rounded-xl border p-4 text-sm font-semibold transition-all ${
                    result.is_correct
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                  }`}>
                    {result.is_correct ? '回答正确！' : `回答错误，正确答案是 ${result.correct_option}`}
                  </div>
                ) : null}
              </div>


            </section>
          </div>
        ) : null}

        {!item ? <p className="text-sm text-[var(--focus-work-text-muted)]">复习题加载中...</p> : null}
      </div>
    </div>
  );
}
