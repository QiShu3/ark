import { apiJson } from '../api';
import type {
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

export function fetchERCSets() {
  return apiJson<ERCSet[]>('/api/erc/sets');
}

export function fetchERCArticles(setId?: string) {
  const query = setId ? `?set_id=${encodeURIComponent(setId)}` : '';
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
