import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

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
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, OptionKey>>({});
  const [submitResult, setSubmitResult] = useState<ERCArticleSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          <p className="mt-4 text-sm text-white/55">正在为您加载今日推荐真题与单词预热…</p>
        </div>
      </div>
    );
  }

  if (phase === 'empty') {
    return (
      <div className="h-full w-full overflow-y-auto px-4 pb-8">
        <div className="mx-auto max-w-2xl pt-12">
          <section className="rounded-3xl border border-white/10 bg-black/20 p-8 backdrop-blur-md">
            <h2 className="text-2xl font-semibold text-white">今日真题练习已完成</h2>
            <p className="mt-4 text-sm leading-6 text-white/60">
              太棒了！您今日推荐的真题阅读已经全部完成了。您可以前往题库自行挑选其他的阅读文章，或者完成任务进入专注时间。
            </p>
            <div className="mt-8 flex gap-3">
              {onCompleteTaskAndFinish ? (
                <button
                  type="button"
                  onClick={onCompleteTaskAndFinish}
                  disabled={isPaused}
                  className="rounded-full bg-white px-6 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:opacity-50"
                >
                  结束并完成今日任务
                </button>
              ) : null}
              <Link
                to="/erc"
                className="rounded-full border border-white/15 bg-white/6 px-6 py-3 text-sm text-white/80 transition hover:bg-white/12"
              >
                返回阅读主页
              </Link>
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
            <div className="text-xs uppercase tracking-[0.24em] text-white/40">Vocabulary Preheat</div>
            <h1 className="mt-2 text-2xl font-semibold text-white">真题词汇预热</h1>
            <div className="mt-2 text-sm text-white/60">
              第 {preheatIndex + 1} 个 / 共 {preheatWords.length} 个单词（来自本篇真题）
            </div>
          </header>

          <p className="text-sm leading-6 text-white/55">
            在阅读文章之前，先熟悉文章里的核心陌生词汇，这能显著提升您的阅读顺畅度。
          </p>

          <section className="rounded-3xl border border-white/10 bg-[#0c1015]/60 p-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-4xl font-semibold tracking-tight text-white">{currentWord.word}</div>
                <div className="mt-3 flex gap-4 text-sm text-white/50">
                  {currentWord.us_pronunciation ? <span>US /{currentWord.us_pronunciation}/</span> : null}
                  {currentWord.uk_pronunciation ? <span>UK /{currentWord.uk_pronunciation}/</span> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRevealed((prev) => !prev)}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/30"
              >
                {revealed ? '收起释义' : '显示释义'}
              </button>
            </div>

            {revealed ? (
              <div className="mt-8 border-t border-white/8 pt-6">
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
                className="rounded-2xl border border-white/10 bg-white/6 px-5 py-4 text-left transition hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
              >
                <div className="text-base font-semibold text-white">{action.label}</div>
                <div className="mt-1 text-xs text-white/45">{action.hint}</div>
              </button>
            ))}
          </div>

          <div className="flex justify-between mt-4">
            <button
              type="button"
              onClick={() => setPhase('reading')}
              className="text-sm text-white/40 transition hover:text-white/60"
            >
              跳过词汇预热，直接阅读原文
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Reading & Result layouts
  return (
    <div className="h-full w-full overflow-y-auto px-1 pb-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-white/45">ERC Practice</div>
            <h1 className="mt-3 text-3xl font-semibold text-white">今日推荐真题</h1>
            {article ? (
              <p className="mt-2 text-sm text-white/50">
                {article.year} 年 Text {article.text_no} · {article.title || 'Untitled Article'}
              </p>
            ) : null}
          </div>
          <Link to="/erc" className="text-sm text-white/60 hover:text-white">
            返回阅读主页
          </Link>
        </div>

        {error ? <p className="mb-4 rounded-xl bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p> : null}

        {article ? (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Left side: Article Text */}
            <article
              aria-label="阅读原文"
              className="space-y-6 rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-2xl lg:p-8"
            >
              <h2 className="text-xl font-bold tracking-tight text-white pb-3 border-b border-white/6">
                Reading Passage
              </h2>
              <div className="space-y-6 mt-4">
                {article.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph.paragraph_no}
                    className="grid grid-cols-[2rem_minmax(0,72ch)] gap-3 text-[1.02rem] leading-9 text-white/85"
                  >
                    <span className="text-right text-xs leading-9 font-medium text-white/25 select-none">
                      {paragraph.paragraph_no}
                    </span>
                    <span className="text-justify font-normal tracking-normal">{paragraph.text}</span>
                  </p>
                ))}
              </div>
            </article>

            {/* Right side: Questions or Results */}
            <div className="space-y-6">
              {phase === 'reading' ? (
                <section className="rounded-3xl border border-white/10 bg-[#0d1015]/40 p-5 lg:p-6 backdrop-blur-md">
                  <h2 className="text-lg font-bold text-white mb-5 border-b border-white/6 pb-3">Comprehension Questions</h2>
                  <div className="space-y-6">
                    {article.questions.map((q, idx) => (
                      <div key={q.question_id} className="border-b border-white/6 pb-5 last:border-b-0 last:pb-0">
                        <h3 className="text-base font-semibold text-white/90">
                          {idx + 1}. {q.stem}
                        </h3>
                        <div className="mt-4 space-y-2">
                          {(Object.keys(q.options) as OptionKey[]).map((key) => {
                            const isSelected = selectedAnswers[q.question_id] === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                disabled={isPaused}
                                onClick={() => handleSelectOption(q.question_id, key)}
                                className={`w-full flex items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                                  isSelected
                                    ? 'border-indigo-500/80 bg-indigo-500/10 text-indigo-200'
                                    : 'border-white/6 bg-white/4 text-white/70 hover:border-white/15 hover:bg-white/6'
                                }`}
                              >
                                <span
                                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                    isSelected
                                      ? 'bg-indigo-500 text-white'
                                      : 'bg-white/8 text-white/60'
                                  }`}
                                >
                                  {key}
                                </span>
                                <span>{q.options[key]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/6">
                    <button
                      type="button"
                      disabled={isPaused || submitting}
                      onClick={handlePracticeSubmit}
                      className="w-full rounded-full bg-white py-4 text-sm font-semibold text-slate-950 shadow-lg shadow-white/5 transition hover:bg-white/90 disabled:opacity-60"
                    >
                      {submitting ? '提交中…' : '提交今日真题解答'}
                    </button>
                  </div>
                </section>
              ) : (
                <section className="rounded-3xl border border-white/10 bg-[#0d1015]/60 p-5 lg:p-6 shadow-2xl backdrop-blur-md">
                  <div className="text-center pb-5 border-b border-white/8">
                    <div className="text-xs uppercase tracking-widest text-white/40">Attempt Summary</div>
                    <div className="mt-2 text-4xl font-extrabold text-white">
                      {submitResult?.correct_count} <span className="text-lg font-normal text-white/50">/ {submitResult?.question_count} 正确</span>
                    </div>
                  </div>

                  <div className="mt-6 space-y-6 max-h-[50vh] overflow-y-auto pr-1">
                    {submitResult?.items.map((item, idx) => {
                      const question = article.questions.find((q) => q.question_id === item.question_id);
                      if (!question) return null;
                      return (
                        <div key={item.question_id} className="border-b border-white/6 pb-5 last:border-b-0 last:pb-0">
                          <h3 className="text-sm font-medium text-white/90">
                            {idx + 1}. {question.stem}
                          </h3>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl border border-white/6 bg-white/4 p-3">
                              <span className="text-white/40 block mb-1">您的选择</span>
                              <span className={`font-semibold ${item.is_correct ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {item.chosen_option}: {question.options[item.chosen_option as OptionKey]}
                              </span>
                            </div>
                            <div className="rounded-xl border border-white/6 bg-white/4 p-3">
                              <span className="text-white/40 block mb-1">正确答案</span>
                              <span className="font-semibold text-emerald-400">
                                {item.correct_option}: {question.options[item.correct_option as OptionKey]}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 pt-5 border-t border-white/8 flex flex-col gap-3">
                    {onCompleteTaskAndFinish ? (
                      <button
                        type="button"
                        onClick={onCompleteTaskAndFinish}
                        disabled={isPaused}
                        className="w-full rounded-full bg-white py-4 text-sm font-semibold text-slate-950 transition hover:bg-white/90 disabled:opacity-50"
                      >
                        标记今日真题任务为已完成
                      </button>
                    ) : null}
                    <Link
                      to="/erc"
                      className="w-full rounded-full border border-white/14 bg-white/6 py-4 text-center text-sm font-semibold text-white/90 transition hover:bg-white/10"
                    >
                      返回阅读主页
                    </Link>
                  </div>
                </section>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
