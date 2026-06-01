import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, User } from '../lib/auth';
import { apiJson, checkIn, getCheckInStatus, CheckInStatus } from '../lib/api';
import confetti from 'canvas-confetti';
import { Bell, BookOpen, CalendarDays, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import WorkflowNavProgress from './WorkflowNavProgress';
import type { WorkflowSnapshot } from './workflowProgress';
import { restartFirstGuide } from '../lib/onboardingEvents';
import SettingsModal from './SettingsModal';
import { useCustomizationStore } from '../lib/customization';
import { useTheme } from '../hooks/useTheme';
import MultiWeekCalendarModal from './MultiWeekCalendarModal';
import EventCountdownCard from './EventCountdownCard';

function isFocusWorkNavigationLocked(workflow: WorkflowSnapshot | null): boolean {
  return workflow?.state === 'focus' && workflow.focus_work_display_state === 'fullscreen';
}

function ArkLogoMark() {
  return (
    <svg
      className="ark-logo-mark h-[48px] w-[48px]"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ark-logo-gradient" x1="12" x2="52" y1="54" y2="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" />
          <stop offset="0.55" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#7dd3fc" />
        </linearGradient>
      </defs>
      <path
        d="M31.8 6.5 8.2 49.5l23.6 8 24-8L31.8 6.5Z"
        fill="none"
        stroke="url(#ark-logo-gradient)"
        strokeLinejoin="round"
        strokeWidth="3.2"
      />
      <path
        d="M31.8 13.5v37.2M31.8 50.7 16.2 46l15.6-32.5L47.8 46 31.8 50.7Z"
        fill="none"
        stroke="url(#ark-logo-gradient)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
      <path
        d="M19.5 46 31.8 30.4 44.4 46"
        fill="none"
        stroke="url(#ark-logo-gradient)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
        opacity="0.78"
      />
    </svg>
  );
}

/**
 * 顶部导航栏组件
 * 仅作占位，固定在顶部
 */
const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const clearSession = useAuthStore((s) => s.clear);
  const avatarUrl = useCustomizationStore((s) => s.avatarUrl);
  const { themePreference, resolvedTheme, toggleResolvedTheme } = useTheme();
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);

  const [checkInState, setCheckInState] = useState<CheckInStatus | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [workflowSnapshot, setWorkflowSnapshot] = useState<WorkflowSnapshot | null>(null);
  const focusNavigationLocked = isFocusWorkNavigationLocked(workflowSnapshot);
  const ThemeIcon = themePreference === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;
  const nextThemeLabel = resolvedTheme === 'dark' ? '切换为日间模式' : '切换为夜间模式';
  const themeButtonTitle =
    themePreference === 'system' ? `跟随系统 · ${resolvedTheme === 'dark' ? '夜间' : '日间'}` : nextThemeLabel;

  /**
   * 加载当前工作流快照（用于导航栏中间的紧凑进度条）。
   */
  async function _loadWorkflowSnapshot(): Promise<void> {
    try {
      const res = await apiJson('/todo/focus/workflow/current');
      const snapshot = res as WorkflowSnapshot;
      if (!snapshot || typeof snapshot !== 'object') {
        setWorkflowSnapshot(null);
        return;
      }
      setWorkflowSnapshot(snapshot);
      if (isFocusWorkNavigationLocked(snapshot)) setAvatarMenuOpen(false);
    } catch {
      setWorkflowSnapshot(null);
    }
  }

  useEffect(() => {
    const initTimer = window.setTimeout(_loadWorkflowSnapshot, 0);
    const handleReload = () => _loadWorkflowSnapshot();
    window.addEventListener('ark:reload-focus', handleReload);
    const timer = window.setInterval(_loadWorkflowSnapshot, 60000);
    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener('ark:reload-focus', handleReload);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!avatarMenuRef.current?.contains(event.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAvatarMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [avatarMenuOpen]);

  useEffect(() => {
    if (token && !user) {
      apiJson<User & Record<string, unknown>>('/auth/me')
        .then((data) => {
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
        })
        .catch((err) => {
            console.error('Failed to fetch user info:', err);
        });
    }
  }, [token, user, setUser]);

  // Handle daily check-in
  useEffect(() => {
    if (user) {
      getCheckInStatus()
        .then((status) => {
          setCheckInState(status);
          if (!status.is_checked_in_today) {
            checkIn().then(() => {
              confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 }
              });
              setCheckInState({
                ...status,
                is_checked_in_today: true,
                current_streak: status.current_streak + 1,
                total_days: status.total_days + 1
              });
              setShowToast(true);
              setTimeout(() => setShowToast(false), 5000);
              window.dispatchEvent(new CustomEvent('ark:reload-checkin'));
            }).catch(err => console.error('Check-in failed:', err));
          }
        })
        .catch(err => console.error('Failed to get check-in status:', err));
    }
  }, [user]);

  function handleLogout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  function handleRestartOnboarding() {
    if (focusNavigationLocked) return;
    restartFirstGuide();
    navigate('/');
  }

  return (
    <>
      <nav className="ark-top-nav fixed left-3 right-3 top-3 z-50 flex h-24 items-center rounded-[48px] border border-[var(--ark-glass-border-soft)] bg-[var(--ark-surface)] px-[30px] text-[var(--ark-text)] backdrop-blur-2xl">
      <div className="flex items-center gap-[18px]">
        <div className="flex h-[54px] w-[54px] items-center justify-center rounded-full">
          <ArkLogoMark />
        </div>
        <EventCountdownCard variant="nav" />
        <button
          type="button"
          aria-label="重新进入首次体验引导"
          title="重新进入首次体验引导"
          disabled={focusNavigationLocked}
          className="ark-focus-ring flex h-[54px] w-[54px] items-center justify-center rounded-full border ark-border bg-[var(--ark-surface-subtle)] text-[var(--ark-text-muted)] transition-colors hover:bg-[var(--ark-accent-soft)] hover:text-[var(--ark-text)] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleRestartOnboarding}
        >
          <BookOpen size={27} aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1" />
      {workflowSnapshot ? (
        <div className="absolute left-1/2 top-1/2 z-10 hidden origin-center -translate-x-1/2 -translate-y-1/2 scale-150 pointer-events-none md:block">
          <div className="pointer-events-auto">
            <WorkflowNavProgress workflow={workflowSnapshot} />
          </div>
        </div>
      ) : null}
      <div className="ml-auto flex items-center gap-6">
        {/* 用户头像区域 */}
        {user ? (
          <div className="flex items-center gap-[18px]">
            <button
              type="button"
              aria-label="打开导航栏日历"
              title="日历"
              disabled={focusNavigationLocked}
              className="ark-nav-icon-button ark-focus-ring flex h-[60px] w-[60px] items-center justify-center rounded-full text-[var(--ark-text-muted)] transition-all hover:text-[var(--ark-text)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                if (focusNavigationLocked) return;
                setShowCalendarModal(true);
              }}
            >
              <CalendarDays size={25} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={focusNavigationLocked ? '切换外观模式' : nextThemeLabel}
              title={themeButtonTitle}
              disabled={focusNavigationLocked}
              className="ark-nav-icon-button ark-focus-ring flex h-[60px] w-[60px] items-center justify-center rounded-full text-[var(--ark-text-muted)] transition-all hover:text-[var(--ark-text)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={toggleResolvedTheme}
            >
              <ThemeIcon size={24} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="通知中心"
              title="通知中心"
              disabled={focusNavigationLocked}
              className="ark-nav-icon-button ark-focus-ring flex h-[60px] w-[60px] items-center justify-center rounded-full text-[var(--ark-text-muted)] transition-all hover:text-[var(--ark-text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Bell size={24} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="打开界面设置"
              title="界面设置"
              disabled={focusNavigationLocked}
              className="ark-nav-icon-button ark-focus-ring flex h-[60px] w-[60px] items-center justify-center rounded-full text-[var(--ark-text-muted)] transition-all hover:text-[var(--ark-text)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                if (focusNavigationLocked) return;
                setShowSettingsModal(true);
              }}
            >
              <Settings size={24} aria-hidden="true" />
            </button>
            <div className="mx-1 h-12 w-px bg-[var(--ark-border)] opacity-55" aria-hidden="true" />
            <div ref={avatarMenuRef} className="relative ml-1">
              <button
                type="button"
                aria-label="打开用户菜单"
                aria-expanded={avatarMenuOpen}
                className="ark-nav-icon-button ark-focus-ring relative flex h-[60px] w-[60px] items-center justify-center rounded-full transition-all"
                onClick={() => setAvatarMenuOpen((prev) => !prev)}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={user.username} className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xl font-bold text-white">
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="absolute bottom-1 right-0 h-3.5 w-3.5 rounded-full border-2 border-[var(--ark-surface-strong)] bg-emerald-400" />
              </button>
              {avatarMenuOpen ? (
                <div className="absolute right-0 top-full z-50 mt-3 w-48 overflow-hidden rounded-2xl border border-ark-border bg-ark-overlay p-2 text-ark-text shadow-xl backdrop-blur-xl">
                  <div className="px-3 py-2 text-sm font-medium text-ark-text">{user.username}</div>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ark-text-muted transition-colors hover:bg-ark-surface-subtle hover:text-ark-text"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <button 
            onClick={() => navigate('/login')}
            className="ark-button-secondary rounded-full px-6 py-2.5 text-[21px] transition-colors"
          >
            Login
          </button>
        )}
      </div>
    </nav>

    {/* Toast Notification */}
    {showToast && checkInState && (
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] animate-[slide-in-top_0.5s_ease-out]">
        <div className="bg-ark-overlay backdrop-blur-lg border border-ark-border px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4">
          <span className="text-sm font-medium text-green-400">✅ 今日已打卡</span>
          <div className="w-px h-4 bg-ark-surface-subtle"></div>
          <span className="text-sm font-medium text-orange-400">🔥 连续打卡 {checkInState.current_streak} 天</span>
        </div>
      </div>
    )}

    <SettingsModal open={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
    <MultiWeekCalendarModal open={showCalendarModal} onClose={() => setShowCalendarModal(false)} />
    </>
  );
};

export default Navigation;
