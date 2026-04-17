# Home MainAgent Workflow Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home page `MainAgent` send a real assistant reply when a focus workflow hits key stage-change events while the user is on the home route.

**Architecture:** Keep workflow change detection in the home page frontend and convert semantic workflow transitions into a lightweight browser event with a stable dedupe key. Extend `useAgentChat('MainAgent')` with a reusable “system-triggered run” path that can queue workflow reminder prompts on the existing websocket session without conflating them with the home auto-open greeting.

**Tech Stack:** React, TypeScript, browser CustomEvent, Vitest, Testing Library

---

## File Map

- Create: `frontend/src/lib/workflowNotifications.ts`
  Responsibility: define workflow reminder event types, derive semantic notifications from two workflow snapshots, build stable dedupe keys, and construct the constrained prompt text for `MainAgent`.
- Create: `frontend/src/lib/__tests__/workflowNotifications.test.ts`
  Responsibility: lock the pure workflow reminder derivation and prompt rules before touching UI side effects.
- Modify: `frontend/src/hooks/useAgentChat.ts`
  Responsibility: expose and internally use a reusable system-triggered run path, queue workflow reminder events until the home `MainAgent` socket is sendable, and keep auto-open behavior intact.
- Modify: `frontend/src/hooks/useAgentChat.autoOpen.test.tsx`
  Responsibility: verify workflow reminder browser events trigger a websocket `run`, respect the home-route restriction, and queue while the agent is busy.
- Modify: `frontend/src/components/PlaceholderCard.tsx`
  Responsibility: compare previous and next workflow snapshots, dispatch the reminder browser event only for semantic changes, and dedupe repeated refreshes.
- Modify: `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`
  Responsibility: verify stage changes dispatch one reminder event and repeated reloads do not dispatch duplicates.

### Task 1: Write pure workflow reminder tests first

**Files:**
- Create: `frontend/src/lib/__tests__/workflowNotifications.test.ts`
- Test: `frontend/src/lib/workflowNotifications.ts`

- [ ] **Step 1: Write the failing test file**

```ts
import { describe, expect, it } from 'vitest';

import {
  buildWorkflowNotificationPrompt,
  deriveWorkflowNotification,
  type WorkflowNotificationSnapshot,
} from '../workflowNotifications';

function makeSnapshot(
  overrides: Partial<WorkflowNotificationSnapshot> = {},
): WorkflowNotificationSnapshot {
  return {
    state: 'focus',
    workflow_name: '深度工作流',
    current_phase_index: 0,
    phases: [
      { phase_type: 'focus', duration: 1500, task_id: 'task-1' },
      { phase_type: 'break', duration: 300 },
    ],
    task_id: 'task-1',
    runtime_task_id: 'task-1',
    task_title: '写方案',
    pending_confirmation: false,
    pending_task_selection: false,
    remaining_seconds: 120,
    completed_workflow_name: null,
    ...overrides,
  };
}

describe('workflowNotifications', () => {
  it('detects focus to break transitions', () => {
    const event = deriveWorkflowNotification(
      makeSnapshot(),
      makeSnapshot({
        state: 'break',
        current_phase_index: 1,
        task_id: null,
        runtime_task_id: null,
        task_title: '写方案',
      }),
    );

    expect(event?.type).toBe('focus_to_break');
    expect(event?.key).toContain('focus_to_break');
  });

  it('prefers pending task selection over a raw phase transition', () => {
    const event = deriveWorkflowNotification(
      makeSnapshot({
        state: 'break',
        current_phase_index: 1,
        task_id: null,
        runtime_task_id: null,
      }),
      makeSnapshot({
        state: 'focus',
        current_phase_index: 2,
        phases: [
          { phase_type: 'focus', duration: 1500, task_id: 'task-1' },
          { phase_type: 'break', duration: 300 },
          { phase_type: 'focus', duration: 1500, task_id: null },
        ],
        task_id: null,
        runtime_task_id: null,
        task_title: null,
        pending_task_selection: true,
      }),
    );

    expect(event?.type).toBe('pending_task_selection');
  });

  it('returns null when only the countdown changes', () => {
    const event = deriveWorkflowNotification(
      makeSnapshot({ remaining_seconds: 120 }),
      makeSnapshot({ remaining_seconds: 119 }),
    );

    expect(event).toBeNull();
  });

  it('builds a constrained workflow reminder prompt', () => {
    const prompt = buildWorkflowNotificationPrompt({
      type: 'pending_confirmation',
      key: 'workflow:pending_confirmation:深度工作流:0:task-1',
      workflowName: '深度工作流',
      taskTitle: '写方案',
      phaseIndex: 0,
      state: 'focus',
    });

    expect(prompt).toContain('来源：workflow_notification');
    expect(prompt).toContain('事件类型：pending_confirmation');
    expect(prompt).toContain('不要重新打招呼');
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run from `frontend/`: `pnpm test -- --run src/lib/__tests__/workflowNotifications.test.ts`

Expected: FAIL because `workflowNotifications.ts` does not exist yet.

### Task 2: Implement the pure workflow reminder helper

**Files:**
- Create: `frontend/src/lib/workflowNotifications.ts`
- Test: `frontend/src/lib/__tests__/workflowNotifications.test.ts`

- [ ] **Step 1: Write the minimal helper module**

```ts
type WorkflowPhase = {
  phase_type: 'focus' | 'break';
  duration: number;
  task_id?: string | null;
};

