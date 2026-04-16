# Multi-week Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dark-glass multi-week task calendar that opens from the home calendar, supports 2-week and 3-week views, and renders dense tasks as transparent glass labels.

**Architecture:** Add a backend range endpoint for calendar task loading, then build focused frontend calendar utilities and components. Keep the compact `CalendarWidget` as the entry point and move expanded calendar responsibilities into new components instead of growing `PlaceholderCard`.

**Tech Stack:** FastAPI + asyncpg + pytest on the backend; React + TypeScript + Vite + Vitest + Testing Library on the frontend; Tailwind utility classes for styling.

---

## File Map

- Modify `backend/routes/todo_routes.py`: add `GET /todo/tasks/calendar` before `GET /todo/tasks/{task_id}` so the static route is not swallowed by the UUID route, and import `date` if needed for date-only query params.
- Modify `backend/tests/test_todo_routes.py`: extend the fake connection and add route tests for range filtering behavior.
- Create `frontend/src/components/calendarUtils.ts`: date range, ISO day keys, task placement, day grouping, ordering, and week-count persistence helpers.
- Create `frontend/src/components/MultiWeekCalendarModal.tsx`: modal shell, toolbar, task loading, week-count state, anchor date navigation, selected date drawer state.
- Create `frontend/src/components/MultiWeekCalendarGrid.tsx`: weekday header and visible day cells.
- Create `frontend/src/components/CalendarDayCell.tsx`: date cell, transparent task labels, overflow row, density indicator.
- Create `frontend/src/components/CalendarDateDrawer.tsx`: selected date details and quick actions.
- Modify `frontend/src/components/CalendarWidget.tsx`: render compact check-in calendar as before and open the multi-week modal on click when used as an interactive widget.
- Modify `frontend/src/components/Navigation.tsx`: stop wrapping `CalendarWidget` in its own modal and let the widget/modal flow be shared, or keep a small explicit modal trigger that opens `MultiWeekCalendarModal`.
- Create `frontend/src/components/__tests__/calendarUtils.test.ts`: utility tests.
- Create `frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx`: modal integration tests.
- Update `frontend/src/setupTests.ts`: mock `/todo/tasks/calendar?...` responses where needed.

---

### Task 1: Backend Calendar Range Endpoint

**Files:**
- Modify: `backend/routes/todo_routes.py`
- Modify: `backend/tests/test_todo_routes.py`

- [ ] **Step 1: Extend fake backend test connection with task rows**

Add `tasks` storage and calendar-query handling to `_FakeTodoConn` in `backend/tests/test_todo_routes.py`.

```python
class _FakeTodoConn:
    def __init__(self) -> None:
        self.stats_rows: list[dict[str, Any]] = []
        self.events: list[dict[str, Any]] = []
        self.tasks: list[dict[str, Any]] = []

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        if "WITH bounds AS" in sql and "FROM log_durations ld" in sql:
            if args[0] != 7:
                return []
            return self.stats_rows
        if "FROM events" in sql and "ORDER BY due_at ASC" in sql:
            user_id = args[0]
            rows = [event for event in self.events if event["user_id"] == user_id]
            return sorted(rows, key=lambda event: (event["due_at"], -event["created_at"].timestamp()))
        if "FROM tasks" in sql and "calendar range endpoint" in sql:
            user_id, range_start, range_end = args
            rows = []
            for task in self.tasks:
                if task["user_id"] != user_id or task["is_deleted"]:
                    continue
                start = task["start_date"]
                due = task["due_date"]
                overlaps = False
                if start is not None and due is not None:
                    overlaps = start < range_end and due >= range_start
                elif start is not None:
                    overlaps = range_start <= start < range_end
                elif due is not None:
                    overlaps = range_start <= due < range_end
                if overlaps:
                    rows.append(task)
            return sorted(
                rows,
                key=lambda task: (
                    0 if task["status"] != "done" else 1,
                    -task["priority"],
                    task["due_date"] or datetime.max.replace(tzinfo=UTC),
                    task["updated_at"],
                ),
            )
        return []
```

- [ ] **Step 2: Add backend tests for the calendar endpoint**

Add these tests to `backend/tests/test_todo_routes.py`.

