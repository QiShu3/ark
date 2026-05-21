import { useEffect, useState } from 'react';

import type { AchievementSummary } from '../achievementTypes';
import { apiJson } from '../../lib/api';
import { formatEventDateTime, fromDateTimeLocalValue, toDateTimeLocalValue } from '../../lib/events/dateTime';
import {
  deleteEvent as deleteEventById,
  getEventWorkbench,
  updateEvent,
} from '../../lib/events/api';
import {
  createEventArrangementAppointment,
  createEventArrangementTask,
  deleteEventArrangementAppointment,
  deleteEventArrangementTask,
  updateEventArrangementAppointment,
  updateEventArrangementTask,
} from '../../lib/events/arrangementApi';
import type { EventItem, EventWorkbench } from '../../lib/events/types';
import type { Appointment, Task } from '../taskTypes';

type EventWorkbenchModalProps = {
  event: EventItem;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

type EventEditFormState = {
  name: string;
  startDate: string;
  dueAt: string;
  isPrimary: boolean;
};

type ArrangementKind = 'task' | 'appointment';

type EditingArrangement =
  | { kind: 'task'; item: Task }
  | { kind: 'appointment'; item: Appointment };

const EMPTY_EVENT_EDIT_FORM: EventEditFormState = {
  name: '',
  startDate: '',
  dueAt: '',
  isPrimary: false,
};

export default function EventWorkbenchModal({ event, onClose, onChanged }: EventWorkbenchModalProps) {
  const [workbench, setWorkbench] = useState<EventWorkbench | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingArrangement, setEditingArrangement] = useState<EditingArrangement | null>(null);
  const [newArrangementKind, setNewArrangementKind] = useState<ArrangementKind | null>(null);
  const [arrangementTitle, setArrangementTitle] = useState('');
  const [arrangementContent, setArrangementContent] = useState('');
  const [arrangementTime, setArrangementTime] = useState('');
  const [achievementSummary, setAchievementSummary] = useState<AchievementSummary | null>(null);
  const [loadingAchievement, setLoadingAchievement] = useState(false);
  const [editingEventDetails, setEditingEventDetails] = useState(false);
  const [eventEditForm, setEventEditForm] = useState<EventEditFormState>(EMPTY_EVENT_EDIT_FORM);
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
        setError(err instanceof Error ? err.message : '安排加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  useEffect(() => {
    let cancelled = false;
    setLoadingAchievement(true);
    void apiJson<AchievementSummary>(`/todo/achievements/summary?event_id=${event.id}`)
      .then((data) => {
        if (cancelled) return;
        setAchievementSummary(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load event achievement summary', err);
        setAchievementSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingAchievement(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  function cancelArrangementEditor(): void {
    setEditingArrangement(null);
    setNewArrangementKind(null);
    setArrangementTitle('');
    setArrangementContent('');
    setArrangementTime('');
  }

  function beginAddArrangement(kind: ArrangementKind): void {
    setEditingArrangement(null);
    setNewArrangementKind(kind);
    setArrangementTitle('');
    setArrangementContent('');
    setArrangementTime('');
    setError(null);
  }

  function beginEditArrangement(next: EditingArrangement): void {
    setEditingArrangement(next);
    setNewArrangementKind(null);
    setArrangementTitle(next.item.title);
    setArrangementContent(next.item.content ?? '');
    setArrangementTime(toDateTimeLocalValue(next.kind === 'appointment' ? next.item.ends_at : next.item.due_date));
    setError(null);
  }

  function appendTask(task: Task): void {
    setWorkbench((current) => (
      current
        ? {
          ...current,
          created_tasks: current.created_tasks.some((item) => item.id === task.id)
            ? current.created_tasks.map((item) => (item.id === task.id ? task : item))
            : [...current.created_tasks, task],
        }
        : current
    ));
  }

  function replaceTask(task: Task): void {
    setWorkbench((current) => (
      current
        ? { ...current, created_tasks: current.created_tasks.map((item) => (item.id === task.id ? task : item)) }
        : current
    ));
  }

  function removeTask(taskId: string): void {
    setWorkbench((current) => (
      current ? { ...current, created_tasks: current.created_tasks.filter((item) => item.id !== taskId) } : current
    ));
  }

  function appendAppointment(appointment: Appointment): void {
    setWorkbench((current) => (
      current
        ? {
          ...current,
          created_appointments: current.created_appointments.some((item) => item.id === appointment.id)
            ? current.created_appointments.map((item) => (item.id === appointment.id ? appointment : item))
            : [...current.created_appointments, appointment],
        }
        : current
    ));
  }

  function replaceAppointment(appointment: Appointment): void {
    setWorkbench((current) => (
      current
        ? {
          ...current,
          created_appointments: current.created_appointments.map((item) => (
            item.id === appointment.id ? appointment : item
          )),
        }
        : current
    ));
  }

  function removeAppointment(appointmentId: string): void {
    setWorkbench((current) => (
      current
        ? { ...current, created_appointments: current.created_appointments.filter((item) => item.id !== appointmentId) }
        : current
    ));
  }

  async function handleSaveArrangement(): Promise<void> {
    const kind = editingArrangement?.kind ?? newArrangementKind;
    if (submitting || !kind) return;
    const title = arrangementTitle.trim();
    if (!title) {
      setError(`请输入${kind === 'appointment' ? '日程' : '任务'}标题`);
      return;
    }
    const isoTime = fromDateTimeLocalValue(arrangementTime);
    if (kind === 'appointment' && !isoTime) {
      setError('请选择日程时间');
      return;
    }
    const payload = {
      title,
      content: arrangementContent.trim() || null,
      time: isoTime,
    };
    setSubmitting(true);
    setError(null);
    try {
      if (kind === 'task') {
        if (editingArrangement?.kind === 'task') {
          replaceTask(await updateEventArrangementTask(currentEvent, editingArrangement.item.id, payload));
        } else {
          appendTask(await createEventArrangementTask(currentEvent, payload));
        }
      } else if (isoTime) {
        if (editingArrangement?.kind === 'appointment') {
          replaceAppointment(await updateEventArrangementAppointment(currentEvent, editingArrangement.item.id, payload));
        } else {
          appendAppointment(await createEventArrangementAppointment(currentEvent, payload));
        }
      }
      cancelArrangementEditor();
      await Promise.resolve(onChanged?.());
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存安排内容失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteArrangement(target: EditingArrangement): Promise<void> {
    if (submitting) return;
    if (!window.confirm(`确定删除“${target.item.title}”吗？`)) return;
    setSubmitting(true);
    setError(null);
    try {
      if (target.kind === 'task') {
        await deleteEventArrangementTask(target.item.id);
        removeTask(target.item.id);
      } else {
        await deleteEventArrangementAppointment(target.item.id);
        removeAppointment(target.item.id);
      }
      cancelArrangementEditor();
      await Promise.resolve(onChanged?.());
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除安排内容失败');
    } finally {
      setSubmitting(false);
    }
  }

  const currentEvent = workbench?.event ?? event;
  const eventAchievements = achievementSummary?.event_achievements ?? null;
  const taskArrangements = workbench?.created_tasks ?? [];
  const appointmentArrangements = workbench?.created_appointments ?? [];

  function beginEditEventDetails(): void {
    setEditingEventDetails(true);
    setEventEditForm({
      name: currentEvent.name,
      startDate: currentEvent.start_date,
      dueAt: toDateTimeLocalValue(currentEvent.due_at),
      isPrimary: currentEvent.is_primary,
    });
    setError(null);
  }

  function cancelEditEventDetails(): void {
    setEditingEventDetails(false);
    setEventEditForm(EMPTY_EVENT_EDIT_FORM);
    setError(null);
  }

  function updateCurrentEvent(updatedEvent: EventItem): void {
    setWorkbench((current) => (
      current
        ? { ...current, event: updatedEvent }
        : { event: updatedEvent, plan_draft: null, created_tasks: [], created_appointments: [] }
    ));
  }

  async function handleSetPrimaryEvent(): Promise<void> {
    if (submitting || currentEvent.is_primary) return;
    setSubmitting(true);
    setError(null);
    try {
      const updatedEvent = await updateEvent(currentEvent.id, { is_primary: true });
      updateCurrentEvent(updatedEvent);
      await Promise.resolve(onChanged?.());
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置主事件失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEventDetails(): Promise<void> {
    if (submitting) return;
    const name = eventEditForm.name.trim();
    const dueAt = fromDateTimeLocalValue(eventEditForm.dueAt);
    if (!name) {
      setError('请输入事件名称');
      return;
    }
    if (!eventEditForm.startDate) {
      setError('请选择开始日期');
      return;
    }
    if (!dueAt) {
      setError('请选择截止时间');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const updatedEvent = await updateEvent(currentEvent.id, {
        name,
        start_date: eventEditForm.startDate,
        due_at: dueAt,
        is_primary: eventEditForm.isPrimary,
      });
      updateCurrentEvent(updatedEvent);
      setEditingEventDetails(false);
      await Promise.resolve(onChanged?.());
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存事件失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEvent(): Promise<void> {
    if (submitting) return;
    if (!window.confirm(`确定删除“${currentEvent.name}”吗？`)) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteEventById(currentEvent.id);
      await Promise.resolve(onChanged?.());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除事件失败');
    } finally {
      setSubmitting(false);
    }
  }

  function renderArrangementEditor(kind: ArrangementKind) {
    const activeKind = editingArrangement?.kind ?? newArrangementKind;
    if (activeKind !== kind) return null;
    const label = kind === 'appointment' ? '日程' : '任务';
    const timeValue = fromDateTimeLocalValue(arrangementTime);
    return (
      <div className="grid gap-3 rounded-lg border border-blue-300/20 bg-blue-400/10 p-3">
        <label className="grid gap-1 text-xs text-white/60">
          {label}标题
          <input
            aria-label={`${label}标题`}
            value={arrangementTitle}
            onChange={(changeEvent) => setArrangementTitle(changeEvent.target.value)}
            className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="grid gap-1 text-xs text-white/60">
          {label}备注
          <textarea
            aria-label={`${label}备注`}
            value={arrangementContent}
            onChange={(changeEvent) => setArrangementContent(changeEvent.target.value)}
            className="min-h-16 rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="grid gap-1 text-xs text-white/60">
          {label}时间
          <input
            aria-label={`${label}时间`}
            type="datetime-local"
            value={arrangementTime}
            onChange={(changeEvent) => setArrangementTime(changeEvent.target.value)}
            className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
          />
        </label>
        {timeValue ? <div className="text-xs text-white/45">时间预览 {formatEventDateTime(timeValue)}</div> : null}
        <div className="flex flex-wrap justify-end gap-2">
          {editingArrangement ? (
            <button
              type="button"
              onClick={() => void handleDeleteArrangement(editingArrangement)}
              className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20"
            >
              删除{label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={cancelArrangementEditor}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSaveArrangement()}
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            保存{label}
          </button>
        </div>
      </div>
    );
  }

  function renderArrangementButton(target: EditingArrangement) {
    return (
      <button
        key={target.item.id}
        type="button"
        onClick={() => beginEditArrangement(target)}
        className="min-h-10 rounded-lg bg-white/[0.05] px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/10"
      >
        {target.item.title}
      </button>
    );
  }

  function renderArrangementColumn(kind: ArrangementKind, items: Task[] | Appointment[]) {
    const label = kind === 'appointment' ? '日程' : '任务';
    return (
      <div className="flex min-h-[180px] flex-col rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="text-sm font-medium text-white/80">{label}</div>
        <div className="mt-3 grid flex-1 content-start gap-2">
          {items.map((item) => {
            const target = kind === 'task'
              ? { kind: 'task' as const, item: item as Task }
              : { kind: 'appointment' as const, item: item as Appointment };
            return editingArrangement?.item.id === item.id ? (
              <div key={item.id}>{renderArrangementEditor(kind)}</div>
            ) : renderArrangementButton(target);
          })}
          {newArrangementKind === kind ? renderArrangementEditor(kind) : null}
          <button
            type="button"
            onClick={() => beginAddArrangement(kind)}
            className="min-h-10 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/55 hover:bg-white/[0.07] hover:text-white"
          >
            添加{label}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 px-5 py-20 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="安排"
      onClick={onClose}
    >
      <div
        className="flex h-[calc(100vh-7rem)] w-[1120px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f16] text-white shadow-2xl"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-white/[0.04] px-5">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-white/45">安排</div>
            <h2 className="mt-1 text-xl font-semibold">{currentEvent.name}</h2>
          </div>
          <button
            type="button"
            className="rounded-full px-3 py-2 text-white/60 hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="关闭安排"
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
                  <div>截止时间 {formatEventDateTime(currentEvent.due_at)}</div>
                  <div>{currentEvent.is_primary ? '主事件' : '非主事件'}</div>
                  <div>创建于 {formatEventDateTime(currentEvent.created_at)}</div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {!currentEvent.is_primary ? (
                  <button
                    type="button"
                    onClick={() => void handleSetPrimaryEvent()}
                    disabled={submitting}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    设为主事件
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={beginEditEventDetails}
                  disabled={submitting}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  编辑事件
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteEvent()}
                  disabled={submitting}
                  className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  删除事件
                </button>
              </div>
            </div>
            {editingEventDetails ? (
              <div className="mt-4 grid gap-3 rounded-lg border border-blue-300/20 bg-blue-400/10 p-3">
                <div className="text-sm font-medium text-blue-100">编辑事件信息</div>
                <div className="grid gap-3 md:grid-cols-[1.4fr_0.9fr_1.1fr]">
                  <label className="grid gap-1 text-xs text-white/60">
                    事件名称
                    <input
                      value={eventEditForm.name}
                      onChange={(changeEvent) => setEventEditForm((state) => ({ ...state, name: changeEvent.target.value }))}
                      className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-white/60">
                    开始日期
                    <input
                      type="date"
                      value={eventEditForm.startDate}
                      onChange={(changeEvent) => setEventEditForm((state) => ({ ...state, startDate: changeEvent.target.value }))}
                      className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-white/60">
                    截止时间
                    <input
                      type="datetime-local"
                      value={eventEditForm.dueAt}
                      onChange={(changeEvent) => setEventEditForm((state) => ({ ...state, dueAt: changeEvent.target.value }))}
                      className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={eventEditForm.isPrimary}
                      onChange={(changeEvent) => setEventEditForm((state) => ({ ...state, isPrimary: changeEvent.target.checked }))}
                      className="h-4 w-4 rounded border-white/20 bg-white/5"
                    />
                    主事件
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEditEventDetails}
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveEventDetails()}
                      disabled={submitting}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      保存事件
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div>
              <h3 className="text-base font-semibold">安排内容</h3>
              <p className="mt-1 text-sm text-white/50">直接管理当前事件下的任务和日程</p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {renderArrangementColumn('task', taskArrangements)}
              {renderArrangementColumn('appointment', appointmentArrangements)}
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h3 className="text-base font-semibold">成就摘要</h3>
            {loadingAchievement ? (
              <p className="mt-2 text-sm text-white/50">成就加载中...</p>
            ) : eventAchievements ? (
              <div className="mt-3 grid gap-3 text-sm">
                <div className="rounded-lg bg-white/[0.05] px-3 py-2">
                  <div className="font-medium text-white">
                    {eventAchievements.summary_text ?? `${currentEvent.name} 的当前进展`}
                  </div>
                  <div className="mt-1 text-white/50">
                    已解锁 {eventAchievements.stats.unlocked_count} 个 · 进行中 {eventAchievements.stats.in_progress_count} 个
                  </div>
                </div>
                {eventAchievements.latest_unlocked[0] ? (
                  <div className="rounded-lg border border-emerald-300/15 bg-emerald-400/10 px-3 py-2 text-emerald-100">
                    最近解锁：{eventAchievements.latest_unlocked[0].title}
                  </div>
                ) : null}
                {eventAchievements.upcoming[0] ? (
                  <div className="rounded-lg border border-blue-300/15 bg-blue-400/10 px-3 py-2 text-blue-100">
                    下一步：{eventAchievements.upcoming[0].title}
                    {eventAchievements.upcoming[0].progress_text ? ` · ${eventAchievements.upcoming[0].progress_text}` : ''}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/50">暂无事件成就进度，完成相关任务或专注后会自动更新。</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
