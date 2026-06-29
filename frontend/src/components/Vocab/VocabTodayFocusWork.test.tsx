import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import VocabTodayFocusWork from './VocabTodayFocusWork';
import type { FocusWorkRunSummary } from '../focus-work/focusWorkTypes';

const { fetchVocabFocusQueue, submitVocabContentReview, useVocabDeck } = vi.hoisted(() => ({
  fetchVocabFocusQueue: vi.fn(),
  submitVocabContentReview: vi.fn(),
  useVocabDeck: vi.fn(),
}));

vi.mock('../../lib/vocab/api', () => ({
  fetchVocabFocusQueue,
  submitVocabContentReview,
}));

vi.mock('../../hooks/vocab/useVocabDeck', () => ({
  useVocabDeck,
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

function focusQueueItem(
  overrides: Partial<{
    id: string;
    deck_id: string;
    word: string;
    review_mode: 'study' | 'review' | 'learning' | 'mistake';
    translation: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 'word-1',
    deck_id: overrides.deck_id ?? 'deck-1',
    word: overrides.word ?? 'apple',
    us_pronunciation: null,
    uk_pronunciation: null,
    translations: [{ pos: 'n.', translation: overrides.translation ?? '苹果' }],
    phrases: [],
    sentences: [],
    prompt_type: 'en_to_zh',
    review_mode: overrides.review_mode ?? 'study',
    mastery_score: 0,
  };
}

describe('VocabTodayFocusWork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchVocabFocusQueue.mockResolvedValue([]);
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
    fetchVocabFocusQueue.mockResolvedValue([focusQueueItem()]);
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

  it('renders a vocab card from the FSRS focus queue', async () => {
    fetchVocabFocusQueue.mockResolvedValue([focusQueueItem()]);

    render(
      <VocabTodayFocusWork
        run={focusRun()}
        disabled={false}
        onContentCompleted={vi.fn()}
      />,
    );

    expect(await screen.findByText('apple')).toBeInTheDocument();
    expect(screen.getByText('0 / 10')).toBeInTheDocument();
    expect(fetchVocabFocusQueue).toHaveBeenCalledWith('deck-1', 10);
  });

  it('does not emit content completion when no focus queue words are available', async () => {
    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={focusRun({ target_word_count: 100 })}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('暂无可练习词卡')).toBeInTheDocument();
      expect(onContentCompleted).not.toHaveBeenCalled();
    });
  });

  it('uses counted run target config as the FSRS queue limit', async () => {
    fetchVocabFocusQueue.mockResolvedValue([focusQueueItem()]);
    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={focusRun({ daily_target_count: 24 })}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    expect(await screen.findByText('apple')).toBeInTheDocument();
    expect(screen.getByText('0 / 24')).toBeInTheDocument();
    expect(fetchVocabFocusQueue).toHaveBeenCalledWith('deck-1', 24);
    await waitFor(() => {
      expect(onContentCompleted).not.toHaveBeenCalled();
    });
  });

  it('submits counted vocab cards through content reviews and completes the round', async () => {
    const user = userEvent.setup();
    fetchVocabFocusQueue.mockResolvedValue([focusQueueItem()]);
    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={focusRun({ target_word_count: 1 })}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    await screen.findByText('apple');
    await user.click(screen.getByRole('button', { name: /记住了/ }));

    await waitFor(() => {
      expect(submitVocabContentReview).toHaveBeenCalledWith({
        deck_id: 'deck-1',
        word_id: 'word-1',
        result: 'good',
        review_mode: 'study',
        prompt_type: 'en_to_zh',
      });
    });
    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalled();
    });
  });

  it('requeues the current card when FSRS asks to repeat today', async () => {
    const user = userEvent.setup();
    fetchVocabFocusQueue.mockResolvedValue([
      focusQueueItem({ id: 'word-1', word: 'apple', translation: '苹果' }),
      focusQueueItem({ id: 'word-2', word: 'brave', translation: '勇敢的', review_mode: 'review' }),
    ]);
    submitVocabContentReview.mockResolvedValueOnce({
      mastery_score: 0,
      next_review_at: '2026-06-10T00:00:00Z',
      wrong_count: 1,
      correct_count: 0,
      interval_days: 0,
      result: 'again',
      should_repeat_today: true,
    });
    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={focusRun({ target_word_count: 2 })}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    await screen.findByText('apple');
    await user.click(screen.getByRole('button', { name: /没记住/ }));

    expect(await screen.findByText('brave')).toBeInTheDocument();
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
    expect(onContentCompleted).not.toHaveBeenCalled();
  });

  it('loads deck words for extra runs when the today queue is already empty', async () => {
    fetchVocabFocusQueue.mockResolvedValue([focusQueueItem({ id: 'word-extra', word: 'brave', translation: '勇敢的' })]);
    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={extraRun({ target_word_count: 10 })}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    expect(await screen.findByText('brave')).toBeInTheDocument();
    expect(screen.getByText('0 / 10')).toBeInTheDocument();
  });

  it('honors large configured targets for extra runs', async () => {
    fetchVocabFocusQueue.mockResolvedValue([focusQueueItem({ id: 'word-extra', word: 'brave', translation: '勇敢的' })]);

    render(
      <VocabTodayFocusWork
        run={extraRun({ target_word_count: 100 })}
        disabled={false}
        onContentCompleted={vi.fn()}
      />,
    );

    expect(await screen.findByText('brave')).toBeInTheDocument();
    expect(screen.getByText('0 / 100')).toBeInTheDocument();
    expect(fetchVocabFocusQueue).toHaveBeenCalledWith('deck-1', 100);
  });

  it('uses the configured deck for extra runs while the global deck is still loading', async () => {
    useVocabDeck.mockReturnValue({
      decks: [],
      activeDeck: null,
      activeDeckVersion: 0,
      inheritancePrompt: null,
      setActiveDeck: vi.fn(),
      confirmInheritance: vi.fn(),
      dismissInheritance: vi.fn(),
      loading: true,
      error: null,
    });
    fetchVocabFocusQueue.mockResolvedValue([focusQueueItem({ id: 'word-extra', deck_id: 'deck-config', word: 'brave', translation: '勇敢的' })]);

    render(
      <VocabTodayFocusWork
        run={extraRun({ deck_id: 'deck-config', target_word_count: 10 })}
        disabled={false}
        onContentCompleted={vi.fn()}
      />,
    );

    expect(await screen.findByText('brave')).toBeInTheDocument();
    expect(fetchVocabFocusQueue).toHaveBeenCalledWith('deck-config', 10);
  });

  it('uses the daily target count for extra run word selection', async () => {
    fetchVocabFocusQueue.mockResolvedValue([
      focusQueueItem({ id: 'word-extra-1', word: 'brave', translation: '勇敢的' }),
      focusQueueItem({ id: 'word-extra-2', word: 'clear', translation: '清楚的', review_mode: 'learning' }),
    ]);

    render(
      <VocabTodayFocusWork
        run={extraRun({ daily_target_count: 2 })}
        disabled={false}
        onContentCompleted={vi.fn()}
      />,
    );

    expect(await screen.findByText('brave')).toBeInTheDocument();
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
    expect(fetchVocabFocusQueue).toHaveBeenCalledWith('deck-1', 2);
  });

  it('completes an extra run after the extra deck words are submitted', async () => {
    const user = userEvent.setup();
    fetchVocabFocusQueue.mockResolvedValue([focusQueueItem({ id: 'word-extra', word: 'brave', translation: '勇敢的' })]);
    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={extraRun({ target_word_count: 10 })}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    await screen.findByText('brave');
    await user.click(screen.getByRole('button', { name: /记住了/ }));

    await waitFor(() => {
      expect(submitVocabContentReview).toHaveBeenCalledWith({
        deck_id: 'deck-1',
        word_id: 'word-extra',
        result: 'good',
        review_mode: 'study',
        prompt_type: 'en_to_zh',
      });
      expect(onContentCompleted).toHaveBeenCalledWith(expect.objectContaining({
        completed_word_count: 1,
        target_word_count: 1,
        extra_round: true,
      }));
    });
  });
});
