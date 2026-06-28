import React from 'react';
import { BarChart3, BookOpen, CheckCircle2, AlertCircle, Loader2, Send, ChevronRight } from 'lucide-react';

import type {
  InputQuestionFocusTemplateProps,
  InputSubmitResult,
} from './inputQuestionTypes';
import MarkdownContent from '../../MarkdownContent';
import ContentBlockRenderer from '../ContentBlockRenderer';

function metaClass(tone: string | undefined) {
  if (tone === 'blue') return 'border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] text-[var(--focus-work-blue-text)]';
  if (tone === 'amber') return 'border-[var(--focus-work-amber-border)] bg-[var(--focus-work-amber-bg)] text-[var(--focus-work-amber-text)]';
  if (tone === 'emerald') return 'border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)]';
  return 'border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] text-[var(--focus-work-text)]';
}

export default function InputQuestionFocusTemplate({
  subtitle,
  article,
  currentQuestion,
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
}: InputQuestionFocusTemplateProps) {
  const [userInput, setUserInput] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<InputSubmitResult | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [loadingNext, setLoadingNext] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const startTimeRef = React.useRef<number>(Date.now());
  const completedRef = React.useRef(false);

  const question = currentQuestion;
  const lines = question?.inputConfig?.lines ?? 1;
  const isMultiLine = lines > 1;
  const maxChars = question?.inputConfig?.maxCharacters;
  const placeholder = question?.inputConfig?.placeholder ?? '请输入答案';

  React.useEffect(() => {
    completedRef.current = false;
    setUserInput('');
    setResult(null);
    setLocalError(null);
    startTimeRef.current = Date.now();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [question?.id]);

  React.useEffect(() => {
    if (completedRef.current) return;
    if (answeredCount >= targetCount && targetCount > 0) {
      completedRef.current = true;
      onContentCompleted({ answered_count: answeredCount, target_question_count: targetCount });
    }
  }, [answeredCount, onContentCompleted, targetCount]);

  React.useEffect(() => {
    if (completedRef.current || loading || question) return;
    completedRef.current = true;
    onContentCompleted({ answered_count: answeredCount, target_question_count: targetCount, no_available_content: answeredCount === 0 });
  }, [answeredCount, question, loading, onContentCompleted, targetCount]);

  async function handleSubmit() {
    if (!question || submitting || disabled || !userInput.trim()) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const res = await onSubmitAnswer(question, userInput);
      setResult(res);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoadNext() {
    if (disabled || loadingNext) return;
    setLoadingNext(true);
    setLocalError(null);
    try {
      onLoadNext();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '下一题加载失败');
    } finally {
      setLoadingNext(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && result && question?.mode === 'fill' && result.correct) {
      e.preventDefault();
      void handleLoadNext();
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-1 pb-2">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden">
        {error || localError ? <p className="mb-4 text-sm text-[var(--focus-work-rose-text)]">{error ?? localError}</p> : null}

        {loading ? <p className="text-sm text-[var(--focus-work-text-muted)]">加载中...</p> : null}

        {!loading && !question ? (
          <div className="flex h-full w-full items-center justify-center p-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-[var(--focus-work-text)]">{emptyTitle ?? '暂无题目'}</h2>
              <p className="mt-2 text-sm text-[var(--focus-work-text-muted)]">{emptyDescription ?? '当前范围内没有待做的题目'}</p>
            </div>
          </div>
        ) : null}

        {question ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            {subtitle ? <p className="text-sm text-[var(--focus-work-text-muted)]">{subtitle}</p> : null}

            {/* Article material */}
            {article && (article.paragraphs.length > 0 || article.materialBlocks?.length) ? (
              <article aria-label="阅读原文" className="flex flex-1 flex-col rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-6 shadow-sm lg:p-8">
                <div className="mb-5 flex shrink-0 items-center justify-between gap-4 border-b border-[var(--focus-work-border)] pb-4">
                  <h2 className="flex items-center gap-2.5 text-xl font-bold text-[var(--focus-work-text)] font-serif lg:text-2xl">
                    <BookOpen className="h-5.5 w-5.5 text-[var(--focus-work-blue-text)]" />
                    {article.title || '阅读材料'}
                  </h2>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-sm text-[var(--focus-work-text-muted)]">
                    {(question.meta ?? []).map((m) => (
                      <span key={m.label} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${metaClass(m.tone)}`}>
                        <BarChart3 className="h-3.5 w-3.5" />
                        {m.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-6 overflow-y-auto pr-3">
                  {article.materialBlocks?.length ? (
                    <ContentBlockRenderer blocks={article.materialBlocks} />
                  ) : (
                    article.paragraphs.map((paragraph) => (
                      paragraph.label ? (
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
                      ) : (
                        <p key={paragraph.id} className="text-[1.02rem] leading-8 text-[var(--focus-work-text)] lg:text-[1.08rem] lg:leading-9">
                          <span className="font-serif tracking-normal">
                            {typeof paragraph.text === 'string' ? (
                              <MarkdownContent content={paragraph.text} inline />
                            ) : (
                              paragraph.text
                            )}
                          </span>
                        </p>
                      )
                    ))
                  )}
                </div>
              </article>
            ) : null}

            {/* Question section */}
            <section className="flex flex-col justify-between rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-5 shadow-sm">
              <div>
                <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-[var(--focus-work-text-muted)]">{question.numberLabel}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--focus-work-text-faint)]">
                      {answeredCount} / {targetCount}
                    </span>
                    <div className="z-10 flex flex-wrap items-center gap-2">
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
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleSubmit()}
                          disabled={disabled || submitting || !userInput.trim()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--focus-work-blue-text)] px-4 py-1.5 text-xs font-semibold text-[var(--focus-work-primary-button-text)] shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          {submitting ? '提交中...' : '提交'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stem - only show if stem is not empty */}
                {question.stem && (
                  <div className="mt-4">
                    {question.stemBlocks?.length ? (
                      <ContentBlockRenderer blocks={question.stemBlocks} />
                    ) : (
                      <div className="text-base font-bold leading-6 text-[var(--focus-work-text)] lg:text-[1.05rem] lg:leading-7">
                        {typeof question.stem === 'string' ? (
                          <MarkdownContent content={question.stem} inline />
                        ) : (
                          question.stem
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Input area */}
                <div className="mt-4">
                  {isMultiLine ? (
                    <textarea
                      ref={inputRef}
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={disabled || submitting}
                      placeholder={placeholder}
                      maxLength={maxChars}
                      rows={lines}
                      className="w-full rounded-xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-4 py-3 text-sm text-[var(--focus-work-text)] placeholder:text-[var(--focus-work-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-work-blue-border)] disabled:opacity-50"
                    />
                  ) : (
                    <input
                      ref={inputRef}
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={disabled || submitting}
                      placeholder={placeholder}
                      maxLength={maxChars}
                      className="w-full rounded-xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-4 py-3 text-sm text-[var(--focus-work-text)] placeholder:text-[var(--focus-work-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-work-blue-border)] disabled:opacity-50"
                    />
                  )}
                  {maxChars ? (
                    <div className="mt-1 text-right text-xs text-[var(--focus-work-text-faint)]">
                      {userInput.length} / {maxChars}
                    </div>
                  ) : null}
                </div>

                {/* Result area */}
                {result ? (
                  <div className="mt-4 rounded-xl border border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] p-4">
                    {result.correct !== undefined && result.correct !== null ? (
                      <div className={`flex items-center gap-2 ${result.correct ? 'text-[var(--focus-work-emerald-text)]' : 'text-[var(--focus-work-rose-text)]'}`}>
                        {result.correct ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                        <span className="text-sm font-semibold">{result.correct ? '正确' : '错误'}</span>
                      </div>
                    ) : null}
                    {result.correct === false && result.acceptedAnswers && result.acceptedAnswers.length > 0 ? (
                      <div className="mt-2 text-sm text-[var(--focus-work-text-muted)]">
                        标准答案：{result.acceptedAnswers.join(' / ')}
                      </div>
                    ) : null}
                    {result.score !== undefined && result.score !== null ? (
                      <div className="flex items-center gap-2 text-[var(--focus-work-amber-text)]">
                        <span className="text-sm font-semibold">得分：{result.score}</span>
                      </div>
                    ) : null}
                    {result.feedback ? <p className="mt-2 text-sm text-[var(--focus-work-text-muted)]">{result.feedback}</p> : null}
                    {result.explanationBlocks?.length ? (
                      <div className="mt-3 border-t border-[var(--focus-work-border)] pt-3">
                        <p className="mb-1 text-xs font-semibold text-[var(--focus-work-text-faint)]">解析</p>
                        <ContentBlockRenderer blocks={result.explanationBlocks} />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Keyboard hints */}
                <div className="mt-3 text-xs text-[var(--focus-work-text-faint)]">
                  Ctrl+Enter 提交
                  {question.mode === 'fill' ? ' · Enter 下一题' : null}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
