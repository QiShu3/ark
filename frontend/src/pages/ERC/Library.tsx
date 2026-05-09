import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchERCArticles, fetchERCSets } from '../../lib/erc/api';
import type { ERCArticleListItem, ERCSet } from '../../lib/erc/types';

const statusLabel: Record<ERCArticleListItem['status'], string> = {
  unstarted: '未练',
  practiced: '已练',
  has_due_review: '待复习',
};

export default function ERCLibrary() {
  const [articles, setArticles] = useState<ERCArticleListItem[]>([]);
  const [sets, setSets] = useState<ERCSet[]>([]);
  const [activeExam, setActiveExam] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchERCSets()
      .then((payload) => {
        if (cancelled) return;
        setSets(payload);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '题库分类加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchERCArticles(activeExam ? { exam: activeExam } : {})
      .then((payload) => {
        if (cancelled) return;
        setArticles(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '题库加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [activeExam]);

  const examOptions = Array.from(new Set(sets.map((set) => set.exam).filter(Boolean)));

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-8 pb-10 pt-20">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="text-sm uppercase tracking-[0.28em] text-white/45">Library</div>
            <h1 className="mt-3 text-3xl font-semibold text-white">阅读题库</h1>
          </div>
          <Link to="/erc" className="text-sm text-white/65 hover:text-white">
            返回首页
          </Link>
        </div>

        {error ? <p className="mt-6 text-sm text-rose-200">{error}</p> : null}

        <div className="mt-6 flex flex-wrap gap-2" aria-label="考试分类">
          {['', ...examOptions].map((exam) => {
            const label = exam || '全部';
            const isActive = activeExam === exam;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setActiveExam(exam)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  isActive
                    ? 'border-white bg-white text-slate-950'
                    : 'border-white/12 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {articles.map((article) => (
            <Link
              key={article.article_id}
              to={`/erc/articles/${article.article_id}/practice`}
              className="rounded-2xl border border-white/10 bg-black/22 p-5 transition hover:border-white/25 hover:bg-black/30"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="text-lg font-semibold text-white">
                  {article.year} Text {article.text_no}
                </div>
                <span className="rounded-full border border-white/12 px-3 py-1 text-xs text-white/70">
                  {statusLabel[article.status]}
                </span>
              </div>
              <div className="mt-3 text-sm text-white/55">
                {article.question_count} 题 · 错题 {article.mistake_count}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
