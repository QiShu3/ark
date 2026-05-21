# Event Arrangements Direct Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing-event arrangement page so `安排内容` directly creates, edits, and deletes real event-linked tasks and schedules.

**Architecture:** Keep the backend workbench read response as the event aggregation source, using `created_tasks` and `created_appointments`. Remove the created-event page's use of `plan_draft`, event-template loading, template apply, save-as-template, source-template update, and generate-final-arrangements behavior. Add a small frontend API helper module for event arrangement mutations so the component stays focused on rendering and state transitions.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, existing FastAPI task and appointment endpoints.

---

### Task 1: Write Failing Direct-Management Tests

**Files:**
- Modify: `frontend/src/components/__tests__/EventWorkbenchModal.test.tsx`

- [ ] **Step 1: Update test imports**

Change the imports at the top of `frontend/src/components/__tests__/EventWorkbenchModal.test.tsx` to include real task and appointment types:

```ts
import type { EventItem } from '../../lib/events/types';
import type { Appointment, Task } from '../taskTypes';
```

- [ ] **Step 2: Add shared test fixtures below the `event` fixture**

Add these fixtures after the `event` constant:

```ts
const eventTask: Task = {
  id: 'task-1',
  user_id: 7,
  title: '完成第一轮复习',
  content: '覆盖全部章节',
  status: 'todo',
  priority: 0,
  target_duration: 0,
  current_cycle_count: 0,
  target_cycle_count: 0,
  cycle_period: 'daily',
  cycle_every_days: null,
  event: '高数期末',
  event_ids: [],
  event_id: 'event-1',
  is_recurring: false,
  period_type: 'once',
  custom_period_days: null,
  max_completions_per_period: 1,
  weekday_only: false,
  time_inherits_from_event: false,
  time_overridden: true,
  manually_scheduled_for_today: false,
  task_type: 'focus',
  tags: [],
  actual_duration: 0,
  start_date: null,
  due_date: '2026-06-06T09:00:00Z',
  is_deleted: false,
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
};

const eventAppointment: Appointment = {
  id: 'appointment-1',
  user_id: 7,
  title: '模拟考试',
  content: null,
  status: 'pending',
  starts_at: null,
  ends_at: '2026-06-13T09:00:00Z',
  repeat_rule: null,
  linked_task_id: null,
  event_id: 'event-1',
  is_recurring: false,
  period_type: 'once',
  custom_period_days: null,
  max_completions_per_period: 1,
  weekday_only: false,
  time_inherits_from_event: false,
  time_overridden: true,
  is_deleted: false,
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
};

const emptyAchievementSummary = {
  active_event: event,
  event_achievements: null,
  global_achievements: {
    title: '全局成就',
    summary_text: '始终显示的长期累计进度',
    stats: {
      unlocked_count: 0,
      in_progress_count: 0,
      primary_metric_value: 0,
      primary_metric_label: '总专注秒数',
    },
    latest_unlocked: [],
    upcoming: [],
  },
};
```

- [ ] **Step 3: Replace template and draft tests with direct-management tests**

Delete the tests named:

```ts
it('applies a template and renders generated plan draft sections', async () => {
```

```ts
it('adds task and schedule arrangement content from the created-event arrangement modal', async () => {
```

```ts
it('edits draft items and saves draft changes back to templates', async () => {
```

Then add these tests before the closing `});` of the `describe` block:

