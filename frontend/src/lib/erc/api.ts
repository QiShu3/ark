import { apiJson } from '../api';
import type { AppTaskStatus } from '../../components/taskTypes';
import type { VocabReviewItem, VocabReviewSubmitResult } from '../vocab/types';
import type {
  ERCAppTaskInitPayload,
  ERCArticleDetail,
  ERCArticleListItem,
  ERCArticleSubmitResult,
  ERCMistakeItem,
  ERCOverview,
  ERCPracticeAnswer,
  ERCReviewNext,
  ERCReviewSubmitResult,
  ERCSet,
} from './types';

export function fetchERCOverview() {
  return apiJson<ERCOverview>('/api/erc/overview');
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

export function fetchERCVocabularyPreheat(articleId: string) {
  return apiJson<VocabReviewItem[]>(`/api/erc/articles/${articleId}/vocabulary/preheat`);
}

export function submitERCVocabularyPreheat(
  articleId: string,
  payload: {
    deck_id: string;
    word_id: string;
    result: 'again' | 'hard' | 'good' | 'easy';
    prompt_type: 'en_to_zh' | 'zh_to_en';
  },
) {
  return apiJson<VocabReviewSubmitResult>(`/api/erc/articles/${articleId}/vocabulary/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchERCReviewNext() {
  return apiJson<ERCReviewNext>('/api/erc/review/next');
}

export function submitERCReview(questionId: string, chosenOption: 'A' | 'B' | 'C' | 'D', timeSpentMs?: number) {
  return apiJson<ERCReviewSubmitResult>('/api/erc/review/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: questionId, chosen_option: chosenOption, time_spent_ms: timeSpentMs }),
  });
}

export function fetchERCMistakes() {
  return apiJson<ERCMistakeItem[]>('/api/erc/mistakes');
}
