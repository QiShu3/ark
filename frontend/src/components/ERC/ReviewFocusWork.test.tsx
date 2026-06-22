import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ReviewFocusWork from './ReviewFocusWork';
import type { FocusWorkRunSummary } from '../focus-work/focusWorkTypes';

const { fetchChoiceReviewNext, fetchChoiceItems, submitChoiceAnswer } = vi.hoisted(() => ({
  fetchChoiceReviewNext: vi.fn(),
  fetchChoiceItems: vi.fn(),
  submitChoiceAnswer: vi.fn(),
}));

vi.mock('../../lib/choice/api', () => ({
  fetchChoiceReviewNext,
  fetchChoiceItems,
  submitChoiceAnswer,
}));

function dueQuestion() {
  return {
    has_item: true,
    next_due_at: null,
    article: { article_id: 'kaoyan2_2025_text2', year: 2025, text_no: 2, title: 'Test Article' },
    paragraphs: [{ paragraph_no: 1, text: 'Context paragraph.' }],
    question: {
      question_id: 'kaoyan2_2025_text2_q26',
      question_no: 26,
      stem: 'Question 26?',
      options: { A: 'A1', B: 'B1', C: 'C1', D: 'D1' },
    },
  };
}

const reviewRun: FocusWorkRunSummary = {
  id: 'run-1',
  workflow_id: 'workflow-1',
  phase_index: 0,
  focus_work_type: 'review',
  counts_for_task_completion: true,
  status: 'running',
  config_snapshot: {
    choice_scope: { bank_id: 'set-1' },
  },
};

describe('ReviewFocusWork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchChoiceReviewNext.mockReset();
    fetchChoiceItems.mockReset();
    submitChoiceAnswer.mockReset();
  });

  it('disables answer submission while focus work is paused', async () => {
    fetchChoiceReviewNext.mockResolvedValue(dueQuestion());
    fetchChoiceItems.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ReviewFocusWork
          run={reviewRun}
          disabled
          onContentCompleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Context paragraph.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交答案' })).toBeDisabled();
  });

  it('emits content completion when no review items are due', async () => {
    fetchChoiceReviewNext.mockResolvedValue({
      has_item: false,
      next_due_at: null,
      article: null,
      paragraphs: [],
      question: null,
    });
    fetchChoiceItems.mockResolvedValue([]);

    const onContentCompleted = vi.fn();

    render(
      <MemoryRouter>
        <ReviewFocusWork
          run={reviewRun}
          disabled={false}
          onContentCompleted={onContentCompleted}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith(expect.objectContaining({ answered_count: 0, no_available_content: true }));
    });
  });

  it('submits through choice API and shows the next-question action after feedback', async () => {
    const user = userEvent.setup();
    fetchChoiceReviewNext.mockResolvedValue(dueQuestion());
    fetchChoiceItems.mockResolvedValue([]);
    submitChoiceAnswer.mockResolvedValue({
      question_id: 'kaoyan2_2025_text2_q26',
      chosen_option: 'A',
      correct_option: 'B',
      is_correct: false,
      rating: 'again',
      next_review_at: null,
    });

    render(
      <MemoryRouter>
        <ReviewFocusWork
          run={reviewRun}
          disabled={false}
          onContentCompleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Context paragraph.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /A1/ }));
    await user.click(screen.getByRole('button', { name: '提交答案' }));

    await waitFor(() => {
      expect(submitChoiceAnswer).toHaveBeenCalledWith('kaoyan2_2025_text2_q26', 'A', 'review');
    });
    expect(await screen.findByRole('button', { name: '下一题' })).toBeInTheDocument();
  });

  it('emits content completion after the configured question target is answered', async () => {
    const user = userEvent.setup();
    fetchChoiceReviewNext.mockResolvedValue(dueQuestion());
    fetchChoiceItems.mockResolvedValue([]);
    submitChoiceAnswer.mockResolvedValue({
      question_id: 'kaoyan2_2025_text2_q26',
      chosen_option: 'A',
      correct_option: 'A',
      is_correct: true,
      rating: 'good',
      next_review_at: null,
    });
    const onContentCompleted = vi.fn();

    render(
      <MemoryRouter>
        <ReviewFocusWork
          run={{ ...reviewRun, config_snapshot: { choice_scope: { bank_id: 'set-1' }, daily_question_target: 1 } }}
          disabled={false}
          onContentCompleted={onContentCompleted}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Context paragraph.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /A1/ }));
    await user.click(screen.getByRole('button', { name: '提交答案' }));

    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith({ answered_count: 1, target_question_count: 1 });
    });
  });

  it('shows error when bank_id is missing', async () => {
    render(
      <MemoryRouter>
        <ReviewFocusWork
          run={{ ...reviewRun, config_snapshot: {} }}
          disabled={false}
          onContentCompleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('未配置题库')).toBeInTheDocument();
  });
});
