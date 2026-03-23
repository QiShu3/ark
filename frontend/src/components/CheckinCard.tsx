import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { apiJson, apiFetch } from '../lib/api';

interface CheckinStatus {
  is_checked_in_today: boolean;
  current_streak: number;
  total_days: number;
}

export const CheckinCard: React.FC = () => {
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const data = await apiJson<CheckinStatus>('/api/checkin/status');
      setStatus(data);
    } catch (e) {
      console.error('Failed to fetch checkin status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleCheckin = async () => {
    if (!status || status.is_checked_in_today) return;
    try {
      const res = await apiFetch('/api/checkin', { method: 'POST' });
      if (res.ok) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
        });
        await fetchStatus();
      }
    } catch (e) {
      console.error('Checkin failed', e);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-sm mx-auto p-6 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 flex justify-center items-center min-h-[140px]">
        <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full"></div>
      </div>
    );
  }

  const isCheckedIn = status?.is_checked_in_today;

  return (
    <div className="w-full max-w-md mx-auto relative p-6 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md border border-white/20 shadow-xl overflow-hidden group">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-2xl opacity-0 group-hover:opacity-100 blur transition duration-500 pointer-events-none"></div>
      
      <div className="relative flex flex-col items-center gap-4">
        <div className="flex w-full justify-between items-center mb-2">
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">每日打卡</h2>
          {status && status.current_streak > 0 && (
            <div className="flex items-center gap-1 bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-sm font-medium border border-orange-500/30 shadow-sm">
              <span role="img" aria-label="streak">🔥</span>
              <span>连续打卡 {status.current_streak} 天</span>
            </div>
          )}
        </div>
        
        <button
          onClick={handleCheckin}
          disabled={isCheckedIn}
          className={`w-full py-4 flex justify-center items-center gap-2 text-lg font-semibold rounded-xl transition-all duration-300 ${
            isCheckedIn 
              ? 'bg-green-500/20 text-green-400 border border-green-500/30 cursor-default shadow-inner'
              : 'bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
          }`}
        >
          {isCheckedIn ? (
            <>
              <span role="img" aria-label="checked">✅</span> 今日已打卡
            </>
          ) : (
            '立即打卡'
          )}
        </button>

        {status && status.total_days > 0 && (
          <p className="text-xs text-white/40 text-center w-full mt-1">
            累计打卡 {status.total_days} 天
          </p>
        )}
      </div>
    </div>
  );
};
