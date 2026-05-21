import { apiJson } from '../api';
import type { Appointment, Task } from '../../components/taskTypes';
import type { EventItem } from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type EventArrangementTaskInput = {
  title: string;
  content: string | null;
  priority: 0 | 1 | 2 | 3;
  targetDuration: number;
  event: string;
  eventId: string | null;
  periodType: Task['period_type'];
  customPeriodDays: number | null;
  maxCompletionsPerPeriod: number;
  weekdayOnly: boolean;
  timeInheritsFromEvent: boolean;
  timeOverridden: boolean;
  taskType: Task['task_type'];
  tags: string[];
  startDate: string | null;
  dueDate: string | null;
};

export type EventArrangementAppointmentInput = {
  title: string;
  content: string | null;
  status: Exclude<Appointment['status'], 'needs_confirmation'>;
  startsAt: string | null;
  endsAt: string;
  repeatRule: string | null;
  eventId: string | null;
  periodType: Appointment['period_type'];
  customPeriodDays: number | null;
  maxCompletionsPerPeriod: number;
  weekdayOnly: boolean;
  timeInheritsFromEvent: boolean;
  timeOverridden: boolean;
};

export function createEventArrangementTask(
  _event: EventItem,
  input: EventArrangementTaskInput,
): Promise<Task> {
  return apiJson<Task>('/todo/tasks', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      status: 'todo',
      priority: input.priority,
      target_duration: input.targetDuration,
      current_cycle_count: 0,
      target_cycle_count: 0,
      cycle_period: 'daily',
      cycle_every_days: null,
      event: input.event,
      event_ids: [],
      event_id: input.eventId,
      is_recurring: input.periodType !== 'once',
      period_type: input.periodType,
      custom_period_days: input.customPeriodDays,
      max_completions_per_period: input.maxCompletionsPerPeriod,
      weekday_only: input.weekdayOnly,
      time_inherits_from_event: input.timeInheritsFromEvent,
      time_overridden: input.timeOverridden,
      task_type: input.taskType,
      tags: input.tags,
      start_date: input.startDate,
      due_date: input.dueDate,
    }),
  });
}

export function updateEventArrangementTask(
  _event: EventItem,
  taskId: string,
  input: EventArrangementTaskInput,
): Promise<Task> {
  return apiJson<Task>(`/todo/tasks/${taskId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      priority: input.priority,
      target_duration: input.targetDuration,
      event: input.event,
      event_id: input.eventId,
      is_recurring: input.periodType !== 'once',
      period_type: input.periodType,
      custom_period_days: input.customPeriodDays,
      max_completions_per_period: input.maxCompletionsPerPeriod,
      weekday_only: input.weekdayOnly,
      time_inherits_from_event: input.timeInheritsFromEvent,
      time_overridden: input.timeOverridden,
      task_type: input.taskType,
      tags: input.tags,
      start_date: input.startDate,
      due_date: input.dueDate,
    }),
  });
}

export function deleteEventArrangementTask(taskId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/todo/tasks/${taskId}`, { method: 'DELETE' });
}

export function createEventArrangementAppointment(
  _event: EventItem,
  input: EventArrangementAppointmentInput,
): Promise<Appointment> {
  return apiJson<Appointment>('/todo/appointments', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      status: input.status,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      repeat_rule: input.repeatRule,
      linked_task_id: null,
      event_id: input.eventId,
      is_recurring: input.periodType !== 'once',
      period_type: input.periodType,
      custom_period_days: input.customPeriodDays,
      max_completions_per_period: input.maxCompletionsPerPeriod,
      weekday_only: input.weekdayOnly,
      time_inherits_from_event: input.timeInheritsFromEvent,
      time_overridden: input.timeOverridden,
    }),
  });
}

export function updateEventArrangementAppointment(
  _event: EventItem,
  appointmentId: string,
  input: EventArrangementAppointmentInput,
): Promise<Appointment> {
  return apiJson<Appointment>(`/todo/appointments/${appointmentId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      status: input.status,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      repeat_rule: input.repeatRule,
      event_id: input.eventId,
      is_recurring: input.periodType !== 'once',
      period_type: input.periodType,
      custom_period_days: input.customPeriodDays,
      max_completions_per_period: input.maxCompletionsPerPeriod,
      weekday_only: input.weekdayOnly,
      time_inherits_from_event: input.timeInheritsFromEvent,
      time_overridden: input.timeOverridden,
    }),
  });
}

export function deleteEventArrangementAppointment(appointmentId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/todo/appointments/${appointmentId}`, { method: 'DELETE' });
}
