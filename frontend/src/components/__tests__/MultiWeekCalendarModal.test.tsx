import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MultiWeekCalendarModal from '../MultiWeekCalendarModal';
import { apiJson } from '../../lib/api';

const mockApiJson = vi.mocked(apiJson);

const task = (patch: Record<string, unknown>) => ({
  id: patch.id ?? 'task-1',
  user_id: 7,
  title: patch.title ?? 'Task',
  content: null,
  status: patch.status ?? 'todo',
  priority: patch.priority ?? 0,
  target_duration: 0,
  current_cycle_count: 0,
  target_cycle_count: 0,
  cycle_period: 'daily',
  cycle_every_days: null,
  event: '',
  event_ids: [],
  task_type: 'focus',
  tags: [],
  actual_duration: 0,
  start_date: patch.start_date ?? null,
  due_date: patch.due_date ?? null,
  is_deleted: false,
  created_at: '2026-04-16T00:00:00+08:00',
  updated_at: patch.updated_at ?? '2026-04-16T00:00:00+08:00',
});

const appointment = (patch: Record<string, unknown>) => ({
  id: patch.id ?? 'appt-1',
  user_id: 7,
  title: patch.title ?? 'Appointment',
  content: patch.content ?? null,
  status: patch.status ?? 'pending',
  starts_at: patch.starts_at ?? null,
  ends_at: patch.ends_at ?? '2026-04-16T10:30:00+08:00',
  repeat_rule: patch.repeat_rule ?? null,
  linked_task_id: patch.linked_task_id ?? null,
  is_deleted: false,
  created_at: '2026-04-16T00:00:00+08:00',
  updated_at: patch.updated_at ?? '2026-04-16T00:00:00+08:00',
});

