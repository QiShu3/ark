import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

import TaskFocusWork from '../focus-work/TaskFocusWork';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(async (path: string) => {
    if (path === '/todo/tasks/task-1') {
      return {
        id: 'task-1',
        title: '撰写周报',
        content: '整理本周交付内容',
        tags: ['report'],
        status: 'todo',
        target_duration: 1500,
        actual_duration: 600,
        current_cycle_count: 0,
        target_cycle_count: 0,
      };
    }
    return {};
  }),
}));

describe('TaskFocusWork', () => {
  it('shows title, timer actions, and collapsed detail toggle', async () => {
    render(
      <TaskFocusWork
        workflow={{
          state: 'focus',
          task_id: 'task-1',
          task_title: '撰写周报',
          remaining_seconds: 1200,
          elapsed_seconds: 300,
          pending_confirmation: false,
          pending_task_selection: false,
          is_paused: false,
        }}
        recordFocus
        onPause={vi.fn()}
        onResume={vi.fn()}
        onComplete={vi.fn()}
        onCompleteTaskAndFinish={vi.fn()}
        onAbandon={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    );

    expect(await screen.findByText('撰写周报')).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '暂停专注' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '完成本轮专注' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '完成任务并结束专注' })).toBeInTheDocument();
  });

  it('shows paused overlay and reveals task details on demand', async () => {
    const user = userEvent.setup();
    render(
      <TaskFocusWork
        workflow={{
          state: 'focus',
          task_id: 'task-1',
          task_title: '撰写周报',
          remaining_seconds: 1200,
          elapsed_seconds: 300,
          pending_confirmation: false,
          pending_task_selection: false,
          is_paused: true,
        }}
        recordFocus
        onPause={vi.fn()}
        onResume={vi.fn()}
        onComplete={vi.fn()}
        onCompleteTaskAndFinish={vi.fn()}
        onAbandon={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    );

    expect(await screen.findByText('继续专注')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看任务细节' }));
    expect(await screen.findByText('整理本周交付内容')).toBeInTheDocument();
  });
});
