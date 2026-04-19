import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it } from 'vitest';

import CalendarDayCell from '../CalendarDayCell';
import { CALENDAR_DAY_HEADER_HEIGHT } from '../calendarLayout';
import type { CalendarDot, CalendarTask } from '../calendarUtils';

function buildTask(patch: Partial<CalendarTask> = {}): CalendarTask {
  return {
    id: patch.id ?? 'task-1',
    user_id: patch.user_id ?? 7,
    title: patch.title ?? '准备工作汇报',
    content: patch.content ?? null,
    status: patch.status ?? 'todo',
    priority: patch.priority ?? 1,
    target_duration: patch.target_duration ?? 0,
    current_cycle_count: patch.current_cycle_count ?? 0,
    target_cycle_count: patch.target_cycle_count ?? 0,
    cycle_period: patch.cycle_period ?? 'daily',
    cycle_every_days: patch.cycle_every_days ?? null,
    event: patch.event ?? '',
    event_ids: patch.event_ids ?? [],
    task_type: patch.task_type ?? 'focus',
    tags: patch.tags ?? [],
    actual_duration: patch.actual_duration ?? 0,
    start_date: patch.start_date ?? '2026-04-16T09:00:00+08:00',
    due_date: patch.due_date ?? null,
    is_deleted: patch.is_deleted ?? false,
    created_at: patch.created_at ?? '2026-04-16T00:00:00+08:00',
    updated_at: patch.updated_at ?? '2026-04-16T00:00:00+08:00',
  };
}

describe('CalendarDayCell', () => {
  const dotItems: CalendarDot[] = [
    { id: 'dot-task', title: '准备工作汇报', kind: 'task', status: 'todo', task: buildTask() },
  ];

  it('keeps hover feedback on the task pill instead of the whole day cell', () => {
    render(
      <CalendarDayCell
        day={new Date('2026-04-16T12:00:00Z')}
        itemCount={1}
        dotItems={dotItems}
        todayKey="2026-04-16"
        onDateClick={() => {}}
      />,
    );

    expect(screen.getByTestId('calendar-day-cell').className).not.toContain('hover:bg-white/[0.04]');
    expect(screen.getByText('1 项')).toBeInTheDocument();
  });

  it('reserves a fixed header zone for the date and count', () => {
    render(
      <CalendarDayCell
        day={new Date('2026-04-16T12:00:00Z')}
        itemCount={1}
        dotItems={dotItems}
        todayKey="2026-04-16"
        onDateClick={() => {}}
      />,
    );

    expect(screen.getByText('1 项').parentElement).toHaveStyle({ minHeight: `${CALENDAR_DAY_HEADER_HEIGHT}px` });
  });

  it('uses a plain container for layout and a separate button for date clicks', () => {
    render(
      <CalendarDayCell
        day={new Date('2026-04-16T12:00:00Z')}
        itemCount={1}
        dotItems={dotItems}
        todayKey="2026-04-16"
        onDateClick={() => {}}
      />,
    );

    expect(screen.getByTestId('calendar-day-cell').tagName).toBe('DIV');
    expect(screen.getByRole('button', { name: '2026-04-16 今天，1 项安排' })).toBeInTheDocument();
  });

  it('allows the week row to stretch the day cell height for stacked task bars', () => {
    render(
      <CalendarDayCell
        day={new Date('2026-04-16T12:00:00Z')}
        itemCount={1}
        dotItems={dotItems}
        todayKey="2026-04-16"
        onDateClick={() => {}}
        rowHeight={320}
      />,
    );

    expect(screen.getByTestId('calendar-day-cell')).toHaveStyle({ minHeight: '320px' });
  });

  it('renders clickable dot items for deadline tasks and appointments', () => {
    render(
      <CalendarDayCell
        day={new Date('2026-04-16T12:00:00Z')}
        itemCount={2}
        dotItems={[
          { id: 'dot-task', title: '准备工作汇报', kind: 'task', status: 'todo', task: buildTask() },
          { id: 'dot-appointment', title: '参加站会', kind: 'appointment', status: 'pending' },
        ]}
        todayKey="2026-04-16"
        onDateClick={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: '打开任务 准备工作汇报' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开日程 参加站会' })).toBeInTheDocument();
  });

  it('shows each dot item title next to the dot so it can be scanned directly in the grid', () => {
    render(
      <CalendarDayCell
        day={new Date('2026-04-16T12:00:00Z')}
        itemCount={2}
        dotItems={[
          { id: 'dot-task', title: '睡前阅读', kind: 'task', status: 'todo', task: buildTask({ title: '睡前阅读' }) },
          { id: 'dot-appointment', title: '参加站会', kind: 'appointment', status: 'pending' },
        ]}
        todayKey="2026-04-16"
        onDateClick={() => {}}
      />,
    );

    expect(screen.getByText('睡前阅读')).toBeInTheDocument();
    expect(screen.getByText('参加站会')).toBeInTheDocument();
  });
});
