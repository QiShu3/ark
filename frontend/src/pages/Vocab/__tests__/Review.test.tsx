import '@testing-library/jest-dom';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useVocabDeck } from '../../../hooks/vocab/useVocabDeck';

vi.mock('../../../lib/vocab/api', () => ({
  fetchVocabDecks: vi.fn().mockResolvedValue([
    { id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' },
  ]),
}));

describe('useVocabDeck', () => {
  it('loads deck options', async () => {
    const { result } = renderHook(() => useVocabDeck());

    await waitFor(() => expect(result.current.decks).toHaveLength(1));
    expect(result.current.activeDeck?.key).toBe('cet4');
  });
});
