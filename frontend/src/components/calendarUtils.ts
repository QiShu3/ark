import type { Appointment, Task } from './taskTypes';

export type WeekCount = 2 | 3;

export type CalendarTask = Task;
export type CalendarAppointment = Appointment;
export type CalendarDot = {
  id: string;
  title: string;
  kind: 'task' | 'appointment';
  task?: CalendarTask;
  appointment?: CalendarAppointment;
  status: string;
};
export type CalendarTaskContinuation = {
  continuesFromPrev: boolean;
  continuesToNext: boolean;
};
export type CalendarWeekSegment = {
  task: CalendarTask;
  startCol: number;
  endCol: number;
  lane: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

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

function sameDay(value: string | null, day: Date): boolean {
  if (!value) return false;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return target >= dayStart && target < dayEnd;
}

export function isScheduledCalendarTask(task: CalendarTask): boolean {
  return Boolean(task.start_date && task.due_date);
}

export function groupCalendarTaskItemsByDay(tasks: CalendarTask[], days: Date[]): Record<string, CalendarTask[]> {
  const grouped = Object.fromEntries(days.map((day) => [toDayKey(day), [] as CalendarTask[]]));

  for (const task of tasks) {
    if (isScheduledCalendarTask(task)) {
      for (const day of days) {
        if (taskAppearsOnDay(task, day)) {
          grouped[toDayKey(day)].push(task);
        }
      }
      continue;
    }

    const anchor = task.due_date ?? task.start_date;
    if (!anchor) continue;
    for (const day of days) {
      if (sameDay(anchor, day)) {
        grouped[toDayKey(day)].push(task);
      }
    }
  }

  for (const day of days) {
    grouped[toDayKey(day)] = grouped[toDayKey(day)].sort(compareTasks);
  }

  return grouped;
}

export function groupAppointmentsByDay(appointments: CalendarAppointment[], days: Date[]): Record<string, CalendarAppointment[]> {
  const grouped = Object.fromEntries(days.map((day) => [toDayKey(day), [] as CalendarAppointment[]]));

  for (const appointment of appointments) {
    for (const day of days) {
      if (sameDay(appointment.ends_at, day)) {
        grouped[toDayKey(day)].push(appointment);
      }
    }
  }

  for (const day of days) {
    grouped[toDayKey(day)] = grouped[toDayKey(day)].sort((a, b) => (
      new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime()
    ));
  }

  return grouped;
}

export function groupCalendarDotsByDay(
  tasks: CalendarTask[],
  appointments: CalendarAppointment[],
  days: Date[],
): Record<string, CalendarDot[]> {
  const grouped = Object.fromEntries(days.map((day) => [toDayKey(day), [] as CalendarDot[]]));

  for (const task of tasks) {
    if (isScheduledCalendarTask(task)) continue;
    const anchor = task.due_date ?? task.start_date;
    if (!anchor) continue;
    for (const day of days) {
      if (sameDay(anchor, day)) {
        grouped[toDayKey(day)].push({
          id: task.id,
          title: task.title,
          kind: 'task',
          task,
          status: task.status,
        });
      }
    }
  }

  for (const appointment of appointments) {
    for (const day of days) {
      if (sameDay(appointment.ends_at, day)) {
        grouped[toDayKey(day)].push({
          id: appointment.id,
          title: appointment.title,
          kind: 'appointment',
          appointment,
          status: appointment.status,
        });
      }
    }
  }

  for (const day of days) {
    grouped[toDayKey(day)] = grouped[toDayKey(day)].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
  }

  return grouped;
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

export function getTaskContinuationForDay(
  days: Date[],
  groupedTasks: Record<string, CalendarTask[]>,
  day: Date,
  taskId: string,
): CalendarTaskContinuation {
  const index = days.findIndex((candidate) => toDayKey(candidate) === toDayKey(day));
  if (index === -1) {
    return {
      continuesFromPrev: false,
      continuesToNext: false,
    };
  }

  const canConnectToPrevious = index > 0 && index % 7 !== 0;
  const canConnectToNext = index < days.length - 1 && index % 7 !== 6;
  const previousDay = canConnectToPrevious ? groupedTasks[toDayKey(days[index - 1])] || [] : [];
  const nextDay = canConnectToNext ? groupedTasks[toDayKey(days[index + 1])] || [] : [];

  return {
    continuesFromPrev: previousDay.some((task) => task.id === taskId),
    continuesToNext: nextDay.some((task) => task.id === taskId),
  };
}

export function buildCalendarWeekSegments(
  weekDays: Date[],
  groupedTasks: Record<string, CalendarTask[]>,
): CalendarWeekSegment[] {
  const seen = new Set<string>();
  const orderedTasks: CalendarTask[] = [];

  for (const day of weekDays) {
    for (const task of groupedTasks[toDayKey(day)] || []) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      orderedTasks.push(task);
    }
  }

  const laneEndCols: number[] = [];

  return orderedTasks.map((task) => {
    const coveredCols = weekDays
      .map((day, index) => ((groupedTasks[toDayKey(day)] || []).some((candidate) => candidate.id === task.id) ? index : -1))
      .filter((index) => index >= 0);

    const startCol = coveredCols[0];
    const endCol = coveredCols[coveredCols.length - 1];

    let lane = 0;
    while (laneEndCols[lane] !== undefined && laneEndCols[lane] >= startCol) {
      lane += 1;
    }
    laneEndCols[lane] = endCol;

    return {
      task,
      startCol,
      endCol,
      lane,
      clippedStart: taskAppearsOnDay(task, addDays(weekDays[0], -1)),
      clippedEnd: taskAppearsOnDay(task, addDays(weekDays[weekDays.length - 1], 1)),
    };
  });
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
