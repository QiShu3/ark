import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import Home from '../Home';

vi.mock('../../../hooks/vocab/useVocabDeck', () => ({
  useVocabDeck: () => ({
    decks: [
      { id: 'deck-1', key: 'cet6', name: 'CET6', description: '', word_count: 7508, created_at: '', updated_at: '' },
      { id: 'deck-2', key: 'cet6luan', name: 'CET6luan', description: '', word_count: 1200, created_at: '', updated_at: '' },
    ],
    activeDeck: { id: 'deck-1', key: 'cet6', name: 'CET6', description: '', word_count: 7508, created_at: '', updated_at: '' },
    setActiveDeck: vi.fn(),
    loading: false,
    error: null,
  }),
}));

vi.mock('../../../lib/vocab/api', () => ({
  fetchVocabToday: vi.fn().mockResolvedValue({ new_count: 12, review_count: 5, mistake_count: 2 }),
}));

describe('Vocab home page', () => {
  it('renders active deck and keeps deck switching collapsed by default', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText('CET6')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '切换词书' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CET6luan' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '切换词书' }));

    expect(screen.getByRole('button', { name: 'CET6luan' })).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(await screen.findByText('5')).toBeInTheDocument();
    expect(await screen.findByText('2')).toBeInTheDocument();
  });
});
