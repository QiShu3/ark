import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

import Navigation from '../Navigation';
import { apiJson, checkIn, getCheckInStatus } from '../../lib/api';
import { useAuthStore, type User } from '../../lib/auth';
import { HOME_ONBOARDING_RESTART_EVENT, HOME_ONBOARDING_STORAGE_KEY } from '../../lib/onboardingEvents';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
  checkIn: vi.fn(),
  getCheckInStatus: vi.fn(),
}));

const mockApiJson = vi.mocked(apiJson);
const mockCheckIn = vi.mocked(checkIn);
const mockGetCheckInStatus = vi.mocked(getCheckInStatus);

function PathProbe() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

function renderNavigation(initialPath = '/flash', userOverrides: Partial<User> = {}) {
  useAuthStore.getState().setSession('token', 3600);
  useAuthStore.getState().setUser({
    id: 1,
    username: 'qishu',
    email: 'qishu@example.com',
    is_active: true,
    is_admin: false,
    created_at: '2026-05-14T00:00:00Z',
    ...userOverrides,
  });

  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Navigation />
      <PathProbe />
    </MemoryRouter>,
  );
}

describe('Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useAuthStore.getState().clear();
    mockCheckIn.mockResolvedValue(undefined);
    mockGetCheckInStatus.mockResolvedValue({
      is_checked_in_today: true,
      current_streak: 7,
      total_days: 20,
      checked_dates: ['2026-05-14'],
    });
  });

  it('locks page navigation and calendar entry while fullscreen focus work is active', async () => {
    const user = userEvent.setup();
    mockApiJson.mockResolvedValue({
      state: 'focus',
      current_phase_index: 0,
      phases: [{ phase_type: 'focus', duration: 1500, focus_work_type: 'vocab_today' }],
      pending_confirmation: false,
      pending_task_selection: false,
      remaining_seconds: 1200,
      elapsed_seconds: 300,
      active_focus_work_type: 'vocab_today',
      focus_work_display_state: 'fullscreen',
    });

    renderNavigation();

    await waitFor(() => expect(screen.getByLabelText('打开导航栏日历')).toBeDisabled());
    expect(screen.getByLabelText('重新进入首次体验引导')).toBeDisabled();

    await user.click(screen.getByLabelText('打开导航栏日历'));
    await user.click(screen.getByLabelText('重新进入首次体验引导'));

    expect(screen.getByTestId('current-path')).toHaveTextContent('/flash');
    expect(screen.queryByRole('dialog', { name: '多周安排日历' })).not.toBeInTheDocument();
  });

  it('keeps navigation locked while fullscreen task focus is paused', async () => {
    mockApiJson.mockResolvedValue({
      state: 'focus',
      current_phase_index: 0,
      phases: [{ phase_type: 'focus', duration: 1500, task_id: 'task-1' }],
      task_id: 'task-1',
      task_title: '撰写周报',
      pending_confirmation: false,
      pending_task_selection: false,
      remaining_seconds: 1200,
      elapsed_seconds: 300,
      active_focus_work_type: 'task_focus',
      focus_work_display_state: 'fullscreen',
      is_paused: true,
    });

    renderNavigation();

    await waitFor(() => expect(screen.getByLabelText('打开导航栏日历')).toBeDisabled());
  });

  it('clears the current session and redirects to login when logging out', async () => {
    const user = userEvent.setup();
    mockApiJson.mockResolvedValue(null);

    renderNavigation('/apps');

    await user.click(screen.getByRole('button', { name: '打开用户菜单' }));
    expect(screen.queryByRole('button', { name: '管理页面' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'UI 组件库' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '退出登录' }));

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().expiresAt).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
  });

  it('shows the admin dashboard entry for admins and redirects to it', async () => {
    const user = userEvent.setup();
    mockApiJson.mockResolvedValue(null);

    const originalLocation = window.location;
    Reflect.deleteProperty(window, 'location');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
      writable: true,
    });

    renderNavigation('/apps', { is_admin: true });

    await user.click(screen.getByRole('button', { name: '打开用户菜单' }));
    const adminButton = screen.getByRole('button', { name: '管理页面' });
    expect(adminButton).toBeInTheDocument();

    await user.click(adminButton);
    expect(window.location.href).toBe('/admin/');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
  });

  it('shows the UI library entry for admins and navigates to it', async () => {
    const user = userEvent.setup();
    mockApiJson.mockResolvedValue(null);

    renderNavigation('/apps', { is_admin: true });

    await user.click(screen.getByRole('button', { name: '打开用户菜单' }));
    await user.click(screen.getByRole('button', { name: 'UI 组件库' }));

    expect(screen.getByTestId('current-path')).toHaveTextContent('/admin/ui');
  });

  it('uses the navbar logo as a home entry', async () => {
    const user = userEvent.setup();
    mockApiJson.mockResolvedValue(null);

    renderNavigation('/erc');

    const homeButton = screen.getByRole('button', { name: '返回首页' });
    expect(homeButton).toBeInTheDocument();
    expect(homeButton).toContainElement(screen.getByRole('presentation', { hidden: true }));

    await user.click(homeButton);

    expect(screen.getByTestId('current-path')).toHaveTextContent('/');
  });

  it('adds a book entry beside the brand to restart the first-experience guide', async () => {
    const user = userEvent.setup();
    const restartListener = vi.fn();
    mockApiJson.mockResolvedValue(null);
    window.localStorage.setItem(HOME_ONBOARDING_STORAGE_KEY, 'done');
    window.addEventListener(HOME_ONBOARDING_RESTART_EVENT, restartListener);

    try {
      renderNavigation('/apps');

      await user.click(screen.getByLabelText('重新进入首次体验引导'));

      expect(window.localStorage.getItem(HOME_ONBOARDING_STORAGE_KEY)).toBeNull();
      expect(restartListener).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('current-path')).toHaveTextContent('/');
    } finally {
      window.removeEventListener(HOME_ONBOARDING_RESTART_EVENT, restartListener);
    }
  });

  it('quick toggles the resolved theme from the navbar', async () => {
    const user = userEvent.setup();
    mockApiJson.mockResolvedValue(null);
    window.localStorage.setItem('ark-theme-preference', 'light');

    renderNavigation('/apps');

    const toggle = await screen.findByRole('button', { name: '切换为夜间模式' });
    await user.click(toggle);

    expect(window.localStorage.getItem('ark-theme-preference')).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('disables the theme toggle while fullscreen focus work is active', async () => {
    mockApiJson.mockResolvedValue({
      state: 'focus',
      current_phase_index: 0,
      phases: [{ phase_type: 'focus', duration: 1500, focus_work_type: 'vocab_today' }],
      pending_confirmation: false,
      pending_task_selection: false,
      remaining_seconds: 1200,
      elapsed_seconds: 300,
      active_focus_work_type: 'vocab_today',
      focus_work_display_state: 'fullscreen',
    });

    renderNavigation();

    await waitFor(() => expect(screen.getByRole('button', { name: '切换外观模式' })).toBeDisabled());
  });
});
