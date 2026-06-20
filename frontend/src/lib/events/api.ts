import { apiJson } from '../api';
import type { EventItem, EventPlanTemplate, EventTemplateStoreTemplate, EventWorkbench } from './types';

export type EventCreateInput = Pick<EventItem, 'name' | 'start_date' | 'due_at' | 'is_primary'>;
export type EventUpdateInput = Partial<EventCreateInput>;
export type EventDeletePreview = {
  tasks_count: number;
  appointments_count: number;
  workflows_count: number;
  app_configs_count: number;
};

export function listEvents(): Promise<EventItem[]> {
  return apiJson<EventItem[]>('/todo/events');
}

export function getPrimaryEvent(): Promise<EventItem> {
  return apiJson<EventItem>('/todo/events/primary');
}

export function createEvent(input: EventCreateInput): Promise<EventItem> {
  return apiJson<EventItem>('/todo/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateEvent(eventId: string, input: EventUpdateInput): Promise<EventItem> {
  return apiJson<EventItem>(`/todo/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteEvent(eventId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/todo/events/${eventId}`, {
    method: 'DELETE',
  });
}

export function getEventDeletePreview(eventId: string): Promise<EventDeletePreview> {
  return apiJson<EventDeletePreview>(`/todo/events/${eventId}/delete-preview`);
}

export function getEventWorkbench(eventId: string): Promise<EventWorkbench> {
  return apiJson<EventWorkbench>(`/todo/events/${eventId}/workbench`);
}

export function listEventPlanTemplates(): Promise<EventPlanTemplate[]> {
  return apiJson<EventPlanTemplate[]>('/todo/event-plan-templates');
}

export function listEventTemplateStore(): Promise<EventTemplateStoreTemplate[]> {
  return apiJson<EventTemplateStoreTemplate[]>('/todo/event-template-store');
}

export type EventPlanTemplateItemInput = {
  kind: 'task' | 'appointment';
  title: string;
  content?: string | null;
  offset_days: number;
  sort_order: number;
  details?: Record<string, unknown>;
};

export type EventPlanTemplateAppConfigInput = {
  client_id: string;
  app_type: 'vocab_today' | 'practice' | 'review';
  config: Record<string, unknown>;
};

export type EventPlanTemplateWorkflowInput = {
  client_id: string;
  name: string;
  focus_duration: number;
  break_duration: number;
  default_focus_timer_mode: 'countdown' | 'countup';
  phases: Array<{
    phase_type: 'focus' | 'break';
    duration: number;
    timer_mode?: 'countdown' | 'countup' | null;
    task_id?: string | null;
    focus_work_type?: string | null;
    is_temporary?: boolean;
    record_focus?: boolean;
  }>;
};

export type EventPlanTemplateInput = {
  name: string;
  description?: string | null;
  schedule_mode: 'from_start' | 'before_due';
  default_event_name?: string | null;
  default_start_date?: string | null;
  default_due_at?: string | null;
  default_is_primary?: boolean | null;
  items: EventPlanTemplateItemInput[];
  app_configs?: EventPlanTemplateAppConfigInput[];
  workflows?: EventPlanTemplateWorkflowInput[];
};

export function createEventPlanTemplate(input: EventPlanTemplateInput): Promise<EventPlanTemplate> {
  return apiJson<EventPlanTemplate>('/todo/event-plan-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateEventPlanTemplate(templateId: string, input: EventPlanTemplateInput): Promise<EventPlanTemplate> {
  return apiJson<EventPlanTemplate>(`/todo/event-plan-templates/${templateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteEventPlanTemplate(templateId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/todo/event-plan-templates/${templateId}`, {
    method: 'DELETE',
  });
}
