import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import VocabTodayFocusWork from './VocabTodayFocusWork';
import type { FocusWorkRunSummary } from '../focus-work/focusWorkTypes';

const { fetchVocabOverviewCurrentWords, submitVocabContentReview, useVocabDeck, useVocabTodaySession } = vi.hoisted(() => ({
  fetchVocabOverviewCurrentWords: vi.fn(),
  submitVocabContentReview: vi.fn(),
  useVocabDeck: vi.fn(),
  useVocabTodaySession: vi.fn(),
}));

vi.mock('../../lib/vocab/api', () => ({
  fetchVocabOverviewCurrentWords,
  submitVocabContentReview,
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

function focusRun(configSnapshot: Record<string, unknown> = {}): FocusWorkRunSummary {
  return {
    id: 'run-1',
    workflow_id: 'workflow-1',
    phase_index: 0,
    focus_work_type: 'vocab_today',
    counts_for_task_completion: true,
    status: 'running',
    config_snapshot: configSnapshot,
  };
}

function extraRun(configSnapshot: Record<string, unknown> = {}): FocusWorkRunSummary {
  return {
    ...focusRun(configSnapshot),
    id: 'run-extra',
    counts_for_task_completion: false,
  };
}

describe('VocabTodayFocusWork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchVocabOverviewCurrentWords.mockResolvedValue([]);
    submitVocabContentReview.mockResolvedValue({
      mastery_score: 10,
      next_review_at: '2026-06-10T00:00:00Z',
      wrong_count: 0,
      correct_count: 1,
      interval_days: 1,
      result: 'good',
      should_repeat_today: false,
    });
    mockReadyCompletedSession();
  });

  it('does not emit content completion while focus work is paused', async () => {
    useVocabTodaySession.mockReturnValue({
      ready: true,
      loading: false,
      error: null,
      isBatchReview: false,
      currentItem: null,
      currentBatchNumber: 0,
      totalBatchCount: 0,
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
    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={focusRun({ target_word_count: 100 })}
        disabled
        onContentCompleted={onContentCompleted}
      />,
    );

    await waitFor(() => {
      expect(onContentCompleted).not.toHaveBeenCalled();
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
        run={focusRun()}
        disabled={false}
        onContentCompleted={vi.fn()}
      />,
    );

    expect(getByText('apple')).toBeInTheDocument();
    expect(getByText('第 1 批 / 共 1 批')).toBeInTheDocument();
    expect(queryByText('今日单词')).not.toBeInTheDocument();
    expect(queryByText('切换词书')).not.toBeInTheDocument();
  });

  it('emits content completion when no words are left', async () => {
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

    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={focusRun({ target_word_count: 100 })}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith({
        completed_word_count: 0,
        target_word_count: 100,
      });
    });
  });

  it('uses the daily target count when a counted run has no explicit target word count', async () => {
    useVocabTodaySession.mockReturnValue({
      ready: true,
      loading: false,
      error: null,
      isBatchReview: false,
      currentItem: null,
      currentBatchNumber: 0,
      totalBatchCount: 0,
      memorizedCount: 20,
      currentMode: 'study',
      submitting: false,
      batchReviewCount: 0,
      batchReviewGroups: [],
      batchReviewActionLabel: '继续',
      continueBatchReview: vi.fn(),
      submit: vi.fn(),
      lastResult: null,
    });
    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={focusRun({ daily_target_count: 24 })}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith({
        completed_word_count: 20,
        target_word_count: 24,
      });
    });
  });

  it('loads deck words for extra runs when the today queue is already empty', async () => {
    useVocabTodaySession.mockReturnValue({
      ready: true,
      loading: false,
      error: null,
      isBatchReview: false,
      currentItem: null,
      currentBatchNumber: 0,
      totalBatchCount: 0,
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
    fetchVocabOverviewCurrentWords.mockResolvedValue([
      {
        id: 'word-extra',
        deck_id: 'deck-1',
        deck_name: 'Default',
        word: 'brave',
        us_pronunciation: null,
        uk_pronunciation: null,
        mastery_state: 'unstarted',
        translations: [{ pos: 'adj.', translation: '勇敢的' }],
      },
    ]);
    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={extraRun({ target_word_count: 10 })}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    expect(await screen.findByText('brave')).toBeInTheDocument();
    expect(screen.getByText('额外轮次：已完成 0 / 1')).toBeInTheDocument();
    expect(onContentCompleted).not.toHaveBeenCalled();
  });

  it('uses the daily target count for extra run word selection', async () => {
    useVocabTodaySession.mockReturnValue({
      ready: true,
      loading: false,
      error: null,
      isBatchReview: false,
      currentItem: null,
      currentBatchNumber: 0,
      totalBatchCount: 0,
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
    fetchVocabOverviewCurrentWords.mockResolvedValue([
      {
        id: 'word-extra-1',
        deck_id: 'deck-1',
        deck_name: 'Default',
        word: 'brave',
        us_pronunciation: null,
        uk_pronunciation: null,
        mastery_state: 'unstarted',
        translations: [{ pos: 'adj.', translation: '勇敢的' }],
      },
      {
        id: 'word-extra-2',
        deck_id: 'deck-1',
        deck_name: 'Default',
        word: 'clear',
        us_pronunciation: null,
        uk_pronunciation: null,
        mastery_state: 'learning',
        translations: [{ pos: 'adj.', translation: '清楚的' }],
      },
      {
        id: 'word-extra-3',
        deck_id: 'deck-1',
        deck_name: 'Default',
        word: 'distant',
        us_pronunciation: null,
        uk_pronunciation: null,
        mastery_state: 'mastered',
        translations: [{ pos: 'adj.', translation: '遥远的' }],
      },
    ]);

    render(
      <VocabTodayFocusWork
        run={extraRun({ daily_target_count: 2 })}
        disabled={false}
        onContentCompleted={vi.fn()}
      />,
    );

    expect(await screen.findByText('brave')).toBeInTheDocument();
    expect(screen.getByText('额外轮次：已完成 0 / 2')).toBeInTheDocument();
  });

  it('completes an extra run after the extra deck words are submitted', async () => {
    const user = userEvent.setup();
    useVocabTodaySession.mockReturnValue({
      ready: true,
      loading: false,
      error: null,
      isBatchReview: false,
      currentItem: null,
      currentBatchNumber: 0,
      totalBatchCount: 0,
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
    fetchVocabOverviewCurrentWords.mockResolvedValue([
      {
        id: 'word-extra',
        deck_id: 'deck-1',
        deck_name: 'Default',
        word: 'brave',
        us_pronunciation: null,
        uk_pronunciation: null,
        mastery_state: 'unstarted',
        translations: [{ pos: 'adj.', translation: '勇敢的' }],
      },
    ]);
    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={extraRun({ target_word_count: 10 })}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    await screen.findByText('brave');
    await user.click(screen.getByRole('button', { name: '记住了3 进入正常间隔' }));

    await waitFor(() => {
      expect(submitVocabContentReview).toHaveBeenCalledWith({
        deck_id: 'deck-1',
        word_id: 'word-extra',
        result: 'good',
        review_mode: 'study',
        prompt_type: 'en_to_zh',
      });
      expect(onContentCompleted).toHaveBeenCalledWith({
        completed_word_count: 1,
        target_word_count: 1,
        extra_round: true,
      });
    });
  });
});
