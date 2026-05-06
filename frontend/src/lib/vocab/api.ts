import { apiJson } from '../api';
import type {
  VocabDeck,
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
  return apiJson<VocabDeck[]>('/api/vocab/decks');
}

export function fetchVocabToday(deckId: string) {
  return apiJson<VocabTodaySummary>(`/api/vocab/decks/${deckId}/today`);
}

export function fetchVocabOverview(deckId: string) {
  return apiJson<VocabOverview>(`/api/vocab/decks/${deckId}/overview`);
}

export function fetchVocabOverviewCompletedDecks(deckId: string) {
  return apiJson<VocabOverviewCompletedDeck[]>(`/api/vocab/decks/${deckId}/overview/completed-decks`);
}

export function fetchVocabOverviewMasteredWords(deckId: string) {
  return apiJson<VocabOverviewMasteredWord[]>(`/api/vocab/decks/${deckId}/overview/mastered-words`);
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
  return apiJson<VocabOverviewCurrentWord[]>(`/api/vocab/decks/${deckId}/overview/current-words?${query.toString()}`);
}

export function fetchVocabStudyQueue(deckId: string, limit = 10) {
  return apiJson<VocabReviewItem[]>(`/api/vocab/decks/${deckId}/study?limit=${limit}`);
}

export function fetchVocabLearningQueue(deckId: string, limit = 10) {
  return apiJson<VocabReviewItem[]>(`/api/vocab/decks/${deckId}/learning?limit=${limit}`);
}

export function fetchVocabReviewQueue(deckId: string, limit = 10) {
  return apiJson<VocabReviewItem[]>(`/api/vocab/decks/${deckId}/review?limit=${limit}`);
}

export function fetchVocabMistakes(deckId: string, limit = 50) {
  return apiJson<VocabMistakeItem[]>(`/api/vocab/decks/${deckId}/mistakes?limit=${limit}`);
}

export function fetchVocabWordDetail(wordId: string) {
  return apiJson<VocabWordDetail>(`/api/vocab/words/${wordId}`);
}

export function updateVocabTodaySettings(deckId: string, payload: VocabTodaySettingsPayload) {
  return apiJson<VocabTodaySummary>(`/api/vocab/decks/${deckId}/today/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function submitVocabReview(payload: VocabReviewSubmitPayload) {
  return apiJson<VocabReviewSubmitResult>('/api/vocab/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
