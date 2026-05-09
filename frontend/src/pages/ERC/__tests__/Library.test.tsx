import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Library from '../Library';

const { fetchERCArticles, fetchERCSets } = vi.hoisted(() => ({
  fetchERCArticles: vi.fn(),
  fetchERCSets: vi.fn(),
}));

vi.mock('../../../lib/erc/api', () => ({
  fetchERCArticles,
  fetchERCSets,
}));

describe('ERC library page', () => {
  beforeEach(() => {
    fetchERCArticles.mockReset();
    fetchERCSets.mockReset();
  });

  it('filters articles by exam', async () => {
    fetchERCSets.mockResolvedValue([
      {
        id: 'set-1',
        key: 'kaoyan1_2020_2025',
        name: '考研英语一',
        description: '',
        exam: '考研英语一',
        article_count: 24,
        question_count: 120,
      },
      {
        id: 'set-2',
        key: 'kaoyan2_2020_2025',
        name: '考研英语二',
        description: '',
        exam: '考研英语二',
        article_count: 24,
        question_count: 120,
      },
    ]);
    fetchERCArticles.mockResolvedValue([
      {
        article_id: 'kaoyan2_2025_text1',
        set_id: 'set-2',
        year: 2025,
        text_no: 1,
        title: '',
        status: 'unstarted',
        question_count: 5,
        mistake_count: 0,
        last_attempt_at: null,
      },
    ]);

    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: '全部' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '考研英语二' }));

    expect(fetchERCArticles).toHaveBeenLastCalledWith({ exam: '考研英语二' });
  });
});
