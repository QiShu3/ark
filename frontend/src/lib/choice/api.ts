import { apiJson } from '../api';
import type {
  ChoiceAnswerSubmitResult,
  ChoiceBank,
  ChoiceFilters,
  ChoiceItem,
  ChoiceMistakeItem,
  ChoiceOverview,
  ChoiceReviewNext,
  SetSnapshot,
} from './types';

export function fetchChoiceBanks() {
  return apiJson<ChoiceBank[]>('/api/choice/banks');
}

export function fetchChoiceFilters(
  bankId: string,
  opts?: { year?: number; subject?: string; tag?: string },
) {
  const params = new URLSearchParams({ bank_id: bankId });
  if (opts?.year != null) params.set('year', String(opts.year));
  if (opts?.subject) params.set('subject', opts.subject);
  if (opts?.tag) params.set('tag', opts.tag);
  return apiJson<ChoiceFilters>(`/api/choice/filters?${params.toString()}`);
}

export function fetchChoiceItems(
  bankId: string,
  opts?: {
    year?: number;
    subject?: string;
    tag?: string;
    limit?: number;
    offset?: number;
    excludeAnswered?: boolean;
  },
) {
  const params = new URLSearchParams({ bank_id: bankId });
  if (opts?.year != null) params.set('year', String(opts.year));
  if (opts?.subject) params.set('subject', opts.subject);
  if (opts?.tag) params.set('tag', opts.tag);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  if (opts?.excludeAnswered) params.set('exclude_answered', 'true');
  return apiJson<ChoiceItem[]>(`/api/choice/items?${params.toString()}`);
}

export function submitChoiceAnswer(questionId: string, chosenOption: string) {
  return apiJson<ChoiceAnswerSubmitResult>(`/api/choice/questions/${encodeURIComponent(questionId)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chosen_option: chosenOption }),
  });
}

export function fetchChoiceOverview(bankId: string) {
  const params = new URLSearchParams({ bank_id: bankId });
  return apiJson<ChoiceOverview>(`/api/choice/overview?${params.toString()}`);
}

export function fetchChoiceReviewNext(bankId: string) {
  const params = new URLSearchParams({ bank_id: bankId });
  return apiJson<ChoiceReviewNext>(`/api/choice/review/next?${params.toString()}`);
}

export function fetchChoiceMistakes(bankId: string) {
  const params = new URLSearchParams({ bank_id: bankId });
  return apiJson<ChoiceMistakeItem[]>(`/api/choice/mistakes?${params.toString()}`);
}

export function fetchSetSnapshots(bankId: string, opts?: { limit?: number; offset?: number }) {
  const params = new URLSearchParams({ bank_id: bankId });
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  return apiJson<SetSnapshot[]>(`/api/choice/snapshots?${params.toString()}`);
}
