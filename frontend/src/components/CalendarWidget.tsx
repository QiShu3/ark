import React, { useState, useEffect } from 'react';
import { getCheckInStatus } from '../lib/api';
import MultiWeekCalendarModal from './MultiWeekCalendarModal';

interface CalendarWidgetProps {
  className?: string;
}

const CalendarWidget: React.FC<CalendarWidgetProps> = ({ className = '' }) => {
  const [checkedDates, setCheckedDates] = useState<Set<string>>(new Set());
  const [showMultiWeekCalendar, setShowMultiWeekCalendar] = useState(false);

  useEffect(() => {
    const load = () => {
      getCheckInStatus()
        .then(res => setCheckedDates(new Set(res.checked_dates)))
        .catch(console.error);
    };
    load();
    window.addEventListener('ark:reload-checkin', load);
    return () => window.removeEventListener('ark:reload-checkin', load);
  }, []);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const monthLabel = `${year}年${month + 1}月`;
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  
  const cells = Array.from({ length: 42 }, (_, i) => {
    const offset = i - firstWeekday + 1;
    if (offset < 1) {
      return {
        day: daysInPrevMonth + offset,
        inCurrentMonth: false,
        isToday: false,
      };
    }
    if (offset > daysInMonth) {
      return {
        day: offset - daysInMonth,
        inCurrentMonth: false,
        isToday: false,
      };
    }
    return {
      day: offset,
      inCurrentMonth: true,
      isToday: offset === today,
    };
  });

  return (
    <>
      <button
        type="button"
        aria-label="打开多周任务日历"
        onClick={() => setShowMultiWeekCalendar(true)}
        className={`bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 p-3 flex flex-col text-left hover:bg-white/[0.14] transition-colors ${className}`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/85 text-sm font-semibold">日历</span>
          <span className="text-white/60 text-xs">{monthLabel}</span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[10px] text-white/45 mb-1">
          {weekdays.map((day) => (
            <div key={day} className="h-5 flex items-center justify-center">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 flex-1">
          {cells.map((cell, idx) => {
            let dateStr = '';
            if (cell.inCurrentMonth) {
              dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
            }
            const isChecked = cell.inCurrentMonth && checkedDates.has(dateStr);
            
            return (
              <div
                key={`${cell.day}-${idx}`}
                className={`h-6 rounded flex items-center justify-center text-[11px] relative ${
                  cell.isToday
                    ? 'bg-[#B5D2E8]/90 text-black/80 font-bold shadow-sm'
                    : cell.inCurrentMonth
                      ? isChecked 
                        ? 'bg-[#E5989B]/90 text-white font-bold shadow-sm' 
                        : 'text-white/80 bg-white/[0.03]'
                      : 'text-white/25'
                }`}
              >
                {cell.day}
                {isChecked && (
                  <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center ${cell.isToday ? 'bg-blue-500 shadow-sm border border-[#1a1a1a]' : 'bg-transparent'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke={cell.isToday ? 'white' : '#3b82f6'} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </button>
      <MultiWeekCalendarModal open={showMultiWeekCalendar} onClose={() => setShowMultiWeekCalendar(false)} />
    </>
  );
};

export default CalendarWidget;
