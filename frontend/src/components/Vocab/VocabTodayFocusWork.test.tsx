import { render, waitFor, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import VocabTodayFocusWork from './VocabTodayFocusWork';

const { useVocabDeck, useVocabTodaySession, apiJson } = vi.hoisted(() => ({
  useVocabDeck: vi.fn(),
  useVocabTodaySession: vi.fn(),
  apiJson: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  apiJson,
}));

vi.mock('../../hooks/vocab/useVocabDeck', () => ({
  useVocabDeck,
}));

vi.mock('../../hooks/vocab/useVocabTodaySession', () => ({
  useVocabTodaySession,
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
    currentItem: {
      id: 'word-1',
      word: 'apple',
      deck_id: 'deck-1',
      us_pronunciation: 'ˈæpəl',
      uk_pronunciation: 'ˈæpəl',
      translations: [{ pos: 'n.', translation: '苹果' }],
      phrases: [],
      sentences: [],
      prompt_type: 'en_to_zh',
      review_mode: 'review',
      mastery_score: 42,
    },
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
    apiJson.mockReset();
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

  it('removes the vocab title and deck switch entry from the focus view', () => {
    const { queryByText, getByText } = render(
      <VocabTodayFocusWork
        workflow={{
          state: 'focus',
          active_focus_work_type: 'vocab_today',
          focus_work_display_state: 'fullscreen',
          is_paused: false,
        }}
        recordFocus
        onCompleteTaskAndFinish={vi.fn()}
        onComplete={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    );

    expect(getByText('apple')).toBeInTheDocument();
    expect(getByText('第 1 批 / 共 1 批')).toBeInTheDocument();
    expect(queryByText('今日单词')).not.toBeInTheDocument();
    expect(queryByText('切换词书')).not.toBeInTheDocument();
  });

  it('renders completed state when no words are left, and clicking complete calls /todo/focus/stop', async () => {
    useVocabTodaySession.mockReturnValue({
      ready: true,
      loading: false,
      error: null,
      isBatchReview: false,
      currentItem: null,
      currentBatchNumber: 0,
      totalBatchCount: 0,
      memorizedCount: 0,
      currentMode: 'study',
      submitting: false,
      batchReviewCount: 0,
      batchReviewGroups: [],
      batchReviewActionLabel: '继续',
      continueBatchReview: vi.fn(),
      submit: vi.fn(),
      lastResult: null,
    });

    const userEvent = (await import('@testing-library/user-event')).default.setup();

    render(
      <VocabTodayFocusWork
        workflow={{
          state: 'focus',
          active_focus_work_type: 'vocab_today',
          focus_work_display_state: 'fullscreen',
          is_paused: false,
        }}
        recordFocus
        onCompleteTaskAndFinish={vi.fn()}
        onComplete={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    );

    expect(screen.getByText('今天这本词书的单词已经完成了。')).toBeInTheDocument();
    const completeBtn = screen.getByRole('button', { name: '完成今日单词' });
    await userEvent.click(completeBtn);

    expect(apiJson).toHaveBeenCalledWith('/todo/focus/stop', { method: 'POST' });
  });
});
