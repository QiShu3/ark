import React, { useEffect, useState } from 'react';
import { apiJson } from '../lib/api';
import type { Appointment, AppointmentStoredStatus, CompletionPeriodType } from './taskTypes';

type EventItem = {
  id: string;
  user_id: number;
  name: string;
  due_at: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

type AppointmentEditFormState = {
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

const EMPTY_FORM: AppointmentEditFormState = {
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

type AppointmentEditModalProps = {
  open: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

function toLocalDateTimeValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toStoredStatus(status: Appointment['status']): AppointmentStoredStatus {
  if (status === 'needs_confirmation') return 'pending';
  return status;
}

function buildEditForm(appointment: Appointment): AppointmentEditFormState {
  return {
    title: appointment.title,
    content: appointment.content || '',
    status: toStoredStatus(appointment.status),
    startsAt: toLocalDateTimeValue(appointment.starts_at),
    endsAt: toLocalDateTimeValue(appointment.ends_at),
    repeatRule: appointment.repeat_rule || '',
    eventId: appointment.event_id ?? '',
    periodType: appointment.period_type ?? 'once',
    customPeriodDays: appointment.custom_period_days ?? 1,
    maxCompletionsPerPeriod: appointment.max_completions_per_period ?? 1,
    weekdayOnly: appointment.weekday_only ?? false,
    timeInheritsFromEvent: appointment.time_inherits_from_event ?? false,
    timeOverridden: appointment.time_overridden ?? false,
  };
}

function syncAppointmentEventSelection(form: AppointmentEditFormState, eventId: string, events: EventItem[]): AppointmentEditFormState {
  const selectedEvent = events.find((event) => event.id === eventId) ?? null;
  if (!selectedEvent) {
    return {
      ...form,
      eventId: '',
      timeInheritsFromEvent: false,
      timeOverridden: false,
    };
  }
  const nextEndsAt = toLocalDateTimeValue(selectedEvent.due_at);
  const shouldFollowEvent = !form.timeOverridden || !form.endsAt;
  return {
    ...form,
    eventId: selectedEvent.id,
    endsAt: shouldFollowEvent ? nextEndsAt : form.endsAt,
    timeInheritsFromEvent: true,
    timeOverridden: shouldFollowEvent ? false : form.timeOverridden,
  };
}

const AppointmentEditModal: React.FC<AppointmentEditModalProps> = ({ open, appointment, onClose, onChanged }) => {
  const [form, setForm] = useState<AppointmentEditFormState>(EMPTY_FORM);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !appointment) {
      setForm(EMPTY_FORM);
      setSubmitting(false);
      setError(null);
      return;
    }
    setForm(buildEditForm(appointment));
    setSubmitting(false);
    setError(null);
  }, [open, appointment]);

  useEffect(() => {
    if (!open) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiJson<EventItem[]>('/todo/events');
        if (cancelled) return;
        setEvents(Array.isArray(res) ? res : []);
      } catch {
        if (cancelled) return;
        setEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open || !appointment) return null;

  async function handleChanged(): Promise<void> {
    await Promise.resolve(onChanged?.());
    onClose();
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const customPeriodDays = form.periodType === 'custom_days' ? Math.max(1, Math.floor(form.customPeriodDays || 1)) : null;
      await apiJson(`/todo/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          content: form.content.trim() || null,
          status: form.status,
          starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : null,
          ends_at: new Date(form.endsAt).toISOString(),
          repeat_rule: form.repeatRule.trim() || null,
          event_id: form.eventId || null,
          is_recurring: form.periodType !== 'once',
          period_type: form.periodType,
          custom_period_days: customPeriodDays,
          max_completions_per_period: Math.max(1, Math.floor(form.maxCompletionsPerPeriod || 1)),
          weekday_only: form.weekdayOnly,
          time_inherits_from_event: form.timeInheritsFromEvent,
          time_overridden: form.timeOverridden,
        }),
      });
      await handleChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '编辑日程失败');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 pt-16 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-label="编辑日程"
    >
      <div
        className="relative flex max-h-[calc(100vh-6rem)] w-[520px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-white/5 px-5">
          <h3 className="text-lg font-bold text-white">编辑日程</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="关闭编辑日程弹窗"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/70">标题</label>
            <input
              aria-label="标题"
              value={form.title}
              onChange={(e) => setForm((state) => ({ ...state, title: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/70">状态</label>
            <select
              aria-label="状态"
              value={form.status}
              onChange={(e) => setForm((state) => ({ ...state, status: e.target.value as AppointmentStoredStatus }))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="pending">待出席</option>
              <option value="attended">已出席</option>
              <option value="missed">已错过</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/70">备注</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((state) => ({ ...state, content: e.target.value }))}
              className="min-h-[88px] w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">开始时间</label>
              <input
                aria-label="开始时间"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((state) => ({ ...state, startsAt: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">结束时间</label>
              <input
                aria-label="结束时间"
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((state) => {
                  const nextValue = e.target.value;
                  const selectedEvent = events.find((event) => event.id === state.eventId) ?? null;
                  const inheritedValue = selectedEvent ? toLocalDateTimeValue(selectedEvent.due_at) : '';
                  return {
                    ...state,
                    endsAt: nextValue,
                    timeOverridden: !!selectedEvent && nextValue !== inheritedValue,
                    timeInheritsFromEvent: !!selectedEvent,
                  };
                })}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/70">关联事件</label>
            <select
              aria-label="关联事件"
              value={form.eventId}
              onChange={(e) => setForm((state) => syncAppointmentEventSelection(state, e.target.value, events))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="">不绑定事件</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.is_primary ? `当前事件：${event.name}` : event.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/70">重复规则</label>
            <input
              aria-label="重复规则"
              value={form.repeatRule}
              onChange={(e) => setForm((state) => ({ ...state, repeatRule: e.target.value }))}
              placeholder="例如：weekly"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">完成周期</label>
              <select
                aria-label="完成周期"
                value={form.periodType}
                onChange={(e) => setForm((state) => ({ ...state, periodType: e.target.value as CompletionPeriodType }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="once">一次性</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
                <option value="custom_days">自定义天数</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">单周期最多完成次数</label>
              <input
                aria-label="单周期最多完成次数"
                type="number"
                min={1}
                value={form.maxCompletionsPerPeriod}
                onChange={(e) => setForm((state) => ({ ...state, maxCompletionsPerPeriod: Number(e.target.value) }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>

          {form.periodType === 'custom_days' ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">自定义完成周期（天）</label>
              <input
                aria-label="自定义完成周期（天）"
                type="number"
                min={1}
                value={form.customPeriodDays}
                onChange={(e) => setForm((state) => ({ ...state, customPeriodDays: Number(e.target.value) }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          ) : null}

          <label className="flex items-center gap-3 text-sm text-white/80">
            <input
              aria-label="仅工作日可完成"
              type="checkbox"
              checked={form.weekdayOnly}
              onChange={(e) => setForm((state) => ({ ...state, weekdayOnly: e.target.checked }))}
              className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50"
            />
            仅工作日可完成
          </label>

          {error ? <div className="text-sm text-red-400">{error}</div> : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-[#1a1a1a] p-5 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
            disabled={submitting}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppointmentEditModal;
