import { apiJson } from '../api';
import type { AppTaskStatus } from '../../components/taskTypes';
import type {
  ERCAppTaskInitPayload,
  ERCArticleDetail,
  ERCArticleListItem,
  ERCArticleSubmitResult,
  ERCConfigSavePayload,
  ERCConfigStatus,
  ERCMistakeItem,
  ERCOverview,
  ERCPracticeAnswer,
  ERCReviewNext,
  ERCReviewSubmitResult,
  ERCSet,
} from './types';

export function fetchERCOverview(setId?: string | null) {
  const query = setId ? `?set_id=${encodeURIComponent(setId)}` : '';
  return apiJson<ERCOverview>(`/api/erc/overview${query}`);
}

export function fetchERCConfigStatus(eventId?: string | null) {
  const query = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
  return apiJson<ERCConfigStatus>(`/todo/app-tasks/erc-config${query}`);
}

export function saveERCConfig(payload: ERCConfigSavePayload) {
  return apiJson<ERCConfigStatus>('/todo/app-tasks/erc-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchERCAppTaskStatus() {
  return apiJson<AppTaskStatus>('/todo/app-tasks/erc/status');
}

export function initializeERCAppTask(payload: ERCAppTaskInitPayload) {
  return apiJson<AppTaskStatus>('/todo/app-tasks/erc/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchERCPracticeAppTaskStatus() {
  return apiJson<AppTaskStatus>('/todo/app-tasks/erc-practice/status');
}

export function initializeERCPracticeAppTask(payload: {
  default_focus_duration: number;
  add_to_today_plan: boolean;
  event_id?: string | null;
  daily_article_target: number;
}) {
  return apiJson<AppTaskStatus>('/todo/app-tasks/erc-practice/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchERCSets() {
  return apiJson<ERCSet[]>('/api/erc/sets');
}

export function fetchERCArticles(filters: { setId?: string; exam?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.setId) {
    params.set('set_id', filters.setId);
  }
  if (filters.exam) {
    params.set('exam', filters.exam);
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiJson<ERCArticleListItem[]>(`/api/erc/articles${query}`);
}

export function fetchERCArticle(articleId: string) {
  return apiJson<ERCArticleDetail>(`/api/erc/articles/${articleId}`);
}

export function submitERCArticle(articleId: string, answers: ERCPracticeAnswer[], timeSpentMs?: number) {
  return apiJson<ERCArticleSubmitResult>(`/api/erc/articles/${articleId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, time_spent_ms: timeSpentMs }),
  });
}

export function fetchERCReviewNext(setId?: string | null) {
  const query = setId ? `?set_id=${encodeURIComponent(setId)}` : '';
  return apiJson<ERCReviewNext>(`/api/erc/review/next${query}`);
}

export function submitERCReview(questionId: string, chosenOption: 'A' | 'B' | 'C' | 'D', timeSpentMs?: number) {
  return apiJson<ERCReviewSubmitResult>('/api/erc/review/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: questionId, chosen_option: chosenOption, time_spent_ms: timeSpentMs }),
  });
}

export function fetchERCMistakes(setId?: string | null) {
  const query = setId ? `?set_id=${encodeURIComponent(setId)}` : '';
  return apiJson<ERCMistakeItem[]>(`/api/erc/mistakes${query}`);
}
