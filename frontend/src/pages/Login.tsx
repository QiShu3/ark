import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore, User } from '../lib/auth';
import { apiJson } from '../lib/api';

type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export default function Login() {
  const token = useAuthStore((s) => s.token);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useAuthStore((s) => s.setUser);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const trimmedUsername = username.trim();
      if (trimmedUsername.length < 3) throw new Error('用户名至少 3 位');
      if (password.length < 8) throw new Error('密码至少 8 位');
      if (mode === 'register') {
        if (password !== confirmPassword) throw new Error('两次密码不一致');
        await apiJson('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmedUsername, password }),
        });
      }

      const data = await apiJson<LoginResponse>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, password }),
      });
      setSession(data.access_token, data.expires_in);
      
      // 获取用户信息
      try {
        const user = await apiJson<User>('/auth/me');
        setUser(user);
      } catch (e) {
        console.error('Failed to fetch user info:', e);
      }

      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'register' ? '注册失败' : '登录失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans">
      <div className="fixed inset-0 z-0">
        <img
          src="/images/background.jpg"
          alt="Background"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/70"></div>
      </div>

      <div className="relative z-10 w-full h-full flex items-center justify-center p-6">
        <div className="relative w-full max-w-md bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPassword('');
              setConfirmPassword('');
              setMode((m) => (m === 'login' ? 'register' : 'login'));
            }}
            className="absolute top-4 right-4 text-sm text-white/70 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg px-3 py-1.5"
          >
            {mode === 'login' ? '注册' : '登录'}
          </button>

          <div className="text-xl font-semibold mb-1">{mode === 'login' ? '登录' : '注册'}</div>
          <div className="text-white/60 text-sm mb-6">
            {mode === 'login' ? '请输入账号与密码' : '创建账号后将自动登录'}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-white/70">用户名</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-11 rounded-lg bg-white/10 border border-white/15 px-3 outline-none focus:border-white/30"
                placeholder="username"
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-white/70">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 rounded-lg bg-white/10 border border-white/15 px-3 outline-none focus:border-white/30"
                placeholder="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {password.length > 0 && password.length < 8 ? (
                <div className="text-xs text-red-200">密码至少 8 位</div>
              ) : (
                <div className="text-xs text-white/40">密码至少 8 位</div>
              )}
            </div>

            {mode === 'register' ? (
              <div className="space-y-2">
                <label className="text-sm text-white/70">确认密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-11 rounded-lg bg-white/10 border border-white/15 px-3 outline-none focus:border-white/30"
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
              </div>
            ) : null}

            <button
              type="submit"
              disabled={
                isSubmitting ||
                username.trim().length < 3 ||
                password.length < 8 ||
                (mode === 'register' && (!confirmPassword || confirmPassword !== password))
              }
              className="w-full h-11 rounded-lg bg-white/15 hover:bg-white/20 border border-white/15 disabled:opacity-50"
            >
              {isSubmitting ? (mode === 'register' ? '注册中...' : '登录中...') : mode === 'register' ? '注册并登录' : '登录'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