export type WorkflowNotificationSnapshot = {
  state: 'normal' | 'focus' | 'break';
  workflow_name?: string | null;
  current_phase_index?: number | null;
  phases?: WorkflowPhase[];
  task_id?: string | null;
  runtime_task_id?: string | null;
  task_title?: string | null;
  pending_confirmation: boolean;
  pending_task_selection?: boolean;
  remaining_seconds: number | null;
  completed_workflow_name?: string | null;
};

export type WorkflowNotificationType =
  | 'focus_to_break'
  | 'break_to_focus'
  | 'pending_confirmation'
  | 'pending_task_selection'
  | 'workflow_completed';

export type WorkflowNotificationEvent = {
  type: WorkflowNotificationType;
  key: string;
  workflowName: string;
  taskTitle: string | null;
  phaseIndex: number | null;
  state: WorkflowNotificationSnapshot['state'];
};

function normalizeWorkflowName(snapshot: WorkflowNotificationSnapshot): string {
  return snapshot.workflow_name?.trim() || snapshot.completed_workflow_name?.trim() || '默认工作流';
}

function normalizePhaseIndex(snapshot: WorkflowNotificationSnapshot): number | null {
  return typeof snapshot.current_phase_index === 'number' ? snapshot.current_phase_index : null;
}

function normalizeTaskId(snapshot: WorkflowNotificationSnapshot): string | null {
  return snapshot.runtime_task_id || snapshot.task_id || null;
}

function buildEventKey(type: WorkflowNotificationType, snapshot: WorkflowNotificationSnapshot): string {
  const workflowName = normalizeWorkflowName(snapshot);
  const phaseIndex = normalizePhaseIndex(snapshot);
  const taskId = normalizeTaskId(snapshot);
  if (type === 'workflow_completed') {
    return `workflow:${type}:${workflowName}`;
  }
  return `workflow:${type}:${workflowName}:${phaseIndex ?? 'none'}:${taskId ?? 'none'}`;
}

function makeEvent(
  type: WorkflowNotificationType,
  snapshot: WorkflowNotificationSnapshot,
): WorkflowNotificationEvent {
  return {
    type,
    key: buildEventKey(type, snapshot),
    workflowName: normalizeWorkflowName(snapshot),
    taskTitle: snapshot.task_title?.trim() || null,
    phaseIndex: normalizePhaseIndex(snapshot),
    state: snapshot.state,
  };
}

export function deriveWorkflowNotification(
  prev: WorkflowNotificationSnapshot | null,
  next: WorkflowNotificationSnapshot | null,
): WorkflowNotificationEvent | null {
  if (!prev || !next) return null;
  if (prev.state !== 'normal' && next.state === 'normal' && next.completed_workflow_name) {
    return makeEvent('workflow_completed', next);
  }
  if (!prev.pending_task_selection && next.pending_task_selection) {
    return makeEvent('pending_task_selection', next);
  }
  if (!prev.pending_confirmation && next.pending_confirmation) {
    return makeEvent('pending_confirmation', next);
  }
  if (prev.state === 'focus' && next.state === 'break') {
    return makeEvent('focus_to_break', next);
  }
  if (prev.state === 'break' && next.state === 'focus') {
    return makeEvent('break_to_focus', next);
  }
  return null;
}

