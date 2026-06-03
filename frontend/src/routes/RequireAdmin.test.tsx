import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import RequireAdmin from './RequireAdmin';
import { useAuthStore, type User } from '../lib/auth';

const baseUser: User = {
  id: 1,
  username: 'qishu',
  email: 'qishu@example.com',
  is_active: true,
  is_admin: false,
  created_at: '2026-05-14T00:00:00Z',
};

function renderProtectedRoute(user: User) {
  useAuthStore.getState().setSession('token', 3600);
  useAuthStore.getState().setUser(user);

  render(
    <MemoryRouter initialEntries={['/admin/ui']}>
      <Routes>
        <Route element={<RequireAdmin />}>
          <Route path="/admin/ui" element={<div>管理员内容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAdmin', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.getState().clear();
  });

  it('renders protected content for admin users', () => {
    renderProtectedRoute({ ...baseUser, is_admin: true });

    expect(screen.getByText('管理员内容')).toBeInTheDocument();
    expect(screen.queryByText('需要管理员权限')).not.toBeInTheDocument();
  });

  it('shows a permission state for non-admin users', () => {
    renderProtectedRoute(baseUser);

    expect(screen.getByRole('main', { name: '管理员权限不足' })).toBeInTheDocument();
    expect(screen.getByText('需要管理员权限')).toBeInTheDocument();
    expect(screen.queryByText('管理员内容')).not.toBeInTheDocument();
  });
});
