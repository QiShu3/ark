import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Today from '../Today';

const submit = vi.fn();
const continueBatchReview = vi.fn();
const sessionState = {
  currentItem: {
    id: 'word-1',
    deck_id: 'deck-1',
    word: 'abruptly',
    us_pronunciation: "ə'brʌptli",
    uk_pronunciation: "ə'brʌptlɪ",
    translations: [{ pos: 'adv', translation: '突然地' }],
    phrases: [],
    sentences: [],
    prompt_type: 'en_to_zh' as const,
    review_mode: 'review' as const,
    mastery_score: 0,
  },
  currentMode: 'review' as const,
  loading: false,
  error: null,
  submitting: false,
  lastResult: null,
  submit,
  learningRemaining: 2,
  reviewRemaining: 3,
  studyRemaining: 5,
  totalRemaining: 10,
  currentBatchNumber: 1,
  totalBatchCount: 3,
  memorizedCount: 24,
  isBatchReview: false,
  batchReviewCount: 0,
  batchReviewGroups: [],
  batchReviewActionLabel: '进入下一批',
  continueBatchReview,
};

vi.mock('../../../hooks/vocab/useVocabDeck', () => ({
  useVocabDeck: () => ({
    decks: [{ id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' }],
    activeDeck: { id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' },
    activeDeckVersion: 0,
    inheritancePrompt: null,
    setActiveDeck: vi.fn(),
    confirmInheritance: vi.fn(),
    dismissInheritance: vi.fn(),
  }),
}));

vi.mock('../../../hooks/vocab/useVocabTodaySession', () => ({
  useVocabTodaySession: () => sessionState,
}));

describe('Vocab today page', () => {
  beforeEach(() => {
    submit.mockReset();
    continueBatchReview.mockReset();
    Object.assign(sessionState, {
      currentItem: {
        id: 'word-1',
        deck_id: 'deck-1',
        word: 'abruptly',
        us_pronunciation: "ə'brʌptli",
        uk_pronunciation: "ə'brʌptlɪ",
        translations: [{ pos: 'adv', translation: '突然地' }],
        phrases: [],
        sentences: [],
        prompt_type: 'en_to_zh',
        review_mode: 'review',
        mastery_score: 0,
      },
      currentMode: 'review',
      loading: false,
      error: null,
      submitting: false,
      lastResult: null,
      submit,
      learningRemaining: 2,
      reviewRemaining: 3,
      studyRemaining: 5,
      totalRemaining: 10,
      currentBatchNumber: 1,
      totalBatchCount: 3,
      memorizedCount: 24,
      isBatchReview: false,
      batchReviewCount: 0,
      batchReviewGroups: [],
      batchReviewActionLabel: '进入下一批',
      continueBatchReview,
    });
  });

  it('renders a unified today flow and submits four-grade review actions', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Today />
      </MemoryRouter>,
    );

    expect(screen.getByText('第 1 批 / 共 3 批')).toBeInTheDocument();
    expect(screen.getByText('abruptly')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /很轻松/ }));

    expect(submit).toHaveBeenCalledWith('easy');
  });

  it('renders the flashcard with rating buttons', async () => {
    render(
      <MemoryRouter>
        <Today />
      </MemoryRouter>,
    );

    expect(screen.getByText('abruptly')).toBeInTheDocument();
    expect(screen.getByText('没记住')).toBeInTheDocument();
    expect(screen.getByText('有点难')).toBeInTheDocument();
    expect(screen.getByText('记住了')).toBeInTheDocument();
    expect(screen.getByText('很轻松')).toBeInTheDocument();
  });
});
