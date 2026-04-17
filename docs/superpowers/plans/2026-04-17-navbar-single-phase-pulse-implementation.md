# Navbar Single-Phase Pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the navbar workflow segment bar with a single-phase status chip that keeps timer clarity while using a very light pulse motif instead of total-stage progress.

**Architecture:** Keep the existing workflow snapshot fetch and live timer reconciliation intact in `WorkflowNavProgress`, but swap the rendered UI from segmented progress to a current-phase chip. Add a tiny active-phase helper in `workflowProgress.ts` so the component can reason about the current phase without depending on total-progress math, and lock the new behavior with a dedicated component test file.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library

---

## File Map

- Modify: `frontend/src/components/WorkflowNavProgress.tsx`
  Responsibility: render the new single-phase navbar chip, hide pulse visuals for static states, and keep click/keyboard/confirm behavior intact.
- Modify: `frontend/src/components/workflowProgress.ts`
  Responsibility: expose a focused helper for resolving the current active phase from `WorkflowSnapshot`.
- Create: `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`
  Responsibility: verify running states, static states, countup target hint, and navbar entry interactions.

### Task 1: Add focused component tests for the new navbar behavior

**Files:**
- Create: `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`

- [ ] **Step 1: Write the failing test file**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

import WorkflowNavProgress from '../WorkflowNavProgress';
import type { WorkflowSnapshot } from '../workflowProgress';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

