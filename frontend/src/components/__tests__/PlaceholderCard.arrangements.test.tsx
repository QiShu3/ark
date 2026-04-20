import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PlaceholderCard from '../PlaceholderCard';
import { apiJson } from '../../lib/api';

const mockApiJson = vi.mocked(apiJson);

function renderArrangementCard() {
  return render(
    <MemoryRouter>
      <PlaceholderCard index={0} />
    </MemoryRouter>,
  );
}

function defaultApiResponse(path: string) {
  if (path === '/todo/focus/current') return Promise.reject(new Error('no focus'));
  if (path === '/todo/focus/today') return Promise.resolve({ minutes: 0 });
  if (path === '/todo/focus/workflow/current') {
    return Promise.resolve({
      state: 'normal',
      task_id: null,
      task_title: null,
      pending_confirmation: false,
      remaining_seconds: null,
    });
  }
  if (path === '/todo/focus/workflows') return Promise.resolve([]);
  if (path === '/todo/tasks?limit=100') return Promise.resolve([]);
  if (path === '/todo/appointments') return Promise.resolve([]);
  return Promise.resolve({});
}

function buildTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'task-1',
    user_id: 7,
    title: '写周报',
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
    event_id: null,
    is_recurring: false,
    period_type: 'once',
    custom_period_days: null,
    max_completions_per_period: 1,
    weekday_only: false,
    time_inherits_from_event: false,
    time_overridden: false,
    task_type: 'focus',
    tags: [],
    actual_duration: 0,
    start_date: null,
    due_date: new Date().toISOString(),
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completion_state: {
      completion_state: 'available',
      is_completable_now: true,
      completed_count_in_period: 0,
      remaining_completions_in_period: 1,
      current_period_start: null,
      current_period_end: null,
      blocked_reason: null,
      hidden_from_action_list: false,
    },
    ...overrides,
  };
}

function buildAppointment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'appt-1',
    user_id: 7,
    title: '站会',
    content: null,
    status: 'pending',
    starts_at: '2026-04-19T10:00:00+08:00',
    ends_at: new Date().toISOString(),
    repeat_rule: 'daily',
    linked_task_id: null,
    event_id: null,
    is_recurring: true,
    period_type: 'daily',
    custom_period_days: null,
    max_completions_per_period: 1,
    weekday_only: false,
    time_inherits_from_event: false,
    time_overridden: false,
    is_deleted: false,
    created_at: '2026-04-19T09:00:00+08:00',
    updated_at: '2026-04-19T09:00:00+08:00',
    completion_state: {
      completion_state: 'available',
      is_completable_now: true,
      completed_count_in_period: 0,
      remaining_completions_in_period: 1,
      current_period_start: null,
      current_period_end: null,
      blocked_reason: null,
      hidden_from_action_list: false,
    },
    ...overrides,
  };
}

function createDataTransfer() {
  const store = new Map<string, string>();
  return {
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
    getData: vi.fn((type: string) => store.get(type) ?? ''),
    effectAllowed: 'all',
    dropEffect: 'move',
  };
}

