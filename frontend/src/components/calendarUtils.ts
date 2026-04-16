import type { Task } from './taskTypes';

export type WeekCount = 2 | 3;

export type CalendarTask = Task;

export const CALENDAR_WEEK_COUNT_STORAGE_KEY = 'ark-calendar-week-count';

export function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  day.setDate(day.getDate() - day.getDay());
  return day;
}

export function buildVisibleDays(anchorDate: Date, weekCount: WeekCount): Date[] {
  const first = startOfWeek(anchorDate);
  return Array.from({ length: weekCount * 7 }, (_, index) => addDays(first, index));
}

function taskAppearsOnDay(task: CalendarTask, day: Date): boolean {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const start = task.start_date ? new Date(task.start_date) : null;
  const due = task.due_date ? new Date(task.due_date) : null;

  if (start && due) return start < dayEnd && due >= dayStart;
  if (start) return start >= dayStart && start < dayEnd;
  if (due) return due >= dayStart && due < dayEnd;
  return false;
}

function compareTasks(a: CalendarTask, b: CalendarTask): number {
  if (a.status !== b.status) return a.status === 'done' ? 1 : -1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
}

export function groupTasksByDay(tasks: CalendarTask[], days: Date[]): Record<string, CalendarTask[]> {
  const grouped = Object.fromEntries(days.map((day) => [toDayKey(day), [] as CalendarTask[]]));
  for (const day of days) {
    const key = toDayKey(day);
    grouped[key] = tasks.filter((task) => taskAppearsOnDay(task, day)).sort(compareTasks);
  }
  return grouped;
}

export function getStoredWeekCount(): WeekCount {
  if (typeof window === 'undefined') return 2;
  return window.localStorage.getItem(CALENDAR_WEEK_COUNT_STORAGE_KEY) === '3' ? 3 : 2;
}

export function setStoredWeekCount(value: WeekCount): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CALENDAR_WEEK_COUNT_STORAGE_KEY, String(value));
}

export function formatRangeParam(date: Date): string {
  return toDayKey(date);
}
