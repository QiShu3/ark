import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Study from '../Study';

const submit = vi.fn();

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

vi.mock('../../../hooks/vocab/useVocabSession', () => ({
  useVocabSession: () => ({
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
      review_mode: 'study',
      mastery_score: 0,
    },
    loading: false,
    error: null,
    submitting: false,
    lastResult: null,
    submit,
  }),
}));

describe('Vocab study page', () => {
  beforeEach(() => {
    submit.mockReset();
  });

  it('renders study actions and submits the selected result', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Study />
      </MemoryRouter>,
    );

    expect(screen.getByText('abruptly')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /没记住/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /有点难/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /记住了/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /很轻松/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /很轻松/ }));

    expect(submit).toHaveBeenCalledWith('easy');
  });
});