```ts
it('renders real event arrangements without template or generate controls', async () => {
  (apiJson as Mock).mockImplementation(async (url: string) => {
    if (url === '/todo/events/event-1/workbench') {
      return {
        event,
        plan_draft: {
          id: 'legacy-draft',
          event_id: 'event-1',
          user_id: 7,
          source_template_id: 'template-1',
          created_at: '2026-05-18T00:00:00Z',
          updated_at: '2026-05-18T00:00:00Z',
          items: [],
        },
        created_tasks: [eventTask],
        created_appointments: [eventAppointment],
      };
    }
    if (url === '/todo/achievements/summary?event_id=event-1') return emptyAchievementSummary;
    return {};
  });

  render(<EventWorkbenchModal event={event} onClose={vi.fn()} />);

  expect(await screen.findByText('安排内容')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '完成第一轮复习' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '模拟考试' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '添加任务' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '添加日程' })).toBeInTheDocument();
  expect(screen.queryByText('选择事件模板')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '套用模板' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '模板工作台' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '另存为事件模板' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '回写源模板' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '生成正式安排' })).not.toBeInTheDocument();
  expect(screen.queryByText('已创建安排')).not.toBeInTheDocument();

  await waitFor(() => {
    expect(apiJson).not.toHaveBeenCalledWith('/todo/event-plan-templates');
  });
});

it('creates real task and schedule arrangements from the arrangement page', async () => {
  const user = userEvent.setup();
  const tasks: Task[] = [];
  const appointments: Appointment[] = [];

  (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
    if (url === '/todo/events/event-1/workbench') {
      return {
        event,
        plan_draft: null,
        created_tasks: tasks,
        created_appointments: appointments,
      };
    }
    if (url === '/todo/achievements/summary?event_id=event-1') return emptyAchievementSummary;
    if (url === '/todo/tasks' && options?.method === 'POST') {
      const payload = JSON.parse(options.body || '{}');
      expect(payload).toMatchObject({
        title: '精修错题',
        content: '错题本',
        event: '高数期末',
        event_id: 'event-1',
        period_type: 'once',
        task_type: 'focus',
      });
      const createdTask = {
        ...eventTask,
        id: 'task-created',
        title: payload.title,
        content: payload.content,
        due_date: payload.due_date,
      };
      tasks.push(createdTask);
      return createdTask;
    }
    if (url === '/todo/appointments' && options?.method === 'POST') {
      const payload = JSON.parse(options.body || '{}');
      expect(payload).toMatchObject({
        title: '模拟考试',
        content: null,
        event_id: 'event-1',
        period_type: 'once',
        status: 'pending',
      });
      const createdAppointment = {
        ...eventAppointment,
        id: 'appointment-created',
        title: payload.title,
        content: payload.content,
        ends_at: payload.ends_at,
      };
      appointments.push(createdAppointment);
      return createdAppointment;
    }
    return {};
  });

  render(<EventWorkbenchModal event={event} onClose={vi.fn()} />);

  expect(await screen.findByText('安排内容')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '添加任务' }));
  await user.type(screen.getByLabelText('任务标题'), '精修错题');
  await user.type(screen.getByLabelText('任务备注'), '错题本');
  await user.type(screen.getByLabelText('任务时间'), '2026-06-07T10:30');
  await user.click(screen.getByRole('button', { name: '保存任务' }));

  await user.click(screen.getByRole('button', { name: '添加日程' }));
  await user.type(screen.getByLabelText('日程标题'), '模拟考试');
  await user.type(screen.getByLabelText('日程时间'), '2026-06-13T09:00');
  await user.click(screen.getByRole('button', { name: '保存日程' }));

  expect(screen.getByRole('button', { name: '精修错题' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '模拟考试' })).toBeInTheDocument();
  expect(apiJson).toHaveBeenCalledWith('/todo/tasks', expect.objectContaining({ method: 'POST' }));
  expect(apiJson).toHaveBeenCalledWith('/todo/appointments', expect.objectContaining({ method: 'POST' }));
  expect(apiJson).not.toHaveBeenCalledWith(
    '/todo/events/event-1/plan-draft/items',
    expect.anything(),
  );
});

it('edits and deletes real event arrangements', async () => {
  const user = userEvent.setup();
  const tasks: Task[] = [{ ...eventTask }];
  const appointments: Appointment[] = [{ ...eventAppointment }];

  (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
    if (url === '/todo/events/event-1/workbench') {
      return {
        event,
        plan_draft: null,
        created_tasks: tasks,
        created_appointments: appointments,
      };
    }
    if (url === '/todo/achievements/summary?event_id=event-1') return emptyAchievementSummary;
    if (url === '/todo/tasks/task-1' && options?.method === 'PATCH') {
      const expectedDueDate = new Date('2026-06-07T10:30').toISOString();
      expect(JSON.parse(options.body || '{}')).toMatchObject({
        title: '精修错题',
        content: '错题本',
        due_date: expectedDueDate,
        event: '高数期末',
        event_id: 'event-1',
      });
      tasks[0] = {
        ...tasks[0],
        title: '精修错题',
        content: '错题本',
        due_date: expectedDueDate,
      };
      return tasks[0];
    }
    if (url === '/todo/appointments/appointment-1' && options?.method === 'DELETE') {
      appointments.splice(0, appointments.length);
      return { ok: true };
    }
    return {};
  });

  vi.stubGlobal('confirm', vi.fn(() => true));

  render(<EventWorkbenchModal event={event} onClose={vi.fn()} />);

  await user.click(await screen.findByRole('button', { name: '完成第一轮复习' }));
  await user.clear(screen.getByLabelText('任务标题'));
  await user.type(screen.getByLabelText('任务标题'), '精修错题');
  await user.clear(screen.getByLabelText('任务备注'));
  await user.type(screen.getByLabelText('任务备注'), '错题本');
  await user.clear(screen.getByLabelText('任务时间'));
  await user.type(screen.getByLabelText('任务时间'), '2026-06-07T10:30');
  await user.click(screen.getByRole('button', { name: '保存任务' }));

  expect(await screen.findByRole('button', { name: '精修错题' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '模拟考试' }));
  await user.click(screen.getByRole('button', { name: '删除日程' }));

  await waitFor(() => {
    expect(apiJson).toHaveBeenCalledWith('/todo/appointments/appointment-1', { method: 'DELETE' });
  });
  expect(screen.queryByRole('button', { name: '模拟考试' })).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run the test and verify failure**

Run:

```bash
cd frontend && pnpm test -- EventWorkbenchModal.test.tsx
```

Expected: the direct-management tests fail because `EventWorkbenchModal` still renders template controls and still calls `/todo/events/event-1/plan-draft/items`.

### Task 2: Add Event Arrangement API Helpers

**Files:**
- Create: `frontend/src/lib/events/arrangementApi.ts`

- [ ] **Step 1: Create focused API helper module**

Create `frontend/src/lib/events/arrangementApi.ts` with this content:

```ts
import { apiJson } from '../api';
import type { Appointment, Task } from '../../components/taskTypes';
import type { EventItem } from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type EventArrangementInput = {
  title: string;
  content: string | null;
  time: string | null;
};

