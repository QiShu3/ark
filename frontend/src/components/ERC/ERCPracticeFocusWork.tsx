import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Sparkles,
} from 'lucide-react';

import {
  fetchERCOverview,
  fetchERCArticle,
  fetchERCVocabularyPreheat,
  submitERCVocabularyPreheat,
  submitERCArticle,
} from '../../lib/erc/api';
import type { ERCArticleDetail, ERCArticleSubmitResult } from '../../lib/erc/types';
import type { VocabReviewItem } from '../../lib/vocab/types';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import WordMetaPanel from '../Vocab/WordMetaPanel';

type OptionKey = 'A' | 'B' | 'C' | 'D';
type ERCPracticeFocusWorkProps = Partial<FocusWorkRendererProps>;

const actions: Array<{ label: string; hint: string; value: 'again' | 'hard' | 'good' | 'easy' }> = [
  { label: '没记住', hint: '再次学习', value: 'again' },
  { label: '模糊', hint: '较短间隔', value: 'hard' },
  { label: '记住了', hint: '正常间隔', value: 'good' },
  { label: '太简单', hint: '延后很久', value: 'easy' },
];

export default function ERCPracticeFocusWork({ workflow, onCompleteTaskAndFinish }: ERCPracticeFocusWorkProps) {
  const [phase, setPhase] = useState<'loading' | 'preheat' | 'reading' | 'result' | 'empty'>('loading');
  const [article, setArticle] = useState<ERCArticleDetail | null>(null);
  const [preheatWords, setPreheatWords] = useState<VocabReviewItem[]>([]);
  const [preheatIndex, setPreheatIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [evidenceHighlighted, setEvidenceHighlighted] = useState(true);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, OptionKey>>({});
  const [submitResult, setSubmitResult] = useState<ERCArticleSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passageScrollRef = useRef<HTMLDivElement | null>(null);

  const isPaused = workflow?.is_paused === true;

  useEffect(() => {
    let active = true;
    const loadPractice = async () => {
      try {
        const overview = await fetchERCOverview();
        if (!active) return;
        if (!overview.recommended_article) {
          setPhase('empty');
          return;
        }

        const articleId = overview.recommended_article.article_id;
        const [articleData, preheatData] = await Promise.all([
          fetchERCArticle(articleId),
          fetchERCVocabularyPreheat(articleId),
        ]);

        if (!active) return;
        setArticle(articleData);
        setPreheatWords(preheatData);

        if (preheatData.length > 0) {
          setPhase('preheat');
        } else {
          setPhase('reading');
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : '真题练习加载失败');
        setPhase('empty');
      }
    };

    void loadPractice();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    passageScrollRef.current?.scrollTo({ top: 0 });
    setEvidenceHighlighted(false);
  }, [article?.article_id, phase]);

  const handlePreheatSubmit = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    if (isPaused || !article) return;
    const word = preheatWords[preheatIndex];
    try {
      await submitERCVocabularyPreheat(article.article_id, {
        deck_id: word.deck_id,
        word_id: word.id,
        result: rating,
        prompt_type: word.prompt_type || 'en_to_zh',
      });
    } catch (err) {
      console.error('Failed to submit preheat review', err);
    }

    setRevealed(false);
    setCurrentQuestionIndex(0);
    if (preheatIndex + 1 < preheatWords.length) {
      setPreheatIndex((prev) => prev + 1);
    } else {
      setPhase('reading');
    }
  };

  const handleSelectOption = (questionId: string, option: OptionKey) => {
    if (isPaused || phase === 'result') return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: option,
    }));
  };

  const handlePracticeSubmit = async () => {
    if (isPaused || !article || submitting) return;
    const unanswered = article.questions.some((q) => !selectedAnswers[q.question_id]);
    if (unanswered) {
      alert('请先完成所有的阅读理解题目再提交！');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const answers = article.questions.map((q) => ({
        question_id: q.question_id,
        chosen_option: selectedAnswers[q.question_id],
      }));
      const result = await submitERCArticle(article.article_id, answers);
      setSubmitResult(result);
      setPhase('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交答案失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[var(--focus-work-border)] border-t-white" />
          <p className="mt-4 text-sm text-[var(--focus-work-text-muted)]">正在为您加载今日推荐真题与单词预热…</p>
        </div>
      </div>
    );
  }

  if (phase === 'empty') {
    return (
      <div className="h-full w-full overflow-y-auto px-4 pb-8">
        <div className="mx-auto max-w-2xl pt-12">
          <section className="rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-8 backdrop-blur-md">
            <h2 className="text-2xl font-semibold text-[var(--focus-work-text)]">今日真题练习已完成</h2>
            <p className="mt-4 text-sm leading-6 text-[var(--focus-work-text-muted)]">
              太棒了！您今日推荐的真题阅读已经全部完成了。您可以前往题库自行挑选其他的阅读文章，或者完成任务进入专注时间。
            </p>
            <div className="mt-8 flex gap-3">
              {onCompleteTaskAndFinish ? (
                <button
                  type="button"
                  onClick={onCompleteTaskAndFinish}
                  disabled={isPaused}
                  className="rounded-full bg-white px-6 py-3 text-sm font-medium text-slate-950 transition hover:opacity-90 disabled:opacity-50"
                >
                  结束并完成今日任务
                </button>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (phase === 'preheat') {
    const currentWord = preheatWords[preheatIndex];
    return (
      <div className="h-full w-full overflow-y-auto px-4 pb-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <header className="pt-2">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Vocabulary Preheat</div>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--focus-work-text)]">真题词汇预热</h1>
            <div className="mt-2 text-sm text-[var(--focus-work-text-muted)]">
              第 {preheatIndex + 1} 个 / 共 {preheatWords.length} 个单词（来自本篇真题）
            </div>
          </header>

          <p className="text-sm leading-6 text-[var(--focus-work-text-muted)]">
            在阅读文章之前，先熟悉文章里的核心陌生词汇，这能显著提升您的阅读顺畅度。
          </p>

          <section className="rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-4xl font-semibold tracking-tight text-[var(--focus-work-text)]">{currentWord.word}</div>
                <div className="mt-3 flex gap-4 text-sm text-[var(--focus-work-text-muted)]">
                  {currentWord.us_pronunciation ? <span>US /{currentWord.us_pronunciation}/</span> : null}
                  {currentWord.uk_pronunciation ? <span>UK /{currentWord.uk_pronunciation}/</span> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRevealed((prev) => !prev)}
                className="rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-4 py-2 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)]"
              >
                {revealed ? '收起释义' : '显示释义'}
              </button>
            </div>

            {revealed ? (
              <div className="mt-8 border-t border-[var(--focus-work-border)] pt-6">
                <WordMetaPanel detail={currentWord} />
              </div>
            ) : null}
          </section>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {actions.map((action) => (
              <button
                key={action.value}
                type="button"
                disabled={isPaused}
                onClick={() => void handlePreheatSubmit(action.value)}
                className="rounded-2xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-4 text-left transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] disabled:opacity-50"
              >
                <div className="text-base font-semibold text-[var(--focus-work-text)]">{action.label}</div>
                <div className="mt-1 text-xs text-[var(--focus-work-text-faint)]">{action.hint}</div>
              </button>
            ))}
          </div>

          <div className="flex justify-between mt-4">
            <button
              type="button"
              onClick={() => setPhase('reading')}
              className="text-sm text-[var(--focus-work-text-faint)] transition hover:text-[var(--focus-work-text-muted)]"
            >
              跳过词汇预热，直接阅读原文
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = article?.questions[currentQuestionIndex];
  const questionCount = article?.questions.length ?? 0;
  const answeredCount = article?.questions.filter((q) => selectedAnswers[q.question_id]).length ?? 0;
  const questionProgressPercent = questionCount > 0 ? Math.round(((currentQuestionIndex + 1) / questionCount) * 100) : 0;
  const passageHighlight =
    'To find out if this extends to non-living beings, Laleh Quinn at the University of California, San Diego, and her colleagues tested whether rats can detect social signals from robotic rats.';

  const renderParagraphText = (text: string, paragraphNo: number) => {
    if (!evidenceHighlighted || paragraphNo !== 1 || !text.includes(passageHighlight)) return text;
    const [before, after] = text.split(passageHighlight);
    return (
      <>
        {before}
        <span className="rounded-md bg-[var(--focus-work-blue-bg)] px-2 py-1 text-[var(--focus-work-text)]">
          {passageHighlight}
        </span>
        {after}
      </>
    );
  };

  // Reading & Result layouts
  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-2 pb-2">
      <div className="mx-auto flex h-full w-full max-w-[92rem] flex-col overflow-hidden">
        {/* Header Section */}
        <div className="mb-4 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--focus-work-text)] lg:text-4xl">
              ERC PRACTICE
            </h1>
            {article ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm text-[var(--focus-work-text-muted)]">
                <span className="font-medium">
                  {article.year} 年 Text {article.text_no} · {article.title || 'Untitled Article'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] px-3 py-1 text-xs font-medium text-[var(--focus-work-blue-text)]">
                  <BarChart3 className="h-3.5 w-3.5 text-[var(--focus-work-blue-text)]" />
                  难度：中等
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] px-3 py-1 text-xs font-medium text-[var(--focus-work-blue-text)]">
                  <Clock className="h-3.5 w-3.5 text-[var(--focus-work-blue-text)]" />
                  预计用时：8-10 分钟
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] px-3 py-1 text-xs font-medium text-[var(--focus-work-blue-text)]">
                  <BarChart3 className="h-3.5 w-3.5 text-[var(--focus-work-blue-text)]" />
                  进度：{answeredCount} / {questionCount || 0}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {error ? <p className="mb-4 rounded-xl bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p> : null}

        {article ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
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
              <div ref={passageScrollRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-3">
                {article.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph.paragraph_no}
                    className="grid grid-cols-[2rem_minmax(0,1fr)] gap-6 text-[1.02rem] leading-8 text-[var(--focus-work-text)] lg:text-[1.08rem] lg:leading-9"
                  >
                    <span className="select-none text-left text-base font-bold text-[var(--focus-work-text)]">
                      {paragraph.paragraph_no}
                    </span>
                    <span className="font-serif tracking-normal">{renderParagraphText(paragraph.text, paragraph.paragraph_no)}</span>
                  </p>
                ))}
              </div>
            </article>

            {/* Current Question Card */}
            {phase === 'reading' && currentQuestion ? (
              <section className="flex flex-col justify-between shrink-0 rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-5 shadow-sm">
                <div>
                  <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-[var(--focus-work-text)] font-serif">Current Question</h2>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--focus-work-text-muted)]">
                        <span>题目 {currentQuestionIndex + 1} / {questionCount}</span>
                        <span className="h-1 w-32 overflow-hidden rounded-full bg-[var(--focus-work-surface-soft)]">
                          <span
                            className="block h-full rounded-full bg-[var(--focus-work-blue-text)] transition-all duration-300"
                            style={{ width: `${questionProgressPercent}%` }}
                          />
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--focus-work-blue-bg)] px-4 py-1 text-sm font-semibold text-[var(--focus-work-blue-text)]">
                    Q{currentQuestionIndex + 1}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 z-10">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] px-2.5 py-1.5 text-xs font-semibold text-[var(--focus-work-text)] hover:bg-[var(--focus-work-blue-bg)] transition"
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                      标记本题
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] px-2.5 py-1.5 text-xs font-semibold text-[var(--focus-work-text)] hover:bg-[var(--focus-work-blue-bg)] transition"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      查看解析
                    </button>

                    <span className="hidden sm:inline h-5 w-px bg-[var(--focus-work-border)] mx-1" />

                    <button
                      type="button"
                      disabled={currentQuestionIndex === 0}
                      onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] px-2.5 py-1.5 text-xs font-semibold text-[var(--focus-work-text-muted)] hover:text-[var(--focus-work-text)] hover:bg-[var(--focus-work-surface-soft)] transition disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      上一题
                    </button>

                    <button
                      type="button"
                      disabled={isPaused || submitting}
                      onClick={handlePracticeSubmit}
                      className="inline-flex rounded-lg bg-[var(--focus-work-blue-text)] px-4 py-1.5 text-xs font-semibold text-[var(--focus-work-primary-button-text)] shadow-sm hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? '提交中…' : '提交答案'}
                    </button>

                    <button
                      type="button"
                      disabled={currentQuestionIndex >= questionCount - 1}
                      onClick={() => setCurrentQuestionIndex((prev) => Math.min(questionCount - 1, prev + 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] px-2.5 py-1.5 text-xs font-semibold text-[var(--focus-work-blue-text)] hover:bg-[var(--focus-work-blue-bg)] transition disabled:opacity-30 disabled:pointer-events-none"
                    >
                      下一题
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-base font-bold leading-6 text-[var(--focus-work-text)] lg:text-[1.05rem] lg:leading-7">
                    {currentQuestion.stem}
                  </h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {(Object.keys(currentQuestion.options) as OptionKey[]).map((key) => {
                      const isSelected = selectedAnswers[currentQuestion.question_id] === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={isPaused}
                          onClick={() => handleSelectOption(currentQuestion.question_id, key)}
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
                          <span className="font-medium">{currentQuestion.options[key]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                </div>

              </section>
            ) : (
              <section className="rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-5 shadow-sm lg:p-6 flex flex-col min-h-0 flex-1">
                  <div className="text-center pb-5 border-b border-[var(--focus-work-border)] shrink-0">
                    <div className="text-xs uppercase tracking-widest text-[var(--focus-work-text-faint)]">Attempt Summary</div>
                    <div className="mt-2 text-4xl font-extrabold text-[var(--focus-work-text)]">
                      {submitResult?.correct_count} <span className="text-lg font-normal text-[var(--focus-work-text-muted)]">/ {submitResult?.question_count} 正确</span>
                    </div>
                  </div>

                  <div className="mt-6 space-y-6 flex-1 min-h-0 overflow-y-auto pr-1">
                    {submitResult?.items.map((item, idx) => {
                      const question = article.questions.find((q) => q.question_id === item.question_id);
                      if (!question) return null;
                      return (
                        <div key={item.question_id} className="border-b border-[var(--focus-work-border)] pb-5 last:border-b-0 last:pb-0">
                          <h3 className="text-sm font-medium text-[var(--focus-work-text)]">
                            {idx + 1}. {question.stem}
                          </h3>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] p-3">
                              <span className="text-[var(--focus-work-text-faint)] block mb-1">您的选择</span>
                              <span className={`font-semibold ${item.is_correct ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {item.chosen_option}: {question.options[item.chosen_option as OptionKey]}
                              </span>
                            </div>
                            <div className="rounded-xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] p-3">
                              <span className="text-[var(--focus-work-text-faint)] block mb-1">正确答案</span>
                              <span className="font-semibold text-emerald-400">
                                {item.correct_option}: {question.options[item.correct_option as OptionKey]}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 pt-5 border-t border-[var(--focus-work-border)] flex flex-col gap-3 shrink-0">
                    {onCompleteTaskAndFinish ? (
                      <button
                        type="button"
                        onClick={onCompleteTaskAndFinish}
                        disabled={isPaused}
                        className="w-full rounded-full bg-white py-4 text-sm font-semibold text-slate-950 transition hover:opacity-90 disabled:opacity-50"
                      >
                        标记今日真题任务为已完成
                      </button>
                    ) : null}
                  </div>
                </section>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
