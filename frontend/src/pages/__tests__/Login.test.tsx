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
    // 默认 mock 验证码接口和 captcha/required 接口
    mockApiJson.mockImplementation(async (path: string) => {
      if (path === '/auth/captcha') {
        return { captcha_id: 'test-captcha-id', image_base64: 'fakebase64' };
      }
      if (path === '/auth/captcha/required') {
        return { required: false };
      }
      return { ok: true };
    });
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

  it('explains the temporary guest account and record recovery limits', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    const guestLogin = screen.getByRole('button', { name: '游客体验' });
    expect(guestLogin).toHaveAttribute('aria-describedby', 'guest-login-note');
    expect(screen.getByText('将创建临时游客账号；退出或更换设备后无法恢复学习记录。注册账号可长期保存数据。')).toHaveAttribute(
      'id',
      'guest-login-note',
    );
  });

  it('registers with email and verifies with a code without logging in', async () => {
    const user = userEvent.setup();
    mockApiJson.mockImplementation(async (path: string) => {
      if (path === '/auth/captcha') {
        return { captcha_id: 'test-captcha-id', image_base64: 'fakebase64' };
      }
      if (path === '/auth/captcha/required') {
        return { required: false };
      }
      return { ok: true };
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '注册' }));
    await user.type(screen.getByLabelText('用户名', { selector: '#register-username' }), 'tester');
    await user.type(screen.getByLabelText('邮箱', { selector: '#register-email' }), 'tester@example.com');
    await user.type(screen.getByLabelText('密码', { selector: '#register-password' }), 'password123');
    await user.type(screen.getByLabelText('确认密码'), 'password123');
    await user.type(screen.getByLabelText('验证码', { selector: '#register-captcha' }), 'ABCD');
    await user.click(screen.getByRole('button', { name: '注册并发送验证码' }));

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith('/auth/register', expect.objectContaining({ method: 'POST' }));
    });
    const registerCall = mockApiJson.mock.calls.find(([path]) => path === '/auth/register');
    expect(JSON.parse(String(registerCall?.[1]?.body))).toMatchObject({
      username: 'tester',
      email: 'tester@example.com',
      password: 'password123',
      captcha_id: 'test-captcha-id',
      captcha_code: 'ABCD',
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
      if (path === '/auth/captcha') {
        return { captcha_id: 'test-captcha-id', image_base64: 'fakebase64' };
      }
      if (path === '/auth/captcha/required') {
        return { required: false };
      }
      if (path === '/auth/login') throw new Error('邮箱未验证，请先查收邮箱验证码');
      return { ok: true };
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('用户名', { selector: '#login-username' }), 'tester');
    await user.type(screen.getByLabelText('密码', { selector: '#login-password' }), 'password123');
    await user.click(screen.getByTestId('auth-submit-btn'));
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
