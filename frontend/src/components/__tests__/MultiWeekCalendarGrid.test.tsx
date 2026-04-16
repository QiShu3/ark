import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it } from 'vitest';

import MultiWeekCalendarGrid from '../MultiWeekCalendarGrid';
import { buildVisibleDays, groupTasksByDay, type CalendarTask } from '../calendarUtils';

function buildTask(patch: Partial<CalendarTask> = {}): CalendarTask {
  return {
    id: patch.id ?? 'task-1',
    user_id: patch.user_id ?? 7,
    title: patch.title ?? '跨天任务',
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
    tags: patch.tags ?? ['story'],
    actual_duration: patch.actual_duration ?? 0,
    start_date: patch.start_date ?? '2026-04-20T09:00:00+08:00',
    due_date: patch.due_date ?? '2026-04-25T18:00:00+08:00',
    is_deleted: patch.is_deleted ?? false,
    created_at: patch.created_at ?? '2026-04-16T00:00:00+08:00',
    updated_at: patch.updated_at ?? '2026-04-16T00:00:00+08:00',
  };
}

describe('MultiWeekCalendarGrid', () => {
  it('renders a multi-day task as one connected bar per week row instead of repeating the title each day', () => {
    const days = buildVisibleDays(new Date('2026-04-23T12:00:00Z'), 2);
    const groupedTasks = groupTasksByDay(
      [
        buildTask(),
        buildTask({
          id: 'task-2',
          title: '第二个任务',
          start_date: '2026-04-20T09:00:00+08:00',
          due_date: '2026-04-25T18:00:00+08:00',
        }),
      ],
      days,
    );

    render(
      <MultiWeekCalendarGrid
        days={days}
        groupedTasks={groupedTasks}
        todayKey="2026-04-23"
        onDateClick={() => {}}
        onTaskClick={() => {}}
      />,
    );

    expect(screen.getAllByText('跨天任务')).toHaveLength(1);
    expect(screen.getAllByText('第二个任务')).toHaveLength(1);
  });
});