```python
def _task_row(
    *,
    user_id: int = 7,
    title: str = "Task",
    status: str = "todo",
    priority: int = 0,
    start_date: datetime | None = None,
    due_date: datetime | None = None,
    is_deleted: bool = False,
) -> dict[str, Any]:
    now = datetime(2026, 4, 16, tzinfo=UTC)
    return {
        "id": uuid4(),
        "user_id": user_id,
        "title": title,
        "content": None,
        "status": status,
        "priority": priority,
        "target_duration": 0,
        "current_cycle_count": 0,
        "target_cycle_count": 0,
        "cycle_period": "daily",
        "cycle_every_days": None,
        "event": "",
        "event_ids": [],
        "task_type": "focus",
        "tags": [],
        "actual_duration": 0,
        "start_date": start_date,
        "due_date": due_date,
        "is_deleted": is_deleted,
        "created_at": now,
        "updated_at": now,
    }


def test_list_calendar_tasks_includes_single_day_and_overlapping_tasks(monkeypatch) -> None:
    conn = _FakeTodoConn()
    conn.tasks = [
        _task_row(title="Start only", start_date=datetime(2026, 4, 16, 8, tzinfo=UTC)),
        _task_row(title="Due only", due_date=datetime(2026, 4, 17, 18, tzinfo=UTC)),
        _task_row(
            title="Multi day",
            start_date=datetime(2026, 4, 15, 9, tzinfo=UTC),
            due_date=datetime(2026, 4, 20, 18, tzinfo=UTC),
        ),
        _task_row(title="Outside", due_date=datetime(2026, 5, 1, 18, tzinfo=UTC)),
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/tasks/calendar?start=2026-04-16&end=2026-04-30")

    assert resp.status_code == 200
    titles = [task["title"] for task in resp.json()]
    assert titles == ["Start only", "Due only", "Multi day"]


def test_list_calendar_tasks_excludes_deleted_and_other_users(monkeypatch) -> None:
    conn = _FakeTodoConn()
    conn.tasks = [
        _task_row(title="Mine", due_date=datetime(2026, 4, 17, 18, tzinfo=UTC)),
        _task_row(user_id=8, title="Other user", due_date=datetime(2026, 4, 17, 18, tzinfo=UTC)),
        _task_row(title="Deleted", due_date=datetime(2026, 4, 17, 18, tzinfo=UTC), is_deleted=True),
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/tasks/calendar?start=2026-04-16&end=2026-04-30")

    assert resp.status_code == 200
    assert [task["title"] for task in resp.json()] == ["Mine"]
```

- [ ] **Step 3: Run backend tests and verify they fail**

Run:

```bash
cd backend
uv run pytest tests/test_todo_routes.py -q
```

Expected: fail with `404` or validation errors because `/todo/tasks/calendar` does not exist yet.

- [ ] **Step 4: Add the calendar route before `/tasks/{task_id}`**

Add this function to `backend/routes/todo_routes.py` immediately after `list_tasks` and before `get_task`.

```python
@router.get("/tasks/calendar", response_model=list[TaskOut])
async def list_calendar_tasks(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    start: date = Query(...),
    end: date = Query(...),
) -> list[TaskOut]:
    """List tasks that overlap a calendar date range."""
    if end <= start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="end must be after start")

    range_start = datetime.combine(start, datetime.min.time(), tzinfo=UTC)
    range_end = datetime.combine(end, datetime.min.time(), tzinfo=UTC)

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            -- calendar range endpoint
            SELECT id, user_id, title, content, status, priority, target_duration,
                   current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids, task_type, tags,
                   actual_duration, start_date, due_date, is_deleted, created_at, updated_at
            FROM tasks
            WHERE user_id = $1
              AND is_deleted = FALSE
              AND (
                (start_date IS NOT NULL AND due_date IS NOT NULL AND start_date < $3 AND due_date >= $2)
                OR (start_date IS NOT NULL AND due_date IS NULL AND start_date >= $2 AND start_date < $3)
                OR (start_date IS NULL AND due_date IS NOT NULL AND due_date >= $2 AND due_date < $3)
              )
            ORDER BY
              CASE WHEN status = 'done' THEN 1 ELSE 0 END ASC,
              priority DESC,
              due_date ASC NULLS LAST,
              updated_at ASC
            LIMIT 500
            """,
            int(user.id),
            range_start,
            range_end,
        )
    return [_row_to_task(r) for r in rows]
```

