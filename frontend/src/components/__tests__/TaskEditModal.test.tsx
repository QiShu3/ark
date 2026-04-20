import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

import TaskEditModal from '../TaskEditModal';
import { apiJson } from '../../lib/api';
import type { Task } from '../taskTypes';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

const mockApiJson = vi.mocked(apiJson);

function buildTask(patch: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    user_id: 7,
    title: '写初稿',
    content: '先完成摘要',
    status: 'todo',
    priority: 2,
    target_duration: 1800,
    current_cycle_count: 0,
    target_cycle_count: 1,
    cycle_period: 'daily',
    cycle_every_days: null,
    event: '论文投稿',
    event_ids: [],
    event_id: 'event-primary',
    is_recurring: true,
    period_type: 'weekly',
    custom_period_days: null,
    max_completions_per_period: 2,
    weekday_only: false,
    time_inherits_from_event: true,
    time_overridden: false,
    task_type: 'focus',
    tags: ['论文'],
    actual_duration: 0,
    start_date: '2026-04-20T09:00:00Z',
    due_date: '2026-04-30T10:00:00Z',
    is_deleted: false,
    created_at: '2026-04-19T09:00:00Z',
    updated_at: '2026-04-19T09:00:00Z',
    completion_state: null,
    ...patch,
  };
}

describe('TaskEditModal', () => {
  it('renders bound event and submits repeat completion settings', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const onClose = vi.fn();

    mockApiJson.mockImplementation(async (path: string) => {
      if (path === '/todo/events') {
        return [
          {
            id: 'event-primary',
            user_id: 7,
            name: '论文投稿',
            due_at: '2026-04-30T10:00:00Z',
            is_primary: true,
            created_at: '2026-04-19T09:00:00Z',
            updated_at: '2026-04-19T09:00:00Z',
          },
          {
            id: 'event-defense',
            user_id: 7,
            name: '答辩',
            due_at: '2026-05-03T09:00:00Z',
            is_primary: false,
            created_at: '2026-04-19T09:00:00Z',
            updated_at: '2026-04-19T09:00:00Z',
          },
        ];
      }
      return buildTask();
    });

    render(
      <TaskEditModal
        open
        task={buildTask()}
        onClose={onClose}
        onChanged={onChanged}
      />,
    );

    expect(screen.getByRole('dialog', { name: '编辑任务' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('关联事件')).toHaveValue('event-primary');
    });
    expect(screen.queryByLabelText('循环周期')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('当前循环次数')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('目的循环次数')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('自定义间隔（天）')).not.toBeInTheDocument();
    expect(screen.getByLabelText('完成周期')).toHaveValue('weekly');
    expect(screen.getByLabelText('单周期最多完成次数')).toHaveValue(2);

    await user.selectOptions(screen.getByLabelText('关联事件'), 'event-defense');
    await user.selectOptions(screen.getByLabelText('完成周期'), 'custom_days');
    await user.clear(screen.getByLabelText('自定义完成周期（天）'));
    await user.type(screen.getByLabelText('自定义完成周期（天）'), '5');
    await user.clear(screen.getByLabelText('单周期最多完成次数'));
    await user.type(screen.getByLabelText('单周期最多完成次数'), '3');
    await user.click(screen.getByLabelText('仅工作日可完成'));
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith('/todo/tasks/task-1', expect.objectContaining({
        method: 'PATCH',
      }));
    });

    const patchCall = mockApiJson.mock.calls.find(([path]) => path === '/todo/tasks/task-1');
    expect(patchCall?.[1]?.body).toBeTruthy();
    const payload = JSON.parse(String(patchCall?.[1]?.body));
    expect(payload.event_id).toBe('event-defense');
    expect(payload.event).toBe('答辩');
    expect(payload.period_type).toBe('custom_days');
    expect(payload.custom_period_days).toBe(5);
    expect(payload.max_completions_per_period).toBe(3);
    expect(payload.weekday_only).toBe(true);
    expect(payload.time_inherits_from_event).toBe(true);
    expect(payload).not.toHaveProperty('current_cycle_count');
    expect(payload).not.toHaveProperty('target_cycle_count');
    expect(payload).not.toHaveProperty('cycle_period');
    expect(payload).not.toHaveProperty('cycle_every_days');
    expect(payload).not.toHaveProperty('event_ids');
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
