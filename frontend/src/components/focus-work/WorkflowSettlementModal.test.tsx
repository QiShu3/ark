import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import WorkflowSettlementModal from './WorkflowSettlementModal';
import type { WorkflowSettlement } from './focusWorkTypes';

const baseSettlement: WorkflowSettlement = {
  workflow_name: '刻意学习流',
  result: '完成',
  phases: [],
  nodes: [],
  total_phases: 0,
  total_answered: 0,
  total_correct: 0,
  total_accuracy: null,
  total_duration_seconds: 0,
  fork_count: 0,
  retry_count: 0,
  best_accuracy: null,
  first_try_passed_count: 0,
};

describe('WorkflowSettlementModal', () => {
  it('shows sub-minute durations instead of an empty duration label', () => {
    render(
      <WorkflowSettlementModal
        open
        settlement={{
          ...baseSettlement,
          nodes: [
            {
              name: 'A 英语二阅读',
              focus_work_type: 'choice',
              answered_count: 2,
              correct_count: 0,
              accuracy: 0,
              duration_seconds: 45,
              status: 'failed',
              is_return_node: false,
              return_to_name: null,
              children: [],
            },
          ],
          total_duration_seconds: 45,
        }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('<1m')).toBeInTheDocument();
    expect(screen.getByText(/用时 <1m/)).toBeInTheDocument();
  });

  it('formats ratio accuracy values as percentages', () => {
    render(
      <WorkflowSettlementModal
        open
        settlement={{
          ...baseSettlement,
          nodes: [{
            name: 'A 数据结构巩固',
            focus_work_type: 'choice',
            answered_count: 3,
            correct_count: 2,
            accuracy: 2 / 3,
            duration_seconds: 15,
            status: 'passed',
            is_return_node: false,
            return_to_name: null,
            children: [],
          }],
          best_accuracy: 2 / 3,
        }}
        onClose={() => {}}
      />,
    );

    expect(screen.getAllByText('67%')).toHaveLength(2);
  });
});
