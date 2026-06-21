import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import AppCenter from '../AppCenter';

describe('AppCenter', () => {
  it('only shows the launchers that remain in scope', () => {
    render(
      <MemoryRouter>
        <AppCenter />
      </MemoryRouter>,
    );

    expect(screen.getByText('应用中心')).toBeInTheDocument();
    expect(screen.getByRole('main', { name: '应用中心' })).toHaveClass('ark-page');
    expect(screen.getByText('背单词')).toBeInTheDocument();
    expect(screen.getByText('阅读训练')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByText('添加应用')).not.toBeInTheDocument();
  });
});