describe('PlaceholderCard arrangements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiJson.mockImplementation((path: string) => defaultApiResponse(path));
  });

  it('renames the entry and modal to arrangements and exposes task/appointment tabs', async () => {
    const user = userEvent.setup();
    renderArrangementCard();

    expect(screen.getByText('安排')).toBeInTheDocument();

    await user.click(screen.getByText('安排'));

    expect(await screen.findByRole('heading', { name: '安排管理' })).toBeInTheDocument();
    expect(screen.getByText('安排总览')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '任务' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '日程' })).toBeInTheDocument();
  });

  it('opens appointment editor directly from the summary column', async () => {
    const user = userEvent.setup();
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/appointments') {
        return Promise.resolve([
          {
            id: 'appt-1',
            user_id: 7,
            title: '站会',
            content: null,
            status: 'needs_confirmation',
            starts_at: '2026-04-19T10:00:00+08:00',
            ends_at: '2026-04-19T10:30:00+08:00',
            repeat_rule: null,
            linked_task_id: null,
            is_deleted: false,
            created_at: '2026-04-19T09:00:00+08:00',
            updated_at: '2026-04-19T09:00:00+08:00',
          },
        ]);
      }
      return defaultApiResponse(path);
    });

    renderArrangementCard();
    await user.click(screen.getByText('安排'));
    await user.click(await screen.findByText('站会'));

    expect(await screen.findByRole('dialog', { name: '编辑日程' })).toBeInTheDocument();
  });

  it('keeps summary task cards as enter-task links without focus-task grouping', async () => {
    const user = userEvent.setup();
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/tasks?limit=100') {
        return Promise.resolve([
          buildTask({ id: 'task-focus', title: '写周报', task_type: 'focus' }),
          buildTask({ id: 'task-checkin', title: '吃维生素', task_type: 'checkin' }),
        ]);
      }
      return defaultApiResponse(path);
    });

    renderArrangementCard();
    await user.click(screen.getByText('安排'));

    expect(await screen.findByText('今日任务')).toBeInTheDocument();
    expect(screen.queryByText('专注任务')).not.toBeInTheDocument();
    expect(screen.getAllByText('进入任务')).toHaveLength(2);
  });

  it('filters task tabs by completion period_type instead of legacy cycle_period', async () => {
    const user = userEvent.setup();
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/tasks?limit=100') {
        return Promise.resolve([
          buildTask({
            id: 'task-daily',
            title: '每日打卡',
            cycle_period: 'monthly',
            is_recurring: true,
            period_type: 'daily',
          }),
          buildTask({
            id: 'task-weekly',
            title: '每周复盘',
            cycle_period: 'daily',
            is_recurring: true,
            period_type: 'weekly',
          }),
          buildTask({
            id: 'task-monthly',
            title: '月末归档',
            cycle_period: 'weekly',
            is_recurring: true,
            period_type: 'monthly',
          }),
          buildTask({
            id: 'task-custom',
            title: '三天一次整理',
            cycle_period: 'daily',
            is_recurring: true,
            period_type: 'custom_days',
            custom_period_days: 3,
          }),
        ]);
      }
      return defaultApiResponse(path);
    });

    renderArrangementCard();
    await user.click(screen.getByText('安排'));

    expect(screen.getByRole('button', { name: '每月' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '周期' })).not.toBeInTheDocument();
    const taskListPane = screen.getByRole('button', { name: '每日' }).parentElement?.parentElement?.nextElementSibling as HTMLElement;

    await user.click(screen.getByRole('button', { name: '每日' }));
    expect(await within(taskListPane).findByText('每日打卡')).toBeInTheDocument();
    expect(within(taskListPane).queryByText('每周复盘')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '每周' }));
    expect(await within(taskListPane).findByText('每周复盘')).toBeInTheDocument();
    expect(within(taskListPane).queryByText('每日打卡')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '每月' }));
    expect(await within(taskListPane).findByText('月末归档')).toBeInTheDocument();
    expect(within(taskListPane).queryByText('每周复盘')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '自定义' }));
    expect(await within(taskListPane).findByText('三天一次整理')).toBeInTheDocument();
    expect(within(taskListPane).queryByText('月末归档')).not.toBeInTheDocument();
  });

  it('completes repeating tasks through the complete endpoint and hides them from actionable lists', async () => {
    const user = userEvent.setup();
    let completed = false;
    mockApiJson.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/todo/tasks?limit=100') {
        return Promise.resolve(
          completed
            ? [
                buildTask({
                  title: '写周报',
                  is_recurring: true,
                  period_type: 'daily',
                  completion_state: {
                    completion_state: 'period_complete',
                    is_completable_now: false,
                    completed_count_in_period: 1,
                    remaining_completions_in_period: 0,
                    current_period_start: null,
                    current_period_end: null,
                    blocked_reason: 'period_limit_reached',
                    hidden_from_action_list: true,
                  },
                }),
              ]
            : [
                buildTask({
                  title: '写周报',
                  is_recurring: true,
                  period_type: 'daily',
                }),
              ],
        );
      }
      if (path === '/todo/tasks/task-1/complete') {
        completed = true;
        return Promise.resolve(buildTask({
          title: '写周报',
          is_recurring: true,
          period_type: 'daily',
          completion_state: {
            completion_state: 'period_complete',
            is_completable_now: false,
            completed_count_in_period: 1,
            remaining_completions_in_period: 0,
            current_period_start: null,
            current_period_end: null,
            blocked_reason: 'period_limit_reached',
            hidden_from_action_list: true,
          },
        }));
      }
      return defaultApiResponse(path);
    });

    renderArrangementCard();
    await user.click(screen.getByText('安排'));
    const taskListPane = screen.getByRole('button', { name: '每日' }).parentElement?.parentElement?.nextElementSibling as HTMLElement;

    await user.click(await screen.findByTitle('完成'));

    expect(await within(taskListPane).findByText('已完成 (1)')).toBeInTheDocument();
    await user.click(within(taskListPane).getByRole('button', { name: '展开' }));
    const completedTask = await within(taskListPane).findByText('写周报');
    expect(completedTask).toBeInTheDocument();
    expect(within(taskListPane).getByText('本周期已完成')).toBeInTheDocument();
    expect(completedTask.closest('div[draggable]')).toHaveAttribute('draggable', 'false');
    expect(within(taskListPane).queryByTitle('完成')).not.toBeInTheDocument();
    expect(mockApiJson).toHaveBeenCalledWith('/todo/tasks/task-1/complete', { method: 'POST' });
  });

  it('completes repeating appointments through the complete endpoint and hides them from actionable lists', async () => {
    const user = userEvent.setup();
    let completed = false;
    mockApiJson.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/todo/appointments') {
        return Promise.resolve(
          completed
            ? [
                buildAppointment({
                  completion_state: {
                    completion_state: 'period_complete',
                    is_completable_now: false,
                    completed_count_in_period: 1,
                    remaining_completions_in_period: 0,
                    current_period_start: null,
                    current_period_end: null,
                    blocked_reason: 'period_limit_reached',
                    hidden_from_action_list: true,
                  },
                }),
              ]
            : [buildAppointment()],
        );
      }
      if (path === '/todo/appointments/appt-1/complete') {
        completed = true;
        return Promise.resolve(buildAppointment({
          completion_state: {
            completion_state: 'period_complete',
            is_completable_now: false,
            completed_count_in_period: 1,
            remaining_completions_in_period: 0,
            current_period_start: null,
            current_period_end: null,
            blocked_reason: 'period_limit_reached',
            hidden_from_action_list: true,
          },
        }));
      }
      return defaultApiResponse(path);
    });

    renderArrangementCard();
    await user.click(screen.getByText('安排'));
    await user.click(screen.getByRole('button', { name: '日程' }));

    const completeButtons = await screen.findAllByTitle('完成日程');
    await user.click(completeButtons[completeButtons.length - 1]!);

    await screen.findByText('暂无日程');
    expect(mockApiJson).toHaveBeenCalledWith('/todo/appointments/appt-1/complete', { method: 'POST' });
  });

  it('drags a today task back to the task repository without changing its period', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const now = new Date();
    const todayDue = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 30).toISOString();
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0).toISOString();
    mockApiJson.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/todo/tasks?limit=100') {
        return Promise.resolve([
          buildTask({
            id: 'task-daily',
            title: '每日复盘',
            is_recurring: true,
            period_type: 'daily',
            due_date: todayDue,
          }),
        ]);
      }
      if (path === '/todo/tasks/task-daily/move-out-of-today') {
        return Promise.resolve(buildTask({
          id: 'task-daily',
          title: '每日复盘',
          is_recurring: true,
          period_type: 'daily',
          start_date: tomorrowStart,
          due_date: tomorrowStart,
        }));
      }
      return defaultApiResponse(path);
    });

    renderArrangementCard();
    await user.click(screen.getByText('安排'));

    const todayTask = await screen.findByLabelText('今日任务：每日复盘');
    const repository = screen.getByLabelText('任务安排仓库');
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(todayTask, { dataTransfer });
    fireEvent.dragOver(repository, { dataTransfer });
    fireEvent.drop(repository, { dataTransfer });

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith('/todo/tasks/task-daily/move-out-of-today', { method: 'PATCH' });
    });
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('今天是该任务当前周期的截止边界'));
    expect(mockApiJson).not.toHaveBeenCalledWith('/todo/tasks/task-daily', expect.objectContaining({
      body: expect.stringContaining('"period_type"'),
    }));
    confirmSpy.mockRestore();
  });

  it('does not move a boundary today task out when the user cancels the warning', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/tasks?limit=100') {
        return Promise.resolve([
          buildTask({
            id: 'task-daily',
            title: '每日复盘',
            is_recurring: true,
            period_type: 'daily',
            due_date: new Date().toISOString(),
          }),
        ]);
      }
      return defaultApiResponse(path);
    });

    renderArrangementCard();
    await user.click(screen.getByText('安排'));

    const todayTask = await screen.findByLabelText('今日任务：每日复盘');
    const repository = screen.getByLabelText('任务安排仓库');
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(todayTask, { dataTransfer });
    fireEvent.drop(repository, { dataTransfer });

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockApiJson).not.toHaveBeenCalledWith('/todo/tasks/task-daily/move-out-of-today', { method: 'PATCH' });
    confirmSpy.mockRestore();
  });
});