Also update the import at the top of `backend/routes/todo_routes.py`:

```python
from datetime import date, datetime, timedelta, timezone
```

- [ ] **Step 5: Run backend tests and verify they pass**

Run:

```bash
cd backend
uv run pytest tests/test_todo_routes.py -q
```

Expected: all tests in `test_todo_routes.py` pass.

- [ ] **Step 6: Commit backend endpoint**

Run:

```bash
git add backend/routes/todo_routes.py backend/tests/test_todo_routes.py
git commit -m "feat(backend): add calendar task range endpoint"
```

---

### Task 2: Calendar Utility Layer

**Files:**
- Create: `frontend/src/components/calendarUtils.ts`
- Create: `frontend/src/components/__tests__/calendarUtils.test.ts`

- [ ] **Step 1: Write utility tests**

Create `frontend/src/components/__tests__/calendarUtils.test.ts`.

```ts
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
        baseTask({ id: 'start', title: 'Start', start_date: '2026-04-16T09:00:00Z' }),
        baseTask({ id: 'due', title: 'Due', due_date: '2026-04-17T18:00:00Z' }),
        baseTask({
          id: 'range',
          title: 'Range',
          start_date: '2026-04-15T09:00:00Z',
          due_date: '2026-04-18T18:00:00Z',
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
        baseTask({ id: 'done', status: 'done', priority: 3, due_date: '2026-04-16T18:00:00Z' }),
        baseTask({ id: 'low', priority: 0, due_date: '2026-04-16T18:00:00Z' }),
        baseTask({ id: 'high', priority: 3, due_date: '2026-04-16T18:00:00Z' }),
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
```

- [ ] **Step 2: Run utility tests and verify they fail**

Run:

```bash
cd frontend
pnpm test -- calendarUtils.test.ts
```

Expected: fail because `calendarUtils.ts` does not exist.

- [ ] **Step 3: Implement calendar utilities**

Create `frontend/src/components/calendarUtils.ts`.

```ts
export type WeekCount = 2 | 3;

export type CalendarTask = {
  id: string;
  title: string;
  status: 'todo' | 'done';
  priority: number;
  start_date: string | null;
  due_date: string | null;
  updated_at: string;
  task_type?: 'focus' | 'checkin';
  event?: string;
  tags?: string[];
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
```

- [ ] **Step 4: Run utility tests and verify they pass**

Run:

```bash
cd frontend
pnpm test -- calendarUtils.test.ts
```

Expected: all tests in `calendarUtils.test.ts` pass.

- [ ] **Step 5: Commit utility layer**

Run:

```bash
git add frontend/src/components/calendarUtils.ts frontend/src/components/__tests__/calendarUtils.test.ts
git commit -m "feat(frontend): add multi-week calendar utilities"
```

---

### Task 3: Multi-week Calendar Components

**Files:**
- Create: `frontend/src/components/MultiWeekCalendarModal.tsx`
- Create: `frontend/src/components/MultiWeekCalendarGrid.tsx`
- Create: `frontend/src/components/CalendarDayCell.tsx`
- Create: `frontend/src/components/CalendarDateDrawer.tsx`
- Create: `frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx`

- [ ] **Step 1: Write modal integration tests**

Create `frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx`.

```tsx
import { render, screen, waitFor } from '@testing-library/react';
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
  created_at: '2026-04-16T00:00:00Z',
  updated_at: patch.updated_at ?? '2026-04-16T00:00:00Z',
});

describe('MultiWeekCalendarModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockApiJson.mockResolvedValue([
      task({ id: 'focus', title: '准备工作汇报', start_date: '2026-04-16T09:00:00Z', priority: 3 }),
      task({ id: 'read', title: '睡前阅读', due_date: '2026-04-16T21:00:00Z', priority: 1 }),
      task({ id: 'overflow-1', title: '任务三', due_date: '2026-04-16T21:00:00Z' }),
      task({ id: 'overflow-2', title: '任务四', due_date: '2026-04-16T21:00:00Z' }),
      task({ id: 'overflow-3', title: '任务五', due_date: '2026-04-16T21:00:00Z' }),
    ]);
  });

  it('renders a two-week calendar by default and loads tasks for the visible range', async () => {
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    expect(await screen.findByRole('dialog', { name: '多周任务日历' })).toBeInTheDocument();
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

  it('shows overflow and opens the date drawer from a busy day', async () => {
    const user = userEvent.setup();
    render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

    await screen.findByText('准备工作汇报');
    await user.click(screen.getByRole('button', { name: '2026-04-16 还有 1 项任务，打开详情' }));

    expect(screen.getByRole('complementary', { name: '2026-04-16 日期详情' })).toBeInTheDocument();
    expect(screen.getByText('任务五')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run modal tests and verify they fail**

Run:

```bash
cd frontend
pnpm test -- MultiWeekCalendarModal.test.tsx
```

Expected: fail because the modal component does not exist.

- [ ] **Step 3: Create `CalendarDayCell.tsx`**

Create a focused day-cell component.

```tsx
import React from 'react';
import { CalendarTask, toDayKey } from './calendarUtils';

