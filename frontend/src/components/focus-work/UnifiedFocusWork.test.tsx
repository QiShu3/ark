import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UnifiedFocusWork from './UnifiedFocusWork';
import type { FocusWorkRunSummary } from './focusWorkTypes';

const { initUnifiedPool, submitUnifiedAnswer } = vi.hoisted(() => ({
  initUnifiedPool: vi.fn(),
  submitUnifiedAnswer: vi.fn(),
}));

vi.mock('../../lib/focus-work/unifiedApi', () => ({
  initUnifiedPool,
  submitUnifiedAnswer,
}));

const baseRun: FocusWorkRunSummary = {
  id: 'run-1',
  workflow_id: 'workflow-1',
  phase_index: 0,
  focus_work_type: 'choice',
  counts_for_task_completion: true,
  status: 'running',
  config_snapshot: {
    bank_id: 'bank-1',
    deliberate_config_id: 'cfg-1',
    primary_filter: 'all',
  },
};

describe('UnifiedFocusWork', () => {
  beforeEach(() => {
    initUnifiedPool.mockReset();
    submitUnifiedAnswer.mockReset();
  });

  it('renders choice questions with split layout when options_json is a JSON string', async () => {
    initUnifiedPool.mockResolvedValue({
      kind: 'choice',
      total: 2,
      matched: 2,
      warning: null,
      target_count: 2,
      first_question: {
        index: 0,
        id: 'q-1',
        question_id: 'question-1',
        stem: '若对如下的二叉树进行中序线索化，则结点 x 的左、右线索指向的结点分别是。\\n\\n![](/uploads/demo.png)',
        options_json: '{\"A\":\"e、c\",\"B\":\"e、a\",\"C\":\"d、c\",\"D\":\"b、a\"}',
        answer: 'D',
        answered: false,
        backflow_count: 0,
        wrong_count: 0,
        right_count: 0,
      },
    });

    render(<UnifiedFocusWork run={baseRun} disabled={false} onContentCompleted={vi.fn()} />);

    expect(await screen.findByLabelText('阅读原文')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Db、a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ae、c' })).toBeInTheDocument();
  });

  it('includes accuracy and duration in completion summary', async () => {
    const baseTime = new Date('2026-07-02T00:00:00Z').getTime();
    let currentTime = baseTime;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
    const user = userEvent.setup();
    const onContentCompleted = vi.fn();

    initUnifiedPool.mockResolvedValue({
      kind: 'choice',
      total: 1,
      matched: 1,
      warning: null,
      target_count: 1,
      first_question: {
        index: 0,
        id: 'q-1',
        question_id: 'question-1',
        stem: 'Question 1',
        options_json: '{"A":"Option A","B":"Option B"}',
        answer: 'A',
        answered: false,
        backflow_count: 0,
        wrong_count: 0,
        right_count: 0,
      },
    });
    submitUnifiedAnswer.mockResolvedValue({
      is_correct: true,
      next_question: null,
      done: true,
      answered_count: 1,
      correct_count: 1,
      total: 1,
      backflow_action: null,
      backflow_info: null,
      warning: null,
    });

    render(<UnifiedFocusWork run={baseRun} disabled={false} onContentCompleted={onContentCompleted} />);

    await screen.findByText('Question 1');
    currentTime += 27000;
    await user.click(screen.getByRole('button', { name: 'AOption A' }));
    await user.click(screen.getByRole('button', { name: '提交答案' }));
    await screen.findByText('专注完成');

    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith(expect.objectContaining({
        run_summary: expect.objectContaining({
          answered_count: 1,
          correct_count: 1,
          accuracy: 1,
          duration_seconds: 27,
        }),
      }));
    });
    nowSpy.mockRestore();
  });
});
