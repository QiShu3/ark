import { apiJson } from '../api';
import type { ChoiceConfigSavePayload, ChoiceConfigStatus } from './types';

export function fetchChoiceConfigStatus(eventId?: string | null) {
  const query = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
  return apiJson<ChoiceConfigStatus>(`/todo/app-tasks/erc-config${query}`);
}

export function saveChoiceConfig(payload: ChoiceConfigSavePayload) {
  return apiJson<ChoiceConfigStatus>('/todo/app-tasks/erc-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
