import React from 'react';

import { apiJson } from '../../lib/api';
import type { Task } from '../taskTypes';
import { formatClockTime } from '../workflowProgress';
import type { FocusWorkRendererProps } from './focusWorkTypes';

type TaskFocusWorkProps = Partial<FocusWorkRendererProps>;

function PauseOverlay({ onResume }: { onResume?: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="w-[min(28rem,92vw)] rounded-[2rem] border border-white/12 bg-[#0c1016]/92 p-8 text-center shadow-2xl">
        <div className="text-xs uppercase tracking-[0.24em] text-white/35">Paused</div>
        <h2 className="mt-4 text-3xl font-semibold text-white">已暂停</h2>
        <p className="mt-3 text-sm leading-6 text-white/60">当前专注阶段已暂停，继续后会从当前这一轮接着计时。</p>
        <button
          type="button"
          onClick={onResume}
          className="mt-8 rounded-full bg-white px-6 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90"
        >
          继续专注
        </button>
      </div>
    </div>
  );
}

export default function TaskFocusWork({
  workflow,
  onPause,
  onResume,
  onComplete,
  onCompleteTaskAndFinish,
  onAbandon,
}: TaskFocusWorkProps) {
  const [task, setTask] = React.useState<Task | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const taskId = workflow?.task_id;
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
  }, [workflow?.task_id]);

  const timerText = React.useMemo(() => {
    if (typeof workflow?.remaining_seconds === 'number') {
      return formatClockTime(workflow.remaining_seconds);
    }
    if (typeof workflow?.elapsed_seconds === 'number') {
      return formatClockTime(workflow.elapsed_seconds);
    }
    return '00:00';
  }, [workflow?.elapsed_seconds, workflow?.remaining_seconds]);

  const title = workflow?.task_title ?? task?.title ?? '未命名任务';
  const content = task?.content?.trim() ?? '';
  const tags = Array.isArray(task?.tags) ? task.tags : [];
  const cycleText = task && task.target_cycle_count > 0
    ? `${task.current_cycle_count}/${task.target_cycle_count} 次`
    : null;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_40%)]" aria-hidden="true" />

      <main className="relative mx-auto flex h-full w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="text-xs uppercase tracking-[0.24em] text-white/35">Task Focus</div>
        <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold leading-tight text-white md:text-5xl">
          {title}
        </h1>
        <p className="mt-8 font-mono text-6xl font-semibold tracking-tight text-white md:text-7xl">{timerText}</p>
        <div className="mt-4 text-sm text-white/52">{workflow?.is_paused ? '当前专注已暂停' : '专注中'}</div>

        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          className="mt-10 rounded-full border border-white/14 bg-white/8 px-4 py-2 text-sm text-white/80 transition hover:border-white/24 hover:bg-white/12"
        >
          {detailsOpen ? '收起任务细节' : '查看任务细节'}
        </button>

        {detailsOpen ? (
          <section className="mt-6 w-full max-w-2xl rounded-[1.75rem] border border-white/10 bg-black/24 p-5 text-left shadow-xl">
            {error ? <p className="text-sm text-rose-200">{error}</p> : null}
            {content ? (
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/35">内容</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-white/78">{content}</p>
              </div>
            ) : (
              <p className="text-sm text-white/48">这个任务还没有补充说明。</p>
            )}
            {tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs text-white/68">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
            {cycleText ? <div className="mt-4 text-xs text-white/45">周期进度：{cycleText}</div> : null}
          </section>
        ) : null}
      </main>

      <footer className="relative flex flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-black/18 px-6 py-5">
        {!workflow?.is_paused ? (
          <button
            type="button"
            onClick={onPause}
            className="rounded-full border border-white/14 bg-white/8 px-5 py-3 text-sm text-white/80 transition hover:border-white/24 hover:bg-white/12"
          >
            暂停专注
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onComplete?.({ taskId: workflow?.task_id ?? null })}
          className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90"
        >
          完成本轮专注
        </button>
        <button
          type="button"
          onClick={onCompleteTaskAndFinish}
          className="rounded-full border border-emerald-300/24 bg-emerald-300/12 px-5 py-3 text-sm text-emerald-50 transition hover:bg-emerald-300/18"
        >
          完成任务并结束专注
        </button>
        <button
          type="button"
          onClick={() => onAbandon?.({ taskId: workflow?.task_id ?? null })}
          className="rounded-full border border-rose-300/22 bg-rose-300/10 px-5 py-3 text-sm text-rose-100 transition hover:bg-rose-300/16"
        >
          放弃本阶段
        </button>
      </footer>

      {workflow?.is_paused ? <PauseOverlay onResume={onResume} /> : null}
    </div>
  );
}
