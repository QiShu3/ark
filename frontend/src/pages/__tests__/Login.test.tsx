import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { useAuthStore } from '../../lib/auth';
import { apiJson } from '../../lib/api';
import Login from '../Login';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

const mockApiJson = vi.mocked(apiJson);

describe('Login page', () => {
  beforeEach(() => {
    mockApiJson.mockReset();
    useAuthStore.getState().clear();
    window.localStorage.clear();
  });

  it('shows the ICP备案 footer link', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '粤ICP备2026047635号' })).toHaveAttribute(
      'href',
      'https://beian.miit.gov.cn/',
    );
  });

  it('registers with email and verifies with a code without logging in', async () => {
    const user = userEvent.setup();
    mockApiJson.mockResolvedValue({ ok: true });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '注册' }));
    await user.type(screen.getByLabelText('用户名'), 'tester');
    await user.type(screen.getByLabelText('邮箱'), 'tester@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.type(screen.getByLabelText('确认密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '注册并发送验证码' }));

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith('/auth/register', expect.objectContaining({ method: 'POST' }));
    });
    const registerCall = mockApiJson.mock.calls.find(([path]) => path === '/auth/register');
    expect(JSON.parse(String(registerCall?.[1]?.body))).toMatchObject({
      username: 'tester',
      email: 'tester@example.com',
      password: 'password123',
    });
    expect(await screen.findByText('验证码已发送，请输入邮箱中的 6 位验证码。')).toBeInTheDocument();
    await user.type(screen.getByLabelText('邮箱验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '验证邮箱' }));

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith(
        '/auth/verify-email',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'tester@example.com', code: '123456' }),
        }),
      );
    });
    expect(await screen.findByText('邮箱验证成功，现在可以登录。')).toBeInTheDocument();
    expect(mockApiJson).not.toHaveBeenCalledWith('/auth/login', expect.anything());
  });

  it('resends verification when login is blocked by an unverified email', async () => {
    const user = userEvent.setup();
    mockApiJson.mockImplementation(async (path: string) => {
      if (path === '/auth/login') throw new Error('邮箱未验证，请先查收邮箱验证码');
      return { ok: true };
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('用户名'), 'tester');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '登录' }));
    await user.click(await screen.findByRole('button', { name: '重发验证码' }));

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith(
        '/auth/verification/resend',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ username: 'tester' }),
        }),
      );
    });
  });
});
