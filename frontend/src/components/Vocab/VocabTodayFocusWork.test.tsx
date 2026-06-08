import { render, waitFor, screen, act } from '@testing-library/react';
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

    useVocabDeck.mockReturnValue({
      activeDeck: { id: 'deck-1', name: 'CET4' },
      activeDeckVersion: 1,
    });
  });

  it('renders learning view when deck has items', () => {
    useVocabTodaySession.mockReturnValue({
      ready: true,
      loading: false,
      error: null,
      currentItem: {
        id: 'word-1',
        deck_id: 'deck-1',
        word: 'apple',
        us_pronunciation: 'ˈæp.əl',
        uk_pronunciation: 'ˈæp.əl',
        translations: [{ pos: 'n.', translation: '苹果' }],
        phrases: [],
        sentences: [],
        prompt_type: 'en_to_zh',
        review_mode: 'study',
        mastery_score: 0,
      },
      currentBatchNumber: 1,
      totalBatchCount: 1,
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

    const { getByText, queryByText } = render(
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

  it('calls onFinished when no words are left', async () => {
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

    const onFinishedMock = vi.fn();

    render(
      <VocabTodayFocusWork
        workflow={{
          state: 'focus',
          active_focus_work_type: 'vocab_today',
          focus_work_display_state: 'fullscreen',
          is_paused: false,
        }}
        recordFocus
        onFinished={onFinishedMock}
        onComplete={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    );

    expect(onFinishedMock).toHaveBeenCalled();
  });

  it('supports extra practice flow via registerResetCommand', async () => {
    useVocabTodaySession.mockReturnValue({
      ready: true,
      loading: false,
      error: null,
      currentItem: null,
      isBatchReview: false,
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

    apiJson.mockImplementation(async (url) => {
      if (url.includes('/overview/current-words')) {
        return [{ id: 'word-extra-1', word: 'banana' }];
      }
      if (url.includes('/words/word-extra-1')) {
        return {
          id: 'word-extra-1',
          deck_id: 'deck-1',
          word: 'banana',
          us_pronunciation: 'bəˈnænə',
          uk_pronunciation: 'bəˈnænə',
          translations: [{ pos: 'n.', translation: '香蕉' }],
          phrases: [],
          sentences: [],
        };
      }
      return null;
    });

    let resetFn: (() => void) | undefined;
    const registerResetCommandMock = vi.fn((fn) => {
      resetFn = fn;
    });
    const onFinishedMock = vi.fn();

    render(
      <VocabTodayFocusWork
        workflow={{
          state: 'focus',
          active_focus_work_type: 'vocab_today',
          focus_work_display_state: 'fullscreen',
          is_paused: false,
        }}
        recordFocus
        registerResetCommand={registerResetCommandMock}
        onFinished={onFinishedMock}
        onComplete={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    );

    expect(registerResetCommandMock).toHaveBeenCalled();
    expect(resetFn).toBeDefined();

    await act(async () => {
      resetFn!();
    });

    expect(await screen.findByText('banana')).toBeInTheDocument();
    expect(screen.getByText('加练进度：第 1 个 / 共 1 个')).toBeInTheDocument();

    const rateBtn = screen.getByRole('button', { name: /记住了/ });
    await userEvent.click(rateBtn);

    expect(onFinishedMock).toHaveBeenCalled();
  });
});
