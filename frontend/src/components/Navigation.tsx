import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, User } from '../lib/auth';
import { apiJson, checkIn, getCheckInStatus, CheckInStatus } from '../lib/api';
import confetti from 'canvas-confetti';
import { Calendar } from 'lucide-react';
import CalendarWidget from './CalendarWidget';

/**
 * 顶部导航栏组件
 * 仅作占位，固定在顶部
 */
const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);

  const [checkInState, setCheckInState] = useState<CheckInStatus | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);

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

  return (
    <>
      <nav className="fixed top-0 left-0 w-full h-16 bg-black/50 backdrop-blur-md text-white flex items-center px-6 z-50 border-b border-white/10">
      <div 
        className="text-xl font-bold cursor-pointer hover:text-blue-400 transition-colors"
        onClick={() => navigate('/')}
      >
        Ark Project
      </div>
      <div className="ml-auto flex items-center gap-6">
        <div className="flex gap-4">
          <button 
            className="hover:text-blue-400 transition-colors"
            onClick={() => navigate('/')}
          >
            Home
          </button>
          <button 
            className="hover:text-blue-400 transition-colors"
            onClick={() => navigate('/apps')}
          >
            Apps
          </button>
          <button
            className="hover:text-blue-400 transition-colors"
            onClick={() => navigate('/agent')}
          >
            Agent
          </button>
          <button className="hover:text-gray-300 cursor-not-allowed opacity-70">About</button>
        </div>

        {/* Check-in Icon */}
        {user && checkInState && (
          <div 
            className="relative flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer"
            title={checkInState.is_checked_in_today ? `已打卡 / 连续 ${checkInState.current_streak} 天` : "今日未打卡"}
            onClick={() => setShowCalendarModal(true)}
          >
            <Calendar size={28} />
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold mt-[6px]">
              {checkInState.current_streak}
            </span>
          </div>
        )}

        {/* 用户头像区域 */}
        {user ? (
          <div className="relative group cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold shadow-lg border border-white/20">
              {user.username.charAt(0).toUpperCase()}
            </div>
            
            {/* 悬停显示的用户名 */}
            <div className="absolute right-0 top-full mt-2 px-3 py-1.5 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
              {user.username}
            </div>
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

    {/* Calendar Modal */}
    {showCalendarModal && (
      <div 
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => setShowCalendarModal(false)}
      >
        <div 
          className="w-[340px] shadow-2xl animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarWidget />
        </div>
      </div>
    )}
    </>
  );
};

export default Navigation;
