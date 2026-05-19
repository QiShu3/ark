import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, User } from '../lib/auth';
import { apiJson, checkIn, getCheckInStatus, CheckInStatus } from '../lib/api';
import confetti from 'canvas-confetti';
import { Calendar, LogOut } from 'lucide-react';
import WorkflowNavProgress from './WorkflowNavProgress';
import type { WorkflowSnapshot } from './workflowProgress';
import MultiWeekCalendarModal from './MultiWeekCalendarModal';

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

  const [checkInState, setCheckInState] = useState<CheckInStatus | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [workflowSnapshot, setWorkflowSnapshot] = useState<WorkflowSnapshot | null>(null);
  const focusNavigationLocked = isFocusWorkNavigationLocked(workflowSnapshot);

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
      apiJson<User>('/auth/me')
        .then(setUser)
        .catch((err) => {
            console.error('Failed to fetch user info:', err);
            // Consider clearing token if 401, but apiJson handles 401 by redirecting to login
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

  return (
    <>
      <nav className="fixed top-0 left-0 w-full h-16 bg-black/50 backdrop-blur-md text-white flex items-center px-6 z-50 border-b border-white/10">
      <div 
        className={`text-xl font-bold transition-colors ${
          focusNavigationLocked ? 'cursor-not-allowed text-white/55' : 'cursor-pointer hover:text-blue-400'
        }`}
        aria-disabled={focusNavigationLocked}
        onClick={() => navigateUnlessLocked('/')}
      >
        Ark Project
      </div>
      <div className="flex-1 flex justify-center px-6">
        {workflowSnapshot ? <WorkflowNavProgress workflow={workflowSnapshot} /> : null}
      </div>
      <div className="ml-auto flex items-center gap-6">
        <div className="flex gap-4">
          <button 
            type="button"
            disabled={focusNavigationLocked}
            className="hover:text-blue-400 transition-colors disabled:cursor-not-allowed disabled:text-white/35 disabled:hover:text-white/35"
            onClick={() => navigateUnlessLocked('/')}
          >
            Home
          </button>
          <button 
            type="button"
            disabled={focusNavigationLocked}
            className="hover:text-blue-400 transition-colors disabled:cursor-not-allowed disabled:text-white/35 disabled:hover:text-white/35"
            onClick={() => navigateUnlessLocked('/apps')}
          >
            Apps
          </button>
          <button type="button" disabled className="hover:text-gray-300 cursor-not-allowed opacity-70">About</button>
        </div>

        {/* Check-in Icon */}
        {user && checkInState && (
          <button
            type="button"
            aria-label="打开导航栏日历"
            disabled={focusNavigationLocked}
            className="relative flex items-center justify-center text-gray-300 hover:text-white transition-colors disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:text-gray-500"
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
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold shadow-lg border border-white/20">
                {user.username.charAt(0).toUpperCase()}
              </div>

              {/* 悬停显示的用户名 */}
              <div className="absolute right-0 top-full mt-2 px-3 py-1.5 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                {user.username}
              </div>
            </div>
            <button
              type="button"
              aria-label="退出登录"
              title="退出登录"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-gray-300 transition-colors hover:bg-white/20 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-300/70"
              onClick={handleLogout}
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button 
            onClick={() => navigate('/login')}
            className="text-sm bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-full transition-colors"
          >
            Login
          </button>
        )}
      </div>
    </nav>

    {/* Toast Notification */}
    {showToast && checkInState && (
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] animate-[slide-in-top_0.5s_ease-out]">
        <div className="bg-black/80 backdrop-blur-lg border border-white/20 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4">
          <span className="text-lg font-bold text-green-400">✅ 今日已打卡</span>
          <div className="w-px h-4 bg-white/20"></div>
          <span className="text-lg font-bold text-orange-400">🔥 连续打卡 {checkInState.current_streak} 天</span>
        </div>
      </div>
    )}

    <MultiWeekCalendarModal open={showCalendarModal} onClose={() => setShowCalendarModal(false)} />
    </>
  );
};

export default Navigation;
