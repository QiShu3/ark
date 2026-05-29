import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsModal from '../SettingsModal';
import { useAuthStore } from '../../lib/auth';

vi.mock('../../lib/api', () => ({
  uploadFile: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue({}),
  getUserUploads: vi.fn().mockResolvedValue([]),
  deleteUserUpload: vi.fn(),
}));

describe('SettingsModal theme mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    useAuthStore.getState().clear();
    useAuthStore.getState().setUser({
      id: 1,
      username: 'qishu',
      email: 'qishu@example.com',
      is_active: true,
      is_admin: false,
      created_at: '2026-05-28T00:00:00Z',
    });
  });

  it('shows a three-state appearance selector and previews the selected theme', async () => {
    const user = userEvent.setup();

    render(<SettingsModal open onClose={() => {}} />);

    expect(screen.getByText('外观模式')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '日间' }));

    expect(window.localStorage.getItem('ark-theme-preference')).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    await user.click(screen.getByRole('button', { name: '夜间' }));
    expect(window.localStorage.getItem('ark-theme-preference')).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('rolls back the theme preference when canceling', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('ark-theme-preference', 'dark');

    render(<SettingsModal open onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: '日间' }));
    expect(window.localStorage.getItem('ark-theme-preference')).toBe('light');

    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(window.localStorage.getItem('ark-theme-preference')).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('keeps the selected theme preference when saving', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('ark-theme-preference', 'system');

    render(<SettingsModal open onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: '日间' }));
    await user.click(screen.getByRole('button', { name: '保存并应用' }));

    expect(window.localStorage.getItem('ark-theme-preference')).toBe('light');
  });
});