function makeWorkflow(overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot {
  return {
    state: 'focus',
    current_phase_index: 0,
    phases: [
      { phase_type: 'focus', duration: 1500 },
      { phase_type: 'break', duration: 300 },
    ],
    pending_confirmation: false,
    pending_task_selection: false,
    remaining_seconds: 754,
    elapsed_seconds: 0,
    phase_planned_duration: 1500,
    ...overrides,
  };
}

describe('WorkflowNavProgress', () => {
  it('renders a running focus chip with pulse motif and no phase count', () => {
    render(<WorkflowNavProgress workflow={makeWorkflow()} />);

    expect(screen.getByText('专注阶段')).toBeInTheDocument();
    expect(screen.getByText('12:34')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-nav-pulse')).toHaveAttribute('data-phase', 'focus');
    expect(screen.queryByText('1/2')).not.toBeInTheDocument();
  });

  it('renders break state with the pulse motif but switches semantics', () => {
    render(
      <WorkflowNavProgress
        workflow={makeWorkflow({
          state: 'break',
          current_phase_index: 1,
          remaining_seconds: 120,
        })}
      />,
    );

    expect(screen.getByText('休息阶段')).toBeInTheDocument();
    expect(screen.getByText('02:00')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-nav-pulse')).toHaveAttribute('data-phase', 'break');
  });

  it('hides pulse visuals while waiting for task selection', () => {
    render(
      <WorkflowNavProgress
        workflow={makeWorkflow({
          pending_task_selection: true,
          remaining_seconds: null,
        })}
      />,
    );

    expect(screen.getByText('选择任务')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-nav-pulse')).not.toBeInTheDocument();
  });

  it('keeps the continue action visible and hides pulse while waiting for confirmation', () => {
    render(
      <WorkflowNavProgress
        workflow={makeWorkflow({
          pending_confirmation: true,
          remaining_seconds: 0,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: '▶ 继续' })).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-nav-pulse')).not.toBeInTheDocument();
  });

  it('shows countup target hint without restoring total-phase progress', () => {
    render(
      <WorkflowNavProgress
        workflow={makeWorkflow({
          state: 'focus',
          phases: [{ phase_type: 'focus', duration: 1500, timer_mode: 'countup' }],
          remaining_seconds: null,
          elapsed_seconds: 600,
          phase_timer_mode: 'countup',
          phase_started_at: '2026-04-17T00:00:00Z',
        })}
      />,
    );

    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('目标 25:00')).toBeInTheDocument();
    expect(screen.queryByText('1/1')).not.toBeInTheDocument();
  });

  it('opens the workflow modal when the chip is clicked', async () => {
    const user = userEvent.setup();
    const openSpy = vi.fn();
    window.addEventListener('ark:open-workflow-modal', openSpy);

    render(<WorkflowNavProgress workflow={makeWorkflow()} />);
    await user.click(screen.getByRole('button', { name: /工作流进度/i }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener('ark:open-workflow-modal', openSpy);
  });
});
```

- [ ] **Step 2: Run the new component test to verify it fails**

Run from `frontend/`: `pnpm test -- --run src/components/__tests__/WorkflowNavProgress.test.tsx`

Expected: FAIL because the current component still renders the segmented bar, still shows phase counts, and does not expose the new `workflow-nav-pulse` test target.

### Task 2: Refactor the navbar component into a single-phase pulse chip

**Files:**
- Modify: `frontend/src/components/workflowProgress.ts`
- Modify: `frontend/src/components/WorkflowNavProgress.tsx`
- Test: `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`

- [ ] **Step 1: Add a direct helper for the active workflow phase**

```ts
export function getActiveWorkflowPhase(workflow: WorkflowSnapshot): WorkflowPhase | null {
  const phases = Array.isArray(workflow.phases) ? workflow.phases : [];
  if (workflow.state === 'normal' || phases.length === 0) return null;

  const activePhaseIndex = clamp(
    Math.round(workflow.current_phase_index ?? 0),
    0,
    phases.length - 1,
  );

  return phases[activePhaseIndex] ?? null;
}
```

- [ ] **Step 2: Replace the segmented progress markup with the single-phase chip**

```tsx
const currentPhase = getActiveWorkflowPhase(workflowForMetrics);
const phaseType = currentPhase?.phase_type ?? 'focus';
const isFocus = phaseType === 'focus';
const accentText = isFocus ? 'text-blue-300' : 'text-orange-300';
const accentDot = isFocus ? 'bg-blue-400' : 'bg-orange-400';
const pulsePhase = isFocus ? 'focus' : 'break';
const showPulse = !workflowForMetrics.pending_confirmation && !workflowForMetrics.pending_task_selection;
const titleText = workflowForMetrics.pending_task_selection
  ? '选择任务'
  : phaseLabel(phaseType);

return (
  <div
    role="button"
    tabIndex={0}
    className="hidden md:flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors max-w-[520px] w-full cursor-pointer"
    onClick={() => window.dispatchEvent(new Event('ark:open-workflow-modal'))}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.dispatchEvent(new Event('ark:open-workflow-modal'));
      }
    }}
    aria-label={`工作流进度：${titleText}，${workflowForMetrics.pending_task_selection ? '等待选择任务' : `时间 ${timerText}`}`}
  >
    <span className={`h-2.5 w-2.5 rounded-full ${accentDot} shadow-[0_0_12px_currentColor] ${accentText}`} />

    <div className="min-w-0 flex-1">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Current</p>
      <div className="flex items-baseline gap-2">
        <span className={`text-sm font-semibold whitespace-nowrap ${accentText}`}>{titleText}</span>
        {targetHint ? <span className="text-[10px] text-white/45 whitespace-nowrap">{targetHint}</span> : null}
      </div>
    </div>

    {showPulse ? (
      <div
        data-testid="workflow-nav-pulse"
        data-phase={pulsePhase}
        aria-hidden="true"
        className="flex items-center gap-1.5"
      >
        <span className={`h-2 w-4 rounded-full ${isFocus ? 'bg-blue-300/85' : 'bg-orange-300/85'} animate-[workflow-pulse_1.4s_ease-in-out_infinite]`} />
        <span className={`h-1.5 w-2.5 rounded-full ${isFocus ? 'bg-blue-300/25' : 'bg-orange-300/25'}`} />
        <span className={`h-1.5 w-2 rounded-full ${isFocus ? 'bg-blue-300/12' : 'bg-orange-300/12'}`} />
      </div>
    ) : null}

    {workflowForMetrics.pending_confirmation ? (
      <button type="button" onClick={handleConfirm} disabled={confirming} className={`text-[11px] font-bold whitespace-nowrap px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors ${accentText}`}>
        {confirming ? '确认中...' : '▶ 继续'}
      </button>
    ) : (
      <span className={`text-sm font-semibold whitespace-nowrap ${accentText}`}>{timerText}</span>
    )}
  </div>
);
```

- [ ] **Step 3: Remove the old phase-strip rendering and keep countup timer reconciliation**

```tsx
const workflowForMetrics = React.useMemo<WorkflowSnapshot>(() => {
  if (workflow.state === 'normal' || workflow.pending_confirmation) {
    return workflow;
  }

  if (isCountup) {
    if (liveElapsed === null || workflow.elapsed_seconds === liveElapsed) return workflow;
    return { ...workflow, elapsed_seconds: liveElapsed };
  }

  if (liveRemaining === null || workflow.remaining_seconds === liveRemaining) return workflow;
  return { ...workflow, remaining_seconds: liveRemaining };
}, [workflow, liveRemaining, liveElapsed, isCountup]);

const showProgress = workflowForMetrics.state !== 'normal' && Array.isArray(workflowForMetrics.phases) && workflowForMetrics.phases.length > 0;

if (!showProgress) {
  return null;
}
```

Implementation notes for this step:
- delete the `<div className="flex-1 flex gap-[3px] h-1.5">...</div>` phase-strip block entirely
- delete the trailing `<span>{metrics.activePhaseIndex + 1}/{phases.length}</span>` block
- keep the `handleConfirm` branch unchanged except for surrounding layout classes

- [ ] **Step 4: Run the new navbar component tests to verify they pass**

Run from `frontend/`: `pnpm test -- --run src/components/__tests__/WorkflowNavProgress.test.tsx`

Expected: PASS with the new running/static-state assertions and modal-open behavior.

- [ ] **Step 5: Commit the component refactor**

```bash
git add frontend/src/components/WorkflowNavProgress.tsx frontend/src/components/workflowProgress.ts frontend/src/components/__tests__/WorkflowNavProgress.test.tsx
git commit -m "feat(frontend): simplify navbar workflow progress"
```

### Task 3: Verify the focused change and guard against regressions

**Files:**
- Verify: `frontend/src/components/WorkflowNavProgress.tsx`
- Verify: `frontend/src/components/workflowProgress.ts`
- Verify: `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`

- [ ] **Step 1: Run the existing workflow progress tests alongside the new navbar tests**

Run from `frontend/`: `pnpm test -- --run src/components/__tests__/WorkflowNavProgress.test.tsx src/components/__tests__/WorkflowProgressBar.test.tsx`

Expected: PASS so the navbar refactor does not accidentally break shared workflow timing helpers used by the full-size progress bar.

- [ ] **Step 2: Run a TypeScript check for the frontend workspace**

Run from `frontend/`: `pnpm check`

Expected: PASS with no new type errors from the helper export or the refactored component branches.

- [ ] **Step 3: Inspect the final diff before handoff**

Run: `git diff -- frontend/src/components/WorkflowNavProgress.tsx frontend/src/components/workflowProgress.ts frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`

Expected: the diff removes segmented progress UI, adds the pulse motif, and adds targeted state coverage tests without touching workflow API code.

- [ ] **Step 4: Confirm the branch is clean after verification**

Run: `git status --short`

Expected: no output if verification did not require follow-up edits; if there is output, resolve it before handoff so the branch matches the verified diff.
