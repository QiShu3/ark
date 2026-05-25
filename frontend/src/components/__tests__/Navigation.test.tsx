import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

import Navigation from '../Navigation';
import { apiJson, checkIn, getCheckInStatus } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
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

function renderNavigation(initialPath = '/vocab') {
  useAuthStore.getState().setSession('token', 3600);
  useAuthStore.getState().setUser({
    id: 1,
    username: 'qishu',
    is_active: true,
    is_admin: false,
    created_at: '2026-05-14T00:00:00Z',
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

    await waitFor(() => expect(screen.getByRole('button', { name: 'Home' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Apps' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'About' })).toBeDisabled();
    expect(screen.getByLabelText('打开导航栏日历')).toBeDisabled();
    expect(screen.getByLabelText('重新进入首次体验引导')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Home' }));
    await user.click(screen.getByRole('button', { name: 'Apps' }));
    await user.click(screen.getByRole('button', { name: 'About' }));
    await user.click(screen.getByLabelText('打开导航栏日历'));
    await user.click(screen.getByLabelText('重新进入首次体验引导'));

    expect(screen.getByTestId('current-path')).toHaveTextContent('/vocab');
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

    await waitFor(() => expect(screen.getByRole('button', { name: 'Home' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Apps' })).toBeDisabled();
    expect(screen.getByLabelText('打开导航栏日历')).toBeDisabled();
  });

  it('clears the current session and redirects to login when logging out', async () => {
    const user = userEvent.setup();
    mockApiJson.mockResolvedValue(null);

    renderNavigation('/apps');

    await user.click(screen.getByRole('button', { name: '退出登录' }));

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().expiresAt).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
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
});