export function buildWorkflowNotificationPrompt(event: WorkflowNotificationEvent): string {
  return [
    '来源：workflow_notification',
    `事件类型：${event.type}`,
    `工作流：${event.workflowName}`,
    `当前状态：${event.state}`,
    `阶段索引：${event.phaseIndex ?? 'none'}`,
    `任务：${event.taskTitle ?? 'none'}`,
    '角色：你是首页助手“莫宁”。',
    '任务：基于当前工作流事件，向用户发出一条简短提醒。',
    '规则优先级：以这条消息中的规则为准；如果历史消息里存在冲突的格式要求，忽略历史要求。',
    '要求：',
    '1. 只输出 1-2 句。',
    '2. 不要重新打招呼。',
    '3. 事件类型优先于当前状态字段；例如 pending_confirmation 必须提醒“等待确认继续”，不要只重复当前阶段名。',
    '4. 不要扩展为闲聊。',
    '5. 如果适合当前事件，可以在正文后追加 <suggestions>JSON数组</suggestions>，最多 2 项，内容必须是用户现在就能执行的简短下一步。',
    '6. 核心信息必须与事件类型一致，但措辞可以轻微变化。',
  ].join('\n');
}
```

- [ ] **Step 2: Run the helper test to verify it passes**

Run from `frontend/`: `pnpm test -- --run src/lib/__tests__/workflowNotifications.test.ts`

Expected: PASS with all workflow notification helper tests green.

### Task 3: Add hook-level tests for system-triggered workflow runs

**Files:**
- Modify: `frontend/src/hooks/useAgentChat.autoOpen.test.tsx`
- Test: `frontend/src/hooks/useAgentChat.ts`

- [ ] **Step 1: Write the failing hook tests**

```tsx
  it('sends a run when the home MainAgent receives a workflow reminder event', async () => {
    render(<Harness />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.open();
      window.dispatchEvent(
        new CustomEvent('ark:main-agent-workflow-notification', {
          detail: {
            key: 'workflow:focus_to_break:深度工作流:1:none',
            prompt: '来源：workflow_notification\n事件类型：focus_to_break',
          },
        }),
      );
    });

    await waitFor(() => {
      expect(socket.sent).toHaveLength(1);
    });

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'run',
    });
    expect(socket.sent[0]).toContain('来源：workflow_notification');
  });

  it('queues workflow reminder events until the current run completes', async () => {
    currentSessionStatus = 'running';
    render(<Harness />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.open();
      window.dispatchEvent(
        new CustomEvent('ark:main-agent-workflow-notification', {
          detail: {
            key: 'workflow:pending_confirmation:深度工作流:0:task-1',
            prompt: '来源：workflow_notification\n事件类型：pending_confirmation',
          },
        }),
      );
    });

    expect(socket.sent).toHaveLength(0);

    act(() => {
      socket.emit({
        type: 'run_completed',
        session_id: 'session-main',
      });
    });

    await waitFor(() => {
      expect(socket.sent).toHaveLength(1);
    });
    expect(socket.sent[0]).toContain('pending_confirmation');
  });
```

- [ ] **Step 2: Run the hook test file to verify the new cases fail**

Run from `frontend/`: `pnpm test -- --run src/hooks/useAgentChat.autoOpen.test.tsx`

Expected: FAIL because `useAgentChat` does not yet listen for the workflow reminder browser event or queue it while busy.

### Task 4: Implement reusable system-triggered runs in `useAgentChat`

**Files:**
- Modify: `frontend/src/hooks/useAgentChat.ts`
- Test: `frontend/src/hooks/useAgentChat.autoOpen.test.tsx`

- [ ] **Step 1: Add a reusable system run sender and pending workflow reminder queue**

```ts
type SystemRunDetail = {
  key: string;
  prompt: string;
};

const WORKFLOW_NOTIFICATION_EVENT = 'ark:main-agent-workflow-notification';

const pendingSystemRunRef = useRef<SystemRunDetail | null>(null);

