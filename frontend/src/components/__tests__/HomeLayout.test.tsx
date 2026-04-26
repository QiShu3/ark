import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import App from '../../App';
import RequireAuth from '../../routes/RequireAuth';
import { useAuthStore } from '../../lib/auth';

const leftPanelSpy = vi.fn(({ collapsed }: { collapsed: boolean }) => (
  <div data-testid="left-panel" data-collapsed={String(collapsed)} />
));

const rightPanelSpy = vi.fn(({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => (
  <button data-testid="right-panel-toggle" data-collapsed={String(collapsed)} onClick={onToggle}>
    toggle
  </button>
));

vi.mock('../Navigation', () => ({
  default: () => <div data-testid="navigation">Navigation</div>,
}));

vi.mock('../LeftPanel', () => ({
  default: (props: { collapsed: boolean }) => leftPanelSpy(props),
}));

vi.mock('../RightPanel', () => ({
  default: (props: { collapsed: boolean; onToggle: () => void }) => rightPanelSpy(props),
}));

describe('App home layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useAuthStore.getState().clear();
  });

  it('defaults to expanded and persists collapsed state after toggle', async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByTestId('left-panel')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('right-panel-toggle')).toHaveAttribute('data-collapsed', 'false');

    await user.click(screen.getByTestId('right-panel-toggle'));

    expect(screen.getByTestId('left-panel')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByTestId('right-panel-toggle')).toHaveAttribute('data-collapsed', 'true');
    expect(window.localStorage.getItem('ark-home-right-panel-collapsed')).toBe('true');
  });

  it('restores a previously collapsed state from localStorage', () => {
    window.localStorage.setItem('ark-home-right-panel-collapsed', 'true');

    render(<App />);

    expect(screen.getByTestId('left-panel')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByTestId('right-panel-toggle')).toHaveAttribute('data-collapsed', 'true');
  });

  it('shows the ICP备案 footer link on the authenticated home layout', () => {
    useAuthStore.getState().setSession('token', 3600);

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/" element={<App />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '粤ICP备2026047635号' })).toHaveAttribute(
      'href',
      'https://beian.miit.gov.cn/',
    );
  });
});
