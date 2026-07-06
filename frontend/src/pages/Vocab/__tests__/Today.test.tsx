import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Today from '../Today';

const { fetchVocabFocusQueue, submitVocabContentReview, useVocabDeck } = vi.hoisted(() => ({
  fetchVocabFocusQueue: vi.fn(),
  submitVocabContentReview: vi.fn(),
  useVocabDeck: vi.fn(),
}));

function reviewItem() {
  return {
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
    next_review_at: null,
    fsrs_card_json: null,
  };
}

vi.mock('../../../hooks/vocab/useVocabDeck', () => ({
  useVocabDeck,
}));

vi.mock('../../../lib/vocab/api', () => ({
  fetchVocabFocusQueue,
  submitVocabContentReview,
}));

describe('Vocab today page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVocabDeck.mockReturnValue({
      decks: [{ id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' }],
      activeDeck: { id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' },
      activeDeckVersion: 0,
      inheritancePrompt: null,
      setActiveDeck: vi.fn(),
      confirmInheritance: vi.fn(),
      dismissInheritance: vi.fn(),
      loading: false,
      error: null,
    });
    fetchVocabFocusQueue.mockResolvedValue([reviewItem()]);
    submitVocabContentReview.mockResolvedValue({
      mastery_score: 10,
      next_review_at: '2026-06-10T00:00:00Z',
      wrong_count: 0,
      correct_count: 1,
      interval_days: 1,
      result: 'easy',
      should_repeat_today: false,
    });
  });

  it('renders a unified today flow and submits four-grade review actions', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Today />
      </MemoryRouter>,
    );

    expect(await screen.findByText('abruptly')).toBeInTheDocument();
    expect(screen.getByText('0 / 10')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /很轻松/ }));

    expect(submitVocabContentReview).toHaveBeenCalledWith({
      deck_id: 'deck-1',
      word_id: 'word-1',
      result: 'easy',
      review_mode: 'review',
      prompt_type: 'en_to_zh',
    });
  });

  it('renders the flashcard with rating buttons', async () => {
    render(
      <MemoryRouter>
        <Today />
      </MemoryRouter>,
    );

    expect(await screen.findByText('abruptly')).toBeInTheDocument();
    expect(screen.getByText('没记住')).toBeInTheDocument();
    expect(screen.getByText('有点难')).toBeInTheDocument();
    expect(screen.getByText('记住了')).toBeInTheDocument();
    expect(screen.getByText('很轻松')).toBeInTheDocument();
  });
});
