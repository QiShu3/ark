import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TaskFocusWork from '../focus-work/TaskFocusWork';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(async (path: string) => {
    if (path === '/todo/tasks/task-1') {
      return {
        id: 'task-1',
        title: '撰写周报',
        content: '整理本周交付内容',
        status: 'todo',
        actual_duration: 600,
        current_cycle_count: 0,
        target_cycle_count: 0,
      };
    }
    return {};
  }),
}));

describe('TaskFocusWork', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(screen.queryByRole('button', { name: '暂停专注' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '完成本轮专注' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '完成任务并结束专注' })).toBeInTheDocument();
  });

  it('counts down locally while task focus is running', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));

    render(
      <TaskFocusWork
        workflow={{
          state: 'focus',
          task_id: 'task-1',
          task_title: '撰写周报',
          remaining_seconds: 5,
          elapsed_seconds: 0,
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

    expect(screen.getByText('00:05')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('00:03')).toBeInTheDocument();
  });

  it('requests a workflow reload when task focus countdown reaches zero', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));
    const reloadSpy = vi.fn();
    window.addEventListener('ark:reload-focus', reloadSpy);

    render(
      <TaskFocusWork
        workflow={{
          state: 'focus',
          task_id: 'task-1',
          task_title: '撰写周报',
          remaining_seconds: 1,
          elapsed_seconds: 0,
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

    expect(screen.getByText('00:01')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener('ark:reload-focus', reloadSpy);
  });

  it('shows paused state and reveals task details on demand', async () => {
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

    expect(await screen.findByText('当前专注已暂停')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '继续专注' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看任务细节' }));
    expect(await screen.findByText('整理本周交付内容')).toBeInTheDocument();
  });
});
