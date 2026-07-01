import '@testing-library/jest-dom';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlashcardAdapter } from '../../../adapters/useFlashcardAdapter';

const {
  fetchVocabToday,
  fetchVocabOverview,
  fetchVocabAppTaskStatus,
} = vi.hoisted(() => ({
  fetchVocabToday: vi.fn(),
  fetchVocabOverview: vi.fn(),
  fetchVocabAppTaskStatus: vi.fn(),
}));

vi.mock('../../../hooks/vocab/useVocabDeck', () => ({
  useVocabDeck: () => ({
    decks: [
      { id: 'deck-1', key: 'cet6', name: 'CET6', description: '', word_count: 7508, created_at: '', updated_at: '' },
      { id: 'deck-2', key: 'cet6luan', name: 'CET6luan', description: '', word_count: 1200, created_at: '', updated_at: '' },
    ],
    activeDeck: { id: 'deck-1', key: 'cet6', name: 'CET6', description: '', word_count: 7508, created_at: '', updated_at: '' },
    activeDeckVersion: 0,
    inheritancePrompt: null,
    setActiveDeck: vi.fn(),
    confirmInheritance: vi.fn(),
    dismissInheritance: vi.fn(),
    loading: false,
    error: null,
  }),
}));

vi.mock('../../../lib/vocab/api', () => ({
  fetchVocabToday,
  fetchVocabOverview,
  fetchVocabAppTaskStatus,
}));

const mockFw = {
  type: 'flash_card', label: '今日单词', template: 'flash_card' as const,
  contentBankType: 'word_deck' as const, contentSelector: 'fsrs_mixed', contentFields: [],
};

describe('useFlashcardAdapter (Vocab)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchVocabToday.mockResolvedValue({
      total_count: 20, completed_count: 10, pending_count: 10,
      new_count: 4, review_count: 6, mistake_count: 0,
      learning_count: 0, daily_target_count: 20, memorized_count: 0,
    });
    fetchVocabOverview.mockResolvedValue({
      completed_deck_count: 3, total_deck_count: 10,
      mastered_word_count: 500,
      current_deck: {
        deck_id: 'deck-1', deck_name: 'CET6',
        total_word_count: 7508, mastered_word_count: 3000,
        learning_word_count: 2000, unstarted_word_count: 2508,
      },
    });
    fetchVocabAppTaskStatus.mockResolvedValue({ state: 'ready' });
  });

  it('returns deck list as contentBank options', async () => {
    const { result } = renderHook(() => useFlashcardAdapter(mockFw, 'vocab'));

    await waitFor(() => {
      expect(result.current.contentBank.type).toBe('word_deck');
      expect(result.current.contentBank.options).toEqual([
        { id: 'deck-1', name: 'CET6' },
        { id: 'deck-2', name: 'CET6luan' },
      ]);
    });
  });

  it('derives today progress metrics from today summary', async () => {
    const { result } = renderHook(() => useFlashcardAdapter(mockFw, 'vocab'));

    await waitFor(() => {
      expect(result.current.metrics[0].value).toBe('10 / 20');
      expect(result.current.metrics[1].value).toBe(10);
    });
  });

  it('returns null assetContent when overview not loaded', () => {
    fetchVocabOverview.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useFlashcardAdapter(mockFw, 'vocab'));
    expect(result.current.assetContent).toBeNull();
  });
});

// TODO: App-level config modal, overview detail modal, and task init/save tests
// will be re-enabled when useSubAppHomePage gains full config/arrangements support.
// These were previously tested via the now-deleted VocabHome component.
describe('Vocab Home — config and overview details (TODO)', () => {
  it.skip('opens config dialog and saves new total target', () => {});
  it.skip('opens config dialog from completed managed task state', () => {});
  it.skip('opens overview detail dialog and loads current deck words', () => {});
  it.skip('reuses cached overview when reopening detail modal', () => {});
});
