import { apiJson } from '../api';
import type { EventWorkbench } from './types';

export function getEventWorkbench(eventId: string): Promise<EventWorkbench> {
  return apiJson<EventWorkbench>(`/todo/events/${eventId}/workbench`);
}

export function generateEventPlanDraft(eventId: string): Promise<EventWorkbench> {
  return apiJson<EventWorkbench>(`/todo/events/${eventId}/plan-draft/generate`, {
    method: 'POST',
  });
}
