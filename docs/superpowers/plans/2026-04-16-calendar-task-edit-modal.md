# Calendar Task Edit Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse the existing full task edit modal when a user clicks a task inside the multi-week calendar.

**Architecture:** Extract the current edit-task modal logic from the task dashboard into a shared component plus shared task types/helpers, then let the calendar modal open that shared editor for the clicked task. After save or delete, refresh the calendar range so the grid stays in sync with edits.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing `apiJson` data layer

---

### Task 1: Lock in the new behavior with a failing test

**Files:**
- Modify: `frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('opens the full edit modal when a calendar task is clicked', async () => {
  const user = userEvent.setup();
  render(<MultiWeekCalendarModal open onClose={() => {}} initialDate={new Date('2026-04-16T12:00:00Z')} />);

  await user.click(await screen.findByText('准备工作汇报'));

  expect(screen.getByRole('heading', { name: '编辑任务' })).toBeInTheDocument();
  expect(screen.getByDisplayValue('准备工作汇报')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx -t "opens the full edit modal when a calendar task is clicked"`
Expected: FAIL because the calendar does not yet render the shared edit modal.

### Task 2: Extract the reusable task editor

**Files:**
- Create: `frontend/src/components/TaskEditModal.tsx`
- Create: `frontend/src/components/taskTypes.ts`
- Modify: `frontend/src/components/PlaceholderCard.tsx`

- [ ] **Step 1: Define shared task types**

```ts
export interface Task {
  id: string;
  user_id: number;
  title: string;
  content: string | null;
  status: 'todo' | 'done';
  priority: number;
  target_duration: number;
  current_cycle_count: number;
  target_cycle_count: number;
  cycle_period: 'daily' | 'weekly' | 'monthly' | 'custom';
  cycle_every_days: number | null;
  event: string;
  event_ids: string[];
  task_type: 'focus' | 'checkin';
  tags: string[];
  actual_duration: number;
  start_date: string | null;
  due_date: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Move the edit modal UI and submit/delete logic into `TaskEditModal`**

```tsx
<TaskEditModal
  open={showEditTaskModal}
  task={selectedTask}
  onClose={() => setShowEditTaskModal(false)}
  onSaved={async () => {
    await _loadTasks();
    window.dispatchEvent(new CustomEvent('ark:reload-focus'));
  }}
/>
```

- [ ] **Step 3: Keep `PlaceholderCard` behavior unchanged**

Run: `pnpm test frontend/src/components/__tests__/CalendarWidget.test.tsx`
Expected: PASS with no task-dashboard regression caused by the extraction.

### Task 3: Connect the calendar to the shared editor

**Files:**
- Modify: `frontend/src/components/MultiWeekCalendarModal.tsx`
- Modify: `frontend/src/components/calendarUtils.ts`

- [ ] **Step 1: Let the calendar task type carry the full task payload**

```ts
import type { Task } from './taskTypes';

export type CalendarTask = Task;
```

- [ ] **Step 2: Open the shared edit modal from task clicks and refresh after save/delete**

```tsx
const [editingTask, setEditingTask] = useState<CalendarTask | null>(null);

<MultiWeekCalendarGrid
  days={visibleDays}
  groupedTasks={groupedTasks}
  todayKey={todayKey}
  onDateClick={setSelectedDate}
  onTaskClick={setEditingTask}
/>

<TaskEditModal
  open={Boolean(editingTask)}
  task={editingTask}
  onClose={() => setEditingTask(null)}
  onSaved={async () => {
    setEditingTask(null);
    await loadVisibleTasks();
  }}
/>
```

- [ ] **Step 3: Run the calendar tests**

Run: `pnpm test frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx`
Expected: PASS, including the new task-click test.
