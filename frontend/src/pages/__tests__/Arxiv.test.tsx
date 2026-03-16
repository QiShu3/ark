import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import '@testing-library/jest-dom';
import Arxiv from '../Arxiv';
import { apiJson } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

vi.mock('../../components/Navigation', () => ({
  default: () => <div data-testid="navigation">Navigation</div>,
}));
vi.mock('../../components/ChatBox', () => ({
  default: () => <div data-testid="chatbox">ChatBox</div>,
}));
vi.mock('../../components/AIAssistantShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('Arxiv Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiJson as Mock).mockImplementation(async (url: string, options?: { body?: string }) => {
      if (url === '/api/arxiv/daily/config') {
        return {
          user_id: 1,
          keywords: 'test',
          category: null,
          author: null,
          limit: 10,
          sort_by: 'submitted_date',
          sort_order: 'descending',
          search_field: 'title',
          update_time: '09:00',
          updated_at: '2026-01-01T09:00:00Z',
          last_run_on: '2026-01-01',
        };
      }
      if (url === '/api/arxiv/daily/candidates') return [];
      if (url === '/api/arxiv/daily/summary') return { summary: 'summary' };
      if (url === '/api/arxiv/papers?limit=200') return [];
      if (url === '/api/arxiv/papers?limit=500') {
        return [
          { user_id: 1, arxiv_id: '2501.00001', is_favorite: true, is_read: true, is_skipped: false },
          { user_id: 1, arxiv_id: '2501.00002', is_favorite: false, is_read: false, is_skipped: true },
        ];
      }
      if (url === '/api/arxiv/papers/details') {
        const payload = options?.body ? JSON.parse(options.body) : { arxiv_ids: [] };
        return (payload.arxiv_ids as string[]).map((id) => ({
          arxiv_id: id,
          title: `Paper ${id}`,
          authors: ['Author'],
          published: '2026-01-01T00:00:00Z',
          summary: 'Summary',
        }));
      }
      return {};
    });
  });

  it('renders in collapsed state by default', async () => {
    render(<Arxiv />);
    expect(screen.getByText('每日配置更改')).toBeInTheDocument();
    expect(await screen.findByText(/最近刷新/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('关键词')).not.toBeInTheDocument();
  });

  it('expands configuration on button click', async () => {
    const user = userEvent.setup();
    render(<Arxiv />);

    await user.click(screen.getByText('每日配置更改'));

    expect(screen.getByPlaceholderText('关键词')).toBeInTheDocument();
    expect(screen.getByText('保存每日配置')).toBeInTheDocument();
  });

  it('collapses after saving configuration', async () => {
    const user = userEvent.setup();
    render(<Arxiv />);

    await user.click(screen.getByText('每日配置更改'));

    expect(screen.getByPlaceholderText('关键词')).toBeInTheDocument();

    const saveBtn = screen.getByText('保存每日配置');
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('关键词')).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('supports paper collection navigation', async () => {
    const user = userEvent.setup();
    render(<Arxiv />);

    await user.click(screen.getByText('论文集'));

    expect(await screen.findByRole('button', { name: '全部' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '收藏' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '已读' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '跳过' }).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: '已读' })[0]);
    await user.click(screen.getByText('搜索'));
    await user.click(screen.getByText('论文集'));

    const allButton = screen.getByRole('button', { name: '全部' });
    expect(allButton.className).toContain('bg-blue-500');
  });

  it('dedupes arxiv ids in 全部 collection union', async () => {
    const user = userEvent.setup();
    render(<Arxiv />);

    await user.click(screen.getByText('论文集'));
    await screen.findByText('Paper 2501.00001');

    const detailsCall = (apiJson as Mock).mock.calls.find(
      ([url]: [string]) => url === '/api/arxiv/papers/details',
    );
    expect(detailsCall).toBeDefined();
    const detailsBody = JSON.parse(detailsCall?.[1]?.body ?? '{"arxiv_ids":[]}');
    expect(detailsBody.arxiv_ids).toEqual(['2501.00001', '2501.00002']);
  });
});
