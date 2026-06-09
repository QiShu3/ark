import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ERCReviewFocusWork from './ERCReviewFocusWork';
import type { FocusWorkRunSummary } from '../focus-work/focusWorkTypes';

const { fetchERCArticle, fetchERCArticles, fetchERCMistakes, fetchERCReviewNext, submitERCReview } = vi.hoisted(() => ({
  fetchERCArticle: vi.fn(),
  fetchERCArticles: vi.fn(),
  fetchERCMistakes: vi.fn(),
  fetchERCReviewNext: vi.fn(),
  submitERCReview: vi.fn(),
}));

vi.mock('../../lib/erc/api', () => ({
  fetchERCArticle,
  fetchERCArticles,
  fetchERCMistakes,
  fetchERCReviewNext,
  submitERCReview,
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

function articleDetail() {
  return {
    article_id: 'kaoyan2_2025_text2',
    set_id: 'set-1',
    exam: '考研英语二',
    year: 2025,
    text_no: 2,
    title: 'Test Article',
    paragraphs: [{ paragraph_no: 1, text: 'Library paragraph.' }],
    questions: [
      {
        question_id: 'kaoyan2_2025_text2_q26',
        question_no: 26,
        stem: 'Question 26?',
        options: { A: 'A1', B: 'B1', C: 'C1', D: 'D1' },
      },
    ],
    last_attempt_at: null,
    vocabulary_summary: null,
  };
}

const reviewRun: FocusWorkRunSummary = {
  id: 'run-1',
  workflow_id: 'workflow-1',
  phase_index: 0,
  focus_work_type: 'erc_review',
  counts_for_task_completion: true,
  status: 'running',
  config_snapshot: {},
};

describe('ERCReviewFocusWork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchERCArticle.mockReset();
    fetchERCArticles.mockReset();
    fetchERCMistakes.mockReset();
    fetchERCReviewNext.mockReset();
    submitERCReview.mockReset();
  });

  it('disables answer submission while focus work is paused', async () => {
    fetchERCReviewNext.mockResolvedValue(dueQuestion());

    render(
      <MemoryRouter>
        <ERCReviewFocusWork
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
    fetchERCReviewNext.mockResolvedValue({
      has_item: false,
      next_due_at: null,
      article: null,
      paragraphs: [],
      question: null,
    });

    const onContentCompleted = vi.fn();

    render(
      <MemoryRouter>
        <ERCReviewFocusWork
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

  it('loads library review content for an extra run when no due review item exists', async () => {
    fetchERCReviewNext.mockResolvedValue({
      has_item: false,
      next_due_at: null,
      article: null,
      paragraphs: [],
      question: null,
    });
    fetchERCMistakes.mockResolvedValue([]);
    fetchERCArticles.mockResolvedValue([
      {
        article_id: 'kaoyan2_2025_text2',
        set_id: 'set-1',
        year: 2025,
        text_no: 2,
        title: 'Test Article',
        status: 'practiced',
        question_count: 1,
        mistake_count: 0,
        last_attempt_at: null,
      },
    ]);
    fetchERCArticle.mockResolvedValue(articleDetail());
    const onContentCompleted = vi.fn();

    render(
      <MemoryRouter>
        <ERCReviewFocusWork
          run={{ ...reviewRun, counts_for_task_completion: false }}
          disabled={false}
          onContentCompleted={onContentCompleted}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Library paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Question 26?')).toBeInTheDocument();
    expect(onContentCompleted).not.toHaveBeenCalled();
  });

  it('emits content completion after the configured question target is answered', async () => {
    const user = userEvent.setup();
    fetchERCReviewNext.mockResolvedValue(dueQuestion());
    submitERCReview.mockResolvedValue({
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
        <ERCReviewFocusWork
          run={{ ...reviewRun, config_snapshot: { daily_question_target: 1 } }}
          disabled={false}
          onContentCompleted={onContentCompleted}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Context paragraph.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'AA1' }));
    await user.click(screen.getByRole('button', { name: '提交答案' }));

    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith({ answered_count: 1, target_question_count: 1 });
    });
  });
});
