import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '../Home';

const { fetchVocabOverview, fetchVocabToday, updateVocabTodaySettings } = vi.hoisted(() => ({
  fetchVocabOverview: vi.fn(),
  fetchVocabToday: vi.fn(),
  updateVocabTodaySettings: vi.fn(),
}));

vi.mock('../../../hooks/vocab/useVocabDeck', () => ({
  useVocabDeck: () => ({
    decks: [
      { id: 'deck-1', key: 'cet6', name: 'CET6', description: '', word_count: 7508, created_at: '', updated_at: '' },
      { id: 'deck-2', key: 'cet6luan', name: 'CET6luan', description: '', word_count: 1200, created_at: '', updated_at: '' },
    ],
    activeDeck: { id: 'deck-1', key: 'cet6', name: 'CET6', description: '', word_count: 7508, created_at: '', updated_at: '' },
    setActiveDeck: vi.fn(),
    loading: false,
    error: null,
  }),
}));

vi.mock('../../../lib/vocab/api', () => ({
  fetchVocabOverview,
  fetchVocabToday,
  updateVocabTodaySettings,
}));

describe('Vocab home page', () => {
  beforeEach(() => {
    fetchVocabOverview.mockReset();
    fetchVocabToday.mockReset();
    updateVocabTodaySettings.mockReset();
  });

  it('renders a today-focused hero card and keeps deck switching collapsed by default', async () => {
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

    expect(await screen.findByText('CET6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换词书' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CET6luan' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '切换词书' }));

    expect(screen.getByRole('button', { name: 'CET6luan' })).toBeInTheDocument();
    expect(await screen.findByText('今日单词')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '继续今日单词' })).toHaveAttribute('href', '#/vocab/today');
    expect(screen.getByRole('button', { name: '调整今日单词' })).toBeInTheDocument();
    expect(screen.getByText('已完成 7 / 24')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('总览')).toBeInTheDocument();
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
    expect(screen.getByText('快捷入口')).toBeInTheDocument();
  });

  it('opens the today settings dialog and saves a new total target', async () => {
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

    await screen.findByText('今日单词');
    await user.click(screen.getByRole('button', { name: '调整今日单词' }));

    expect(screen.getByRole('dialog', { name: '调整今日单词' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();
    expect(screen.getByText('30% Learning / Relearning')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('今日总量'), { target: { value: '30' } });
    await user.click(screen.getByRole('button', { name: '保存今日参数' }));

    await waitFor(() => {
      expect(updateVocabTodaySettings).toHaveBeenCalledWith('deck-1', { total_target_count: 30 });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '调整今日单词' })).not.toBeInTheDocument();
    });
  });

  it('shows the completed action when today is done and opens a continue dialog', async () => {
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

    expect(await screen.findByRole('button', { name: '今日已完成' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '今日已完成' }));

    expect(screen.getByRole('dialog', { name: '今日已完成' })).toBeInTheDocument();
    expect(screen.getByText('今天这本词书已经完成，是否继续再来一轮？')).toBeInTheDocument();
    expect(screen.getByDisplayValue('48')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存并继续' })).toBeInTheDocument();
  });
});
