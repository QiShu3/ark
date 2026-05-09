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
});
