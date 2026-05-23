import { useEffect, useState } from 'react';

import type { AchievementSummary } from '../achievementTypes';
import { apiJson } from '../../lib/api';
import { formatEventDateTime, fromDateTimeLocalValue, toDateTimeLocalValue } from '../../lib/events/dateTime';
import {
  deleteEvent as deleteEventById,
  getEventWorkbench,
  listEvents,
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
import { activateEventSubApps } from '../../lib/events/eventAppSync';
import type { EventItem, EventWorkbench } from '../../lib/events/types';
import type { Appointment, AppointmentStoredStatus, CompletionPeriodType, Task } from '../taskTypes';

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

type TaskArrangementFormState = {
  title: string;
  content: string;
  priority: 0 | 1 | 2 | 3;
  targetMinutes: number;
  event: string;
  eventId: string;
  periodType: CompletionPeriodType;
  customPeriodDays: number;
  maxCompletionsPerPeriod: number;
  weekdayOnly: boolean;
  timeInheritsFromEvent: boolean;
  timeOverridden: boolean;
  taskType: 'focus' | 'checkin';
  tagsText: string;
  startDate: string;
  dueDate: string;
};

type AppointmentArrangementFormState = {
  title: string;
  content: string;
  status: AppointmentStoredStatus;
  startsAt: string;
  endsAt: string;
  repeatRule: string;
  eventId: string;
  periodType: CompletionPeriodType;
  customPeriodDays: number;
  maxCompletionsPerPeriod: number;
  weekdayOnly: boolean;
  timeInheritsFromEvent: boolean;
  timeOverridden: boolean;
};

const EMPTY_EVENT_EDIT_FORM: EventEditFormState = {
  name: '',
  startDate: '',
  dueAt: '',
  isPrimary: false,
};

const EMPTY_TASK_ARRANGEMENT_FORM: TaskArrangementFormState = {
  title: '',
  content: '',
  priority: 0,
  targetMinutes: 0,
  event: '',
  eventId: '',
  periodType: 'once',
  customPeriodDays: 1,
  maxCompletionsPerPeriod: 1,
  weekdayOnly: false,
  timeInheritsFromEvent: false,
  timeOverridden: false,
  taskType: 'focus',
  tagsText: '',
  startDate: '',
  dueDate: '',
};

const EMPTY_APPOINTMENT_ARRANGEMENT_FORM: AppointmentArrangementFormState = {
  title: '',
  content: '',
  status: 'pending',
  startsAt: '',
  endsAt: '',
  repeatRule: '',
  eventId: '',
  periodType: 'once',
  customPeriodDays: 1,
  maxCompletionsPerPeriod: 1,
  weekdayOnly: false,
  timeInheritsFromEvent: false,
  timeOverridden: false,
};

export default function EventWorkbenchModal({ event, onClose, onChanged }: EventWorkbenchModalProps) {
  const [workbench, setWorkbench] = useState<EventWorkbench | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingArrangement, setEditingArrangement] = useState<EditingArrangement | null>(null);
  const [newArrangementKind, setNewArrangementKind] = useState<ArrangementKind | null>(null);
  const [taskArrangementForm, setTaskArrangementForm] = useState<TaskArrangementFormState>(EMPTY_TASK_ARRANGEMENT_FORM);
  const [appointmentArrangementForm, setAppointmentArrangementForm] = useState<AppointmentArrangementFormState>(
    EMPTY_APPOINTMENT_ARRANGEMENT_FORM,
  );
  const [arrangementEvents, setArrangementEvents] = useState<EventItem[]>([]);
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

  useEffect(() => {
    let cancelled = false;
    void listEvents()
      .then((items) => {
        if (cancelled) return;
        setArrangementEvents(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (cancelled) return;
        setArrangementEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentEvent = workbench?.event ?? event;
  const eventOptions = arrangementEvents.some((item) => item.id === currentEvent.id)
    ? arrangementEvents
    : [currentEvent, ...arrangementEvents];
  const eventAchievements = achievementSummary?.event_achievements ?? null;
  const taskArrangements = workbench?.created_tasks ?? [];
  const appointmentArrangements = workbench?.created_appointments ?? [];

  function getEventOption(eventId: string): EventItem | null {
    return eventOptions.find((item) => item.id === eventId) ?? null;
  }

  function buildDefaultTaskArrangementForm(selectedEvent: EventItem): TaskArrangementFormState {
    return {
      ...EMPTY_TASK_ARRANGEMENT_FORM,
      event: selectedEvent.name,
      eventId: selectedEvent.id,
    };
  }

  function buildTaskArrangementForm(task: Task): TaskArrangementFormState {
    return {
      title: task.title,
      content: task.content ?? '',
      priority: task.priority as 0 | 1 | 2 | 3,
      targetMinutes: Math.round(task.target_duration / 60),
      event: task.event || '',
      eventId: task.event_id ?? '',
      periodType: task.period_type ?? 'once',
      customPeriodDays: task.custom_period_days ?? 1,
      maxCompletionsPerPeriod: task.max_completions_per_period ?? 1,
      weekdayOnly: task.weekday_only ?? false,
      timeInheritsFromEvent: task.time_inherits_from_event ?? false,
      timeOverridden: task.time_overridden ?? false,
      taskType: task.task_type || 'focus',
      tagsText: task.tags.join(', '),
      startDate: toDateTimeLocalValue(task.start_date),
      dueDate: toDateTimeLocalValue(task.due_date),
    };
  }

  function buildDefaultAppointmentArrangementForm(selectedEvent: EventItem): AppointmentArrangementFormState {
    return {
      ...EMPTY_APPOINTMENT_ARRANGEMENT_FORM,
      eventId: selectedEvent.id,
    };
  }

  function buildAppointmentArrangementForm(appointment: Appointment): AppointmentArrangementFormState {
    return {
      title: appointment.title,
      content: appointment.content ?? '',
      status: appointment.status === 'needs_confirmation' ? 'pending' : appointment.status,
      startsAt: toDateTimeLocalValue(appointment.starts_at),
      endsAt: toDateTimeLocalValue(appointment.ends_at),
      repeatRule: appointment.repeat_rule ?? '',
      eventId: appointment.event_id ?? '',
      periodType: appointment.period_type ?? 'once',
      customPeriodDays: appointment.custom_period_days ?? 1,
      maxCompletionsPerPeriod: appointment.max_completions_per_period ?? 1,
      weekdayOnly: appointment.weekday_only ?? false,
      timeInheritsFromEvent: appointment.time_inherits_from_event ?? false,
      timeOverridden: appointment.time_overridden ?? false,
    };
  }

  function syncTaskEventSelection(form: TaskArrangementFormState, eventId: string): TaskArrangementFormState {
    const selectedEvent = getEventOption(eventId);
    if (!selectedEvent) {
      return {
        ...form,
        event: '',
        eventId: '',
        timeInheritsFromEvent: false,
        timeOverridden: false,
      };
    }
    const inheritedDueDate = toDateTimeLocalValue(selectedEvent.due_at);
    const shouldFollowEvent = !form.timeOverridden || !form.dueDate;
    return {
      ...form,
      event: selectedEvent.name,
      eventId: selectedEvent.id,
      dueDate: shouldFollowEvent ? inheritedDueDate : form.dueDate,
      timeInheritsFromEvent: true,
      timeOverridden: shouldFollowEvent ? false : form.timeOverridden,
    };
  }

  function syncAppointmentEventSelection(
    form: AppointmentArrangementFormState,
    eventId: string,
  ): AppointmentArrangementFormState {
    const selectedEvent = getEventOption(eventId);
    if (!selectedEvent) {
      return {
        ...form,
        eventId: '',
        timeInheritsFromEvent: false,
        timeOverridden: false,
      };
    }
    const inheritedEndsAt = toDateTimeLocalValue(selectedEvent.due_at);
    const shouldFollowEvent = !form.timeOverridden || !form.endsAt;
    return {
      ...form,
      eventId: selectedEvent.id,
      endsAt: shouldFollowEvent ? inheritedEndsAt : form.endsAt,
      timeInheritsFromEvent: true,
      timeOverridden: shouldFollowEvent ? false : form.timeOverridden,
    };
  }

  function cancelArrangementEditor(): void {
    setEditingArrangement(null);
    setNewArrangementKind(null);
    setTaskArrangementForm(EMPTY_TASK_ARRANGEMENT_FORM);
    setAppointmentArrangementForm(EMPTY_APPOINTMENT_ARRANGEMENT_FORM);
  }

  function beginAddArrangement(kind: ArrangementKind): void {
    setEditingArrangement(null);
    setNewArrangementKind(kind);
    if (kind === 'task') {
      setTaskArrangementForm(buildDefaultTaskArrangementForm(currentEvent));
    } else {
      setAppointmentArrangementForm(buildDefaultAppointmentArrangementForm(currentEvent));
    }
    setError(null);
  }

  function beginEditArrangement(next: EditingArrangement): void {
    setEditingArrangement(next);
    setNewArrangementKind(null);
    if (next.kind === 'task') {
      setTaskArrangementForm(buildTaskArrangementForm(next.item));
    } else {
      setAppointmentArrangementForm(buildAppointmentArrangementForm(next.item));
    }
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
    const title = kind === 'task' ? taskArrangementForm.title.trim() : appointmentArrangementForm.title.trim();
    if (!title) {
      setError(`请输入${kind === 'appointment' ? '日程' : '任务'}标题`);
      return;
    }
    const taskStartDate = fromDateTimeLocalValue(taskArrangementForm.startDate);
    const taskDueDate = fromDateTimeLocalValue(taskArrangementForm.dueDate);
    const appointmentStartsAt = fromDateTimeLocalValue(appointmentArrangementForm.startsAt);
    const appointmentEndsAt = fromDateTimeLocalValue(appointmentArrangementForm.endsAt);
    if (kind === 'appointment' && !appointmentEndsAt) {
      setError('请选择结束时间');
      return;
    }
    const customPeriodDays = kind === 'task'
      ? (taskArrangementForm.periodType === 'custom_days' ? Math.max(1, Math.floor(taskArrangementForm.customPeriodDays || 1)) : null)
      : (
        appointmentArrangementForm.periodType === 'custom_days'
          ? Math.max(1, Math.floor(appointmentArrangementForm.customPeriodDays || 1))
          : null
      );
    const tags = taskArrangementForm.tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    setSubmitting(true);
    setError(null);
    try {
      if (kind === 'task') {
        const payload = {
          title,
          content: taskArrangementForm.content.trim() || null,
          priority: taskArrangementForm.priority,
          targetDuration: Math.max(0, Math.round(taskArrangementForm.targetMinutes * 60)),
          event: taskArrangementForm.event.trim(),
          eventId: taskArrangementForm.eventId || null,
          periodType: taskArrangementForm.periodType,
          customPeriodDays,
          maxCompletionsPerPeriod: Math.max(1, Math.floor(taskArrangementForm.maxCompletionsPerPeriod || 1)),
          weekdayOnly: taskArrangementForm.weekdayOnly,
          timeInheritsFromEvent: taskArrangementForm.timeInheritsFromEvent,
          timeOverridden: taskArrangementForm.timeOverridden,
          taskType: taskArrangementForm.taskType,
          tags,
          startDate: taskStartDate,
          dueDate: taskDueDate,
        };
        if (editingArrangement?.kind === 'task') {
          replaceTask(await updateEventArrangementTask(currentEvent, editingArrangement.item.id, payload));
        } else {
          appendTask(await createEventArrangementTask(currentEvent, payload));
        }
      } else if (appointmentEndsAt) {
        const payload = {
          title,
          content: appointmentArrangementForm.content.trim() || null,
          status: appointmentArrangementForm.status,
          startsAt: appointmentStartsAt,
          endsAt: appointmentEndsAt,
          repeatRule: appointmentArrangementForm.repeatRule.trim() || null,
          eventId: appointmentArrangementForm.eventId || null,
          periodType: appointmentArrangementForm.periodType,
          customPeriodDays,
          maxCompletionsPerPeriod: Math.max(1, Math.floor(appointmentArrangementForm.maxCompletionsPerPeriod || 1)),
          weekdayOnly: appointmentArrangementForm.weekdayOnly,
          timeInheritsFromEvent: appointmentArrangementForm.timeInheritsFromEvent,
          timeOverridden: appointmentArrangementForm.timeOverridden,
        };
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
      await activateEventSubApps(currentEvent.id);
      updateCurrentEvent(updatedEvent);
      await Promise.resolve(onChanged?.());
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
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
      if (eventEditForm.isPrimary) {
        await activateEventSubApps(currentEvent.id);
      }
      updateCurrentEvent(updatedEvent);
      setEditingEventDetails(false);
      await Promise.resolve(onChanged?.());
      if (eventEditForm.isPrimary) {
        window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      }
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
    const previewTime = kind === 'appointment'
      ? fromDateTimeLocalValue(appointmentArrangementForm.endsAt)
      : fromDateTimeLocalValue(taskArrangementForm.dueDate);
    return (
      <div className="grid gap-3 rounded-lg border border-blue-300/20 bg-blue-400/10 p-3">
        {kind === 'task' ? (
          <>
            <label className="grid gap-1 text-xs text-white/60">
              标题
              <input
                aria-label="标题"
                value={taskArrangementForm.title}
                onChange={(changeEvent) => setTaskArrangementForm((state) => ({ ...state, title: changeEvent.target.value }))}
                className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-white/60">
                任务类型
                <select
                  aria-label="任务类型"
                  value={taskArrangementForm.taskType}
                  onChange={(changeEvent) => (
                    setTaskArrangementForm((state) => ({ ...state, taskType: changeEvent.target.value as 'focus' | 'checkin' }))
                  )}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                >
                  <option value="focus">专注任务</option>
                  <option value="checkin">快速打卡</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-white/60">
                优先级
                <select
                  aria-label="优先级"
                  value={taskArrangementForm.priority}
                  onChange={(changeEvent) => (
                    setTaskArrangementForm((state) => ({ ...state, priority: Number(changeEvent.target.value) as 0 | 1 | 2 | 3 }))
                  )}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                >
                  <option value={0}>0 低</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3 高</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-xs text-white/60">
              备注
              <textarea
                aria-label="备注"
                value={taskArrangementForm.content}
                onChange={(changeEvent) => setTaskArrangementForm((state) => ({ ...state, content: changeEvent.target.value }))}
                className="min-h-16 rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-white/60">
                目标时长（分钟）
                <input
                  aria-label="目标时长（分钟）"
                  type="number"
                  min={0}
                  value={taskArrangementForm.targetMinutes}
                  onChange={(changeEvent) => (
                    setTaskArrangementForm((state) => ({ ...state, targetMinutes: Number(changeEvent.target.value) }))
                  )}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="grid gap-1 text-xs text-white/60">
                开始日期
                <input
                  aria-label="开始日期"
                  type="datetime-local"
                  value={taskArrangementForm.startDate}
                  onChange={(changeEvent) => (
                    setTaskArrangementForm((state) => ({ ...state, startDate: changeEvent.target.value }))
                  )}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="grid gap-1 text-xs text-white/60">
                截止日期
                <input
                  aria-label="截止日期"
                  type="datetime-local"
                  value={taskArrangementForm.dueDate}
                  onChange={(changeEvent) => {
                    const nextValue = changeEvent.target.value;
                    setTaskArrangementForm((state) => {
                      const selectedEvent = getEventOption(state.eventId);
                      const inheritedValue = selectedEvent ? toDateTimeLocalValue(selectedEvent.due_at) : '';
                      return {
                        ...state,
                        dueDate: nextValue,
                        timeInheritsFromEvent: Boolean(selectedEvent),
                        timeOverridden: Boolean(selectedEvent) && nextValue !== inheritedValue,
                      };
                    });
                  }}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <label className="grid gap-1 text-xs text-white/60">
              关联事件
              <select
                aria-label="关联事件"
                value={taskArrangementForm.eventId}
                onChange={(changeEvent) => (
                  setTaskArrangementForm((state) => syncTaskEventSelection(state, changeEvent.target.value))
                )}
                className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
              >
                <option value="">不绑定事件</option>
                {eventOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.is_primary ? `当前事件：${option.name}` : option.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-white/60">
                完成周期
                <select
                  aria-label="完成周期"
                  value={taskArrangementForm.periodType}
                  onChange={(changeEvent) => (
                    setTaskArrangementForm((state) => ({ ...state, periodType: changeEvent.target.value as CompletionPeriodType }))
                  )}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                >
                  <option value="once">一次性</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                  <option value="custom_days">自定义天数</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-white/60">
                单周期最多完成次数
                <input
                  aria-label="单周期最多完成次数"
                  type="number"
                  min={1}
                  value={taskArrangementForm.maxCompletionsPerPeriod}
                  onChange={(changeEvent) => (
                    setTaskArrangementForm((state) => ({ ...state, maxCompletionsPerPeriod: Number(changeEvent.target.value) }))
                  )}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            {taskArrangementForm.periodType === 'custom_days' ? (
              <label className="grid gap-1 text-xs text-white/60">
                自定义完成周期（天）
                <input
                  aria-label="自定义完成周期（天）"
                  type="number"
                  min={1}
                  value={taskArrangementForm.customPeriodDays}
                  onChange={(changeEvent) => (
                    setTaskArrangementForm((state) => ({ ...state, customPeriodDays: Number(changeEvent.target.value) }))
                  )}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                />
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-white/70">
              <input
                aria-label="仅工作日可完成"
                type="checkbox"
                checked={taskArrangementForm.weekdayOnly}
                onChange={(changeEvent) => (
                  setTaskArrangementForm((state) => ({ ...state, weekdayOnly: changeEvent.target.checked }))
                )}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50"
              />
              仅工作日可完成
            </label>
            <label className="grid gap-1 text-xs text-white/60">
              标签
              <input
                aria-label="标签"
                value={taskArrangementForm.tagsText}
                onChange={(changeEvent) => setTaskArrangementForm((state) => ({ ...state, tagsText: changeEvent.target.value }))}
                placeholder="逗号分隔，例如：学习,arxiv"
                className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
            </label>
          </>
        ) : (
          <>
            <label className="grid gap-1 text-xs text-white/60">
              标题
              <input
                aria-label="标题"
                value={appointmentArrangementForm.title}
                onChange={(changeEvent) => (
                  setAppointmentArrangementForm((state) => ({ ...state, title: changeEvent.target.value }))
                )}
                className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="grid gap-1 text-xs text-white/60">
              状态
              <select
                aria-label="状态"
                value={appointmentArrangementForm.status}
                onChange={(changeEvent) => (
                  setAppointmentArrangementForm((state) => ({
                    ...state,
                    status: changeEvent.target.value as AppointmentStoredStatus,
                  }))
                )}
                className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
              >
                <option value="pending">待出席</option>
                <option value="attended">已出席</option>
                <option value="missed">已错过</option>
                <option value="cancelled">已取消</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-white/60">
              备注
              <textarea
                aria-label="备注"
                value={appointmentArrangementForm.content}
                onChange={(changeEvent) => (
                  setAppointmentArrangementForm((state) => ({ ...state, content: changeEvent.target.value }))
                )}
                className="min-h-16 rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-white/60">
                开始时间
                <input
                  aria-label="开始时间"
                  type="datetime-local"
                  value={appointmentArrangementForm.startsAt}
                  onChange={(changeEvent) => (
                    setAppointmentArrangementForm((state) => ({ ...state, startsAt: changeEvent.target.value }))
                  )}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="grid gap-1 text-xs text-white/60">
                结束时间
                <input
                  aria-label="结束时间"
                  type="datetime-local"
                  value={appointmentArrangementForm.endsAt}
                  onChange={(changeEvent) => {
                    const nextValue = changeEvent.target.value;
                    setAppointmentArrangementForm((state) => {
                      const selectedEvent = getEventOption(state.eventId);
                      const inheritedValue = selectedEvent ? toDateTimeLocalValue(selectedEvent.due_at) : '';
                      return {
                        ...state,
                        endsAt: nextValue,
                        timeInheritsFromEvent: Boolean(selectedEvent),
                        timeOverridden: Boolean(selectedEvent) && nextValue !== inheritedValue,
                      };
                    });
                  }}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <label className="grid gap-1 text-xs text-white/60">
              关联事件
              <select
                aria-label="关联事件"
                value={appointmentArrangementForm.eventId}
                onChange={(changeEvent) => (
                  setAppointmentArrangementForm((state) => syncAppointmentEventSelection(state, changeEvent.target.value))
                )}
                className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
              >
                <option value="">不绑定事件</option>
                {eventOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.is_primary ? `当前事件：${option.name}` : option.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-white/60">
              重复规则
              <input
                aria-label="重复规则"
                value={appointmentArrangementForm.repeatRule}
                onChange={(changeEvent) => (
                  setAppointmentArrangementForm((state) => ({ ...state, repeatRule: changeEvent.target.value }))
                )}
                placeholder="例如：weekly"
                className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-white/60">
                完成周期
                <select
                  aria-label="完成周期"
                  value={appointmentArrangementForm.periodType}
                  onChange={(changeEvent) => (
                    setAppointmentArrangementForm((state) => ({
                      ...state,
                      periodType: changeEvent.target.value as CompletionPeriodType,
                    }))
                  )}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                >
                  <option value="once">一次性</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                  <option value="custom_days">自定义天数</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-white/60">
                单周期最多完成次数
                <input
                  aria-label="单周期最多完成次数"
                  type="number"
                  min={1}
                  value={appointmentArrangementForm.maxCompletionsPerPeriod}
                  onChange={(changeEvent) => (
                    setAppointmentArrangementForm((state) => ({
                      ...state,
                      maxCompletionsPerPeriod: Number(changeEvent.target.value),
                    }))
                  )}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            {appointmentArrangementForm.periodType === 'custom_days' ? (
              <label className="grid gap-1 text-xs text-white/60">
                自定义完成周期（天）
                <input
                  aria-label="自定义完成周期（天）"
                  type="number"
                  min={1}
                  value={appointmentArrangementForm.customPeriodDays}
                  onChange={(changeEvent) => (
                    setAppointmentArrangementForm((state) => ({ ...state, customPeriodDays: Number(changeEvent.target.value) }))
                  )}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                />
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-white/70">
              <input
                aria-label="仅工作日可完成"
                type="checkbox"
                checked={appointmentArrangementForm.weekdayOnly}
                onChange={(changeEvent) => (
                  setAppointmentArrangementForm((state) => ({ ...state, weekdayOnly: changeEvent.target.checked }))
                )}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50"
              />
              仅工作日可完成
            </label>
          </>
        )}
        {previewTime ? <div className="text-xs text-white/45">时间预览 {formatEventDateTime(previewTime)}</div> : null}
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
    const dueAt = target.kind === 'appointment' ? target.item.ends_at : target.item.due_date;
    const timeLabel = dueAt ? formatEventDateTime(dueAt) : '未设时间';
    const timeId = `arrangement-${target.kind}-${target.item.id}-time`;

    return (
      <button
        key={target.item.id}
        type="button"
        aria-label={target.item.title}
        aria-describedby={timeId}
        onClick={() => beginEditArrangement(target)}
        className="flex min-h-10 items-center justify-between gap-3 rounded-lg bg-white/[0.05] px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/10"
      >
        <span className="min-w-0 truncate">{target.item.title}</span>
        <span id={timeId} className="shrink-0 text-xs font-normal text-white/45">
          {timeLabel}
        </span>
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
