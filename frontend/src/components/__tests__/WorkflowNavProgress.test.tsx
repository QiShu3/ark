import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, afterEach } from 'vitest';
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
  afterEach(() => {
    vi.useRealTimers();
  });

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T00:10:00Z'));

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