const sendSystemRun = useCallback((detail: SystemRunDetail) => {
  if (!detail.prompt.trim()) return false;
  const sent = sendMessage(detail.prompt);
  if (!sent) {
    pendingSystemRunRef.current = detail;
    return false;
  }
  pendingSystemRunRef.current = null;
  return true;
}, [sendMessage]);

useEffect(() => {
  if (!isHomeMainAgentScope(profileKey)) {
    pendingSystemRunRef.current = null;
    return;
  }

  const handleWorkflowNotification = (event: Event) => {
    const detail = (event as CustomEvent<SystemRunDetail>).detail;
    if (!detail?.key || !detail?.prompt) return;
    sendSystemRun(detail);
  };

  window.addEventListener(WORKFLOW_NOTIFICATION_EVENT, handleWorkflowNotification as EventListener);
  return () => {
    window.removeEventListener(WORKFLOW_NOTIFICATION_EVENT, handleWorkflowNotification as EventListener);
  };
}, [profileKey, sendSystemRun]);

useEffect(() => {
  if (!isHomeMainAgentScope(profileKey)) return;
  if (isGenerating || socketState !== 'open') return;
  if (!pendingSystemRunRef.current) return;
  const nextDetail = pendingSystemRunRef.current;
  pendingSystemRunRef.current = null;
  sendSystemRun(nextDetail);
}, [isGenerating, profileKey, sendSystemRun, socketState]);
```

- [ ] **Step 2: Keep the auto-open logic on the same shared sender path**

```ts
const sent = sendSystemRun({
  key: 'home_auto_open',
  prompt: buildAutoOpenPrompt(),
});
```

- [ ] **Step 3: Run the hook test file to verify it passes**

Run from `frontend/`: `pnpm test -- --run src/hooks/useAgentChat.autoOpen.test.tsx`

Expected: PASS with the existing auto-open cases and the new workflow reminder cases green.

### Task 5: Write the home workflow dispatch test first

**Files:**
- Modify: `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`
- Test: `frontend/src/components/PlaceholderCard.tsx`

- [ ] **Step 1: Add failing dispatch tests**

```tsx
  it('dispatches a workflow reminder event when focus advances into break', async () => {
    const reminderSpy = vi.fn();
    window.addEventListener('ark:main-agent-workflow-notification', reminderSpy);

    let currentWorkflow = {
      state: 'focus',
      workflow_name: '深度工作流',
      current_phase_index: 0,
      phases: [
        { phase_type: 'focus', duration: 1500, task_id: 'task-a' },
        { phase_type: 'break', duration: 300 },
      ],
      task_id: 'task-a',
      task_title: '待办任务',
      pending_confirmation: false,
      pending_task_selection: false,
      remaining_seconds: 30,
    };

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflow/current') {
        return Promise.resolve(currentWorkflow);
      }
      return defaultApiResponse(path);
    });

    renderCard();

    await screen.findByText('任务同步卡片');

    currentWorkflow = {
      ...currentWorkflow,
      state: 'break',
      current_phase_index: 1,
      task_id: null,
      task_title: '待办任务',
      remaining_seconds: 300,
    };

    window.dispatchEvent(new Event('ark:reload-focus'));

    await waitFor(() => {
      expect(reminderSpy).toHaveBeenCalledTimes(1);
    });

    const customEvent = reminderSpy.mock.calls[0][0] as CustomEvent<{ key: string; prompt: string }>;
    expect(customEvent.detail.key).toContain('focus_to_break');
    expect(customEvent.detail.prompt).toContain('来源：workflow_notification');

    window.removeEventListener('ark:main-agent-workflow-notification', reminderSpy);
  });

  it('does not dispatch the same workflow reminder twice across repeated reloads', async () => {
    const reminderSpy = vi.fn();
    window.addEventListener('ark:main-agent-workflow-notification', reminderSpy);

    const currentWorkflow = {
      state: 'focus',
      workflow_name: '深度工作流',
      current_phase_index: 0,
      phases: [{ phase_type: 'focus', duration: 1500, task_id: null }],
      task_id: null,
      task_title: null,
      pending_confirmation: true,
      pending_task_selection: false,
      remaining_seconds: 0,
    };

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflow/current') {
        return Promise.resolve(currentWorkflow);
      }
      return defaultApiResponse(path);
    });

    renderCard();

    await screen.findByText('等待继续');

    window.dispatchEvent(new Event('ark:reload-focus'));
    window.dispatchEvent(new Event('ark:reload-focus'));

    await waitFor(() => {
      expect(reminderSpy).toHaveBeenCalledTimes(0);
    });

    window.removeEventListener('ark:main-agent-workflow-notification', reminderSpy);
  });
