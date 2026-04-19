import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
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
    task_type: 'focus',
    tags: [],
    actual_duration: 0,
    start_date: null,
    due_date: new Date().toISOString(),
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
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
});
