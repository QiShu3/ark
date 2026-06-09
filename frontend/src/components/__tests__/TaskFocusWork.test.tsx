import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

import TaskFocusWork from '../focus-work/TaskFocusWork';
import type { FocusWorkRunSummary } from '../focus-work/focusWorkTypes';

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

function taskRun(): FocusWorkRunSummary {
  return {
    id: 'run-1',
    workflow_id: 'workflow-1',
    phase_index: 0,
    task_id: 'task-1',
    focus_work_type: 'task_focus',
    counts_for_task_completion: true,
    status: 'running',
    config_snapshot: {
      task_title: '撰写周报',
    },
  };
}

describe('TaskFocusWork', () => {
  it('shows title and content-complete action without task business controls', async () => {
    render(
      <TaskFocusWork
        run={taskRun()}
        disabled={false}
        onContentCompleted={vi.fn()}
      />,
    );

    expect(await screen.findByText('撰写周报')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '暂停专注' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '完成本轮专注' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '完成任务并结束专注' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '完成本轮内容' })).toBeInTheDocument();
  });

  it('emits content completion when the user finishes task content', async () => {
    const user = userEvent.setup();
    const onContentCompleted = vi.fn();

    render(
      <TaskFocusWork
        run={taskRun()}
        disabled={false}
        onContentCompleted={onContentCompleted}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '完成本轮内容' }));

    expect(onContentCompleted).toHaveBeenCalledWith({ task_id: 'task-1' });
  });

  it('shows paused state and reveals task details on demand', async () => {
    const user = userEvent.setup();
    render(
      <TaskFocusWork
        run={taskRun()}
        disabled
        onContentCompleted={vi.fn()}
      />,
    );

    expect(await screen.findByText('当前专注已暂停')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '继续专注' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '完成本轮内容' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '查看任务细节' }));
    expect(await screen.findByText('整理本周交付内容')).toBeInTheDocument();
  });
});