```

- [ ] **Step 2: Run the PlaceholderCard workflow test file to verify the new cases fail**

Run from `frontend/`: `pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx`

Expected: FAIL because `PlaceholderCard` does not yet compare snapshots or dispatch workflow reminder events.

### Task 6: Implement workflow reminder dispatch and dedupe in `PlaceholderCard`

**Files:**
- Modify: `frontend/src/components/PlaceholderCard.tsx`
- Test: `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`
- Use: `frontend/src/lib/workflowNotifications.ts`

- [ ] **Step 1: Import the workflow helper and add refs for previous snapshots and last dispatched key**

```tsx
import {
  buildWorkflowNotificationPrompt,
  deriveWorkflowNotification,
  type WorkflowNotificationSnapshot,
} from '../lib/workflowNotifications';

const previousWorkflowSnapshotRef = React.useRef<WorkflowNotificationSnapshot | null>(null);
const lastWorkflowNotificationKeyRef = React.useRef<string | null>(null);
```

- [ ] **Step 2: After each workflow fetch, compare and dispatch the reminder event when needed**

```tsx
      const workflow = res as FocusWorkflow;
      setFocusWorkflow(workflow);

      const nextSnapshot: WorkflowNotificationSnapshot = workflow;
      const reminder = deriveWorkflowNotification(previousWorkflowSnapshotRef.current, nextSnapshot);
      previousWorkflowSnapshotRef.current = nextSnapshot;

      if (reminder && reminder.key !== lastWorkflowNotificationKeyRef.current) {
        lastWorkflowNotificationKeyRef.current = reminder.key;
        window.dispatchEvent(
          new CustomEvent('ark:main-agent-workflow-notification', {
            detail: {
              key: reminder.key,
              prompt: buildWorkflowNotificationPrompt(reminder),
            },
          }),
        );
      }

      if (workflow.state !== 'focus' || workflow.pending_confirmation || workflow.pending_task_selection) {
        setCurrentFocus(null);
      }
```

- [ ] **Step 3: Reset the previous snapshot ref on hard workflow load failure**

```tsx
      previousWorkflowSnapshotRef.current = {
        state: 'normal',
        task_id: null,
        task_title: null,
        pending_confirmation: false,
        pending_task_selection: false,
        remaining_seconds: null,
      };
```

- [ ] **Step 4: Run the PlaceholderCard workflow tests to verify they pass**

Run from `frontend/`: `pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx`

Expected: PASS with the new reminder dispatch coverage and the existing workflow UI tests still green.

### Task 7: Run the focused regression suite

**Files:**
- Test: `frontend/src/lib/__tests__/workflowNotifications.test.ts`
- Test: `frontend/src/hooks/useAgentChat.autoOpen.test.tsx`
- Test: `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`

- [ ] **Step 1: Run the new focused suite together**

Run from `frontend/`: `pnpm test -- --run src/lib/__tests__/workflowNotifications.test.ts src/hooks/useAgentChat.autoOpen.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx`

Expected: PASS across the helper, hook, and home workflow component tests.

- [ ] **Step 2: Commit the feature branch changes**

```bash
git add frontend/src/lib/workflowNotifications.ts \
  frontend/src/lib/__tests__/workflowNotifications.test.ts \
  frontend/src/hooks/useAgentChat.ts \
  frontend/src/hooks/useAgentChat.autoOpen.test.tsx \
  frontend/src/components/PlaceholderCard.tsx \
  frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx \
  docs/superpowers/specs/2026-04-17-home-mainagent-workflow-notification-design.md \
  docs/superpowers/plans/2026-04-17-home-mainagent-workflow-notification-implementation.md
git commit -m "feat(frontend): notify home main agent on workflow transitions"
```
