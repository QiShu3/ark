import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PlaceholderCard from '../PlaceholderCard';
import { apiJson } from '../../lib/api';

const mockApiJson = vi.mocked(apiJson);

function buildTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'task-1',
    user_id: 7,
    title: '任务 A',
    content: null,
    status: 'todo',
    priority: 1,
    target_duration: 1500,
    current_cycle_count: 0,
    target_cycle_count: 1,
    cycle_period: 'daily',
    cycle_every_days: null,
    event: '',
    event_ids: [],
    task_type: 'focus',
    tags: [],
    actual_duration: 0,
    start_date: null,
    due_date: null,
    is_deleted: false,
    created_at: '2026-04-16T08:00:00+08:00',
    updated_at: '2026-04-16T08:00:00+08:00',
    ...overrides,
  };
}

function defaultApiResponse(path: string) {
  if (path === '/todo/focus/current') {
    return Promise.reject(new Error('no focus'));
  }
  if (path === '/todo/focus/today') {
    return Promise.resolve({ minutes: 0 });
  }
  if (path === '/todo/focus/workflow/current') {
    return Promise.resolve({
      state: 'normal',
      task_id: null,
      task_title: null,
      pending_confirmation: false,
      pending_task_selection: false,
      remaining_seconds: null,
    });
  }
  if (path === '/todo/focus/workflows') {
    return Promise.resolve([]);
  }
  if (path === '/todo/tasks?limit=100') {
    return Promise.resolve([]);
  }
  return Promise.resolve({});
}

function renderCard() {
  return render(
    <MemoryRouter>
      <PlaceholderCard index={0} />
    </MemoryRouter>,
  );
}

describe('PlaceholderCard workflow UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiJson.mockImplementation((path: string) => defaultApiResponse(path));
  });

  it('submits default timer mode and phase task binding when saving a workflow preset', async () => {
    const user = userEvent.setup();
    const task = buildTask();

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/tasks?limit=100') {
        return Promise.resolve([task]);
      }
      if (path === '/todo/focus/workflows' && init?.method === 'POST') {
        return Promise.resolve({
          id: 'preset-1',
          user_id: 7,
          name: '深度工作',
          focus_duration: 1500,
          break_duration: 300,
          default_focus_timer_mode: 'countup',
          phases: [
            { phase_type: 'focus', duration: 1500, timer_mode: 'countup', task_id: task.id },
            { phase_type: 'break', duration: 300, timer_mode: null, task_id: null },
          ],
          is_default: false,
          created_at: '2026-04-16T08:00:00+08:00',
          updated_at: '2026-04-16T08:00:00+08:00',
        });
      }
      return defaultApiResponse(path);
    });

    renderCard();
    window.dispatchEvent(new Event('ark:open-workflow-modal'));

    await user.type(await screen.findByLabelText('工作流名称'), '深度工作');
    await user.selectOptions(screen.getByLabelText('默认专注计时方式'), 'countup');
    await user.selectOptions(screen.getByLabelText('阶段 1 计时方式'), 'countup');
    await user.selectOptions(screen.getByLabelText('阶段 1 绑定任务'), task.id);
    await user.click(screen.getByRole('button', { name: '创建工作流' }));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(([path, init]) => path === '/todo/focus/workflows' && init?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call?.[1]?.body ?? '{}'));
      expect(body.default_focus_timer_mode).toBe('countup');
      expect(body.phases[0]).toMatchObject({
        phase_type: 'focus',
        duration: 1500,
        timer_mode: 'countup',
        task_id: task.id,
      });
    });
  });

  it('hides the duration input for countup focus phases but still submits a default target duration', async () => {
    const user = userEvent.setup();

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/focus/workflows' && init?.method === 'POST') {
        return Promise.resolve({
          id: 'preset-2',
          user_id: 7,
          name: '正计时流',
          focus_duration: 1500,
          break_duration: 300,
          default_focus_timer_mode: 'countup',
          phases: [
            { phase_type: 'focus', duration: 1500, timer_mode: 'countup', task_id: null },
            { phase_type: 'break', duration: 300, timer_mode: null, task_id: null },
          ],
          is_default: false,
          created_at: '2026-04-16T08:00:00+08:00',
          updated_at: '2026-04-16T08:00:00+08:00',
        });
      }
      return defaultApiResponse(path);
    });

    renderCard();
    window.dispatchEvent(new Event('ark:open-workflow-modal'));

    await user.type(await screen.findByLabelText('工作流名称'), '正计时流');
    await user.selectOptions(screen.getByLabelText('阶段 1 计时方式'), 'countup');

    expect(screen.queryByLabelText('阶段 1 时长（分钟）')).not.toBeInTheDocument();
    expect(screen.getByText('正计时阶段不需要单独设置时长')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '创建工作流' }));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(([path, init]) => path === '/todo/focus/workflows' && init?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call?.[1]?.body ?? '{}'));
      expect(body.phases[0]).toMatchObject({
        phase_type: 'focus',
        timer_mode: 'countup',
        duration: 1500,
      });
    });
  });

  it('lets the user select a task for the current pending workflow phase', async () => {
    const user = userEvent.setup();
    const todoTask = buildTask({ id: 'task-todo', title: '待办任务' });
    const doneTask = buildTask({ id: 'task-done', title: '已完成任务', status: 'done' });

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/tasks?limit=100') {
        return Promise.resolve([todoTask, doneTask]);
      }
      if (path === '/todo/focus/workflow/current') {
        return Promise.resolve({
          state: 'focus',
          workflow_name: '深度工作流',
          current_phase_index: 0,
          phases: [{ phase_type: 'focus', duration: 1500, timer_mode: 'countup', task_id: null }],
          task_id: null,
          task_title: null,
          pending_confirmation: false,
          pending_task_selection: true,
          remaining_seconds: null,
          phase_timer_mode: 'countup',
          elapsed_seconds: null,
        });
      }
      if (path === '/todo/focus/workflow/select-task' && init?.method === 'POST') {
        return Promise.resolve({
          state: 'focus',
          workflow_name: '深度工作流',
          current_phase_index: 0,
          phases: [{ phase_type: 'focus', duration: 1500, timer_mode: 'countup', task_id: null }],
          task_id: todoTask.id,
          task_title: todoTask.title,
          pending_confirmation: false,
          pending_task_selection: false,
          remaining_seconds: null,
          phase_timer_mode: 'countup',
          elapsed_seconds: 0,
          runtime_task_id: todoTask.id,
          phase_started_at: '2026-04-16T08:00:00+08:00',
        });
      }
      return defaultApiResponse(path);
    });

    renderCard();

    await user.click(await screen.findByRole('button', { name: '选择当前阶段任务' }));
    await user.click(await screen.findByRole('button', { name: '选择任务 待办任务' }));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(
        ([path, init]) => path === '/todo/focus/workflow/select-task' && init?.method === 'POST',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call?.[1]?.body ?? '{}'));
      expect(body).toEqual({ task_id: todoTask.id });
    });
  });
});
