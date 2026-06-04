import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Review from '../Review';

const { fetchERCReviewNext, submitERCReview } = vi.hoisted(() => ({
  fetchERCReviewNext: vi.fn(),
  submitERCReview: vi.fn(),
}));

vi.mock('../../../lib/erc/api', () => ({
  fetchERCReviewNext,
  submitERCReview,
}));

describe('ERC review page', () => {
  beforeEach(() => {
    fetchERCReviewNext.mockReset();
    submitERCReview.mockReset();
  });

  it('shows empty state when no due question exists', async () => {
    fetchERCReviewNext.mockResolvedValue({
      has_item: false,
      next_due_at: null,
      article: null,
      paragraphs: [],
      question: null,
    });

    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    expect(await screen.findByText('暂无到期复习')).toBeInTheDocument();
  });

  it('renders due question context on a frosted reading surface', async () => {
    fetchERCReviewNext.mockResolvedValue({
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
    });

    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Context paragraph.')).toBeInTheDocument();
    expect(screen.getByLabelText('阅读原文')).toBeInTheDocument();
  });
});
