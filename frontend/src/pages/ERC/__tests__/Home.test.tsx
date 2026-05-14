import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '../Home';

const { fetchERCOverview } = vi.hoisted(() => ({
  fetchERCOverview: vi.fn(),
}));

vi.mock('../../../lib/erc/api', () => ({
  fetchERCOverview,
}));

describe('ERC home page', () => {
  beforeEach(() => {
    fetchERCOverview.mockReset();
  });

  it('renders reading training summary and primary links', async () => {
    fetchERCOverview.mockResolvedValue({
      due_review_count: 3,
      practiced_article_count: 8,
      practiced_question_count: 40,
      accuracy: 0.75,
      mistake_count: 5,
      recommended_article: { article_id: 'kaoyan2_2025_text1', year: 2025, text_no: 1, title: '' },
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText('阅读训练')).toBeInTheDocument();
    expect(screen.getByText('今日待复习')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入题库' })).toHaveAttribute('href', '/erc/library');
    const startFocusSpy = vi.fn();
    window.addEventListener('ark:start-focus-work', startFocusSpy);
    const reviewButton = screen.getByRole('button', { name: '开始复习' });
    fireEvent.click(reviewButton);
    expect(startFocusSpy).toHaveBeenCalledTimes(1);
    expect((startFocusSpy.mock.calls[0][0] as CustomEvent).detail).toEqual({ focusWorkType: 'erc_review' });
    expect(reviewButton).toHaveClass('bg-white/10', 'backdrop-blur-xl');
    window.removeEventListener('ark:start-focus-work', startFocusSpy);
    expect(screen.getByRole('link', { name: '查看错题' })).toHaveAttribute('href', '/erc/mistakes');
    expect(screen.getByRole('link', { name: '查看错题' })).toHaveClass('bg-white/10', 'backdrop-blur-xl');
  });
});
