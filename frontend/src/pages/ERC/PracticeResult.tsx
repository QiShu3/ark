import { Link, useLocation } from 'react-router-dom';

import type { ERCArticleDetail, ERCArticleSubmitResult } from '../../lib/erc/types';

export default function ERCPracticeResult() {
  const location = useLocation();
  const state = location.state as { article?: ERCArticleDetail; result?: ERCArticleSubmitResult } | null;
  const article = state?.article;
  const result = state?.result;

  if (!article || !result) {
    return (
      <div className="fixed inset-x-1 bottom-1 top-[7.5rem] z-10 overflow-y-auto rounded-[28px] px-8 pb-10 pt-32">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-semibold text-ark-text">练习结果</h1>
          <p className="mt-4 text-ark-text-muted">没有可展示的练习结果。</p>
          <Link to="/erc/library" className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm text-slate-950">
            返回题库
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-1 bottom-1 top-[7.5rem] z-10 overflow-y-auto rounded-[28px] px-8 pb-10 pt-32">
      <div className="mx-auto max-w-5xl">
        <div className="border-b border-ark-border pb-6">
          <div className="text-sm uppercase tracking-[0.28em] text-ark-text-faint">Result</div>
          <h1 className="mt-3 text-3xl font-semibold text-ark-text">
            {article.year} Text {article.text_no}
          </h1>
          <div className="mt-4 text-5xl font-semibold text-ark-text">
            {result.correct_count} / {result.question_count}
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {result.items.map((item) => (
            <div key={item.question_id} className="rounded-2xl border border-ark-border bg-ark-surface-subtle p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-medium text-ark-text">{item.question_no}</div>
                <div className={item.is_correct ? 'text-sm text-emerald-200' : 'text-sm text-rose-200'}>
                  {item.is_correct ? '正确' : '错误'}
                </div>
              </div>
              <div className="mt-3 text-sm text-ark-text-muted">
                你的答案 {item.chosen_option} · 正确答案 {item.correct_option}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/erc/review" className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950">
            进入复习池
          </Link>
          <Link to="/erc/library" className="rounded-full border border-ark-border px-5 py-3 text-sm text-ark-text">
            继续练习
          </Link>
        </div>
      </div>
    </div>
  );
}
