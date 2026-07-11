import { type FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  User as UserIcon,
  Lock,
  Eye,
  EyeOff,
  Mail,
  Sparkles,
  Target,
  BarChart3,
  LogIn,
  RefreshCw,
} from 'lucide-react';

import { useAuthStore, User } from '../lib/auth';
import { apiJson } from '../lib/api';
import { useCustomizationStore } from '../lib/customization';
import { clearAppRegistryCache } from '../lib/appRegistry';

type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type AuthMode = 'login' | 'register' | 'forgot';

const features = [
  {
    icon: Target,
    title: '有目的的学习',
    desc: '明确目标，让每一分钟都有方向',
  },
  {
    icon: Sparkles,
    title: '保持专注',
    desc: '沉浸式专注体验，高效达成目标',
  },
  {
    icon: BarChart3,
    title: '及时反馈',
    desc: '数据驱动，看见每一步成长',
  },
];

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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // 图形验证码
  const [captchaId, setCaptchaId] = useState<string>('');
  const [captchaImage, setCaptchaImage] = useState<string>('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [isRefreshingCaptcha, setIsRefreshingCaptcha] = useState(false);

  // 卡片高度过渡
  const panelRefs = useRef<Record<AuthMode, HTMLDivElement | null>>({
    login: null,
    register: null,
    forgot: null,
  });
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

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

  const fetchCaptcha = useCallback(async () => {
    setIsRefreshingCaptcha(true);
    try {
      const res = await apiJson<{ captcha_id: string; image_base64: string }>('/auth/captcha');
      setCaptchaId(res.captcha_id);
      setCaptchaImage(res.image_base64);
      setCaptchaCode('');
    } catch (e) {
      console.error('Failed to fetch captcha:', e);
    } finally {
      setIsRefreshingCaptcha(false);
    }
  }, []);

  const checkCaptchaRequired = useCallback(async () => {
    try {
      const res = await apiJson<{ required: boolean }>('/auth/captcha/required');
      setShowCaptcha(res.required);
      if (res.required && !captchaId) {
        await fetchCaptcha();
      }
    } catch (e) {
      // ignore
    }
  }, [captchaId, fetchCaptcha]);

  // 注册模式始终显示验证码
  useEffect(() => {
    if (mode === 'register') {
      setShowCaptcha(true);
      if (!captchaId) fetchCaptcha();
    } else if (mode === 'login') {
      checkCaptchaRequired();
    } else {
      setShowCaptcha(false);
    }
  }, [mode, captchaId, fetchCaptcha, checkCaptchaRequired]);

  // 测量当前面板高度，实现高度平滑过渡
  useLayoutEffect(() => {
    const el = panelRefs.current[mode];
    if (el) {
      setPanelHeight(el.scrollHeight);
    }
  }, [mode, error, notice, pendingVerificationEmail, showCaptcha, password, confirmPassword]);

  if (alreadyLoggedIn) return <Navigate to={from} replace />;

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
        if (showCaptcha && !captchaCode.trim()) throw new Error('请输入验证码');
        await apiJson('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: trimmedUsername,
            email: trimmedEmail,
            password,
            captcha_id: captchaId,
            captcha_code: captchaCode.trim(),
          }),
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
        body: JSON.stringify({
          username: trimmedUsername,
          password,
          captcha_id: showCaptcha ? captchaId : undefined,
          captcha_code: showCaptcha ? captchaCode.trim() : undefined,
        }),
      });
      setSession(data.access_token, data.expires_in);
      await syncUserSettings();
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : mode === 'register' ? '注册失败' : '登录失败';
      setError(message);
      setCanResendVerification(message.includes('邮箱未验证'));
      // 登录失败时刷新验证码并检查是否需要显示
      if (mode === 'login') {
        checkCaptchaRequired();
        if (showCaptcha) fetchCaptcha();
      } else if (mode === 'register') {
        fetchCaptcha();
      }
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

  const switchTab = (newMode: 'login' | 'register') => {
    resetTransientState();
    setMode(newMode);
  };

  const guestLogin = async () => {
    if (isSubmitting) return;
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      const data = await apiJson<LoginResponse>('/auth/guest', { method: 'POST' });
      setSession(data.access_token, data.expires_in);
      clearAppRegistryCache();
      await syncUserSettings();
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '游客登录失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden font-sans">
      {/* Full-screen background image */}
      <div className="absolute inset-0">
        <img
          src={`${import.meta.env.BASE_URL}images/login-bg.png`}
          alt="background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{
          background: 'rgba(255, 255, 255, 0.15)',
        }} />
      </div>

      {/* Main content */}
      <div className="relative z-10 w-full h-full flex">
        {/* Left panel - Brand showcase */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col justify-between p-12 xl:p-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}favicon.png`}
              alt="Ark"
              className="w-10 h-10 rounded-xl object-cover"
            />
            <div>
              <div className="text-xl font-bold text-slate-800">Ark</div>
              <div className="text-xs text-slate-500">及时反馈你的每一个学习</div>
            </div>
          </div>

          {/* Hero text & features */}
          <div className="max-w-lg">
            <h1 className="text-4xl xl:text-5xl font-bold text-slate-800 leading-tight mb-4">
              让学习
              <br />
              <span className="text-sky-600">看得见进步</span>
            </h1>
            <p className="text-slate-500 mb-8 text-sm">
              有目的的学习 · 保持专注 · 及时反馈
            </p>

            {/* Feature cards */}
            <div className="space-y-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="flex items-center gap-4 px-4 py-3 rounded-2xl backdrop-blur-sm"
                    style={{
                      background: 'rgba(255, 255, 255, 0.55)',
                      border: '1px solid rgba(255, 255, 255, 0.6)',
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-sky-50">
                      <Icon className="w-5 h-5 text-sky-500" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-700 text-sm">{feature.title}</div>
                      <div className="text-xs text-slate-500">{feature.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div />
        </div>

        {/* Right panel - Login form */}
        <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-6 lg:p-8">
          <div
            className="w-full max-w-md rounded-3xl p-8 backdrop-blur-xl overflow-hidden"
            style={{
              background: 'rgba(255, 255, 255, 0.78)',
              border: '1px solid rgba(255, 255, 255, 0.85)',
              boxShadow: '0 20px 50px -15px rgba(0, 0, 0, 0.12), 0 8px 20px -10px rgba(0, 0, 0, 0.06)',
            }}
          >
            {/* Tab switcher (login/register) */}
            {mode !== 'forgot' && (
              <div
                className="flex rounded-2xl p-1 mb-6"
                style={{ background: 'rgba(148, 163, 184, 0.12)' }}
              >
                <button
                  type="button"
                  onClick={() => switchTab('login')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                    mode === 'login'
                      ? 'text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  style={mode === 'login' ? {
                      background: '#3b82f6',
                    } : {}}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTab('register')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                      mode === 'register'
                        ? 'text-white'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                    style={mode === 'register' ? {
                      background: '#3b82f6',
                    } : {}}
                >
                  注册
                </button>
              </div>
            )}

            {/* Form content with height + cross-fade transition */}
            <div
              style={{
                height: panelHeight ? `${panelHeight}px` : 'auto',
                transition: 'height 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Login panel */}
              <div
                ref={(el) => { panelRefs.current.login = el; }}
                aria-hidden={mode !== 'login'}
                style={{
                  position: mode === 'login' ? 'relative' : 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  opacity: mode === 'login' ? 1 : 0,
                  transform: mode === 'login' ? 'translateY(0)' : 'translateY(8px)',
                  transition: 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  pointerEvents: mode === 'login' ? 'auto' : 'none',
                  visibility: mode === 'login' ? 'visible' : 'hidden',
                }}
              >
                <h2 className="text-xl font-bold text-slate-800 mb-1">欢迎回来</h2>
                <p className="text-sm text-slate-400 mb-6">很高兴再次见到你！</p>

                <form onSubmit={onSubmit} className="space-y-4">
                  {/* Username */}
                  <div className="space-y-1.5">
                    <label htmlFor="login-username" className="text-xs font-medium text-slate-600 ml-1">
                      用户名
                    </label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="login-username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full h-11 rounded-xl bg-white/80 border border-slate-200 pl-10 pr-3 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50 transition-all"
                        placeholder="请输入用户名"
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label htmlFor="login-password" className="text-xs font-medium text-slate-600 ml-1">
                      密码
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-11 rounded-xl bg-white/80 border border-slate-200 pl-10 pr-10 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50 transition-all"
                        placeholder="请输入密码"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {password.length > 0 && password.length < 8 ? (
                      <div className="text-xs text-red-400 ml-1">密码至少 8 位</div>
                    ) : (
                      <div className="text-xs text-slate-300 ml-1">密码至少 8 位</div>
                    )}
                  </div>

                  {/* Captcha (conditionally shown on login) */}
                  {showCaptcha ? (
                    <div className="space-y-1.5">
                      <label htmlFor="login-captcha" className="text-xs font-medium text-slate-600 ml-1">
                        验证码
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <svg
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M9 12l2 2 4-4" />
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                          <input
                            id="login-captcha"
                            value={captchaCode}
                            onChange={(e) => setCaptchaCode(e.target.value.toUpperCase().slice(0, 6))}
                            className="w-full h-11 rounded-xl bg-white/80 border border-slate-200 pl-10 pr-3 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50 transition-all tracking-widest uppercase"
                            placeholder="请输入验证码"
                            autoComplete="off"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={fetchCaptcha}
                          disabled={isRefreshingCaptcha}
                          className="h-11 px-3 rounded-xl bg-white/80 border border-slate-200 flex items-center justify-center hover:border-slate-300 transition-all disabled:opacity-50"
                          title="刷新验证码"
                        >
                          {captchaImage ? (
                            <img
                              src={`data:image/png;base64,${captchaImage}`}
                              alt="验证码"
                              className="h-8 w-auto rounded"
                            />
                          ) : (
                            <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Error */}
                  {error && mode === 'login' ? (
                    <div
                      className="text-sm text-red-500 rounded-xl p-3"
                      style={{
                        background: 'rgba(248, 113, 113, 0.1)',
                        border: '1px solid rgba(248, 113, 113, 0.25)',
                      }}
                    >
                      {error}
                      {canResendVerification ? (
                        <button
                          type="button"
                          className="ml-3 text-red-400 underline underline-offset-2 disabled:opacity-50"
                          disabled={isSubmitting}
                          onClick={resendVerification}
                        >
                          重发验证码
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Notice */}
                  {notice && mode === 'login' ? (
                    <div
                      className="rounded-xl p-3 text-[14px] font-medium leading-6 text-emerald-600"
                      style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                      }}
                    >
                      {notice}
                    </div>
                  ) : null}

                  {/* Remember me & Forgot password */}
                  {!pendingVerificationEmail ? (
                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                        />
                        <span className="text-xs text-slate-500">记住我</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          resetTransientState();
                          setMode('forgot');
                        }}
                        className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
                      >
                        忘记密码？
                      </button>
                    </div>
                  ) : null}

                  {/* Submit */}
                  {!pendingVerificationEmail && (
                    <button
                      type="submit"
                      data-testid="auth-submit-btn"
                      disabled={
                        isSubmitting ||
                        username.trim().length < 3 ||
                        password.length < 8 ||
                        (showCaptcha && !captchaCode.trim())
                      }
                      className="w-full h-12 rounded-xl text-white font-medium disabled:opacity-50 transition-all hover:bg-blue-600 active:scale-[0.98] flex items-center justify-center gap-2"
                      style={{
                        background: '#3b82f6',
                        boxShadow: 'none',
                      }}
                    >
                      <LogIn className="w-4 h-4" />
                      {isSubmitting ? '登录中...' : '登录'}
                    </button>
                  )}

                  {/* Guest login */}
                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200/60" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2 text-slate-400" style={{ background: 'rgba(255, 255, 255, 0.78)' }}>或</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={guestLogin}
                    disabled={isSubmitting}
                    className="w-full h-10 rounded-xl text-slate-600 text-sm font-medium disabled:opacity-50 transition-all hover:bg-slate-100 active:scale-[0.98] flex items-center justify-center gap-2 border border-slate-200"
                  >
                    <UserIcon className="w-4 h-4" />
                    游客体验
                  </button>
                </form>
              </div>

              {/* Register panel */}
              <div
                ref={(el) => { panelRefs.current.register = el; }}
                aria-hidden={mode !== 'register'}
                style={{
                  position: mode === 'register' ? 'relative' : 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  opacity: mode === 'register' ? 1 : 0,
                  transform: mode === 'register' ? 'translateY(0)' : 'translateY(8px)',
                  transition: 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  pointerEvents: mode === 'register' ? 'auto' : 'none',
                  visibility: mode === 'register' ? 'visible' : 'hidden',
                }}
              >
                <h2 className="text-xl font-bold text-slate-800 mb-1">创建账号</h2>
                <p className="text-sm text-slate-400 mb-6">加入我们，开启 AI 学习之旅</p>

                <form onSubmit={onSubmit} className="space-y-4">
                  {/* Username */}
                  <div className="space-y-1.5">
                    <label htmlFor="register-username" className="text-xs font-medium text-slate-600 ml-1">
                      用户名
                    </label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="register-username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full h-11 rounded-xl bg-white/80 border border-slate-200 pl-10 pr-3 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50 transition-all"
                        placeholder="请输入用户名"
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label htmlFor="register-email" className="text-xs font-medium text-slate-600 ml-1">
                      邮箱
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="register-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full h-11 rounded-xl bg-white/80 border border-slate-200 pl-10 pr-3 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50 transition-all"
                        placeholder="name@example.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label htmlFor="register-password" className="text-xs font-medium text-slate-600 ml-1">
                      密码
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="register-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-11 rounded-xl bg-white/80 border border-slate-200 pl-10 pr-10 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50 transition-all"
                        placeholder="请输入密码"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {password.length > 0 && password.length < 8 ? (
                      <div className="text-xs text-red-400 ml-1">密码至少 8 位</div>
                    ) : (
                      <div className="text-xs text-slate-300 ml-1">密码至少 8 位</div>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div className="space-y-1.5">
                    <label htmlFor="register-confirm-password" className="text-xs font-medium text-slate-600 ml-1">
                      确认密码
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="register-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full h-11 rounded-xl bg-white/80 border border-slate-200 pl-10 pr-3 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50 transition-all"
                        placeholder="请再次输入密码"
                        autoComplete="new-password"
                      />
                    </div>
                    {confirmPassword && confirmPassword !== password ? (
                      <div className="text-xs text-red-400 ml-1">两次密码不一致</div>
                    ) : null}
                  </div>

                  {/* Captcha (always shown on register) */}
                  <div className="space-y-1.5">
                    <label htmlFor="register-captcha" className="text-xs font-medium text-slate-600 ml-1">
                      验证码
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <svg
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 12l2 2 4-4" />
                          <circle cx="12" cy="12" r="10" />
                        </svg>
                        <input
                          id="register-captcha"
                          value={captchaCode}
                          onChange={(e) => setCaptchaCode(e.target.value.toUpperCase().slice(0, 6))}
                          className="w-full h-11 rounded-xl bg-white/80 border border-slate-200 pl-10 pr-3 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50 transition-all tracking-widest uppercase"
                          placeholder="请输入验证码"
                          autoComplete="off"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={fetchCaptcha}
                        disabled={isRefreshingCaptcha}
                        className="h-11 px-3 rounded-xl bg-white/80 border border-slate-200 flex items-center justify-center hover:border-slate-300 transition-all disabled:opacity-50"
                        title="刷新验证码"
                      >
                        {captchaImage ? (
                          <img
                            src={`data:image/png;base64,${captchaImage}`}
                            alt="验证码"
                            className="h-8 w-auto rounded"
                          />
                        ) : (
                          <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  {error && mode === 'register' ? (
                    <div
                      className="text-sm text-red-500 rounded-xl p-3"
                      style={{
                        background: 'rgba(248, 113, 113, 0.1)',
                        border: '1px solid rgba(248, 113, 113, 0.25)',
                      }}
                    >
                      {error}
                    </div>
                  ) : null}

                  {/* Notice */}
                  {notice && mode === 'register' ? (
                    <div
                      className="rounded-xl p-3 text-[14px] font-medium leading-6 text-emerald-600"
                      style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                      }}
                    >
                      {notice}
                    </div>
                  ) : null}

                  {/* Email verification section */}
                  {pendingVerificationEmail ? (
                    <div
                      className="space-y-3 rounded-xl p-4"
                      style={{
                        background: 'rgba(255, 255, 255, 0.6)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                      }}
                    >
                      <div className="text-sm font-medium text-slate-600">
                        验证邮箱：{pendingVerificationEmail}
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="register-email-code" className="text-sm font-medium text-slate-700">
                          邮箱验证码
                        </label>
                        <input
                          id="register-email-code"
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="w-full h-11 rounded-xl bg-white/80 border border-slate-200 px-4 tracking-[0.3em] text-center text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50 transition-all"
                          placeholder="000000"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={isVerifyingCode || verificationCode.trim().length !== 6}
                        onClick={verifyEmailCode}
                        className="w-full h-10 rounded-xl text-white font-medium disabled:opacity-50 transition-all"
                        style={{
                          background: '#10b981',
                          boxShadow: 'none',
                        }}
                      >
                        {isVerifyingCode ? '验证中...' : '验证邮箱'}
                      </button>
                    </div>
                  ) : null}

                  {/* Submit */}
                  {!pendingVerificationEmail && (
                    <button
                      type="submit"
                      disabled={
                        isSubmitting ||
                        username.trim().length < 3 ||
                        password.length < 8 ||
                        !email.trim() ||
                        !confirmPassword ||
                        confirmPassword !== password ||
                        !captchaCode.trim()
                      }
                      className="w-full h-12 rounded-xl text-white font-medium disabled:opacity-50 transition-all hover:bg-blue-600 active:scale-[0.98] flex items-center justify-center gap-2"
                      style={{
                        background: '#3b82f6',
                        boxShadow: 'none',
                      }}
                    >
                      <LogIn className="w-4 h-4" />
                      {isSubmitting ? '注册中...' : '注册并发送验证码'}
                    </button>
                  )}
                </form>
              </div>

              {/* Forgot password panel */}
              <div
                ref={(el) => { panelRefs.current.forgot = el; }}
                aria-hidden={mode !== 'forgot'}
                style={{
                  position: mode === 'forgot' ? 'relative' : 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  opacity: mode === 'forgot' ? 1 : 0,
                  transform: mode === 'forgot' ? 'translateY(0)' : 'translateY(8px)',
                  transition: 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  pointerEvents: mode === 'forgot' ? 'auto' : 'none',
                  visibility: mode === 'forgot' ? 'visible' : 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => { resetTransientState(); setMode('login'); }}
                  className="text-sm text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1"
                >
                  ← 返回登录
                </button>
                <h2 className="text-xl font-bold text-slate-800 mb-1">找回密码</h2>
                <p className="text-sm text-slate-400 mb-6">输入注册邮箱，我们会发送重置链接</p>

                <form onSubmit={onSubmit} className="space-y-4">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <label htmlFor="forgot-email" className="text-xs font-medium text-slate-600 ml-1">
                      邮箱
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="forgot-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full h-11 rounded-xl bg-white/80 border border-slate-200 pl-10 pr-3 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50 transition-all"
                        placeholder="name@example.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Error */}
                  {error && mode === 'forgot' ? (
                    <div
                      className="text-sm text-red-500 rounded-xl p-3"
                      style={{
                        background: 'rgba(248, 113, 113, 0.1)',
                        border: '1px solid rgba(248, 113, 113, 0.25)',
                      }}
                    >
                      {error}
                    </div>
                  ) : null}

                  {/* Notice */}
                  {notice && mode === 'forgot' ? (
                    <div
                      className="rounded-xl p-3 text-[14px] font-medium leading-6 text-emerald-600"
                      style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                      }}
                    >
                      {notice}
                    </div>
                  ) : null}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={isSubmitting || !email.trim()}
                    className="w-full h-12 rounded-xl text-white font-medium disabled:opacity-50 transition-all hover:bg-blue-600 active:scale-[0.98] flex items-center justify-center gap-2"
                    style={{
                      background: '#3b82f6',
                      boxShadow: 'none',
                    }}
                  >
                    <LogIn className="w-4 h-4" />
                    {isSubmitting ? '发送中...' : '发送重置邮件'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ICP Footer */}
      <div className="fixed inset-x-0 bottom-4 z-20 px-4 text-center">
        <div className="pointer-events-none mx-auto flex w-fit max-w-full items-center justify-center rounded-full px-3 py-1.5 backdrop-blur-sm"
          style={{ background: 'rgba(255, 255, 255, 0.6)', border: '1px solid rgba(255, 255, 255, 0.8)' }}
        >
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            粤ICP备2026047635号
          </a>
        </div>
      </div>
    </div>
  );
}
