import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchERCReviewNext, submitERCReview } from '../../lib/erc/api';
import type { ERCReviewNext, ERCReviewSubmitResult } from '../../lib/erc/types';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';

type OptionKey = 'A' | 'B' | 'C' | 'D';
type ERCReviewFocusWorkProps = Partial<FocusWorkRendererProps>;

export default function ERCReviewFocusWork({ onComplete }: ERCReviewFocusWorkProps) {
  const [item, setItem] = useState<ERCReviewNext | null>(null);
  const [selected, setSelected] = useState<OptionKey | null>(null);
  const [result, setResult] = useState<ERCReviewSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadNext = () => {
    setSelected(null);
    setResult(null);
    fetchERCReviewNext()
      .then((payload) => {
        setItem(payload);
        setError(null);
        if (!payload.has_item) {
          onComplete?.({ hasItem: false });
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '复习题加载失败'));
  };

  useEffect(() => {
    loadNext();
  }, []);

  const handleSubmit = async () => {
    if (!item?.question || !selected) return;
    try {
      const nextResult = await submitERCReview(item.question.question_id, selected);
      setResult(nextResult);
      setError(null);
      onComplete?.({
        questionId: item.question.question_id,
        selected,
        isCorrect: nextResult.is_correct,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto px-1 pb-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="text-sm uppercase tracking-[0.28em] text-white/45">Review</div>
            <h1 className="mt-3 text-3xl font-semibold text-white">复习池</h1>
          </div>
          <Link to="/erc" className="text-sm text-white/65 hover:text-white">
            返回首页
          </Link>
        </div>

        {error ? <p className="mb-4 text-sm text-rose-200">{error}</p> : null}

        {item && !item.has_item ? (
          <section className="rounded-2xl border border-white/10 bg-black/22 p-8">
            <h2 className="text-2xl font-semibold text-white">暂无到期复习</h2>
            <p className="mt-3 text-sm text-white/62">今天没有需要复习的阅读题，可以去题库练一篇新的文章。</p>
            <Link to="/erc/library" className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm text-slate-950">
              进入题库
            </Link>
          </section>
        ) : null}

        {item?.has_item && item.question ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <article
              aria-label="阅读原文"
              className="space-y-7 rounded-2xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/20 backdrop-blur-2xl backdrop-saturate-125 lg:p-8"
            >
              {item.paragraphs.map((paragraph) => (
                <p key={paragraph.paragraph_no} className="grid grid-cols-[2rem_minmax(0,76ch)] gap-4 text-[1.02rem] leading-9 text-white/86">
                  <span className="text-right text-sm leading-9 text-white/28">{paragraph.paragraph_no}</span>
                  <span>{paragraph.text}</span>
                </p>
              ))}
            </article>

            <section className="rounded-2xl border border-white/10 bg-black/22 p-5">
              <div className="text-sm text-white/50">
                {item.article?.year} Text {item.article?.text_no}
              </div>
              <h2 className="mt-3 text-lg font-semibold text-white">
                {item.question.question_no}. {item.question.stem}
              </h2>
              <div className="mt-5 space-y-2">
                {(Object.keys(item.question.options) as OptionKey[]).map((key) => (
                  <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 px-3 py-2 text-sm text-white/75">
                    <input
                      type="radio"
                      name={item.question?.question_id}
                      value={key}
                      aria-label={`${key} ${item.question?.options[key] ?? ''}`}
                      checked={selected === key}
                      disabled={!!result}
                      onChange={() => setSelected(key)}
                      className="mt-1"
                    />
                    <span>
                      <span className="mr-2 font-semibold text-white">{key}</span>
                      {item.question?.options[key]}
                    </span>
                  </label>
                ))}
              </div>
              {result ? (
                <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
                  {result.is_correct ? '回答正确' : `回答错误，正确答案是 ${result.correct_option}`}
                </div>
              ) : null}
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!selected || !!result}
                  className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 disabled:opacity-60"
                >
                  提交答案
                </button>
                {result ? (
                  <button type="button" onClick={loadNext} className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/82">
                    下一题
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {!item ? <p className="text-sm text-white/55">复习题加载中...</p> : null}
      </div>
    </div>
  );
}
