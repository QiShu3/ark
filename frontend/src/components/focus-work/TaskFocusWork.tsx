import React from 'react';

import { apiJson } from '../../lib/api';
import type { Task } from '../taskTypes';
import type { FocusWorkRendererProps } from './focusWorkTypes';

type TaskFocusWorkProps = FocusWorkRendererProps;

export default function TaskFocusWork({
  run,
  disabled,
  onContentCompleted,
}: TaskFocusWorkProps) {
  const [task, setTask] = React.useState<Task | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const taskId = run.task_id;
    if (!taskId) {
      setTask(null);
      return;
    }
    void apiJson<Task>(`/todo/tasks/${taskId}`)
      .then((next) => {
        if (cancelled) return;
        setTask(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '任务详情加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [run.task_id]);

  const title = task?.title ?? String(run.config_snapshot?.task_title ?? '未命名任务');
  const content = task?.content?.trim() ?? '';
  const cycleText = task && task.target_cycle_count > 0
    ? `${task.current_cycle_count}/${task.target_cycle_count} 次`
    : null;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_40%)]" aria-hidden="true" />

      <main className="relative mx-auto flex h-full w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Task Focus</div>
        <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold leading-tight text-[var(--focus-work-text)] md:text-5xl">
          {title}
        </h1>
        <div className="mt-4 text-sm text-[var(--focus-work-text-muted)]">{disabled ? '当前专注已暂停' : '专注中'}</div>

        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          className="mt-10 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-4 py-2 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)]"
        >
          {detailsOpen ? '收起任务细节' : '查看任务细节'}
        </button>

        {detailsOpen ? (
          <section className="mt-6 w-full max-w-2xl rounded-[1.75rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-5 text-left shadow-xl">
            {error ? <p className="text-sm text-rose-200">{error}</p> : null}
            {content ? (
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--focus-work-text-faint)]">内容</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--focus-work-text)]">{content}</p>
              </div>
            ) : (
              <p className="text-sm text-[var(--focus-work-text-faint)]">这个任务还没有补充说明。</p>
            )}
            {cycleText ? <div className="mt-4 text-xs text-[var(--focus-work-text-faint)]">周期进度：{cycleText}</div> : null}
          </section>
        ) : null}
      </main>

      <footer className="relative flex flex-wrap items-center justify-center gap-3 border-t border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] px-6 py-5">
        <button
          type="button"
          onClick={() => onContentCompleted({ task_id: run.task_id ?? null })}
          disabled={disabled}
          className="rounded-full border border-emerald-300/24 bg-emerald-300/12 px-5 py-3 text-sm text-emerald-50 transition hover:bg-emerald-300/18"
        >
          完成本轮内容
        </button>
      </footer>
    </div>
  );
}
