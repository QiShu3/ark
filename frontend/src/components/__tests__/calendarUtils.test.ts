import { describe, expect, it } from 'vitest';
import {
  buildVisibleDays,
  getStoredWeekCount,
  groupTasksByDay,
  setStoredWeekCount,
  toDayKey,
  type CalendarTask,
} from '../calendarUtils';

const baseTask = (patch: Partial<CalendarTask>): CalendarTask => ({
  id: patch.id ?? 'task-1',
  title: patch.title ?? 'Task',
  status: patch.status ?? 'todo',
  priority: patch.priority ?? 0,
  start_date: patch.start_date ?? null,
  due_date: patch.due_date ?? null,
  updated_at: patch.updated_at ?? '2026-04-16T00:00:00Z',
});

describe('calendarUtils', () => {
  it('builds 14 visible days for a two-week view starting on Sunday', () => {
    const days = buildVisibleDays(new Date('2026-04-16T12:00:00Z'), 2);

    expect(days).toHaveLength(14);
    expect(toDayKey(days[0])).toBe('2026-04-12');
    expect(toDayKey(days[13])).toBe('2026-04-25');
  });

  it('builds 21 visible days for a three-week view', () => {
    const days = buildVisibleDays(new Date('2026-04-16T12:00:00Z'), 3);

    expect(days).toHaveLength(21);
    expect(toDayKey(days[20])).toBe('2026-05-02');
  });

  it('groups tasks by start date, due date, and overlapping ranges', () => {
    const days = buildVisibleDays(new Date('2026-04-16T12:00:00Z'), 2);
    const grouped = groupTasksByDay(
      [
        baseTask({ id: 'start', title: 'Start', start_date: '2026-04-16T09:00:00+08:00' }),
        baseTask({ id: 'due', title: 'Due', due_date: '2026-04-17T18:00:00+08:00' }),
        baseTask({
          id: 'range',
          title: 'Range',
          start_date: '2026-04-15T09:00:00+08:00',
          due_date: '2026-04-18T18:00:00+08:00',
        }),
      ],
      days,
    );

    expect(grouped['2026-04-16'].map((task) => task.id)).toContain('start');
    expect(grouped['2026-04-17'].map((task) => task.id)).toContain('due');
    expect(grouped['2026-04-15'].map((task) => task.id)).toContain('range');
    expect(grouped['2026-04-18'].map((task) => task.id)).toContain('range');
  });

  it('orders active higher-priority tasks before completed tasks', () => {
    const days = [new Date('2026-04-16T00:00:00Z')];
    const grouped = groupTasksByDay(
      [
        baseTask({ id: 'done', status: 'done', priority: 3, due_date: '2026-04-16T18:00:00+08:00' }),
        baseTask({ id: 'low', priority: 0, due_date: '2026-04-16T18:00:00+08:00' }),
        baseTask({ id: 'high', priority: 3, due_date: '2026-04-16T18:00:00+08:00' }),
      ],
      days,
    );

    expect(grouped['2026-04-16'].map((task) => task.id)).toEqual(['high', 'low', 'done']);
  });

  it('persists only supported week counts', () => {
    window.localStorage.clear();

    expect(getStoredWeekCount()).toBe(2);
    setStoredWeekCount(3);
    expect(getStoredWeekCount()).toBe(3);
    window.localStorage.setItem('ark-calendar-week-count', '6');
    expect(getStoredWeekCount()).toBe(2);
  });
});
