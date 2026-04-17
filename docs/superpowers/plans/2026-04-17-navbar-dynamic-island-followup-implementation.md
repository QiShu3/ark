# Navbar Dynamic Island Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the navbar workflow chip into a three-layer “dynamic island” interaction with a compact resting state, a focus-only hover expansion that reveals the current task, and a temporary transition feedback state that expands without hiding time.

**Architecture:** Keep the existing workflow snapshot polling and live timer reconciliation intact, but add a small UI state machine inside `WorkflowNavProgress` to distinguish resting, hover-expanded, and transition-feedback modes. Drive the feature entirely from existing snapshot fields (`state`, `task_title`, `pending_*`, timer data), and cover the behavior with focused component tests that exercise rerenders, hover transitions, and feedback timeouts.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library

---

## File Map

- Modify: `frontend/src/components/WorkflowNavProgress.tsx`
  Responsibility: add the dynamic island state model, animate width changes, reveal task title on hover, and show temporary transition feedback while preserving timer visibility.
- Modify: `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`
  Responsibility: lock down compact/resting behavior, hover-only task reveal, transition feedback expansion, timeout recovery, and static-state exclusions.

### Task 1: Add failing tests for compact, hover, and feedback states

**Files:**
- Modify: `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`

- [ ] **Step 1: Extend the navbar test file with the new dynamic-island expectations**

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('keeps the resting focus chip compact and hides the task title by default', () => {
  render(
    <WorkflowNavProgress
      workflow={makeWorkflow({
        task_title: '撰写周报',
      })}
    />,
  );

  const chip = screen.getByRole('button', { name: /工作流进度/i });
  expect(chip).toHaveAttribute('data-layout', 'compact');
  expect(screen.getByText('专注中')).toBeInTheDocument();
  expect(screen.queryByText('撰写周报')).not.toBeInTheDocument();
  expect(screen.getByText('12:34')).toBeInTheDocument();
});

it('expands on hover during focus and reveals the current task title', async () => {
  const user = userEvent.setup();
  render(
    <WorkflowNavProgress
      workflow={makeWorkflow({
        task_title: '撰写周报',
      })}
    />,
  );

  const chip = screen.getByRole('button', { name: /工作流进度/i });
  await user.hover(chip);

  expect(chip).toHaveAttribute('data-layout', 'hover');
  expect(screen.getByText('撰写周报')).toBeInTheDocument();
  expect(screen.getByText('12:34')).toBeInTheDocument();

  await user.unhover(chip);
  expect(chip).toHaveAttribute('data-layout', 'compact');
  expect(screen.queryByText('撰写周报')).not.toBeInTheDocument();
});

it('does not expand on hover outside focus mode', async () => {
  const user = userEvent.setup();
  render(
    <WorkflowNavProgress
      workflow={makeWorkflow({
        state: 'break',
        current_phase_index: 1,
        remaining_seconds: 120,
        task_title: '撰写周报',
      })}
    />,
  );

  const chip = screen.getByRole('button', { name: /工作流进度/i });
  await user.hover(chip);

  expect(chip).toHaveAttribute('data-layout', 'compact');
  expect(screen.queryByText('撰写周报')).not.toBeInTheDocument();
});

it('expands into transition feedback when the phase changes and keeps the timer visible', () => {
  vi.useFakeTimers();
  const { rerender } = render(<WorkflowNavProgress workflow={makeWorkflow()} />);

  rerender(
    <WorkflowNavProgress
      workflow={makeWorkflow({
        state: 'break',
        current_phase_index: 1,
        remaining_seconds: 296,
      })}
    />,
  );

  const chip = screen.getByRole('button', { name: /工作流进度/i });
  expect(chip).toHaveAttribute('data-layout', 'feedback');
  expect(screen.getByText('开始休息')).toBeInTheDocument();
  expect(screen.getByText('04:56')).toBeInTheDocument();
});

