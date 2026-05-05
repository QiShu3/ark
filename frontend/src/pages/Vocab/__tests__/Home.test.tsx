import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import Home from '../Home';

vi.mock('../../../hooks/vocab/useVocabDeck', () => ({
  useVocabDeck: () => ({
    decks: [{ id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' }],
    activeDeck: { id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' },
    setActiveDeck: vi.fn(),
    loading: false,
    error: null,
  }),
}));

vi.mock('../../../lib/vocab/api', () => ({
  fetchVocabToday: vi.fn().mockResolvedValue({ new_count: 12, review_count: 5, mistake_count: 2 }),
}));

describe('Vocab home page', () => {
  it('renders active deck and today summary', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText('CET4')).toHaveLength(2);
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(await screen.findByText('5')).toBeInTheDocument();
    expect(await screen.findByText('2')).toBeInTheDocument();
  });
});
