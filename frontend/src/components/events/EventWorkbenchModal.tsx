import { useEffect, useState } from 'react';

import { generateEventPlanDraft, getEventWorkbench } from '../../lib/events/api';
import type { EventItem, EventWorkbench } from '../../lib/events/types';

type EventWorkbenchModalProps = {
  event: EventItem;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EventWorkbenchModal({ event, onClose, onChanged }: EventWorkbenchModalProps) {
  const [workbench, setWorkbench] = useState<EventWorkbench | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getEventWorkbench(event.id)
      .then((data) => {
        if (cancelled) return;
        setWorkbench(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '事件工作台加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  async function handleGenerate(): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const nextWorkbench = await generateEventPlanDraft(event.id);
      setWorkbench(nextWorkbench);
      await Promise.resolve(onChanged?.());
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成正式安排失败');
    } finally {
      setSubmitting(false);
    }
  }

  const currentEvent = workbench?.event ?? event;
  const draftItems = workbench?.plan_draft?.items ?? [];
  const taskDrafts = draftItems.filter((item) => item.kind === 'task');
  const appointmentDrafts = draftItems.filter((item) => item.kind === 'appointment');

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 px-5 py-20 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="事件工作台"
      onClick={onClose}
    >
      <div
        className="flex h-[calc(100vh-7rem)] w-[1120px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f16] text-white shadow-2xl"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-white/[0.04] px-5">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-white/45">事件工作台</div>
            <h2 className="mt-1 text-xl font-semibold">{currentEvent.name}</h2>
          </div>
          <button
            type="button"
            className="rounded-full px-3 py-2 text-white/60 hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="关闭事件工作台"
          >
            关闭
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <div className="text-white/50">加载中...</div> : null}
          {error ? <div className="mb-4 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">事件总览</h3>
                <div className="mt-3 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
                  <div>开始日期 {currentEvent.start_date}</div>
                  <div>截止时间 {formatDateTime(currentEvent.due_at)}</div>
                  <div>{currentEvent.is_primary ? '主事件' : '非主事件'}</div>
                  <div>创建于 {formatDateTime(currentEvent.created_at)}</div>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">计划草稿</h3>
                  <p className="mt-1 text-sm text-white/50">模板套用后会先进入这里，生成前不会出现在任务或日程里。</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={submitting || draftItems.length === 0}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? '生成中...' : '生成正式安排'}
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <h4 className="text-sm font-medium text-blue-200">任务草稿</h4>
                  <div className="mt-2 grid gap-2">
                    {taskDrafts.length ? taskDrafts.map((item) => (
                      <div key={item.id} className="rounded-lg bg-white/[0.05] px-3 py-2 text-sm">
                        {item.title}
                      </div>
                    )) : <div className="text-sm text-white/40">暂无任务草稿</div>}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-teal-200">日程草稿</h4>
                  <div className="mt-2 grid gap-2">
                    {appointmentDrafts.length ? appointmentDrafts.map((item) => (
                      <div key={item.id} className="rounded-lg bg-white/[0.05] px-3 py-2 text-sm">
                        {item.title}
                      </div>
                    )) : <div className="text-sm text-white/40">暂无日程草稿</div>}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="text-base font-semibold">已创建安排</h3>
              <div className="mt-4 grid gap-3">
                <div>
                  <h4 className="text-sm font-medium text-blue-200">已创建任务</h4>
                  <div className="mt-2 grid gap-2">
                    {workbench?.created_tasks.length ? workbench.created_tasks.map((task) => (
                      <div key={task.id} className="rounded-lg bg-white/[0.05] px-3 py-2 text-sm">
                        {task.title}
                      </div>
                    )) : <div className="text-sm text-white/40">暂无已创建任务</div>}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-teal-200">已创建日程</h4>
                  <div className="mt-2 grid gap-2">
                    {workbench?.created_appointments.length ? workbench.created_appointments.map((appointment) => (
                      <div key={appointment.id} className="rounded-lg bg-white/[0.05] px-3 py-2 text-sm">
                        {appointment.title}
                      </div>
                    )) : <div className="text-sm text-white/40">暂无已创建日程</div>}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h3 className="text-base font-semibold">成就摘要</h3>
            <p className="mt-2 text-sm text-white/50">第一版沿用现有自动成就，后续会接入更完整的成就浏览。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