it('returns to the compact state after the feedback timeout', () => {
  vi.useFakeTimers();
  const { rerender } = render(<WorkflowNavProgress workflow={makeWorkflow()} />);

  rerender(
    <WorkflowNavProgress
      workflow={makeWorkflow({
        state: 'break',
        current_phase_index: 1,
        remaining_seconds: 296,
      })}
    />,
  );

  act(() => {
    vi.advanceTimersByTime(1800);
  });

  const chip = screen.getByRole('button', { name: /工作流进度/i });
  expect(chip).toHaveAttribute('data-layout', 'compact');
  expect(screen.getByText('休息中')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused navbar test file to verify the new assertions fail**

Run from `frontend/`: `pnpm test -- --run src/components/__tests__/WorkflowNavProgress.test.tsx`

Expected: FAIL because the current implementation uses one fixed-width layout, does not reveal task titles on hover, and does not enter a temporary feedback mode after phase transitions.

### Task 2: Implement the internal layout state model in `WorkflowNavProgress`

**Files:**
- Modify: `frontend/src/components/WorkflowNavProgress.tsx`
- Test: `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`

- [ ] **Step 1: Add explicit UI-state tracking for hover and transition feedback**

```tsx
const [isHovered, setIsHovered] = React.useState(false);
const [feedbackText, setFeedbackText] = React.useState<string | null>(null);
const previousPhaseRef = React.useRef<{ state: WorkflowSnapshot['state']; index: number | null } | null>(null);

const isInteractiveFocus = workflowForMetrics.state === 'focus'
  && !workflowForMetrics.pending_confirmation
  && !workflowForMetrics.pending_task_selection;

React.useEffect(() => {
  const nextPhase = {
    state: workflowForMetrics.state,
    index: workflowForMetrics.current_phase_index ?? null,
  };
  const prevPhase = previousPhaseRef.current;

  if (
    prevPhase
    && prevPhase.state !== 'normal'
    && nextPhase.state !== 'normal'
    && (prevPhase.state !== nextPhase.state || prevPhase.index !== nextPhase.index)
  ) {
    setFeedbackText(resolveFeedbackCopy(prevPhase.state, nextPhase.state));
  }

  previousPhaseRef.current = nextPhase;
}, [workflowForMetrics.state, workflowForMetrics.current_phase_index]);

React.useEffect(() => {
  if (!feedbackText) return;
  const timer = window.setTimeout(() => setFeedbackText(null), 1600);
  return () => window.clearTimeout(timer);
}, [feedbackText]);
```

- [ ] **Step 2: Derive a single `layoutMode` from workflow, feedback, and hover state**

```tsx
const hasTaskTitle = Boolean(workflowForMetrics.task_title?.trim());
const showHoverTask = isInteractiveFocus && isHovered && hasTaskTitle && !feedbackText;
const showFeedback = Boolean(feedbackText)
  && !workflowForMetrics.pending_confirmation
  && !workflowForMetrics.pending_task_selection;

const layoutMode: 'compact' | 'hover' | 'feedback' = showFeedback
  ? 'feedback'
  : showHoverTask
    ? 'hover'
    : 'compact';

const titleText = showFeedback
  ? feedbackText!
  : workflowForMetrics.pending_task_selection
    ? '选择任务'
    : workflowForMetrics.pending_confirmation
      ? '等待继续'
      : phaseStatusLabel(phaseType);
```

Implementation notes for this step:
- add a small local helper such as `phaseStatusLabel()` that returns `专注中` / `休息中`
- add a local helper such as `resolveFeedbackCopy()` that maps transitions to `专注完成` / `开始休息` / `休息结束` / `继续专注`
- keep feedback mode higher priority than hover mode

- [ ] **Step 3: Update the rendered chip so width and content depend on `layoutMode`**

```tsx
const layoutClass = layoutMode === 'compact'
  ? 'max-w-[320px]'
  : layoutMode === 'hover'
    ? 'max-w-[460px]'
    : 'max-w-[500px]';

return (
  <div
    role="button"
    tabIndex={0}
    data-layout={layoutMode}
    className={`hidden md:flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-[max-width,padding,background-color] duration-300 w-full ${layoutClass} cursor-pointer overflow-hidden`}
    onMouseEnter={() => setIsHovered(true)}
    onMouseLeave={() => setIsHovered(false)}
    ...
  >
    <span className={`h-2.5 w-2.5 rounded-full ${activeColorBg} shadow-[0_0_12px_currentColor] ${activeColorText}`} />

    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className={`text-sm font-semibold whitespace-nowrap ${activeColorText}`}>{titleText}</span>
        {showHoverTask ? (
          <span className="min-w-0 truncate text-xs text-white/55">{workflowForMetrics.task_title}</span>
        ) : null}
        {targetHint && layoutMode !== 'compact' ? (
          <span className="text-[10px] text-white/45 whitespace-nowrap">{targetHint}</span>
        ) : null}
      </div>
    </div>

    {showPulse ? (
      <div data-testid="workflow-nav-pulse" data-phase={phaseType} aria-hidden="true" className={layoutMode === 'feedback' ? 'flex items-center gap-1.5 scale-110' : 'flex items-center gap-1.5'}>
        ...
      </div>
    ) : null}

    {workflowForMetrics.pending_confirmation ? (
      <button ...>{confirming ? '确认中...' : '▶ 继续'}</button>
    ) : (
      <span className={`text-sm font-semibold whitespace-nowrap ${activeColorText}`}>{timerText}</span>
    )}
  </div>
);
```

Implementation notes for this step:
- compact mode should not render the task title
- hover mode should only render the task title when `task_title` exists
- feedback mode should keep the timer visible while swapping the central copy
- static states (`pending_task_selection`, `pending_confirmation`) should continue to suppress the pulse motif

- [ ] **Step 4: Run the focused navbar tests to verify the new state model passes**

Run from `frontend/`: `pnpm test -- --run src/components/__tests__/WorkflowNavProgress.test.tsx`

Expected: PASS with layout-mode, hover, transition-feedback, and timeout assertions all green.

- [ ] **Step 5: Commit the dynamic-island component behavior**

```bash
git add frontend/src/components/WorkflowNavProgress.tsx frontend/src/components/__tests__/WorkflowNavProgress.test.tsx
git commit -m "feat(frontend): add dynamic island states to navbar workflow"
```

### Task 3: Verify interactions, timing, and broader frontend stability

**Files:**
- Verify: `frontend/src/components/WorkflowNavProgress.tsx`
- Verify: `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`

- [ ] **Step 1: Run the navbar test file together with related workflow component coverage**

Run from `frontend/`: `pnpm test -- --run src/components/__tests__/WorkflowNavProgress.test.tsx src/components/__tests__/WorkflowProgressBar.test.tsx`

Expected: PASS so the dynamic-island behavior does not regress the shared workflow rendering expectations.

- [ ] **Step 2: Run the full frontend suite**

Run from `frontend/`: `pnpm test -- --run`

Expected: PASS across the full frontend suite, confirming that the new hover and feedback timers do not introduce cross-test instability.

- [ ] **Step 3: Run a TypeScript check**

Run from `frontend/`: `pnpm check`

Expected: PASS with no type errors from the added state machine helpers or mouse-event handlers.

- [ ] **Step 4: Inspect the targeted diff before handoff**

Run: `git diff -- frontend/src/components/WorkflowNavProgress.tsx frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`

Expected: the diff shows one cohesive interaction upgrade in the navbar chip, with no workflow API or unrelated layout changes.

- [ ] **Step 5: Confirm the branch is clean after verification**

Run: `git status --short`

Expected: no output if verification did not require extra follow-up edits; if there is output, resolve it before handoff so the branch reflects the verified state.