export function createEventArrangementTask(
  event: EventItem,
  input: EventArrangementInput,
): Promise<Task> {
  return apiJson<Task>('/todo/tasks', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      status: 'todo',
      priority: 0,
      target_duration: 0,
      current_cycle_count: 0,
      target_cycle_count: 0,
      cycle_period: 'daily',
      cycle_every_days: null,
      event: event.name,
      event_ids: [],
      event_id: event.id,
      is_recurring: false,
      period_type: 'once',
      custom_period_days: null,
      max_completions_per_period: 1,
      weekday_only: false,
      time_inherits_from_event: false,
      time_overridden: Boolean(input.time),
      task_type: 'focus',
      tags: [],
      start_date: null,
      due_date: input.time,
    }),
  });
}

export function updateEventArrangementTask(
  event: EventItem,
  taskId: string,
  input: EventArrangementInput,
): Promise<Task> {
  return apiJson<Task>(`/todo/tasks/${taskId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      event: event.name,
      event_id: event.id,
      time_inherits_from_event: false,
      time_overridden: Boolean(input.time),
      due_date: input.time,
    }),
  });
}

export function deleteEventArrangementTask(taskId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/todo/tasks/${taskId}`, { method: 'DELETE' });
}

export function createEventArrangementAppointment(
  event: EventItem,
  input: EventArrangementInput,
): Promise<Appointment> {
  return apiJson<Appointment>('/todo/appointments', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      status: 'pending',
      starts_at: null,
      ends_at: input.time,
      repeat_rule: null,
      linked_task_id: null,
      event_id: event.id,
      is_recurring: false,
      period_type: 'once',
      custom_period_days: null,
      max_completions_per_period: 1,
      weekday_only: false,
      time_inherits_from_event: false,
      time_overridden: true,
    }),
  });
}

