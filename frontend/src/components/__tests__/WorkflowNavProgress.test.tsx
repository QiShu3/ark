import { act, render, screen } from '@testing-library/react';
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

    expect(screen.getByText('专注中')).toBeInTheDocument();
    expect(screen.getByText('12:34')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /工作流进度/i })).toHaveAttribute('data-layout', 'compact');
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

    expect(screen.getByText('休息中')).toBeInTheDocument();
    expect(screen.getByText('02:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /工作流进度/i })).toHaveAttribute('data-layout', 'compact');
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
});
