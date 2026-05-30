import { type FormEvent, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import BeianFooter from '../components/BeianFooter';
import { apiJson } from '../lib/api';

export default function ResetPassword() {
  const location = useLocation();
  const token = useMemo(() => new URLSearchParams(location.search).get('token') || '', [location.search]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit = Boolean(token) && password.length >= 8 && password === confirmPassword && !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiJson('/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black p-6 text-ark-text">
      <div className="fixed inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/background.jpg`}
          alt="Background"
          className="h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/70" />
      </div>
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-ark-border bg-ark-overlay p-6 shadow-lg backdrop-blur-md">
        <div className="mb-1 text-xl font-semibold">重置密码</div>
        <p className="mb-6 text-sm text-ark-text-muted">请输入新的 Ark 登录密码</p>

        {success ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              密码已重置，请使用新密码登录。
            </div>
            <Link
              to="/login"
              className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-ark-border bg-ark-surface-subtle text-sm transition hover:bg-ark-surface-subtle"
            >
              返回登录
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {!token ? <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">重置链接缺少 token。</div> : null}
            <div className="space-y-2">
              <label htmlFor="reset-password" className="text-sm text-ark-text">新密码</label>
              <input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-lg border border-ark-border bg-ark-surface-subtle px-3 outline-none focus:border-ark-border"
                autoComplete="new-password"
              />
              <div className={password.length > 0 && password.length < 8 ? 'text-xs text-red-200' : 'text-xs text-ark-text-faint'}>
                密码至少 8 位
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="reset-confirm-password" className="text-sm text-ark-text">确认密码</label>
              <input
                id="reset-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 w-full rounded-lg border border-ark-border bg-ark-surface-subtle px-3 outline-none focus:border-ark-border"
                autoComplete="new-password"
              />
              {confirmPassword && confirmPassword !== password ? <div className="text-xs text-red-200">两次密码不一致</div> : null}
            </div>
            {error ? <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-11 w-full rounded-lg border border-ark-border bg-ark-surface-subtle text-sm transition hover:bg-ark-surface-subtle disabled:opacity-50"
            >
              {submitting ? '重置中...' : '重置密码'}
            </button>
          </form>
        )}
      </div>
      <BeianFooter />
    </div>
  );
}
