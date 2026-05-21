import { apiJson } from '../api';
import type { Appointment, Task } from '../../components/taskTypes';
import type { EventItem } from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type EventArrangementInput = {
  title: string;
  content: string | null;
  time: string | null;
};

export function createEventArrangementTask(
  event: EventItem,
  input: EventArrangementInput,
): Promise<Task> {
  return apiJson<Task>('/todo/tasks', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      status: 'todo',
      priority: 0,
      target_duration: 0,
      current_cycle_count: 0,
      target_cycle_count: 0,
      cycle_period: 'daily',
      cycle_every_days: null,
      event: event.name,
      event_ids: [],
      event_id: event.id,
      is_recurring: false,
      period_type: 'once',
      custom_period_days: null,
      max_completions_per_period: 1,
      weekday_only: false,
      time_inherits_from_event: false,
      time_overridden: Boolean(input.time),
      task_type: 'focus',
      tags: [],
      start_date: null,
      due_date: input.time,
    }),
  });
}

export function updateEventArrangementTask(
  event: EventItem,
  taskId: string,
  input: EventArrangementInput,
): Promise<Task> {
  return apiJson<Task>(`/todo/tasks/${taskId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      event: event.name,
      event_id: event.id,
      time_inherits_from_event: false,
      time_overridden: Boolean(input.time),
      due_date: input.time,
    }),
  });
}

export function deleteEventArrangementTask(taskId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/todo/tasks/${taskId}`, { method: 'DELETE' });
}

export function createEventArrangementAppointment(
  event: EventItem,
  input: EventArrangementInput,
): Promise<Appointment> {
  return apiJson<Appointment>('/todo/appointments', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      status: 'pending',
      starts_at: null,
      ends_at: input.time,
      repeat_rule: null,
      linked_task_id: null,
      event_id: event.id,
      is_recurring: false,
      period_type: 'once',
      custom_period_days: null,
      max_completions_per_period: 1,
      weekday_only: false,
      time_inherits_from_event: false,
      time_overridden: true,
    }),
  });
}

export function updateEventArrangementAppointment(
  event: EventItem,
  appointmentId: string,
  input: EventArrangementInput,
): Promise<Appointment> {
  return apiJson<Appointment>(`/todo/appointments/${appointmentId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      starts_at: null,
      ends_at: input.time,
      event_id: event.id,
      time_inherits_from_event: false,
      time_overridden: true,
    }),
  });
}

export function deleteEventArrangementAppointment(appointmentId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/todo/appointments/${appointmentId}`, { method: 'DELETE' });
}
