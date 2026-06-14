import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '../Home';

const {
  apiJson,
  fetchVocabOverview,
  fetchVocabOverviewCompletedDecks,
  fetchVocabOverviewCurrentWords,
  fetchVocabOverviewMasteredWords,
  fetchVocabToday,
  fetchVocabAppTaskStatus,
  initializeVocabAppTask,
  updateVocabTodaySettings,
} = vi.hoisted(() => ({
  apiJson: vi.fn(),
  fetchVocabOverview: vi.fn(),
  fetchVocabOverviewCompletedDecks: vi.fn(),
  fetchVocabOverviewCurrentWords: vi.fn(),
  fetchVocabOverviewMasteredWords: vi.fn(),
  fetchVocabToday: vi.fn(),
  fetchVocabAppTaskStatus: vi.fn(),
  initializeVocabAppTask: vi.fn(),
  updateVocabTodaySettings: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  apiJson,
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
  fetchVocabOverview,
  fetchVocabOverviewCompletedDecks,
  fetchVocabOverviewCurrentWords,
  fetchVocabOverviewMasteredWords,
  fetchVocabToday,
  fetchVocabAppTaskStatus,
  initializeVocabAppTask,
  updateVocabTodaySettings,
}));

describe('Vocab home page', () => {
  beforeEach(() => {
    fetchVocabOverview.mockReset();
    fetchVocabOverviewCompletedDecks.mockReset();
    fetchVocabOverviewCurrentWords.mockReset();
    fetchVocabOverviewMasteredWords.mockReset();
    fetchVocabToday.mockReset();
    fetchVocabAppTaskStatus.mockReset();
    initializeVocabAppTask.mockReset();
    updateVocabTodaySettings.mockReset();
    apiJson.mockReset();
    apiJson.mockResolvedValue({ id: 'log-1' });
    fetchVocabAppTaskStatus.mockResolvedValue({
      state: 'ready',
      task_id: 'task-vocab',
      config_id: 'config-vocab',
      completion_state: null,
      blocked_reason: null,
      config: {},
    });
  });

  it('renders the unified sub-app template and starts focus work from managed arrangements', async () => {
    fetchVocabOverview.mockResolvedValue({
      completed_deck_count: 2,
      total_deck_count: 6,
      mastered_word_count: 1240,
      current_deck: {
        deck_id: 'cet6',
        deck_name: 'CET6',
        total_word_count: 7508,
        mastered_word_count: 3600,
        learning_word_count: 2100,
        unstarted_word_count: 1808,
      },
    });
    fetchVocabToday.mockResolvedValue({
      learning_count: 7,
      new_count: 12,
      review_count: 5,
      mistake_count: 2,
      total_count: 24,
      pending_count: 17,
      completed_count: 7,
      daily_target_count: 24,
      memorized_count: 120,
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText('当前词书：CET6')).toBeInTheDocument();
    expect(screen.getByText('今日单词任务')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '长期积累' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '托管安排' })).toBeInTheDocument();
    expect(screen.getByText('今日进度')).toBeInTheDocument();
    expect(screen.getAllByText('7 / 24').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('今天这本词书要完成的学习任务，系统会先带你完成复习，再进入新词。')).not.toBeInTheDocument();
    expect(screen.queryByText('快捷入口')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '切换词书' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '配置' }));
    expect(screen.getByRole('dialog', { name: '配置背单词' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换词书' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CET6luan' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '切换词书' }));

    expect(screen.getByRole('button', { name: 'CET6luan' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭配置背单词弹窗' }));

    const reloadFocusSpy = vi.fn();
    window.addEventListener('ark:reload-focus', reloadFocusSpy);
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/tasks/task-vocab/focus/start', { method: 'POST' });
    });
    expect(reloadFocusSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener('ark:reload-focus', reloadFocusSpy);
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('已完成词书')).toBeInTheDocument();
    expect(screen.getByText('2 / 6 本')).toBeInTheDocument();
    expect(screen.getByText('累计掌握单词')).toBeInTheDocument();
    expect(screen.getByText('1240')).toBeInTheDocument();
    expect(screen.getByText('当前词书掌握度')).toBeInTheDocument();
    expect(screen.getByText('3600 / 7508')).toBeInTheDocument();
    expect(screen.getByText('未开始')).toBeInTheDocument();
    expect(screen.getByText('1808')).toBeInTheDocument();
    expect(screen.getByText('学习中')).toBeInTheDocument();
    expect(screen.getByText('2100')).toBeInTheDocument();
    expect(screen.getAllByText('已掌握')).toHaveLength(2);
    expect(screen.getByText('3600')).toBeInTheDocument();
  });

  it('shows initialize button before vocab app task is initialized', async () => {
    fetchVocabOverview.mockResolvedValue({
      completed_deck_count: 2,
      total_deck_count: 6,
      mastered_word_count: 1240,
      current_deck: {
        deck_id: 'cet6',
        deck_name: 'CET6',
        total_word_count: 7508,
        mastered_word_count: 3600,
        learning_word_count: 2100,
        unstarted_word_count: 1808,
      },
    });
    fetchVocabToday.mockResolvedValue({
      learning_count: 7,
      new_count: 12,
      review_count: 5,
      mistake_count: 2,
      total_count: 24,
      pending_count: 17,
      completed_count: 7,
      daily_target_count: 24,
      memorized_count: 120,
    });
    fetchVocabAppTaskStatus.mockResolvedValue({
      state: 'uninitialized',
      task_id: null,
      config_id: null,
      completion_state: null,
      blocked_reason: null,
      config: {},
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: '初始化' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始' })).not.toBeInTheDocument();
  });

  it('initializes vocab app task from active deck', async () => {
    const user = userEvent.setup();
    fetchVocabOverview.mockResolvedValue({
      completed_deck_count: 2,
      total_deck_count: 6,
      mastered_word_count: 1240,
      current_deck: {
        deck_id: 'cet6',
        deck_name: 'CET6',
        total_word_count: 7508,
        mastered_word_count: 3600,
        learning_word_count: 2100,
        unstarted_word_count: 1808,
      },
    });
    fetchVocabToday.mockResolvedValue({
      learning_count: 7,
      new_count: 12,
      review_count: 5,
      mistake_count: 2,
      total_count: 24,
      pending_count: 17,
      completed_count: 7,
      daily_target_count: 24,
      memorized_count: 120,
    });
    fetchVocabAppTaskStatus.mockResolvedValue({
      state: 'uninitialized',
      task_id: null,
      config_id: null,
      completion_state: null,
      blocked_reason: null,
      config: {},
    });
    initializeVocabAppTask.mockResolvedValue({
      state: 'ready',
      task_id: 'task-vocab',
      config_id: 'config-vocab',
      completion_state: null,
      blocked_reason: null,
      config: { deck_id: 'deck-1', daily_target_count: 24 },
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: '初始化' }));

    expect(initializeVocabAppTask).toHaveBeenCalledWith({
      deck_id: 'deck-1',
      daily_target_count: 24,
      default_focus_duration: 1500,
      add_to_today_plan: true,
    });
  });

  it('opens the overview detail dialog and loads current deck words', async () => {
    const user = userEvent.setup();
    fetchVocabOverview.mockResolvedValue({
      completed_deck_count: 2,
      total_deck_count: 6,
      mastered_word_count: 1240,
      current_deck: {
        deck_id: 'cet6',
        deck_name: 'CET6',
        total_word_count: 7508,
        mastered_word_count: 3600,
        learning_word_count: 2100,
        unstarted_word_count: 1808,
      },
    });
    fetchVocabToday.mockResolvedValue({
      learning_count: 7,
      new_count: 12,
      review_count: 5,
      mistake_count: 2,
      total_count: 24,
      pending_count: 17,
      completed_count: 7,
      daily_target_count: 24,
      memorized_count: 120,
    });
    fetchVocabOverviewCurrentWords.mockResolvedValue([
      {
        id: 'word-1',
        deck_id: 'cet6',
        deck_name: 'CET6',
        word: 'prosperity',
        us_pronunciation: null,
        uk_pronunciation: null,
        mastery_state: 'mastered',
        translations: [{ pos: 'n.', translation: '繁荣' }],
      },
    ]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await screen.findByText('当前词书掌握度');
    await user.click(screen.getByRole('button', { name: /当前词书掌握度/ }));

    expect(await screen.findByRole('dialog', { name: '总览明细' })).toBeInTheDocument();
    expect(fetchVocabOverviewCurrentWords).toHaveBeenCalledWith('deck-1', 'all', 'deck-1');
    expect(await screen.findByText('prosperity')).toBeInTheDocument();
    expect(screen.getByText('繁荣')).toBeInTheDocument();
  });

  it('reuses cached overview data when reopening the same detail modal', async () => {
    const user = userEvent.setup();
    fetchVocabOverview.mockResolvedValue({
      completed_deck_count: 2,
      total_deck_count: 6,
      mastered_word_count: 1240,
      current_deck: {
        deck_id: 'deck-1',
        deck_name: 'CET6',
        total_word_count: 7508,
        mastered_word_count: 3600,
        learning_word_count: 2100,
        unstarted_word_count: 1808,
      },
    });
    fetchVocabToday.mockResolvedValue({
      learning_count: 7,
      new_count: 12,
      review_count: 5,
      mistake_count: 2,
      total_count: 24,
      pending_count: 17,
      completed_count: 7,
      daily_target_count: 24,
      memorized_count: 120,
    });
    fetchVocabOverviewCompletedDecks.mockResolvedValue([
      {
        deck_id: 'deck-2',
        deck_name: 'CET4',
        total_word_count: 100,
        mastered_word_count: 100,
        learning_word_count: 0,
        unstarted_word_count: 0,
      },
    ]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await screen.findByText('已完成词书');
    await user.click(screen.getByRole('button', { name: /已完成词书 2 \/ 6 本/ }));
    expect(await screen.findByRole('dialog', { name: '总览明细' })).toBeInTheDocument();
    await screen.findByText('CET4');
    expect(fetchVocabOverviewCompletedDecks).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '关闭总览明细弹窗' }));
    expect(screen.queryByRole('dialog', { name: '总览明细' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /已完成词书 2 \/ 6 本/ }));
    expect(await screen.findByRole('dialog', { name: '总览明细' })).toBeInTheDocument();
    await screen.findByText('CET4');
    expect(fetchVocabOverviewCompletedDecks).toHaveBeenCalledTimes(1);
  });

  it('opens the config dialog and saves a new total target', async () => {
    const user = userEvent.setup();
    fetchVocabOverview.mockResolvedValue({
      completed_deck_count: 1,
      total_deck_count: 6,
      mastered_word_count: 1000,
      current_deck: {
        deck_id: 'cet6',
        deck_name: 'CET6',
        total_word_count: 7508,
        mastered_word_count: 2000,
        learning_word_count: 3000,
        unstarted_word_count: 2508,
      },
    });
    fetchVocabToday.mockResolvedValue({
      learning_count: 6,
      new_count: 12,
      review_count: 2,
      mistake_count: 1,
      total_count: 20,
      pending_count: 20,
      completed_count: 0,
      daily_target_count: 20,
      memorized_count: 90,
    });
    updateVocabTodaySettings.mockResolvedValue({
      learning_count: 9,
      new_count: 18,
      review_count: 3,
      mistake_count: 1,
      total_count: 30,
      pending_count: 30,
      completed_count: 0,
      daily_target_count: 30,
      memorized_count: 90,
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await screen.findByText('今日单词任务');
    await user.click(screen.getByRole('button', { name: '配置' }));

    expect(screen.getByRole('dialog', { name: '配置背单词' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换词书' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();
    expect(screen.queryByText('单词黄金配比方案')).not.toBeInTheDocument();

    const targetInput = screen.getByLabelText('今日总量');
    fireEvent.change(targetInput, { target: { value: '' } });
    expect(targetInput).toHaveValue(null);

    fireEvent.change(targetInput, { target: { value: '30' } });
    await user.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(updateVocabTodaySettings).toHaveBeenCalledWith('deck-1', { total_target_count: 30 });
    });
    expect(initializeVocabAppTask).toHaveBeenCalledWith({
      deck_id: 'deck-1',
      daily_target_count: 30,
      default_focus_duration: 1500,
      add_to_today_plan: true,
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '配置今日单词' })).not.toBeInTheDocument();
    });
  });

  it('opens the config dialog from completed managed task state', async () => {
    const user = userEvent.setup();
    fetchVocabOverview.mockResolvedValue({
      completed_deck_count: 4,
      total_deck_count: 6,
      mastered_word_count: 2200,
      current_deck: {
        deck_id: 'cet6',
        deck_name: 'CET6',
        total_word_count: 7508,
        mastered_word_count: 7508,
        learning_word_count: 0,
        unstarted_word_count: 0,
      },
    });
    fetchVocabToday.mockResolvedValue({
      learning_count: 0,
      new_count: 0,
      review_count: 0,
      mistake_count: 1,
      total_count: 24,
      pending_count: 0,
      completed_count: 24,
      daily_target_count: 24,
      memorized_count: 100,
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await screen.findByText('completed');
    const configButtons = screen.getAllByRole('button', { name: '配置' });
    await user.click(configButtons[1]);

    expect(screen.getByRole('dialog', { name: '配置背单词' })).toBeInTheDocument();
    expect(screen.getByText('今天这本词书已经完成，可调整目标继续再来一轮。')).toBeInTheDocument();
    expect(screen.getByDisplayValue('48')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存并继续' })).toBeInTheDocument();
  });
});
