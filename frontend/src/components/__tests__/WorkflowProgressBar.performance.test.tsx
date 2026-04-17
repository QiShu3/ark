import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import WorkflowProgressBar from '../WorkflowProgressBar';
import { estimateFps } from '../workflowProgress';

describe('WorkflowProgressBar performance baseline', () => {
  it('keeps average render cost under a stable jsdom threshold after warmup', () => {
    const phases = Array.from({ length: 24 }).map((_, idx) => ({
      phase_type: idx % 2 === 0 ? 'focus' as const : 'break' as const,
      duration: 60,
    }));

    const renderWorkflow = () => render(
      <WorkflowProgressBar
        workflow={{
          state: 'focus',
          phases,
          current_phase_index: 8,
          pending_confirmation: false,
          remaining_seconds: 20,
        }}
      />,
    );

    renderWorkflow().unmount();

    const runs = 5;
    let totalDuration = 0;
    for (let i = 0; i < runs; i += 1) {
      const start = performance.now();
      const view = renderWorkflow();
      totalDuration += performance.now() - start;
      view.unmount();
    }

    expect(totalDuration / runs).toBeLessThan(120);
  });

  it('meets 50fps baseline for 16ms frame interval', () => {
    expect(estimateFps(16)).toBeGreaterThanOrEqual(50);
  });
});
