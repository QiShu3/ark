import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '../Home';

const { apiJson, fetchERCAppTaskStatus, fetchERCOverview, initializeERCAppTask } = vi.hoisted(() => ({
  apiJson: vi.fn(),
  fetchERCAppTaskStatus: vi.fn(),
  fetchERCOverview: vi.fn(),
  initializeERCAppTask: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  apiJson,
}));

vi.mock('../../../lib/erc/api', () => ({
  fetchERCAppTaskStatus,
  fetchERCOverview,
  initializeERCAppTask,
}));

describe('ERC home page', () => {
  beforeEach(() => {
    apiJson.mockReset();
    apiJson.mockResolvedValue({ id: 'log-erc' });
    fetchERCAppTaskStatus.mockReset();
    fetchERCAppTaskStatus.mockResolvedValue({
      state: 'ready',
      task_id: 'task-erc',
      config_id: 'config-erc',
      completion_state: null,
      blocked_reason: null,
      config: {},
    });
    fetchERCOverview.mockReset();
    initializeERCAppTask.mockReset();
  });

  it('renders reading training summary and primary links', async () => {
    fetchERCOverview.mockResolvedValue({
      due_review_count: 3,
      practiced_article_count: 8,
      practiced_question_count: 40,
      accuracy: 0.75,
      mistake_count: 5,
      recommended_article: { article_id: 'kaoyan2_2025_text1', year: 2025, text_no: 1, title: '' },
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText('阅读训练')).toBeInTheDocument();
    expect(screen.getByText('今日待复习')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入题库' })).toHaveAttribute('href', '/erc/library');
    const reloadFocusSpy = vi.fn();
    window.addEventListener('ark:reload-focus', reloadFocusSpy);
    const reviewButton = screen.getByRole('button', { name: '开始复习' });
    fireEvent.click(reviewButton);
    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/tasks/task-erc/focus/start', { method: 'POST' });
    });
    expect(reloadFocusSpy).toHaveBeenCalledTimes(1);
    expect(reviewButton).toHaveClass('bg-white/10', 'backdrop-blur-xl');
    window.removeEventListener('ark:reload-focus', reloadFocusSpy);
    expect(screen.getByRole('link', { name: '查看错题' })).toHaveAttribute('href', '/erc/mistakes');
    expect(screen.getByRole('link', { name: '查看错题' })).toHaveClass('bg-white/10', 'backdrop-blur-xl');
  });

  it('shows initialize button before ERC app task is initialized', async () => {
    fetchERCOverview.mockResolvedValue({
      due_review_count: 3,
      practiced_article_count: 8,
      practiced_question_count: 40,
      accuracy: 0.75,
      mistake_count: 5,
      recommended_article: null,
    });
    fetchERCAppTaskStatus.mockResolvedValue({
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

    expect(await screen.findByRole('button', { name: '初始化 ERC 复习' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始复习' })).not.toBeInTheDocument();
  });

  it('initializes ERC app task from the home page', async () => {
    const user = userEvent.setup();
    fetchERCOverview.mockResolvedValue({
      due_review_count: 3,
      practiced_article_count: 8,
      practiced_question_count: 40,
      accuracy: 0.75,
      mistake_count: 5,
      recommended_article: null,
    });
    fetchERCAppTaskStatus.mockResolvedValue({
      state: 'uninitialized',
      task_id: null,
      config_id: null,
      completion_state: null,
      blocked_reason: null,
      config: {},
    });
    initializeERCAppTask.mockResolvedValue({
      state: 'ready',
      task_id: 'task-erc',
      config_id: 'config-erc',
      completion_state: null,
      blocked_reason: null,
      config: { review_scope: 'due' },
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: '初始化 ERC 复习' }));

    expect(initializeERCAppTask).toHaveBeenCalledWith({
      review_scope: 'due',
      daily_question_target: 10,
      default_focus_duration: 1500,
      add_to_today_plan: true,
    });
  });
});
