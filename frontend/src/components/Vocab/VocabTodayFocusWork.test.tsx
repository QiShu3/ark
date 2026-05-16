import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import VocabTodayFocusWork from './VocabTodayFocusWork';

const { useVocabDeck, useVocabTodaySession } = vi.hoisted(() => ({
  useVocabDeck: vi.fn(),
  useVocabTodaySession: vi.fn(),
}));

vi.mock('../../hooks/vocab/useVocabDeck', () => ({
  useVocabDeck,
}));

vi.mock('../../hooks/vocab/useVocabTodaySession', () => ({
  useVocabTodaySession,
}));

vi.mock('./DeckSwitcher', () => ({
  default: () => <div>Deck switcher</div>,
}));

function mockReadyCompletedSession() {
  useVocabDeck.mockReturnValue({
    decks: [],
    activeDeck: { id: 'deck-1', name: 'Default' },
    activeDeckVersion: 1,
    inheritancePrompt: null,
    setActiveDeck: vi.fn(),
    confirmInheritance: vi.fn(),
    dismissInheritance: vi.fn(),
  });
  useVocabTodaySession.mockReturnValue({
    ready: true,
    loading: false,
    error: null,
    isBatchReview: false,
    currentItem: null,
    currentBatchNumber: 1,
    totalBatchCount: 1,
    memorizedCount: 10,
    currentMode: 'study',
    submitting: false,
    batchReviewCount: 0,
    batchReviewGroups: [],
    batchReviewActionLabel: '继续',
    continueBatchReview: vi.fn(),
    submit: vi.fn(),
    lastResult: null,
  });
}

describe('VocabTodayFocusWork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadyCompletedSession();
  });

  it('does not auto-complete the app task while focus work is paused', async () => {
    const complete = vi.fn();

    render(
      <VocabTodayFocusWork
        workflow={{
          state: 'focus',
          active_focus_work_type: 'vocab_today',
          focus_work_display_state: 'fullscreen',
          is_paused: true,
        }}
        recordFocus
        onCompleteTaskAndFinish={complete}
        onComplete={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(useVocabTodaySession).toHaveBeenCalled();
    });
    expect(complete).not.toHaveBeenCalled();
  });
});
