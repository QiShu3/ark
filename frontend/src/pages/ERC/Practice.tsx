import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import SubAppPageShell from '../../components/SubAppPageShell';
import ReviewResultPanel from '../../components/Vocab/ReviewResultPanel';
import StudyCard from '../../components/Vocab/StudyCard';
import { fetchERCArticle, fetchERCVocabularyPreheat, submitERCArticle, submitERCVocabularyPreheat } from '../../lib/erc/api';
import type { ERCArticleDetail, ERCPracticeAnswer } from '../../lib/erc/types';
import type { VocabReviewItem, VocabReviewSubmitResult } from '../../lib/vocab/types';

type OptionKey = 'A' | 'B' | 'C' | 'D';

const vocabularyStateLabel: Record<string, string> = {
  learning: '学习中',
  unstarted: '未学',
  unknown: '词库外',
};

const preheatActions: Array<{ label: string; hint: string; value: 'again' | 'hard' | 'good' | 'easy' }> = [
  { label: '没记住', hint: '稍后再看', value: 'again' },
  { label: '有点难', hint: '短间隔复习', value: 'hard' },
  { label: '记住了', hint: '进入复习', value: 'good' },
  { label: '很轻松', hint: '延后再看', value: 'easy' },
];

export default function ERCPractice() {
  const { articleId = '' } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState<ERCArticleDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, OptionKey>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preheatStarted, setPreheatStarted] = useState(false);
  const [preheatLoading, setPreheatLoading] = useState(false);
  const [preheatSubmitting, setPreheatSubmitting] = useState(false);
  const [preheatItems, setPreheatItems] = useState<VocabReviewItem[]>([]);
  const [preheatResult, setPreheatResult] = useState<VocabReviewSubmitResult | null>(null);
  const [preheatError, setPreheatError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchERCArticle(articleId)
      .then((payload) => {
        if (cancelled) return;
        setArticle(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '文章加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  useEffect(() => {
    setPreheatStarted(false);
    setPreheatItems([]);
    setPreheatResult(null);
    setPreheatError(null);
  }, [articleId]);

  const unansweredCount = useMemo(() => {
    if (!article) return 0;
    return article.questions.filter((question) => !answers[question.question_id]).length;
  }, [answers, article]);

  const handleSubmit = async () => {
    if (!article) return;
    if (unansweredCount > 0) {
      setError(`还有 ${unansweredCount} 道题未作答`);
      return;
    }
    setSubmitting(true);
    try {
      const payload: ERCPracticeAnswer[] = article.questions.map((question) => ({
        question_id: question.question_id,
        chosen_option: answers[question.question_id],
      }));
      const result = await submitERCArticle(article.article_id, payload);
      navigate(`/erc/articles/${article.article_id}/result`, { state: { article, result } });
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartPreheat = async () => {
    if (!article) return;
    setPreheatLoading(true);
    try {
      const payload = await fetchERCVocabularyPreheat(article.article_id);
      setPreheatItems(payload);
      setPreheatStarted(true);
      setPreheatError(null);
      setPreheatResult(null);
    } catch (err) {
      setPreheatError(err instanceof Error ? err.message : '预热单词加载失败');
    } finally {
      setPreheatLoading(false);
    }
  };

  const handleSubmitPreheat = async (result: 'again' | 'hard' | 'good' | 'easy') => {
    if (!article || preheatItems.length === 0) return;
    const currentItem = preheatItems[0];
    setPreheatSubmitting(true);
    try {
      const payload = await submitERCVocabularyPreheat(article.article_id, {
        deck_id: currentItem.deck_id,
        word_id: currentItem.id,
        result,
        prompt_type: currentItem.prompt_type,
      });
      setPreheatResult(payload);
      setPreheatError(null);
      setPreheatItems((prev) => (payload.should_repeat_today ? [...prev.slice(1), currentItem] : prev.slice(1)));
    } catch (err) {
      setPreheatError(err instanceof Error ? err.message : '预热结果提交失败');
    } finally {
      setPreheatSubmitting(false);
    }
  };

  const currentPreheatItem = preheatItems[0] ?? null;

  return (
    <SubAppPageShell maxWidth="7xl" paddingX="6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.28em] text-ark-text-faint">Practice</div>
            <h1 className="mt-2 text-2xl font-semibold text-ark-text">
              {article ? `${article.year} Text ${article.text_no}` : '整篇练习'}
            </h1>
          </div>
          <Link to="/erc/library" className="text-sm text-ark-text-muted hover:text-ark-text">
            返回题库
          </Link>
        </div>

        {error ? <p className="mb-4 rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

        {article ? (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <article
              aria-label="阅读原文"
              className="space-y-7 rounded-2xl border border-ark-border bg-ark-surface-subtle p-6 shadow-2xl shadow-black/20 backdrop-blur-2xl backdrop-saturate-125 lg:p-8"
            >
              {article.paragraphs.map((paragraph) => (
                <p key={paragraph.paragraph_no} className="grid grid-cols-[2rem_minmax(0,76ch)] gap-4 text-[1.02rem] leading-9 text-ark-text">
                  <span className="text-right text-sm leading-9 text-ark-text-faint">{paragraph.paragraph_no}</span>
                  <span>{paragraph.text}</span>
                </p>
              ))}
            </article>

            <section className="space-y-5">
              {article.vocabulary_summary && article.vocabulary_summary.total_word_count > 0 ? (
                <section className="rounded-2xl border border-ark-border bg-ark-surface-subtle p-5 backdrop-blur-xl">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <div className="text-sm text-ark-text-muted">阅读前词汇预热</div>
                      <div className="mt-2 text-2xl font-semibold text-ark-text">
                        {Math.round(article.vocabulary_summary.mastery_rate * 100)}%
                        <span className="ml-2 text-sm font-normal text-ark-text-muted">已掌握</span>
                      </div>
                    </div>
                    <div className="text-right text-sm text-ark-text-muted">
                      预计生词 {article.vocabulary_summary.unfamiliar_count} / {article.vocabulary_summary.total_word_count}
                    </div>
                  </div>

                  {article.vocabulary_summary.preview_words.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {article.vocabulary_summary.preview_words.map((item) => (
                        <span
                          key={`${item.word}-${item.state}`}
                          className="rounded-full border border-ark-border bg-ark-surface-subtle px-3 py-1 text-xs text-ark-text"
                          title={vocabularyStateLabel[item.state] ?? item.state}
                        >
                          {item.word}
                          <span className="ml-2 text-ark-text-faint">{vocabularyStateLabel[item.state] ?? item.state}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-ark-text-muted">这篇文章的预习词已经全部掌握，可以直接开练。</p>
                  )}

                  {article.vocabulary_summary.unfamiliar_count > 0 ? (
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleStartPreheat}
                        disabled={preheatLoading}
                        className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-ark-surface-subtle disabled:opacity-60"
                      >
                        {preheatLoading ? '加载中...' : '先预热单词'}
                      </button>
                      <span className="text-xs text-ark-text-faint">预热结果会同步到背单词进度</span>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {preheatError ? (
                <p className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{preheatError}</p>
              ) : null}

              {preheatStarted ? (
                <section className="space-y-4">
                  {currentPreheatItem ? (
                    <>
                      <div className="flex items-center justify-between gap-4 text-sm text-ark-text-muted">
                        <span>预热词 {preheatItems.length} 个待完成</span>
                        <button
                          type="button"
                          onClick={() => setPreheatStarted(false)}
                          className="text-ark-text-muted transition hover:text-ark-text"
                        >
                          收起
                        </button>
                      </div>
                      <StudyCard key={currentPreheatItem.id} item={currentPreheatItem} />
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {preheatActions.map((action) => (
                          <button
                            key={action.value}
                            type="button"
                            disabled={preheatSubmitting}
                            onClick={() => void handleSubmitPreheat(action.value)}
                            className="rounded-2xl border border-ark-border bg-ark-surface-subtle px-4 py-3 text-left transition hover:border-ark-border hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <div className="text-sm font-medium text-ark-text">{action.label}</div>
                            <div className="mt-1 text-xs text-ark-text-muted">{action.hint}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm text-emerald-50">
                      预热完成，可以开始做题。
                    </div>
                  )}
                  {preheatResult ? <ReviewResultPanel result={preheatResult} /> : null}
                </section>
              ) : null}

              {article.questions.map((question) => (
                <fieldset key={question.question_id} className="rounded-2xl border border-ark-border bg-ark-surface-subtle p-5">
                  <legend className="text-base font-medium text-ark-text">
                    {question.question_no}. {question.stem}
                  </legend>
                  <div className="mt-4 space-y-2">
                    {(Object.keys(question.options) as OptionKey[]).map((key) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-ark-border px-3 py-2 text-sm text-ark-text transition hover:border-ark-border hover:bg-ark-surface-subtle"
                      >
                        <input
                          type="radio"
                          name={question.question_id}
                          value={key}
                          aria-label={`${key} ${question.options[key]}`}
                          checked={answers[question.question_id] === key}
                          onChange={() => setAnswers((prev) => ({ ...prev, [question.question_id]: key }))}
                          className="mt-1"
                        />
                        <span>
                          <span className="mr-2 font-semibold text-ark-text">{key}</span>
                          {question.options[key]}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 disabled:opacity-60"
              >
                {submitting ? '提交中...' : '提交整篇'}
              </button>
            </section>
          </div>
        ) : (
          <p className="text-sm text-ark-text-muted">文章加载中...</p>
        )}
    </SubAppPageShell>
  );
}