export function updateEventArrangementAppointment(
  event: EventItem,
  appointmentId: string,
  input: EventArrangementInput,
): Promise<Appointment> {
  return apiJson<Appointment>(`/todo/appointments/${appointmentId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      starts_at: null,
      ends_at: input.time,
      event_id: event.id,
      time_inherits_from_event: false,
      time_overridden: true,
    }),
  });
}

export function deleteEventArrangementAppointment(appointmentId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/todo/appointments/${appointmentId}`, { method: 'DELETE' });
}
```

- [ ] **Step 2: Run TypeScript check and verify helper compiles**

Run:

```bash
cd frontend && pnpm check
```

Expected: TypeScript passes. If TypeScript reports an error in `frontend/src/lib/events/arrangementApi.ts`, correct that helper before moving to the modal refactor.

### Task 3: Refactor Created-Event Arrangement Modal

**Files:**
- Modify: `frontend/src/components/events/EventWorkbenchModal.tsx`

- [ ] **Step 1: Replace template and draft imports**

In `frontend/src/components/events/EventWorkbenchModal.tsx`, replace the import block from `../../lib/events/api` with:

```ts
import {
  deleteEvent as deleteEventById,
  getEventWorkbench,
  updateEvent,
} from '../../lib/events/api';
import {
  createEventArrangementAppointment,
  createEventArrangementTask,
  deleteEventArrangementAppointment,
  deleteEventArrangementTask,
  updateEventArrangementAppointment,
  updateEventArrangementTask,
} from '../../lib/events/arrangementApi';
```

Replace the type imports with:

```ts
import type { EventItem, EventWorkbench } from '../../lib/events/types';
import type { Appointment, Task } from '../taskTypes';
```

Delete the `EventTemplateManagerModal` import.

- [ ] **Step 2: Add arrangement editor types after `EventEditFormState`**

Add these types after `EventEditFormState`:

```ts
type ArrangementKind = 'task' | 'appointment';

type EditingArrangement =
  | { kind: 'task'; item: Task }
  | { kind: 'appointment'; item: Appointment };
```

- [ ] **Step 3: Replace template and draft state**

In component state, delete these state declarations:

```ts
const [templates, setTemplates] = useState<EventPlanTemplate[]>([]);
const [selectedTemplateId, setSelectedTemplateId] = useState('');
const [showTemplateManager, setShowTemplateManager] = useState(false);
const [editingItem, setEditingItem] = useState<EventPlanDraftItem | null>(null);
const [newDraftKind, setNewDraftKind] = useState<EventPlanDraftItem['kind'] | null>(null);
const [draftTitle, setDraftTitle] = useState('');
const [draftContent, setDraftContent] = useState('');
const [draftTime, setDraftTime] = useState('');
const [showSaveTemplate, setShowSaveTemplate] = useState(false);
const [saveTemplateName, setSaveTemplateName] = useState('');
const [saveTemplateDescription, setSaveTemplateDescription] = useState('');
const [saveTemplateMode, setSaveTemplateMode] = useState<'from_start' | 'before_due'>('before_due');
```

Add these state declarations in their place:

```ts
const [editingArrangement, setEditingArrangement] = useState<EditingArrangement | null>(null);
const [newArrangementKind, setNewArrangementKind] = useState<ArrangementKind | null>(null);
const [arrangementTitle, setArrangementTitle] = useState('');
const [arrangementContent, setArrangementContent] = useState('');
const [arrangementTime, setArrangementTime] = useState('');
```

- [ ] **Step 4: Remove template loading and draft/template handlers**

Delete the `loadTemplates` function, the `useEffect` that calls `loadTemplates`, and these handlers:

```ts
handleGenerate
handleApplyTemplate
beginEditDraftItem
beginAddDraftItem
cancelDraftEditor
handleSaveDraftItem
handleDeleteDraftItem
handleSaveAsTemplate
handleUpdateSourceTemplate
```

- [ ] **Step 5: Add real-arrangement helpers**

Add these helpers before `const currentEvent = workbench?.event ?? event;`:

```ts
function cancelArrangementEditor(): void {
  setEditingArrangement(null);
  setNewArrangementKind(null);
  setArrangementTitle('');
  setArrangementContent('');
  setArrangementTime('');
}

