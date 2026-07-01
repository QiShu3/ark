import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import AppCenter from '../AppCenter';

vi.mock('../../lib/appRegistry', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/appRegistry')>();
  return {
    ...mod,
    loadAppRegistry: vi.fn().mockResolvedValue([
      {
        id: 'flash',
        name: '背单词',
        description: '切换词书并开始今日学习',
        icon: 'book-open',
        route: '/flash',
        focusWorks: [],
        sections: ['hero', 'asset', 'arrangements'],
      },
      {
        id: 'choice',
        name: '阅读训练',
        description: '整篇练习并进入 FSRS 复习池',
        icon: 'scroll-text',
        route: '/erc',
        focusWorks: [],
        sections: ['hero', 'asset', 'arrangements'],
      },
    ]),
  };
});

describe('AppCenter', () => {
  it('only shows the launchers that remain in scope', async () => {
    render(
      <MemoryRouter>
        <AppCenter />
      </MemoryRouter>,
    );

    expect(screen.getByText('应用中心')).toBeInTheDocument();
    expect(screen.getByRole('main', { name: '应用中心' })).toHaveClass('ark-page');
    expect(await screen.findByText('背单词')).toBeInTheDocument();
    expect(screen.getByText('阅读训练')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText('添加应用')).not.toBeInTheDocument();
  });
});
