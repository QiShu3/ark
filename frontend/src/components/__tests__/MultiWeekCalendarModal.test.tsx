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

describe('MultiWeekCalendarModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockApiJson.mockResolvedValue([
      task({ id: 'focus', title: '准备工作汇报', start_date: '2026-04-16T09:00:00+08:00', priority: 3 }),
      task({ id: 'read', title: '睡前阅读', due_date: '2026-04-16T21:00:00+08:00', priority: 1 }),
      task({ id: 'overflow-1', title: '任务三', due_date: '2026-04-16T21:00:00+08:00' }),
      task({ id: 'overflow-2', title: '任务四', due_date: '2026-04-16T21:00:00+08:00' }),
      task({ id: 'overflow-3', title: '任务五', due_date: '2026-04-16T21:00:00+08:00' }),
    ]);
  });

  it('renders a two-week calendar by default and loads tasks for the visible range', async () => {
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    expect(await screen.findByRole('dialog', { name: '多周任务日历' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开年月选择器，当前 2026年4月' })).toBeInTheDocument();
    expect(screen.getAllByTestId('calendar-day-cell')).toHaveLength(14);
    expect(await screen.findByText('准备工作汇报')).toBeInTheDocument();
    expect(mockApiJson).toHaveBeenCalledWith('/todo/tasks/calendar?start=2026-04-12&end=2026-04-26');
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
    await user.click(screen.getByRole('button', { name: '2026-04-16，5 项任务' }));

    const drawer = screen.getByRole('complementary', { name: '2026-04-16 日期详情' });
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText('任务五')).toBeInTheDocument();
  });

  it('opens the full edit modal when a calendar task is clicked', async () => {
    const user = userEvent.setup();
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    await user.click(await screen.findByText('准备工作汇报'));

    expect(screen.getByRole('heading', { name: '编辑任务' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('准备工作汇报')).toBeInTheDocument();
  });

  it('keeps the calendar grid stable while a navigated range is loading', async () => {
    const user = userEvent.setup();
    let resolveSecondLoad: (value: unknown[]) => void = () => {};
    mockApiJson
      .mockResolvedValueOnce([
        task({ id: 'focus', title: '准备工作汇报', start_date: '2026-04-16T09:00:00+08:00', priority: 3 }),
      ])
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveSecondLoad = resolve;
      }));

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
    expect(mockApiJson).toHaveBeenLastCalledWith('/todo/tasks/calendar?start=2025-11-30&end=2025-12-14');
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