function beginAddArrangement(kind: ArrangementKind): void {
  setEditingArrangement(null);
  setNewArrangementKind(kind);
  setArrangementTitle('');
  setArrangementContent('');
  setArrangementTime('');
  setError(null);
}

function beginEditArrangement(next: EditingArrangement): void {
  setEditingArrangement(next);
  setNewArrangementKind(null);
  setArrangementTitle(next.item.title);
  setArrangementContent(next.item.content ?? '');
  setArrangementTime(toDateTimeLocalValue(next.kind === 'appointment' ? next.item.ends_at : next.item.due_date));
  setError(null);
}

function appendTask(task: Task): void {
  setWorkbench((current) => (
    current ? { ...current, created_tasks: [...current.created_tasks, task] } : current
  ));
}

function replaceTask(task: Task): void {
  setWorkbench((current) => (
    current
      ? { ...current, created_tasks: current.created_tasks.map((item) => (item.id === task.id ? task : item)) }
      : current
  ));
}

function removeTask(taskId: string): void {
  setWorkbench((current) => (
    current ? { ...current, created_tasks: current.created_tasks.filter((item) => item.id !== taskId) } : current
  ));
}

function appendAppointment(appointment: Appointment): void {
  setWorkbench((current) => (
    current ? { ...current, created_appointments: [...current.created_appointments, appointment] } : current
  ));
}

function replaceAppointment(appointment: Appointment): void {
  setWorkbench((current) => (
    current
      ? {
        ...current,
        created_appointments: current.created_appointments.map((item) => (
          item.id === appointment.id ? appointment : item
        )),
      }
      : current
  ));
}

function removeAppointment(appointmentId: string): void {
  setWorkbench((current) => (
    current
      ? { ...current, created_appointments: current.created_appointments.filter((item) => item.id !== appointmentId) }
      : current
  ));
}
```

- [ ] **Step 6: Add save and delete handlers for real arrangements**

Add these handlers after the helpers from Step 5:

```ts
async function handleSaveArrangement(): Promise<void> {
  const kind = editingArrangement?.kind ?? newArrangementKind;
  if (submitting || !kind) return;
  const title = arrangementTitle.trim();
  if (!title) {
    setError(`请输入${kind === 'appointment' ? '日程' : '任务'}标题`);
    return;
  }
  const isoTime = fromDateTimeLocalValue(arrangementTime);
  if (kind === 'appointment' && !isoTime) {
    setError('请选择日程时间');
    return;
  }
  const payload = {
    title,
    content: arrangementContent.trim() || null,
    time: isoTime,
  };
  setSubmitting(true);
  setError(null);
  try {
    if (kind === 'task') {
      if (editingArrangement?.kind === 'task') {
        replaceTask(await updateEventArrangementTask(currentEvent, editingArrangement.item.id, payload));
      } else {
        appendTask(await createEventArrangementTask(currentEvent, payload));
      }
    } else if (isoTime) {
      if (editingArrangement?.kind === 'appointment') {
        replaceAppointment(await updateEventArrangementAppointment(currentEvent, editingArrangement.item.id, payload));
      } else {
        appendAppointment(await createEventArrangementAppointment(currentEvent, payload));
      }
    }
    cancelArrangementEditor();
    await Promise.resolve(onChanged?.());
  } catch (err) {
    setError(err instanceof Error ? err.message : '保存安排内容失败');
  } finally {
    setSubmitting(false);
  }
}