describe('MultiWeekCalendarModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockApiJson.mockImplementation((path: string) => {
      if (path.startsWith('/todo/tasks/calendar')) {
        return Promise.resolve([
          task({
            id: 'focus',
            title: '准备工作汇报',
            start_date: '2026-04-16T09:00:00+08:00',
            due_date: '2026-04-16T11:00:00+08:00',
            priority: 3,
          }),
          task({ id: 'read', title: '睡前阅读', due_date: '2026-04-16T21:00:00+08:00', priority: 1 }),
          task({ id: 'overflow-1', title: '任务三', due_date: '2026-04-16T21:00:00+08:00' }),
          task({ id: 'overflow-2', title: '任务四', due_date: '2026-04-16T21:00:00+08:00' }),
          task({ id: 'overflow-3', title: '任务五', due_date: '2026-04-16T21:00:00+08:00' }),
        ]);
      }
      if (path === '/todo/appointments?view=all') {
        return Promise.resolve([
          appointment({ id: 'standup', title: '参加站会', ends_at: '2026-04-16T10:30:00+08:00' }),
        ]);
      }
      return Promise.resolve([]);
    });
  });

  it('renders a two-week calendar by default and loads tasks for the visible range', async () => {
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    expect(await screen.findByRole('dialog', { name: '多周安排日历' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开年月选择器，当前 2026年4月' })).toBeInTheDocument();
    expect(screen.getAllByTestId('calendar-day-cell')).toHaveLength(14);
    expect(await screen.findByText('准备工作汇报')).toBeInTheDocument();
    expect(mockApiJson).toHaveBeenCalledWith('/todo/tasks/calendar?start=2026-04-12&end=2026-04-26');
    expect(mockApiJson).toHaveBeenCalledWith('/todo/appointments?view=all');
  });

  it('switches to three weeks and persists the preference', async () => {
    const user = userEvent.setup();
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    await user.click(await screen.findByRole('button', { name: '显示 3 周' }));

    expect(screen.getAllByTestId('calendar-day-cell')).toHaveLength(21);
    expect(window.localStorage.getItem('ark-calendar-week-count')).toBe('3');
  });

  it('opens the date drawer from a busy day and shows all tasks for that date', async () => {
    const user = userEvent.setup();
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    await screen.findByText('准备工作汇报');
    await user.click(screen.getByRole('button', { name: '2026-04-16，6 项安排' }));

    const drawer = screen.getByRole('complementary', { name: '2026-04-16 日期详情' });
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText('任务五')).toBeInTheDocument();
    expect(within(drawer).getByText('参加站会')).toBeInTheDocument();
  });

  it('opens the full edit modal when a calendar task is clicked', async () => {
    const user = userEvent.setup();
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    await user.click(await screen.findByText('准备工作汇报'));

    expect(screen.getByRole('heading', { name: '编辑任务' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('准备工作汇报')).toBeInTheDocument();
  });

  it('renders scheduled tasks as bars while deadline tasks and appointments stay as dots', async () => {
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    expect(await screen.findByTestId('calendar-task-bar-focus')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-task-bar-read')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开任务 睡前阅读' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开日程 参加站会' })).toBeInTheDocument();
  });

  it('opens the appointment editor when an appointment dot is clicked', async () => {
    const user = userEvent.setup();
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    await user.click(await screen.findByRole('button', { name: '打开日程 参加站会' }));

    expect(screen.getByRole('heading', { name: '编辑日程' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('参加站会')).toBeInTheDocument();
  });

  it('opens the task editor when a deadline-only task dot is clicked', async () => {
    const user = userEvent.setup();
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    await user.click(await screen.findByRole('button', { name: '打开任务 睡前阅读' }));

    expect(screen.getByRole('heading', { name: '编辑任务' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('睡前阅读')).toBeInTheDocument();
  });

  it('keeps the calendar grid stable while a navigated range is loading', async () => {
    const user = userEvent.setup();
    let resolveSecondLoad: (value: unknown[]) => void = () => {};
    mockApiJson.mockImplementationOnce((path: string) => {
      expect(path).toContain('/todo/tasks/calendar');
      return Promise.resolve([
        task({
          id: 'focus',
          title: '准备工作汇报',
          start_date: '2026-04-16T09:00:00+08:00',
          due_date: '2026-04-16T11:00:00+08:00',
          priority: 3,
        }),
      ]);
    });
    mockApiJson.mockImplementationOnce((path: string) => {
      expect(path).toBe('/todo/appointments?view=all');
      return Promise.resolve([]);
    });
    mockApiJson.mockImplementationOnce((path: string) => {
      expect(path).toContain('/todo/tasks/calendar');
      return new Promise((resolve) => {
        resolveSecondLoad = resolve;
      });
    });
    mockApiJson.mockImplementationOnce((path: string) => {
      expect(path).toBe('/todo/appointments?view=all');
      return Promise.resolve([]);
    });

    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);
    await screen.findByText('准备工作汇报');

    await user.click(screen.getByRole('button', { name: '下一段日期' }));

    expect(screen.queryByText('加载中...')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('calendar-day-cell')).toHaveLength(14);

    resolveSecondLoad([]);
  });

  it('allows switching year and month from the title picker', async () => {
    const user = userEvent.setup();
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    await user.click(await screen.findByRole('button', { name: '打开年月选择器，当前 2026年4月' }));
    expect(screen.getByRole('dialog', { name: '选择年份和月份' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '上一年' }));
    await user.click(screen.getByRole('button', { name: '切换到 2025年12月' }));

    expect(screen.getByRole('button', { name: '打开年月选择器，当前 2025年12月' })).toBeInTheDocument();
    expect(mockApiJson).toHaveBeenCalledWith('/todo/tasks/calendar?start=2025-11-30&end=2025-12-14');
    expect(mockApiJson).toHaveBeenCalledWith('/todo/appointments?view=all');
  });

  it('renders the year-month picker as an opaque surface', async () => {
    const user = userEvent.setup();
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    await user.click(await screen.findByRole('button', { name: '打开年月选择器，当前 2026年4月' }));

    const picker = screen.getByRole('dialog', { name: '选择年份和月份' });
    expect(picker).toHaveClass('bg-slate-950');
    expect(picker).toHaveClass('z-30');
    expect(picker.className).not.toContain('backdrop-blur');
  });
});
