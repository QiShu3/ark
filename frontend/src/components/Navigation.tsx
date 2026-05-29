import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, User } from '../lib/auth';
import { apiJson, checkIn, getCheckInStatus, CheckInStatus } from '../lib/api';
import confetti from 'canvas-confetti';
import { BookOpen, Calendar, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import WorkflowNavProgress from './WorkflowNavProgress';
import type { WorkflowSnapshot } from './workflowProgress';
import MultiWeekCalendarModal from './MultiWeekCalendarModal';
import { restartFirstGuide } from '../lib/onboardingEvents';
import SettingsModal from './SettingsModal';
import { useCustomizationStore } from '../lib/customization';
import { useTheme } from '../hooks/useTheme';

function isFocusWorkNavigationLocked(workflow: WorkflowSnapshot | null): boolean {
  return workflow?.state === 'focus' && workflow.focus_work_display_state === 'fullscreen';
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

  const [checkInState, setCheckInState] = useState<CheckInStatus | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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
      if (isFocusWorkNavigationLocked(snapshot)) setShowCalendarModal(false);
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

  function navigateUnlessLocked(path: string) {
    if (focusNavigationLocked) return;
    navigate(path);
  }

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
      <nav className="fixed left-0 top-0 z-50 flex h-16 w-full items-center border-b ark-border bg-[var(--ark-surface)] px-6 text-[var(--ark-text)] backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div
          className={`text-lg font-semibold ark-font-display transition-colors ${
            focusNavigationLocked ? 'cursor-not-allowed text-[var(--ark-text-faint)]' : 'cursor-pointer hover:text-[var(--ark-accent)]'
          }`}
          aria-disabled={focusNavigationLocked}
          onClick={() => navigateUnlessLocked('/')}
        >
          Ark Project
        </div>
        <button
          type="button"
          aria-label="重新进入首次体验引导"
          title="重新进入首次体验引导"
          disabled={focusNavigationLocked}
          className="ark-focus-ring flex h-9 w-9 items-center justify-center rounded-full border ark-border bg-[var(--ark-surface-subtle)] text-[var(--ark-text-muted)] transition-colors hover:bg-[var(--ark-accent-soft)] hover:text-[var(--ark-text)] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleRestartOnboarding}
        >
          <BookOpen size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1" />
      {workflowSnapshot ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none hidden md:block">
          <div className="pointer-events-auto">
            <WorkflowNavProgress workflow={workflowSnapshot} />
          </div>
        </div>
      ) : null}
      <div className="ml-auto flex items-center gap-6">


        {/* Check-in Icon */}
        {user && checkInState && (
          <button
            type="button"
            aria-label="打开导航栏日历"
            disabled={focusNavigationLocked}
            className="relative flex items-center justify-center text-[var(--ark-text-muted)] transition-colors hover:text-[var(--ark-text)] disabled:cursor-not-allowed disabled:text-[var(--ark-text-faint)] disabled:hover:text-[var(--ark-text-faint)]"
            title={checkInState.is_checked_in_today ? `已打卡 / 连续 ${checkInState.current_streak} 天` : "今日未打卡"}
            onClick={() => {
              if (focusNavigationLocked) return;
              setShowCalendarModal(true);
            }}
          >
            <Calendar size={28} />
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold mt-[6px]">
              {checkInState.current_streak}
            </span>
          </button>
        )}

        {/* 用户头像区域 */}
        {user ? (
          <div className="flex items-center gap-3">
            <div className="relative group cursor-pointer">
              {avatarUrl ? (
                <img src={avatarUrl} alt={user.username} className="w-8 h-8 rounded-full object-cover border border-ark-border" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold shadow-lg border border-ark-border">
                  {user.username.charAt(0).toUpperCase()}
                </div>
              )}

              {/* 悬停显示的用户名 */}
              <div className="absolute right-0 top-full mt-2 px-3 py-1.5 bg-ark-overlay backdrop-blur-md border border-ark-border rounded-lg text-sm text-ark-text opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                {user.username}
              </div>
            </div>
            <button
              type="button"
              aria-label={focusNavigationLocked ? '切换外观模式' : nextThemeLabel}
              title={themeButtonTitle}
              disabled={focusNavigationLocked}
              className="ark-focus-ring flex h-8 w-8 items-center justify-center rounded-full border ark-border bg-[var(--ark-surface-subtle)] text-[var(--ark-text-muted)] transition-colors hover:bg-[var(--ark-accent-soft)] hover:text-[var(--ark-text)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={toggleResolvedTheme}
            >
              <ThemeIcon size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="打开界面设置"
              title="界面设置"
              disabled={focusNavigationLocked}
              className="ark-focus-ring flex h-8 w-8 items-center justify-center rounded-full border ark-border bg-[var(--ark-surface-subtle)] text-[var(--ark-text-muted)] transition-colors hover:bg-[var(--ark-accent-soft)] hover:text-[var(--ark-text)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                if (focusNavigationLocked) return;
                setShowSettingsModal(true);
              }}
            >
              <Settings size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="退出登录"
              title="退出登录"
              className="ark-focus-ring flex h-8 w-8 items-center justify-center rounded-full border ark-border bg-[var(--ark-surface-subtle)] text-[var(--ark-text-muted)] transition-colors hover:bg-[var(--ark-accent-soft)] hover:text-[var(--ark-text)]"
              onClick={handleLogout}
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button 
            onClick={() => navigate('/login')}
            className="ark-button-secondary text-sm px-4 py-1.5 rounded-full transition-colors"
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

    <MultiWeekCalendarModal open={showCalendarModal} onClose={() => setShowCalendarModal(false)} />
    <SettingsModal open={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
    </>
  );
};

export default Navigation;
