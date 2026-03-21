import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import WorkflowProgressBar from '../WorkflowProgressBar';
import { estimateFps } from '../workflowProgress';

describe('WorkflowProgressBar performance baseline', () => {
  it('keeps first render under 100ms', () => {
    const phases = Array.from({ length: 24 }).map((_, idx) => ({
      phase_type: idx % 2 === 0 ? 'focus' as const : 'break' as const,
      duration: 60,
    }));

    const start = performance.now();
    render(
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
    const end = performance.now();

    expect(end - start).toBeLessThan(100);
  });

  it('meets 50fps baseline for 16ms frame interval', () => {
    expect(estimateFps(16)).toBeGreaterThanOrEqual(50);
  });
});
