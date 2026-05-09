import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { fetchERCArticle, submitERCArticle } from '../../lib/erc/api';
import type { ERCArticleDetail, ERCPracticeAnswer } from '../../lib/erc/types';

type OptionKey = 'A' | 'B' | 'C' | 'D';

export default function ERCPractice() {
  const { articleId = '' } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState<ERCArticleDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, OptionKey>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-6 pb-10 pt-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.28em] text-white/45">Practice</div>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              {article ? `${article.year} Text ${article.text_no}` : '整篇练习'}
            </h1>
          </div>
          <Link to="/erc/library" className="text-sm text-white/65 hover:text-white">
            返回题库
          </Link>
        </div>

        {error ? <p className="mb-4 rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

        {article ? (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <article className="space-y-5 border-r border-white/10 pr-0 lg:pr-6">
              {article.paragraphs.map((paragraph) => (
                <p key={paragraph.paragraph_no} className="text-base leading-8 text-white/76">
                  <span className="mr-3 text-sm text-white/35">{paragraph.paragraph_no}</span>
                  {paragraph.text}
                </p>
              ))}
            </article>

            <section className="space-y-5">
              {article.questions.map((question) => (
                <fieldset key={question.question_id} className="rounded-2xl border border-white/10 bg-black/22 p-5">
                  <legend className="text-base font-medium text-white">
                    {question.question_no}. {question.stem}
                  </legend>
                  <div className="mt-4 space-y-2">
                    {(Object.keys(question.options) as OptionKey[]).map((key) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 px-3 py-2 text-sm text-white/75 transition hover:border-white/18 hover:bg-white/5"
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
                          <span className="mr-2 font-semibold text-white">{key}</span>
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
          <p className="text-sm text-white/55">文章加载中...</p>
        )}
      </div>
    </div>
  );
}
