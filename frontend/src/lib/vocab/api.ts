import { apiJson } from '../api';
import type {
  VocabDeck,
  VocabMistakeItem,
  VocabReviewItem,
  VocabReviewSubmitPayload,
  VocabReviewSubmitResult,
  VocabTodaySummary,
  VocabWordDetail,
} from './types';

export function fetchVocabDecks() {
  return apiJson<VocabDeck[]>('/api/vocab/decks');
}

export function fetchVocabToday(deckId: string) {
  return apiJson<VocabTodaySummary>(`/api/vocab/decks/${deckId}/today`);
}

export function fetchVocabStudyQueue(deckId: string, limit = 10) {
  return apiJson<VocabReviewItem[]>(`/api/vocab/decks/${deckId}/study?limit=${limit}`);
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

export function submitVocabReview(payload: VocabReviewSubmitPayload) {
  return apiJson<VocabReviewSubmitResult>('/api/vocab/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
