import '@testing-library/jest-dom';
import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVocabDeck } from '../../../hooks/vocab/useVocabDeck';

const {
  fetchVocabDecks,
  fetchVocabInheritancePreview,
  fetchVocabOverview,
  inheritVocabMasteredWords,
} = vi.hoisted(() => ({
  fetchVocabDecks: vi.fn().mockResolvedValue([
    { id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' },
    { id: 'deck-2', key: 'cet6', name: 'CET6', description: '', word_count: 1200, created_at: '', updated_at: '' },
  ]),
  fetchVocabInheritancePreview: vi.fn(),
  fetchVocabOverview: vi.fn(),
  inheritVocabMasteredWords: vi.fn(),
}));

vi.mock('../../../lib/vocab/api', () => ({
  fetchVocabDecks,
  fetchVocabInheritancePreview,
  fetchVocabOverview,
  inheritVocabMasteredWords,
}));

describe('useVocabDeck', () => {
  beforeEach(() => {
    fetchVocabDecks.mockClear();
    fetchVocabInheritancePreview.mockReset();
    fetchVocabOverview.mockReset();
    inheritVocabMasteredWords.mockReset();
    window.localStorage.clear();
  });

  it('loads deck options', async () => {
    const { result } = renderHook(() => useVocabDeck(), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });

    await waitFor(() => expect(result.current.decks).toHaveLength(2));
    expect(result.current.activeDeck?.key).toBe('cet4');
    expect(fetchVocabDecks).toHaveBeenCalledTimes(1);
  });

  it('prompts inheritance when switching to an unused deck with global matches', async () => {
    fetchVocabOverview.mockResolvedValue({
      completed_deck_count: 0,
      total_deck_count: 2,
      mastered_word_count: 100,
      current_deck: {
        deck_id: 'deck-2',
        deck_name: 'CET6',
        total_word_count: 1200,
        mastered_word_count: 0,
        learning_word_count: 0,
        unstarted_word_count: 1200,
      },
    });
    fetchVocabInheritancePreview.mockResolvedValue({ inheritable_word_count: 32 });

    const { result } = renderHook(() => useVocabDeck(), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });

    await waitFor(() => expect(result.current.decks).toHaveLength(2));
    act(() => {
      result.current.setActiveDeck(result.current.decks[1]);
    });

    await waitFor(() => expect(result.current.inheritancePrompt?.inheritableWordCount).toBe(32));
    expect(result.current.activeDeck?.key).toBe('cet6');
  });
});
