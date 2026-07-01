import { apiJson } from '../api';
import type { AppTaskStatus } from '../../components/taskTypes';
import type {
  VocabAppTaskInitPayload,
  VocabDeck,
  VocabInheritanceApplyResult,
  VocabInheritancePreview,
  VocabOverviewCompletedDeck,
  VocabOverviewCurrentWord,
  VocabOverviewMasteredWord,
  VocabOverview,
  VocabMistakeItem,
  VocabReviewItem,
  VocabReviewSubmitPayload,
  VocabReviewSubmitResult,
  VocabTodaySettingsPayload,
  VocabTodaySummary,
  VocabWordDetail,
} from './types';

export function fetchVocabDecks() {
  return apiJson<VocabDeck[]>('/api/flash/decks');
}

export function fetchVocabToday(deckId: string) {
  return apiJson<VocabTodaySummary>(`/api/flash/decks/${deckId}/today`);
}

export function fetchVocabAppTaskStatus() {
  return apiJson<AppTaskStatus>('/todo/app-tasks/vocab/status');
}

export function initializeVocabAppTask(payload: VocabAppTaskInitPayload) {
  return apiJson<AppTaskStatus>('/todo/app-tasks/vocab/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchVocabOverview(deckId: string) {
  return apiJson<VocabOverview>(`/api/flash/decks/${deckId}/overview`);
}

export function fetchVocabInheritancePreview(deckId: string) {
  return apiJson<VocabInheritancePreview>(`/api/flash/decks/${deckId}/inheritance-preview`);
}

export function inheritVocabMasteredWords(deckId: string) {
  return apiJson<VocabInheritanceApplyResult>(`/api/flash/decks/${deckId}/inherit-mastered-words`, {
    method: 'POST',
  });
}

export function fetchVocabOverviewCompletedDecks(deckId: string) {
  return apiJson<VocabOverviewCompletedDeck[]>(`/api/flash/decks/${deckId}/overview/completed-decks`);
}

export function fetchVocabOverviewMasteredWords(deckId: string) {
  return apiJson<VocabOverviewMasteredWord[]>(`/api/flash/decks/${deckId}/overview/mastered-words`);
}

export function fetchVocabOverviewCurrentWords(
  deckId: string,
  state: 'all' | 'unstarted' | 'learning' | 'mastered' = 'all',
  targetDeckId?: string,
) {
  const query = new URLSearchParams({ state });
  if (targetDeckId) {
    query.set('target_deck_id', targetDeckId);
  }
  return apiJson<VocabOverviewCurrentWord[]>(`/api/flash/decks/${deckId}/overview/current-words?${query.toString()}`);
}

export function fetchVocabFocusQueue(deckId: string, limit = 10) {
  return apiJson<VocabReviewItem[]>(`/api/flash/decks/${deckId}/focus-queue?limit=${limit}`);
}

export function fetchVocabStudyQueue(deckId: string, limit = 10) {
  return apiJson<VocabReviewItem[]>(`/api/flash/decks/${deckId}/study?limit=${limit}`);
}

export function fetchVocabLearningQueue(deckId: string, limit = 10) {
  return apiJson<VocabReviewItem[]>(`/api/flash/decks/${deckId}/learning?limit=${limit}`);
}

export function fetchVocabReviewQueue(deckId: string, limit = 10) {
  return apiJson<VocabReviewItem[]>(`/api/flash/decks/${deckId}/review?limit=${limit}`);
}

export function fetchVocabMistakes(deckId: string, limit = 50) {
  return apiJson<VocabMistakeItem[]>(`/api/flash/decks/${deckId}/mistakes?limit=${limit}`);
}

export function fetchVocabWordDetail(wordId: string) {
  return apiJson<VocabWordDetail>(`/api/flash/words/${wordId}`);
}

export function updateVocabTodaySettings(deckId: string, payload: VocabTodaySettingsPayload) {
  return apiJson<VocabTodaySummary>(`/api/flash/decks/${deckId}/today/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function submitVocabReview(payload: VocabReviewSubmitPayload) {
  return apiJson<VocabReviewSubmitResult>('/api/flash/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function submitVocabContentReview(payload: VocabReviewSubmitPayload) {
  return apiJson<VocabReviewSubmitResult>('/api/flash/content-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