const TASK_COLORS = ['sky', 'mint', 'lavender', 'pink', 'green', 'yellow', 'violet'] as const;

function taskColor(task: CalendarTask): string {
  const source = task.tags?.[0] || task.task_type || task.id;
  const code = Array.from(source).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return TASK_COLORS[code % TASK_COLORS.length];
}

type CalendarDayCellProps = {
  day: Date;
  tasks: CalendarTask[];
  todayKey: string;
  onDateClick: (day: Date) => void;
  onTaskClick?: (task: CalendarTask) => void;
};

const CalendarDayCell: React.FC<CalendarDayCellProps> = ({ day, tasks, todayKey, onDateClick, onTaskClick }) => {
  const key = toDayKey(day);
  const visibleTasks = tasks.slice(0, 4);
  const overflow = Math.max(0, tasks.length - visibleTasks.length);
  const isToday = key === todayKey;

  return (
    <button
      type="button"
      data-testid="calendar-day-cell"
      onClick={() => onDateClick(day)}
      className={`relative min-h-[236px] min-w-0 overflow-hidden border-r border-b border-white/[0.08] bg-white/[0.018] p-3 text-left transition-colors hover:bg-white/[0.04] ${
        isToday ? 'bg-cyan-300/[0.08]' : ''
      }`}
      aria-label={`${key}${isToday ? ' 今天' : ''}，${tasks.length} 项任务`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent" />
      <div className="relative z-10 mb-3 flex min-h-8 items-center justify-between gap-2 text-white/80">
        <span
          className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${
            isToday ? 'bg-cyan-300 text-slate-950 shadow-[0_0_0_4px_rgba(103,232,249,0.10)]' : ''
          }`}
        >
          {day.getDate()}
        </span>
        <span className="text-xs font-semibold text-white/35">{tasks.length} 项</span>
      </div>
      <div className="relative z-10 flex flex-col gap-1.5">
        {visibleTasks.map((task) => (
          <span
            key={task.id}
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onTaskClick?.(task);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onTaskClick?.(task);
              }
            }}
            className={`calendar-task-label calendar-task-${taskColor(task)}`}
          >
            <span className="calendar-task-dot" />
            <span className="truncate">{task.title}</span>
          </span>
        ))}
        {overflow > 0 ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onDateClick(day);
            }}
            className="flex h-7 items-center rounded-[10px] border border-dashed border-white/15 bg-white/[0.025] px-2 text-xs text-white/60"
            aria-label={`${key} 还有 ${overflow} 项任务，打开详情`}
          >
            +{overflow} 项折叠
          </span>
        ) : null}
      </div>
      {tasks.length > 0 ? (
        <span
          className={`absolute inset-x-0 bottom-0 h-0.5 ${
            tasks.length > 4
              ? 'bg-gradient-to-r from-rose-400/50 to-amber-300/50'
              : 'bg-gradient-to-r from-cyan-300/40 to-emerald-300/40'
          }`}
        />
      ) : null}
    </button>
  );
};

export default CalendarDayCell;
```

- [ ] **Step 4: Create `CalendarDateDrawer.tsx`**

```tsx
import React from 'react';
import { CalendarTask, toDayKey } from './calendarUtils';

type CalendarDateDrawerProps = {
  date: Date | null;
  tasks: CalendarTask[];
  onClose: () => void;
};

const CalendarDateDrawer: React.FC<CalendarDateDrawerProps> = ({ date, tasks, onClose }) => {
  if (!date) return null;
  const key = toDayKey(date);
  const activeTasks = tasks.filter((task) => task.status !== 'done');
  const completedTasks = tasks.filter((task) => task.status === 'done');

  return (
    <aside
      role="complementary"
      aria-label={`${key} 日期详情`}
      className="w-[320px] shrink-0 border-l border-white/10 bg-black/20 p-4 backdrop-blur-xl"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Day Detail</div>
          <h3 className="text-lg font-bold text-white">{key}</h3>
        </div>
        <button type="button" onClick={onClose} className="rounded-full bg-white/5 px-3 py-1 text-white/70 hover:bg-white/10">
          关闭
        </button>
      </div>
      <button type="button" className="mb-4 w-full rounded-xl border border-cyan-200/20 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/15">
        + 创建这一天的任务
      </button>
      <section className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-widest text-white/40">待办 ({activeTasks.length})</h4>
        {activeTasks.length ? activeTasks.map((task) => (
          <div key={task.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/85">
            {task.title}
          </div>
        )) : <div className="text-sm text-white/35">这一天暂无待办</div>}
      </section>
      {completedTasks.length ? (
        <section className="mt-5 space-y-2 opacity-70">
          <h4 className="text-xs font-bold uppercase tracking-widest text-white/40">已完成 ({completedTasks.length})</h4>
          {completedTasks.map((task) => (
            <div key={task.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm text-white/70">
              {task.title}
            </div>
          ))}
        </section>
      ) : null}
    </aside>
  );
};

export default CalendarDateDrawer;
```

- [ ] **Step 5: Create `MultiWeekCalendarGrid.tsx`**

```tsx
import React from 'react';
import CalendarDayCell from './CalendarDayCell';
import { CalendarTask, toDayKey } from './calendarUtils';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type MultiWeekCalendarGridProps = {
  days: Date[];
  groupedTasks: Record<string, CalendarTask[]>;
  todayKey: string;
  onDateClick: (day: Date) => void;
  onTaskClick?: (task: CalendarTask) => void;
};

const MultiWeekCalendarGrid: React.FC<MultiWeekCalendarGridProps> = ({
  days,
  groupedTasks,
  todayKey,
  onDateClick,
  onTaskClick,
}) => (
  <div className="min-w-[1080px]">
    <div className="grid h-12 grid-cols-7 border-b border-white/10 bg-white/[0.02]">
      {WEEKDAYS.map((weekday) => (
        <div key={weekday} className="grid place-items-center text-sm font-bold text-white/55">
          {weekday}
        </div>
      ))}
    </div>
    <div className="grid grid-cols-7">
      {days.map((day) => {
        const key = toDayKey(day);
        return (
          <CalendarDayCell
            key={key}
            day={day}
            tasks={groupedTasks[key] || []}
            todayKey={todayKey}
            onDateClick={onDateClick}
            onTaskClick={onTaskClick}
          />
        );
      })}
    </div>
  </div>
);

export default MultiWeekCalendarGrid;
```

- [ ] **Step 6: Create `MultiWeekCalendarModal.tsx`**

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/api';
import CalendarDateDrawer from './CalendarDateDrawer';
import MultiWeekCalendarGrid from './MultiWeekCalendarGrid';
import {
  addDays,
  buildVisibleDays,
  CalendarTask,
  formatRangeParam,
  getStoredWeekCount,
  groupTasksByDay,
  setStoredWeekCount,
  toDayKey,
  WeekCount,
} from './calendarUtils';

type MultiWeekCalendarModalProps = {
  open: boolean;
  onClose: () => void;
  initialDate?: Date;
};

const MultiWeekCalendarModal: React.FC<MultiWeekCalendarModalProps> = ({ open, onClose, initialDate }) => {
  const [anchorDate, setAnchorDate] = useState(() => initialDate || new Date());
  const [weekCount, setWeekCount] = useState<WeekCount>(() => getStoredWeekCount());
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const visibleDays = useMemo(() => buildVisibleDays(anchorDate, weekCount), [anchorDate, weekCount]);
  const groupedTasks = useMemo(() => groupTasksByDay(tasks, visibleDays), [tasks, visibleDays]);
  const todayKey = toDayKey(new Date());
  const selectedTasks = selectedDate ? groupedTasks[toDayKey(selectedDate)] || [] : [];

  useEffect(() => {
    if (!open) return;
    const start = visibleDays[0];
    const end = addDays(visibleDays[visibleDays.length - 1], 1);
    setLoading(true);
    setError(null);
    apiJson<CalendarTask[]>(`/todo/tasks/calendar?start=${formatRangeParam(start)}&end=${formatRangeParam(end)}`)
      .then(setTasks)
      .catch((err) => {
        console.error('Failed to load calendar tasks', err);
        setError(err instanceof Error ? err.message : '加载日历任务失败');
        setTasks([]);
      })
      .finally(() => setLoading(false));
  }, [open, visibleDays]);

  if (!open) return null;

  const monthLabel = `${anchorDate.getMonth() + 1} 月`;

  function updateWeekCount(next: WeekCount) {
    setWeekCount(next);
    setStoredWeekCount(next);
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" role="dialog" aria-label="多周任务日历">
      <div className="flex h-[86vh] w-[92vw] max-w-[1500px] overflow-hidden rounded-[2rem] border border-white/15 bg-slate-950/75 text-white shadow-2xl backdrop-blur-2xl">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-20 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-6">
            <div className="flex items-center gap-3 text-2xl font-black tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/20 bg-white/[0.06] text-sm">▦</span>
              <span>{monthLabel}</span>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/[0.06] text-xl hover:bg-white/[0.1]">+</button>
              <div className="flex h-10 overflow-hidden rounded-xl border border-white/20 bg-white/[0.06]">
                <button type="button" aria-pressed={weekCount === 2} aria-label="显示 2 周" onClick={() => updateWeekCount(2)} className={`px-4 text-sm font-bold ${weekCount === 2 ? 'bg-cyan-300/20 text-cyan-50' : 'text-white/60'}`}>2 周</button>
                <button type="button" aria-pressed={weekCount === 3} aria-label="显示 3 周" onClick={() => updateWeekCount(3)} className={`px-4 text-sm font-bold ${weekCount === 3 ? 'bg-cyan-300/20 text-cyan-50' : 'text-white/60'}`}>3 周</button>
              </div>
              <div className="flex h-10 overflow-hidden rounded-xl border border-white/20 bg-white/[0.06]">
                <button type="button" aria-label="上一段日期" onClick={() => setAnchorDate((date) => addDays(date, -weekCount * 7))} className="px-4 text-xl text-white/80">‹</button>
                <button type="button" onClick={() => setAnchorDate(new Date())} className="border-x border-white/10 px-4 text-sm font-bold">今天</button>
                <button type="button" aria-label="下一段日期" onClick={() => setAnchorDate((date) => addDays(date, weekCount * 7))} className="px-4 text-xl text-white/80">›</button>
              </div>
              <button type="button" onClick={onClose} className="rounded-xl border border-white/20 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/75 hover:bg-white/[0.1]">关闭</button>
            </div>
          </header>
          {error ? <div className="border-b border-red-300/20 bg-red-400/10 px-6 py-2 text-sm text-red-100">{error}</div> : null}
          {loading ? <div className="border-b border-white/10 px-6 py-2 text-sm text-white/45">加载中...</div> : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <MultiWeekCalendarGrid
              days={visibleDays}
              groupedTasks={groupedTasks}
              todayKey={todayKey}
              onDateClick={setSelectedDate}
            />
          </div>
        </div>
        <CalendarDateDrawer date={selectedDate} tasks={selectedTasks} onClose={() => setSelectedDate(null)} />
      </div>
    </div>
  );
};

export default MultiWeekCalendarModal;
```

- [ ] **Step 7: Add task-label CSS utilities to `frontend/src/index.css`**

Append these classes so Tailwind does not need dynamic color generation.

```css
.calendar-task-label {
  --task-rgb: 96, 165, 250;
  position: relative;
  display: flex;
  height: 31px;
  align-items: center;
  gap: 0.5rem;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(var(--task-rgb), 0.25);
  background:
    linear-gradient(135deg, rgba(var(--task-rgb), 0.13), rgba(var(--task-rgb), 0.035)),
    rgba(255, 255, 255, 0.018);
  padding: 0 0.625rem;
  color: rgba(248, 250, 252, 0.88);
  font-size: 0.875rem;
  line-height: 1;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 0 16px rgba(var(--task-rgb), 0.045),
    0 8px 18px rgba(0, 0, 0, 0.08);
}

.calendar-task-label::before {
  content: "";
  position: absolute;
  bottom: 7px;
  left: 0;
  top: 7px;
  width: 2px;
  border-radius: 999px;
  background: rgba(var(--task-rgb), 0.72);
  box-shadow: 0 0 12px rgba(var(--task-rgb), 0.55);
}

.calendar-task-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 999px;
  background: rgb(var(--task-rgb));
  box-shadow: 0 0 12px rgba(var(--task-rgb), 0.65);
}

.calendar-task-pink { --task-rgb: 251, 113, 133; }
.calendar-task-mint { --task-rgb: 45, 212, 191; }
.calendar-task-sky { --task-rgb: 56, 189, 248; }
.calendar-task-green { --task-rgb: 52, 211, 153; }
.calendar-task-violet { --task-rgb: 192, 132, 252; }
.calendar-task-yellow { --task-rgb: 251, 191, 36; }
.calendar-task-lavender { --task-rgb: 129, 140, 248; }
```

- [ ] **Step 8: Run modal tests and verify they pass**

Run:

```bash
cd frontend
pnpm test -- MultiWeekCalendarModal.test.tsx calendarUtils.test.ts
```

Expected: all calendar frontend tests pass.

- [ ] **Step 9: Commit calendar components**

Run:

```bash
git add frontend/src/components/MultiWeekCalendarModal.tsx frontend/src/components/MultiWeekCalendarGrid.tsx frontend/src/components/CalendarDayCell.tsx frontend/src/components/CalendarDateDrawer.tsx frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx frontend/src/index.css
git commit -m "feat(frontend): add multi-week calendar modal"
```

---

### Task 4: Integrate Calendar Entry Points

**Files:**
- Modify: `frontend/src/components/CalendarWidget.tsx`
- Modify: `frontend/src/components/Navigation.tsx`
- Modify: `frontend/src/setupTests.ts`
- Add or modify: `frontend/src/components/__tests__/CalendarWidget.test.tsx`

- [ ] **Step 1: Write entry-point test**

Create `frontend/src/components/__tests__/CalendarWidget.test.tsx`.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CalendarWidget from '../CalendarWidget';
import { getCheckInStatus } from '../../lib/api';

const mockGetCheckInStatus = vi.mocked(getCheckInStatus);

describe('CalendarWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCheckInStatus.mockResolvedValue({
      is_checked_in_today: true,
      current_streak: 3,
      total_days: 8,
      checked_dates: ['2026-04-16'],
    });
  });

  it('opens the multi-week calendar when clicked', async () => {
    const user = userEvent.setup();

    render(<CalendarWidget />);

    await user.click(await screen.findByRole('button', { name: '打开多周任务日历' }));

    expect(await screen.findByRole('dialog', { name: '多周任务日历' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run entry-point test and verify it fails**

Run:

```bash
cd frontend
pnpm test -- CalendarWidget.test.tsx
```

Expected: fail because the compact widget does not open the new modal yet.

- [ ] **Step 3: Update `CalendarWidget.tsx`**

Add local modal state, wrap the current compact calendar in a button, and render `MultiWeekCalendarModal`.

```tsx
import React, { useState, useEffect } from 'react';
import { getCheckInStatus } from '../lib/api';
import MultiWeekCalendarModal from './MultiWeekCalendarModal';
```

Inside the component:

```tsx
const [showMultiWeekCalendar, setShowMultiWeekCalendar] = useState(false);
```

Change the root calendar wrapper to:

```tsx
<>
  <button
    type="button"
    aria-label="打开多周任务日历"
    onClick={() => setShowMultiWeekCalendar(true)}
    className={`bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 p-3 flex flex-col text-left hover:bg-white/[0.14] transition-colors ${className}`}
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-white/85 text-sm font-semibold">日历</span>
      <span className="text-white/60 text-xs">{monthLabel}</span>
    </div>
    <div className="grid grid-cols-7 gap-1 text-[10px] text-white/45 mb-1">
      {weekdays.map((day) => (
        <div key={day} className="h-5 flex items-center justify-center">
          {day}
        </div>
      ))}
    </div>
    <div className="grid grid-cols-7 gap-1 flex-1">
      {cells.map((cell, idx) => {
        let dateStr = '';
        if (cell.inCurrentMonth) {
          dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
        }
        const isChecked = cell.inCurrentMonth && checkedDates.has(dateStr);

        return (
          <div
            key={`${cell.day}-${idx}`}
            className={`h-6 rounded flex items-center justify-center text-[11px] relative ${
              cell.isToday
                ? 'bg-[#B5D2E8]/90 text-black/80 font-bold shadow-sm'
                : cell.inCurrentMonth
                  ? isChecked
                    ? 'bg-[#E5989B]/90 text-white font-bold shadow-sm'
                    : 'text-white/80 bg-white/[0.03]'
                  : 'text-white/25'
            }`}
          >
            {cell.day}
            {isChecked && (
              <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center ${cell.isToday ? 'bg-blue-500 shadow-sm border border-[#1a1a1a]' : 'bg-transparent'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke={cell.isToday ? 'white' : '#3b82f6'} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </button>
  <MultiWeekCalendarModal open={showMultiWeekCalendar} onClose={() => setShowMultiWeekCalendar(false)} />
</>
```

Keep the existing check-in date rendering unchanged inside the button.

- [ ] **Step 4: Update `frontend/src/setupTests.ts` with check-in API mocks**

Extend the existing `vi.mock('./lib/api', ...)` return value so tests importing `getCheckInStatus` continue to work.

```ts
vi.mock('./lib/api', () => ({
  apiJson: vi.fn().mockImplementation(async (url) => {
    if (url === '/api/arxiv/daily/config') return null;
    if (url === '/api/arxiv/daily/candidates') return [];
    if (url === '/api/arxiv/papers?limit=200') return [];
    if (typeof url === 'string' && url.startsWith('/todo/tasks/calendar')) return [];
    return [];
  }),
  checkIn: vi.fn().mockResolvedValue(undefined),
  getCheckInStatus: vi.fn().mockResolvedValue({
    is_checked_in_today: true,
    current_streak: 1,
    total_days: 1,
    checked_dates: [],
  }),
}));
```

- [ ] **Step 5: Update `Navigation.tsx` to use the shared multi-week calendar modal**

Keep `showCalendarModal` as the navigation icon trigger state:

```tsx
const [showCalendarModal, setShowCalendarModal] = useState(false);
```

Keep this state, but replace the old overlay body:

```tsx
{showCalendarModal && (
  <MultiWeekCalendarModal open={showCalendarModal} onClose={() => setShowCalendarModal(false)} />
)}
```

Also replace the `CalendarWidget` import in `Navigation.tsx` with:

```tsx
import MultiWeekCalendarModal from './MultiWeekCalendarModal';
```

- [ ] **Step 6: Run entry-point and modal tests**

Run:

```bash
cd frontend
pnpm test -- CalendarWidget.test.tsx MultiWeekCalendarModal.test.tsx calendarUtils.test.ts
```

Expected: all calendar frontend tests pass.

- [ ] **Step 7: Commit entry-point integration**

Run:

```bash
git add frontend/src/components/CalendarWidget.tsx frontend/src/components/Navigation.tsx frontend/src/setupTests.ts frontend/src/components/__tests__/CalendarWidget.test.tsx
git commit -m "feat(frontend): open multi-week calendar from home"
```

---

### Task 5: Full Verification And Polish

**Files:**
- Review: all changed files

- [ ] **Step 1: Run frontend type checks**

Run:

```bash
cd frontend
pnpm check
```

Expected: TypeScript check passes.

- [ ] **Step 2: Run frontend lint**

Run:

```bash
cd frontend
pnpm lint
```

Expected: ESLint passes or reports only pre-existing unrelated warnings. Any new calendar lint errors must be fixed.

- [ ] **Step 3: Run frontend tests**

Run:

```bash
cd frontend
pnpm test
```

Expected: Vitest suite passes.

- [ ] **Step 4: Run backend tests**

Run:

```bash
cd backend
uv run pytest
```

Expected: pytest suite passes.

- [ ] **Step 5: Run backend lint**

Run:

```bash
cd backend
uv run ruff check .
```

Expected: Ruff passes.

- [ ] **Step 6: Inspect git status and final diff**

Run:

```bash
git status --short
git diff --stat main...HEAD
```

Expected: working tree is clean after commits, and diff only contains calendar-related implementation changes plus the design/plan docs.
