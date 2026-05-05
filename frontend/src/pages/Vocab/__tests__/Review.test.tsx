import '@testing-library/jest-dom';
import { StrictMode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVocabDeck } from '../../../hooks/vocab/useVocabDeck';

const { fetchVocabDecks } = vi.hoisted(() => ({
  fetchVocabDecks: vi.fn().mockResolvedValue([
    { id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' },
  ]),
}));

vi.mock('../../../lib/vocab/api', () => ({
  fetchVocabDecks,
}));

describe('useVocabDeck', () => {
  beforeEach(() => {
    fetchVocabDecks.mockClear();
    window.localStorage.clear();
  });

  it('loads deck options', async () => {
    const { result } = renderHook(() => useVocabDeck(), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });

    await waitFor(() => expect(result.current.decks).toHaveLength(1));
    expect(result.current.activeDeck?.key).toBe('cet4');
    expect(fetchVocabDecks).toHaveBeenCalledTimes(1);
  });
});
