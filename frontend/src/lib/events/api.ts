import { apiJson } from '../api';
import type { EventItem, EventPlanDraftItem, EventPlanTemplate, EventWorkbench } from './types';

export type EventCreateInput = Pick<EventItem, 'name' | 'start_date' | 'due_at' | 'is_primary'>;
export type EventUpdateInput = Partial<EventCreateInput>;

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

export function getEventWorkbench(eventId: string): Promise<EventWorkbench> {
  return apiJson<EventWorkbench>(`/todo/events/${eventId}/workbench`);
}

export function generateEventPlanDraft(eventId: string): Promise<EventWorkbench> {
  return apiJson<EventWorkbench>(`/todo/events/${eventId}/plan-draft/generate`, {
    method: 'POST',
  });
}

export type EventPlanDraftItemInput = Partial<Pick<
  EventPlanDraftItem,
  'title' | 'content' | 'scheduled_for' | 'starts_at' | 'ends_at' | 'payload' | 'sort_order'
>>;

export function updateEventPlanDraftItem(
  eventId: string,
  itemId: string,
  input: EventPlanDraftItemInput,
): Promise<EventWorkbench> {
  return apiJson<EventWorkbench>(`/todo/events/${eventId}/plan-draft/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteEventPlanDraftItem(eventId: string, itemId: string): Promise<EventWorkbench> {
  return apiJson<EventWorkbench>(`/todo/events/${eventId}/plan-draft/items/${itemId}`, {
    method: 'DELETE',
  });
}

export type EventPlanDraftSaveAsTemplateInput = {
  name: string;
  description?: string | null;
  schedule_mode: 'from_start' | 'before_due';
};

export function saveEventPlanDraftAsTemplate(
  eventId: string,
  input: EventPlanDraftSaveAsTemplateInput,
): Promise<EventPlanTemplate> {
  return apiJson<EventPlanTemplate>(`/todo/events/${eventId}/plan-draft/save-as-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateEventPlanDraftSourceTemplate(eventId: string): Promise<EventPlanTemplate> {
  return apiJson<EventPlanTemplate>(`/todo/events/${eventId}/plan-draft/update-source-template`, {
    method: 'POST',
  });
}

export function listEventPlanTemplates(): Promise<EventPlanTemplate[]> {
  return apiJson<EventPlanTemplate[]>('/todo/event-plan-templates');
}

export function applyEventPlanTemplate(eventId: string, templateId: string): Promise<EventWorkbench> {
  return apiJson<EventWorkbench>(`/todo/events/${eventId}/plan-draft/apply-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id: templateId }),
  });
}

export type EventPlanTemplateItemInput = {
  kind: 'task' | 'appointment';
  title: string;
  content?: string | null;
  offset_days: number;
  sort_order: number;
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

export function copyEventPlanTemplate(templateId: string): Promise<EventPlanTemplate> {
  return apiJson<EventPlanTemplate>(`/todo/event-plan-templates/${templateId}/copy`, {
    method: 'POST',
  });
}

export function deleteEventPlanTemplate(templateId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/todo/event-plan-templates/${templateId}`, {
    method: 'DELETE',
  });
}
