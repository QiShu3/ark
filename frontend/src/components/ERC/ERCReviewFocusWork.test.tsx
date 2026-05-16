import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ERCReviewFocusWork from './ERCReviewFocusWork';

const { fetchERCReviewNext, submitERCReview } = vi.hoisted(() => ({
  fetchERCReviewNext: vi.fn(),
  submitERCReview: vi.fn(),
}));

vi.mock('../../lib/erc/api', () => ({
  fetchERCReviewNext,
  submitERCReview,
}));

function dueQuestion() {
  return {
    has_item: true,
    next_due_at: null,
    article: { article_id: 'kaoyan2_2025_text2', year: 2025, text_no: 2, title: '' },
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
    fetchERCReviewNext.mockReset();
    submitERCReview.mockReset();
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
});
