import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { AppTaskStatus } from '../../components/taskTypes';
import { apiJson } from '../../lib/api';
import { fetchERCAppTaskStatus, fetchERCOverview, initializeERCAppTask } from '../../lib/erc/api';
import type { ERCOverview } from '../../lib/erc/types';

export default function ERCHome() {
  const [overview, setOverview] = useState<ERCOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appTaskStatus, setAppTaskStatus] = useState<AppTaskStatus | null>(null);
  const [appTaskBusy, setAppTaskBusy] = useState(false);
  const [appTaskError, setAppTaskError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchERCOverview()
      .then((payload) => {
        if (cancelled) return;
        setOverview(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '阅读训练加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchERCAppTaskStatus()
      .then((payload) => {
        if (cancelled) return;
        setAppTaskStatus(payload);
        setAppTaskError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAppTaskError(err instanceof Error ? err.message : 'ERC 任务状态加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const accuracy = overview ? Math.round(overview.accuracy * 100) : 0;
  const initializeReviewTask = async () => {
    setAppTaskBusy(true);
    try {
      const payload = await initializeERCAppTask({
        review_scope: 'due',
        daily_question_target: 10,
        default_focus_duration: 1500,
        add_to_today_plan: true,
      });
      setAppTaskStatus(payload);
      setAppTaskError(null);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '初始化 ERC 复习失败');
    } finally {
      setAppTaskBusy(false);
    }
  };

  const startReviewFocusWork = async () => {
    if (!appTaskStatus?.task_id) return;
    setAppTaskBusy(true);
    try {
      await apiJson(`/todo/tasks/${appTaskStatus.task_id}/focus/start`, { method: 'POST' });
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      setAppTaskError(null);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '开始 ERC 复习失败');
    } finally {
      setAppTaskBusy(false);
    }
  };

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-8 pb-10 pt-20">
      <div className="mx-auto max-w-6xl">
        <section className="border-b border-white/10 pb-8">
          <div className="text-sm uppercase tracking-[0.28em] text-white/45">ERC</div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">阅读训练</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/68">
            围绕整篇阅读练习和单题复习，把做过的阅读理解沉淀成长期复习资产。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/erc/library" className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950">
              进入题库
            </Link>
            {appTaskStatus?.state === 'uninitialized' ? (
              <button
                type="button"
                onClick={initializeReviewTask}
                disabled={appTaskBusy}
                className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm text-white/86 shadow-lg shadow-black/10 backdrop-blur-xl backdrop-saturate-150 transition hover:border-white/25 hover:bg-white/16 hover:text-white disabled:opacity-60"
              >
                初始化 ERC 复习
              </button>
            ) : (
              <button
                type="button"
                onClick={startReviewFocusWork}
                disabled={!appTaskStatus?.task_id || appTaskBusy || appTaskStatus?.state === 'completed_today'}
                className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm text-white/86 shadow-lg shadow-black/10 backdrop-blur-xl backdrop-saturate-150 transition hover:border-white/25 hover:bg-white/16 hover:text-white disabled:opacity-60"
              >
                {appTaskStatus?.state === 'completed_today' ? '今日已完成' : '开始复习'}
              </button>
            )}
            <Link
              to="/erc/mistakes"
              className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm text-white/86 shadow-lg shadow-black/10 backdrop-blur-xl backdrop-saturate-150 transition hover:border-white/25 hover:bg-white/16 hover:text-white"
            >
              查看错题
            </Link>
          </div>
        </section>

        {error ? <p className="mt-6 text-sm text-rose-200">{error}</p> : null}
        {appTaskError ? <p className="mt-6 text-sm text-rose-200">{appTaskError}</p> : null}

        {overview ? (
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-sm text-white/55">今日待复习</div>
              <div className="mt-3 text-4xl font-semibold text-white">{overview.due_review_count}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-sm text-white/55">已练文章</div>
              <div className="mt-3 text-4xl font-semibold text-white">{overview.practiced_article_count}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-sm text-white/55">正确率</div>
              <div className="mt-3 text-4xl font-semibold text-white">{accuracy}%</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-sm text-white/55">错题</div>
              <div className="mt-3 text-4xl font-semibold text-white">{overview.mistake_count}</div>
            </div>
          </div>
        ) : (
          <p className="mt-8 text-sm text-white/55">阅读训练加载中...</p>
        )}

        {overview?.recommended_article ? (
          <section className="mt-8 border-t border-white/10 pt-6">
            <div className="text-sm text-white/55">推荐练习</div>
            <Link
              to={`/erc/articles/${overview.recommended_article.article_id}/practice`}
              className="mt-3 inline-flex rounded-full border border-white/15 px-5 py-3 text-sm text-white/82"
            >
              {overview.recommended_article.year} Text {overview.recommended_article.text_no}
            </Link>
          </section>
        ) : null}
      </div>
    </div>
  );
}
