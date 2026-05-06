import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Today from '../Today';

const submit = vi.fn();

vi.mock('../../../hooks/vocab/useVocabDeck', () => ({
  useVocabDeck: () => ({
    decks: [{ id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' }],
    activeDeck: { id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' },
    setActiveDeck: vi.fn(),
  }),
}));

vi.mock('../../../hooks/vocab/useVocabTodaySession', () => ({
  useVocabTodaySession: () => ({
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
  }),
}));

describe('Vocab today page', () => {
  beforeEach(() => {
    submit.mockReset();
  });

  it('renders a unified today flow and submits four-grade review actions', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Today />
      </MemoryRouter>,
    );

    expect(screen.getByText('今日单词')).toBeInTheDocument();
    expect(screen.getByText('先完成今日复习，再进入今天的新词。')).toBeInTheDocument();
    expect(screen.getByText('剩余 10')).toBeInTheDocument();
    expect(screen.getByText('Learning 2')).toBeInTheDocument();
    expect(screen.getByText('复习 3')).toBeInTheDocument();
    expect(screen.getByText('新词 5')).toBeInTheDocument();
    expect(screen.getByText('abruptly')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /很轻松/ }));

    expect(submit).toHaveBeenCalledWith('easy');
  });
});