async function handleDeleteArrangement(target: EditingArrangement): Promise<void> {
  if (submitting) return;
  if (!window.confirm(`确定删除“${target.item.title}”吗？`)) return;
  setSubmitting(true);
  setError(null);
  try {
    if (target.kind === 'task') {
      await deleteEventArrangementTask(target.item.id);
      removeTask(target.item.id);
    } else {
      await deleteEventArrangementAppointment(target.item.id);
      removeAppointment(target.item.id);
    }
    cancelArrangementEditor();
    await Promise.resolve(onChanged?.());
  } catch (err) {
    setError(err instanceof Error ? err.message : '删除安排内容失败');
  } finally {
    setSubmitting(false);
  }
}
```

- [ ] **Step 7: Replace draft-derived constants**

Replace:

```ts
const draftItems = workbench?.plan_draft?.items ?? [];
const taskDrafts = draftItems.filter((item) => item.kind === 'task');
const appointmentDrafts = draftItems.filter((item) => item.kind === 'appointment');
const sourceTemplateName = templates.find((template) => template.id === workbench?.plan_draft?.source_template_id)?.name;
```

with:

```ts
const taskArrangements = workbench?.created_tasks ?? [];
const appointmentArrangements = workbench?.created_appointments ?? [];
```

- [ ] **Step 8: Replace draft rendering functions**

Delete `renderDraftEditor`, `renderDraftItem`, and `renderDraftColumn`. Add:

```tsx
function renderArrangementEditor(kind: ArrangementKind) {
  const activeKind = editingArrangement?.kind ?? newArrangementKind;
  if (activeKind !== kind) return null;
  const label = kind === 'appointment' ? '日程' : '任务';
  const timeValue = fromDateTimeLocalValue(arrangementTime);
  return (
    <div className="grid gap-3 rounded-lg border border-blue-300/20 bg-blue-400/10 p-3">
      <label className="grid gap-1 text-xs text-white/60">
        {label}标题
        <input
          aria-label={`${label}标题`}
          value={arrangementTitle}
          onChange={(changeEvent) => setArrangementTitle(changeEvent.target.value)}
          className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="grid gap-1 text-xs text-white/60">
        {label}备注
        <textarea
          aria-label={`${label}备注`}
          value={arrangementContent}
          onChange={(changeEvent) => setArrangementContent(changeEvent.target.value)}
          className="min-h-16 rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="grid gap-1 text-xs text-white/60">
        {label}时间
        <input
          aria-label={`${label}时间`}
          type="datetime-local"
          value={arrangementTime}
          onChange={(changeEvent) => setArrangementTime(changeEvent.target.value)}
          className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
        />
      </label>
      {timeValue ? <div className="text-xs text-white/45">时间预览 {formatEventDateTime(timeValue)}</div> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {editingArrangement ? (
          <button
            type="button"
            onClick={() => void handleDeleteArrangement(editingArrangement)}
            className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20"
          >
            删除{label}
          </button>
        ) : null}
        <button
          type="button"
          onClick={cancelArrangementEditor}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => void handleSaveArrangement()}
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          保存{label}
        </button>
      </div>
    </div>
  );
}

function renderArrangementButton(target: EditingArrangement) {
  return (
    <button
      key={target.item.id}
      type="button"
      onClick={() => beginEditArrangement(target)}
      className="min-h-10 rounded-lg bg-white/[0.05] px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/10"
    >
      {target.item.title}
    </button>
  );
}

