import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it } from 'vitest';

import CalendarDayCell from '../CalendarDayCell';
import type { CalendarTask } from '../calendarUtils';

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
  it('keeps hover feedback on the task pill instead of the whole day cell', () => {
    render(
      <CalendarDayCell
        day={new Date('2026-04-16T12:00:00Z')}
        tasks={[buildTask()]}
        todayKey="2026-04-16"
        onDateClick={() => {}}
        onTaskClick={() => {}}
      />,
    );

    expect(screen.getByTestId('calendar-day-cell').className).not.toContain('hover:bg-white/[0.04]');
    expect(screen.getByRole('button', { name: '准备工作汇报' })).toHaveClass('calendar-task-interactive');
  });
});
