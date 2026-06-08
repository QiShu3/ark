import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ERCReviewFocusWork from './ERCReviewFocusWork';

const { fetchERCReviewNext, submitERCReview, fetchERCArticles, fetchERCArticle, apiJson } = vi.hoisted(() => ({
  fetchERCReviewNext: vi.fn(),
  submitERCReview: vi.fn(),
  fetchERCArticles: vi.fn(),
  fetchERCArticle: vi.fn(),
  apiJson: vi.fn(),
}));

vi.mock('../../lib/erc/api', () => ({
  fetchERCReviewNext,
  submitERCReview,
  fetchERCArticles,
  fetchERCArticle,
}));

vi.mock('../../lib/api', () => ({
  apiJson,
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

describe('ERCReviewFocusWork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchERCReviewNext.mockReset();
    submitERCReview.mockReset();
    fetchERCArticles.mockReset();
    fetchERCArticle.mockReset();
    apiJson.mockReset();
  });

  it('disables answer submission while focus work is paused', async () => {
    fetchERCReviewNext.mockResolvedValue(dueQuestion());

    render(
      <MemoryRouter>
        <ERCReviewFocusWork
          workflow={{
            state: 'focus',
            active_focus_work_type: 'erc_review',
            focus_work_display_state: 'fullscreen',
            is_paused: true,
          }}
          recordFocus
          onComplete={vi.fn()}
          onInterrupt={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Context paragraph.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交答案' })).toBeDisabled();
  });

  it('calls onFinished when no review items are due', async () => {
    fetchERCReviewNext.mockResolvedValue({
      has_item: false,
      next_due_at: null,
      article: null,
      paragraphs: [],
      question: null,
    });

    const onFinishedMock = vi.fn();

    render(
      <MemoryRouter>
        <ERCReviewFocusWork
          workflow={{
            state: 'focus',
            active_focus_work_type: 'erc_review',
            focus_work_display_state: 'fullscreen',
            is_paused: false,
          }}
          recordFocus
          onFinished={onFinishedMock}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(onFinishedMock).toHaveBeenCalled();
    });
  });

  it('supports resetting via registerResetCommand for extra practice flow', async () => {
    fetchERCReviewNext.mockResolvedValue({
      has_item: false,
      next_due_at: null,
      article: null,
      paragraphs: [],
      question: null,
    });

    fetchERCArticles.mockResolvedValue([
      { article_id: 'art-1', year: 2025, text_no: 1, title: 'Art Title' }
    ]);

    fetchERCArticle.mockResolvedValue({
      article_id: 'art-1',
      year: 2025,
      text_no: 1,
      title: 'Art Title',
      paragraphs: [{ paragraph_no: 1, text: 'Extra practice passage text.' }],
      questions: [{
        question_id: 'q-1',
        question_no: 1,
        stem: 'Extra question stem?',
        options: { A: 'Option A', B: 'Option B' }
      }]
    });

    submitERCReview.mockResolvedValue({
      correct_option: 'A',
      explanation: 'Matches text.'
    });

    let resetFn: (() => void) | undefined;
    const registerResetCommandMock = vi.fn((fn) => {
      resetFn = fn;
    });
    const onFinishedMock = vi.fn();
    const userEvent = (await import('@testing-library/user-event')).default.setup();

    render(
      <MemoryRouter>
        <ERCReviewFocusWork
          workflow={{
            state: 'focus',
            active_focus_work_type: 'erc_review',
            focus_work_display_state: 'fullscreen',
            is_paused: false,
          }}
          recordFocus
          registerResetCommand={registerResetCommandMock}
          onFinished={onFinishedMock}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(onFinishedMock).toHaveBeenCalled();
    });
    expect(registerResetCommandMock).toHaveBeenCalled();
    expect(resetFn).toBeDefined();

    const { act } = await import('@testing-library/react');
    await act(async () => {
      resetFn!();
    });

    // Should load the extra review question
    expect(await screen.findByText('Extra practice passage text.')).toBeInTheDocument();
    expect(screen.getByText('Extra question stem?')).toBeInTheDocument();

    // Select Option A and Submit
    const optionABtn = screen.getByRole('button', { name: /A/ });
    await userEvent.click(optionABtn);

    const submitBtn = screen.getByRole('button', { name: '提交答案' });
    await userEvent.click(submitBtn);

    expect(submitERCReview).toHaveBeenCalledWith('q-1', 'A');
  });
});
