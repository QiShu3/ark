import { apiJson } from '../api';
import type { EventPlanTemplate, EventWorkbench } from './types';

export function getEventWorkbench(eventId: string): Promise<EventWorkbench> {
  return apiJson<EventWorkbench>(`/todo/events/${eventId}/workbench`);
}

export function generateEventPlanDraft(eventId: string): Promise<EventWorkbench> {
  return apiJson<EventWorkbench>(`/todo/events/${eventId}/plan-draft/generate`, {
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
  items: EventPlanTemplateItemInput[];
};

export function createEventPlanTemplate(input: EventPlanTemplateInput): Promise<EventPlanTemplate> {
  return apiJson<EventPlanTemplate>('/todo/event-plan-templates', {
    method: 'POST',
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
