import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import VocabTodayFocusWork from './VocabTodayFocusWork';
import type { FocusWorkRunSummary } from '../focus-work/focusWorkTypes';

const { fetchVocabOverviewCurrentWords, submitVocabContentReview, useVocabDeck } = vi.hoisted(() => ({
  fetchVocabOverviewCurrentWords: vi.fn(),
  submitVocabContentReview: vi.fn(),
  useVocabDeck: vi.fn(),
}));

vi.mock('../../lib/vocab/api', () => ({
  fetchVocabOverviewCurrentWords,
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

function overviewWord(
  overrides: Partial<{
    id: string;
    deck_id: string;
    deck_name: string;
    word: string;
    mastery_state: 'unstarted' | 'learning' | 'mastered';
    translation: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 'word-1',
    deck_id: overrides.deck_id ?? 'deck-1',
    deck_name: overrides.deck_name ?? 'Default',
    word: overrides.word ?? 'apple',
    us_pronunciation: null,
    uk_pronunciation: null,
    mastery_state: overrides.mastery_state ?? 'unstarted',
    translations: [{ pos: 'n.', translation: overrides.translation ?? '苹果' }],
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
    fetchVocabOverviewCurrentWords.mockResolvedValue([overviewWord()]);
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

  it('renders an open-ended vocab card from the deck content pool', async () => {
    fetchVocabOverviewCurrentWords.mockResolvedValue([overviewWord()]);

    render(
      <VocabTodayFocusWork
        run={focusRun()}
        disabled={false}
        onContentCompleted={vi.fn()}
      />,
    );

    expect(await screen.findByText('apple')).toBeInTheDocument();
    expect(screen.getByText('已完成 0')).toBeInTheDocument();
    expect(fetchVocabOverviewCurrentWords).toHaveBeenCalledWith('deck-1', 'all');
  });

  it('does not emit content completion when no open-ended words are available', async () => {
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

  it('ignores counted run target config and keeps the vocab focus work open-ended', async () => {
    fetchVocabOverviewCurrentWords.mockResolvedValue([overviewWord()]);
    const onContentCompleted = vi.fn();

    render(
      <VocabTodayFocusWork
        run={focusRun({ daily_target_count: 24 })}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    expect(await screen.findByText('apple')).toBeInTheDocument();
    expect(screen.getByText('已完成 0')).toBeInTheDocument();
    await waitFor(() => {
      expect(onContentCompleted).not.toHaveBeenCalled();
    });
  });

  it('submits counted vocab cards without completing the focus work content', async () => {
    const user = userEvent.setup();
    fetchVocabOverviewCurrentWords.mockResolvedValue([overviewWord()]);
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
    expect(onContentCompleted).not.toHaveBeenCalled();
  });

  it('loads deck words for extra runs when the today queue is already empty', async () => {
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
    expect(screen.getByText('0 / 10')).toBeInTheDocument();
  });

  it('honors large configured targets for extra runs', async () => {
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

    render(
      <VocabTodayFocusWork
        run={extraRun({ target_word_count: 100 })}
        disabled={false}
        onContentCompleted={vi.fn()}
      />,
    );

    expect(await screen.findByText('brave')).toBeInTheDocument();
    expect(screen.getByText('0 / 100')).toBeInTheDocument();
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
    fetchVocabOverviewCurrentWords.mockResolvedValue([
      {
        id: 'word-extra',
        deck_id: 'deck-config',
        deck_name: 'Configured',
        word: 'brave',
        us_pronunciation: null,
        uk_pronunciation: null,
        mastery_state: 'unstarted',
        translations: [{ pos: 'adj.', translation: '勇敢的' }],
      },
    ]);

    render(
      <VocabTodayFocusWork
        run={extraRun({ deck_id: 'deck-config', target_word_count: 10 })}
        disabled={false}
        onContentCompleted={vi.fn()}
      />,
    );

    expect(await screen.findByText('brave')).toBeInTheDocument();
    expect(fetchVocabOverviewCurrentWords).toHaveBeenCalledWith('deck-config', 'all');
  });

  it('uses the daily target count for extra run word selection', async () => {
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
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
  });

  it('completes an extra run after the extra deck words are submitted', async () => {
    const user = userEvent.setup();
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
    await user.click(screen.getByRole('button', { name: /记住了/ }));

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