function renderArrangementColumn(kind: ArrangementKind, items: Task[] | Appointment[]) {
  const label = kind === 'appointment' ? '日程' : '任务';
  return (
    <div className="flex min-h-[180px] flex-col rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="text-sm font-medium text-white/80">{label}</div>
      <div className="mt-3 grid flex-1 content-start gap-2">
        {items.map((item) => {
          const target = kind === 'task'
            ? { kind: 'task' as const, item: item as Task }
            : { kind: 'appointment' as const, item: item as Appointment };
          return editingArrangement?.item.id === item.id ? (
            <div key={item.id}>{renderArrangementEditor(kind)}</div>
          ) : renderArrangementButton(target);
        })}
        {newArrangementKind === kind ? renderArrangementEditor(kind) : null}
        <button
          type="button"
          onClick={() => beginAddArrangement(kind)}
          className="min-h-10 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/55 hover:bg-white/[0.07] hover:text-white"
        >
          添加{label}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Replace the template and arrangement JSX sections**

Delete the whole template-selection section that starts with:

```tsx
<section className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
```

and contains `选择事件模板`, `套用模板`, and `模板工作台`.

Replace the two-column `lg:grid-cols-[1fr_1fr]` block containing `安排内容` and `已创建安排` with this single arrangement section:

```tsx
<section className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
  <div>
    <h3 className="text-base font-semibold">安排内容</h3>
    <p className="mt-1 text-sm text-white/50">直接管理当前事件下的任务和日程</p>
  </div>
  <div className="mt-4 grid gap-3 md:grid-cols-2">
    {renderArrangementColumn('task', taskArrangements)}
    {renderArrangementColumn('appointment', appointmentArrangements)}
  </div>
</section>
```

Delete the `EventTemplateManagerModal` render block at the end of the component.

- [ ] **Step 10: Run focused tests**

Run:

```bash
cd frontend && pnpm test -- EventWorkbenchModal.test.tsx
```

Expected: all `EventWorkbenchModal` tests pass.

- [ ] **Step 11: Commit modal refactor**

Run:

```bash
git add frontend/src/components/events/EventWorkbenchModal.tsx frontend/src/components/__tests__/EventWorkbenchModal.test.tsx frontend/src/lib/events/arrangementApi.ts
git commit -m "refactor(frontend): manage event arrangements directly"
```

After the commit succeeds, update `docs/开发日志.md` with a new entry for this commit under `codex/event-refactor`, then amend the commit so the log entry is included:

```bash
git add docs/开发日志.md
git commit --amend --no-edit
```

### Task 4: Regression Verification

**Files:**
- Verify: `frontend/src/components/events/EventWorkbenchModal.tsx`
- Verify: `frontend/src/components/EventCountdownCard.tsx`
- Verify: `docs/开发日志.md`

- [ ] **Step 1: Run event frontend tests**

Run:

```bash
cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx
```

Expected: all three test files pass. If Node version warning appears for Node 22 versus expected Node 20, record it in the final verification notes while treating passing test results as valid.

- [ ] **Step 2: Run frontend type check**

Run:

```bash
cd frontend && pnpm check
```

Expected: TypeScript check passes.

- [ ] **Step 3: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 4: Browser verify the created-event arrangement page**

Use the in-app browser at `http://localhost:5173/`. Open an existing event arrangement page and verify:

- `选择事件模板` is absent.
- `套用模板` is absent.
- `模板工作台` is absent.
- `另存为事件模板` is absent.
- `回写源模板` is absent.
- `生成正式安排` is absent.
- `已创建安排` is absent.
- `安排内容` has task and schedule columns.
- Saving `添加任务` creates a visible task item in the task column.
- Saving `添加日程` creates a visible schedule item in the schedule column.

- [ ] **Step 5: Record final development log evidence**

If the implementation commit already contains a complete `docs/开发日志.md` entry with all verification commands, update that same entry with browser verification results and amend the implementation commit:

```bash
git add docs/开发日志.md
git commit --amend --no-edit
```

If verification fixes require code changes, make the code change, rerun the relevant verification command, and amend the implementation commit with the changed files and updated development log.
