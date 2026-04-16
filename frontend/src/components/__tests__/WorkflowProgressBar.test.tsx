import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';

import WorkflowProgressBar from '../WorkflowProgressBar';
import { computeWorkflowProgress } from '../workflowProgress';

describe('computeWorkflowProgress', () => {
  it('calculates elapsed and percent by current remaining seconds', () => {
    const metrics = computeWorkflowProgress({
      state: 'focus',
      phases: [
        { phase_type: 'focus', duration: 60 },
        { phase_type: 'break', duration: 30 },
        { phase_type: 'focus', duration: 90 },
      ],
      current_phase_index: 1,
      pending_confirmation: false,
      remaining_seconds: 15,
    });

    expect(metrics.totalSeconds).toBe(180);
    expect(metrics.elapsedSeconds).toBe(75);
    expect(Math.round(metrics.percent)).toBe(42);
    expect(metrics.activePhaseIndex).toBe(1);
  });

  it('handles pending confirmation as fully elapsed in current phase', () => {
    const metrics = computeWorkflowProgress({
      state: 'break',
      phases: [
        { phase_type: 'focus', duration: 120 },
        { phase_type: 'break', duration: 30 },
      ],
      current_phase_index: 1,
      pending_confirmation: true,
      remaining_seconds: 0,
    });

    expect(metrics.elapsedSeconds).toBe(150);
    expect(metrics.percent).toBe(100);
  });

  it('uses elapsed seconds for countup focus phases', () => {
    const metrics = computeWorkflowProgress({
      state: 'focus',
      phases: [
        { phase_type: 'focus', duration: 1500, timer_mode: 'countup', task_id: null },
        { phase_type: 'break', duration: 300 },
      ],
      current_phase_index: 0,
      pending_confirmation: false,
      pending_task_selection: false,
      remaining_seconds: null,
      elapsed_seconds: 600,
      phase_timer_mode: 'countup',
    });

    expect(metrics.totalSeconds).toBe(1800);
    expect(metrics.elapsedSeconds).toBe(600);
    expect(Math.round(metrics.percent)).toBe(33);
  });

  it('returns zero metrics for invalid boundaries', () => {
    const metrics = computeWorkflowProgress({
      state: 'normal',
      phases: [],
      current_phase_index: 0,
      pending_confirmation: false,
      remaining_seconds: null,
    });

    expect(metrics.totalSeconds).toBe(0);
    expect(metrics.percent).toBe(0);
  });
});

describe('WorkflowProgressBar', () => {
  it('renders dynamic nodes and progress text', () => {
    render(
      <WorkflowProgressBar
        workflow={{
          state: 'focus',
          phases: [
            { phase_type: 'focus', duration: 60 },
            { phase_type: 'break', duration: 60 },
            { phase_type: 'focus', duration: 60 },
            { phase_type: 'break', duration: 60 },
          ],
          current_phase_index: 2,
          pending_confirmation: false,
          remaining_seconds: 30,
        }}
      />,
    );

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toBeInTheDocument();
    expect(progressbar).toHaveAttribute('aria-valuenow', '63');
    expect(screen.getByText('63%')).toBeInTheDocument();
    expect(screen.getAllByText(/阶段/).length).toBeGreaterThan(0);
  });

  it('keeps fill transition smooth on workflow updates', () => {
    const { rerender, container } = render(
      <WorkflowProgressBar
        workflow={{
          state: 'focus',
          phases: [
            { phase_type: 'focus', duration: 100 },
            { phase_type: 'break', duration: 100 },
          ],
          current_phase_index: 0,
          pending_confirmation: false,
          remaining_seconds: 100,
        }}
      />,
    );

    rerender(
      <WorkflowProgressBar
        workflow={{
          state: 'focus',
          phases: [
            { phase_type: 'focus', duration: 100 },
            { phase_type: 'break', duration: 100 },
          ],
          current_phase_index: 0,
          pending_confirmation: false,
          remaining_seconds: 60,
        }}
      />,
    );

    const fill = container.querySelector('div[style*="transition: width 400ms linear"]');
    expect(fill).toBeInTheDocument();
  });

  it('renders countup focus phases with elapsed time and target hint', () => {
    render(
      <WorkflowProgressBar
        workflow={{
          state: 'focus',
          phases: [{ phase_type: 'focus', duration: 1500, timer_mode: 'countup', task_id: null }],
          current_phase_index: 0,
          pending_confirmation: false,
          pending_task_selection: false,
          remaining_seconds: null,
          elapsed_seconds: 600,
          phase_timer_mode: 'countup',
        }}
      />,
    );

    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('目标 25:00')).toBeInTheDocument();
  });
});
