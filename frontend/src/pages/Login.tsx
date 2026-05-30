import { type FormEvent, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore, User } from '../lib/auth';
import { apiJson } from '../lib/api';
import { useCustomizationStore } from '../lib/customization';
import BeianFooter from '../components/BeianFooter';

type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type AuthMode = 'login' | 'register' | 'forgot';

export default function Login() {
  const token = useAuthStore((s) => s.token);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useAuthStore((s) => s.setUser);

  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canResendVerification, setCanResendVerification] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const alreadyLoggedIn = useMemo(() => {
    if (!token || !expiresAt) return false;
    return Date.now() < expiresAt;
  }, [token, expiresAt]);

  let from = '/';
  const state = location.state;
  if (state && typeof state === 'object') {
    const fromObj = (state as { from?: unknown }).from;
    if (fromObj && typeof fromObj === 'object') {
      const pathname = (fromObj as { pathname?: unknown }).pathname;
      if (typeof pathname === 'string' && pathname) from = pathname;
    }
  }

  if (alreadyLoggedIn) return <Navigate to={from} replace />;

  const syncUserSettings = async () => {
    try {
      const data = await apiJson<User & Record<string, unknown>>('/auth/me');
      setUser(data);
      const serverData: Record<string, unknown> = {};
      if (data.avatar_url) serverData.avatarUrl = data.avatar_url;
      if (data.custom_background_url) serverData.backgroundUrl = data.custom_background_url;
      if (data.custom_character_url) serverData.characterUrl = data.custom_character_url;
      if (data.background_blur !== undefined) serverData.backgroundBlur = data.background_blur;
      if (data.background_opacity !== undefined) serverData.backgroundOpacity = data.background_opacity;
      if (data.show_character !== undefined) serverData.showCharacter = data.show_character;
      if (data.character_scale !== undefined) serverData.characterScale = data.character_scale;
      if (Object.keys(serverData).length > 0) {
        useCustomizationStore.getState().loadFromServer(serverData);
      }
    } catch (e) {
      console.error('Failed to fetch user info:', e);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setNotice(null);
    setCanResendVerification(false);
    setIsSubmitting(true);
    try {
      const trimmedUsername = username.trim();
      const trimmedEmail = email.trim();
      if (mode === 'forgot') {
        if (!trimmedEmail || !trimmedEmail.includes('@')) throw new Error('请输入有效邮箱');
        await apiJson('/auth/password/forgot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmedEmail }),
        });
        setNotice('如果邮箱已绑定账号，我们已发送重置密码邮件。');
        return;
      }

      if (trimmedUsername.length < 3) throw new Error('用户名至少 3 位');
      if (password.length < 8) throw new Error('密码至少 8 位');
      if (mode === 'register') {
        if (!trimmedEmail || !trimmedEmail.includes('@')) throw new Error('请输入有效邮箱');
        if (password !== confirmPassword) throw new Error('两次密码不一致');
        await apiJson('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmedUsername, email: trimmedEmail, password }),
        });
        setPendingVerificationEmail(trimmedEmail);
        setVerificationCode('');
        setPassword('');
        setConfirmPassword('');
        setNotice('验证码已发送，请输入邮箱中的 6 位验证码。');
        return;
      }

      const data = await apiJson<LoginResponse>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, password }),
      });
      setSession(data.access_token, data.expires_in);
      await syncUserSettings();
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : mode === 'register' ? '注册失败' : '登录失败';
      setError(message);
      setCanResendVerification(message.includes('邮箱未验证'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendVerification = async () => {
    if (isSubmitting || username.trim().length < 3) return;
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      await apiJson('/auth/verification/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      setNotice('验证码已重新发送，请查收邮箱。');
      setCanResendVerification(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyEmailCode = async () => {
    if (isVerifyingCode) return;
    const trimmedEmail = pendingVerificationEmail.trim();
    const code = verificationCode.trim();
    if (!trimmedEmail || code.length !== 6 || !/^\d+$/.test(code)) {
      setError('请输入 6 位数字验证码');
      return;
    }
    setError(null);
    setNotice(null);
    setIsVerifyingCode(true);
    try {
      await apiJson('/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, code }),
      });
      setPendingVerificationEmail('');
      setVerificationCode('');
      setEmail('');
      setMode('login');
      setNotice('邮箱验证成功，现在可以登录。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '邮箱验证失败');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const resetTransientState = () => {
    setError(null);
    setNotice(null);
    setCanResendVerification(false);
    setPendingVerificationEmail('');
    setVerificationCode('');
    setPassword('');
    setConfirmPassword('');
  };

  const title = mode === 'login' ? '登录' : mode === 'register' ? '注册' : '找回密码';
  const subtitle =
    mode === 'login'
      ? '请输入账号与密码'
      : mode === 'register'
        ? '创建账号后需要先验证邮箱'
        : '输入注册邮箱，我们会发送重置链接';
  const switchLabel = mode === 'register' || mode === 'forgot' ? '登录' : '注册';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-ark-text font-sans">
      <div className="fixed inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/background.jpg`}
          alt="Background"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/70"></div>
      </div>

      <div className="relative z-10 w-full h-full flex items-center justify-center p-6">
        <div className="relative w-full max-w-md bg-ark-overlay backdrop-blur-md border border-ark-border rounded-2xl p-6 shadow-lg">
          <button
            type="button"
            onClick={() => {
              resetTransientState();
              setMode((m) => (m === 'login' ? 'register' : 'login'));
            }}
            className="absolute top-4 right-4 text-sm text-ark-text hover:text-ark-text bg-ark-surface-subtle hover:bg-ark-surface-subtle border border-ark-border rounded-lg px-3 py-1.5"
          >
            {switchLabel}
          </button>

          <div className="text-xl font-semibold mb-1">{title}</div>
          <div className="text-ark-text-muted text-sm mb-6">{subtitle}</div>

          <form onSubmit={onSubmit} className="space-y-4">
            {mode !== 'forgot' ? (
              <div className="space-y-2">
                <label htmlFor="auth-username" className="text-sm text-ark-text">用户名</label>
                <input
                  id="auth-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-11 rounded-lg bg-ark-surface-subtle border border-ark-border px-3 outline-none focus:border-ark-border"
                  placeholder="username"
                  autoComplete="username"
                />
              </div>
            ) : null}

            {mode === 'register' || mode === 'forgot' ? (
              <div className="space-y-2">
                <label htmlFor="auth-email" className="text-sm text-ark-text">邮箱</label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 rounded-lg bg-ark-surface-subtle border border-ark-border px-3 outline-none focus:border-ark-border"
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </div>
            ) : null}

            {mode !== 'forgot' ? (
              <div className="space-y-2">
                <label htmlFor="auth-password" className="text-sm text-ark-text">密码</label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 rounded-lg bg-ark-surface-subtle border border-ark-border px-3 outline-none focus:border-ark-border"
                  placeholder="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                {password.length > 0 && password.length < 8 ? (
                  <div className="text-xs text-red-200">密码至少 8 位</div>
                ) : (
                  <div className="text-xs text-ark-text-faint">密码至少 8 位</div>
                )}
              </div>
            ) : null}

            {mode === 'register' ? (
              <div className="space-y-2">
                <label htmlFor="auth-confirm-password" className="text-sm text-ark-text">确认密码</label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-11 rounded-lg bg-ark-surface-subtle border border-ark-border px-3 outline-none focus:border-ark-border"
                  placeholder="confirm password"
                  autoComplete="new-password"
                />
                {confirmPassword && confirmPassword !== password ? (
                  <div className="text-xs text-red-200">两次密码不一致</div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                {error}
                {canResendVerification ? (
                  <button
                    type="button"
                    className="ml-3 text-ark-text underline underline-offset-4 disabled:opacity-50"
                    disabled={isSubmitting}
                    onClick={resendVerification}
                  >
                    重发验证码
                  </button>
                ) : null}
              </div>
            ) : null}

            {notice ? (
              <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/12 p-3 text-[15px] font-medium leading-6 tracking-normal text-emerald-50">
                {notice}
              </div>
            ) : null}

            {pendingVerificationEmail ? (
              <div className="space-y-3 rounded-lg border border-ark-border bg-ark-surface-subtle p-3">
                <div className="text-sm font-medium text-ark-text-muted">验证邮箱：{pendingVerificationEmail}</div>
                <div className="space-y-2">
                  <label htmlFor="auth-email-code" className="text-sm font-medium text-ark-text">邮箱验证码</label>
                  <input
                    id="auth-email-code"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full h-11 rounded-lg bg-ark-surface-subtle border border-ark-border px-3 tracking-[0.3em] outline-none focus:border-ark-border"
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>
                <button
                  type="button"
                  disabled={isVerifyingCode || verificationCode.trim().length !== 6}
                  onClick={verifyEmailCode}
                  className="w-full h-10 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/25 border border-emerald-300/25 disabled:opacity-50"
                >
                  {isVerifyingCode ? '验证中...' : '验证邮箱'}
                </button>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={
                isSubmitting ||
                (mode !== 'forgot' && username.trim().length < 3) ||
                (mode !== 'forgot' && password.length < 8) ||
                ((mode === 'register' || mode === 'forgot') && !email.trim()) ||
                (mode === 'register' && (!confirmPassword || confirmPassword !== password))
              }
              className="w-full h-11 rounded-lg bg-ark-surface-subtle hover:bg-ark-surface-subtle border border-ark-border disabled:opacity-50"
            >
              {isSubmitting
                ? mode === 'register'
                  ? '注册中...'
                  : mode === 'forgot'
                    ? '发送中...'
                    : '登录中...'
                : mode === 'register'
                  ? '注册并发送验证码'
                  : mode === 'forgot'
                    ? '发送重置邮件'
                    : '登录'}
            </button>

            {mode === 'login' ? (
              <button
                type="button"
                className="w-full text-sm text-ark-text-muted transition hover:text-ark-text"
                onClick={() => {
                  resetTransientState();
                  setMode('forgot');
                }}
              >
                忘记密码？
              </button>
            ) : mode === 'forgot' ? (
              <button
                type="button"
                className="w-full text-sm text-ark-text-muted transition hover:text-ark-text"
                onClick={() => {
                  resetTransientState();
                  setMode('login');
                }}
              >
                返回登录
              </button>
            ) : null}
          </form>
        </div>
      </div>

      <BeianFooter />
    </div>
  );
}
