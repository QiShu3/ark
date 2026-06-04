import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { getCheckInStatus, CheckInStatus } from '../lib/api';
import MultiWeekCalendarModal from './MultiWeekCalendarModal';

interface CalendarWidgetProps {
  className?: string;
}

const CalendarWidget: React.FC<CalendarWidgetProps> = ({ className = '' }) => {
  const [checkedDates, setCheckedDates] = useState<Set<string>>(new Set());
  const [checkInState, setCheckInState] = useState<CheckInStatus | null>(null);
  const [showMultiWeekCalendar, setShowMultiWeekCalendar] = useState(false);
  const [modalInitialDate, setModalInitialDate] = useState<Date | undefined>(undefined);
  const [currentDate, setCurrentDate] = useState(() => new Date());

  useEffect(() => {
    const load = () => {
      getCheckInStatus()
        .then(res => {
          setCheckInState(res);
          setCheckedDates(new Set(res.checked_dates));
        })
        .catch(console.error);
    };
    load();
    window.addEventListener('ark:reload-checkin', load);
    return () => window.removeEventListener('ark:reload-checkin', load);
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthLabel = `${year} 年 ${month + 1} 月`;
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  const now = new Date();
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const cells = Array.from({ length: 42 }, (_, i) => {
    const offset = i - firstWeekday + 1;
    if (offset < 1) {
      const prevDate = new Date(year, month - 1, daysInPrevMonth + offset);
      const y = prevDate.getFullYear();
      const m = prevDate.getMonth() + 1;
      const d = prevDate.getDate();
      return {
        day: daysInPrevMonth + offset,
        inCurrentMonth: false,
        dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      };
    }
    if (offset > daysInMonth) {
      const nextDate = new Date(year, month + 1, offset - daysInMonth);
      const y = nextDate.getFullYear();
      const m = nextDate.getMonth() + 1;
      const d = nextDate.getDate();
      return {
        day: offset - daysInMonth,
        inCurrentMonth: false,
        dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      };
    }
    return {
      day: offset,
      inCurrentMonth: true,
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(offset).padStart(2, '0')}`,
    };
  });

  const cellChecked = cells.map(cell => cell.inCurrentMonth && checkedDates.has(cell.dateStr));


  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const isCheckedInToday = checkInState?.is_checked_in_today ?? false;
  const currentStreak = checkInState?.current_streak ?? 0;
  const statusLabelText = `${isCheckedInToday ? '今日已打卡' : '今日还未打卡'} · 连续 ${currentStreak} 天`;

  return (
    <>
      <div
        className={`ark-panel-card ark-calendar-widget flex flex-col p-3.5 text-left ${className || 'rounded-[24px]'}`}
      >
        <div className="relative mb-1 flex items-center justify-between">
          <button
            type="button"
            aria-label="打开多周任务日历"
            onClick={() => {
              setModalInitialDate(currentDate);
              setShowMultiWeekCalendar(true);
            }}
            className="flex items-center gap-2 transition-opacity hover:opacity-85"
          >
            <CalendarDays className="h-5 w-5 text-blue-500" />
            <span className="text-lg font-bold text-[var(--ark-text)]">日历</span>
          </button>
          <span className="text-[17px] font-bold text-[var(--ark-text)] tracking-wider">
            {monthLabel}
          </span>
          
          <span className="flex items-center gap-2">
            <button
              type="button"
              aria-label="上一月"
              onClick={handlePrevMonth}
              className="ark-calendar-nav-button flex h-7 w-7 items-center justify-center rounded-full"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="下一月"
              onClick={handleNextMonth}
              className="ark-calendar-nav-button flex h-7 w-7 items-center justify-center rounded-full"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        </div>

        {/* 今日打卡状态 */}
        <div className="mb-1.5 flex items-center text-sm font-medium text-[var(--ark-text-muted)]">
          <span className="mr-1.5 h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
          {statusLabelText}
        </div>

        {/* 星期头部 */}
        <div className="mb-1 grid grid-cols-7 text-xs font-semibold text-[var(--ark-text-faint)]">
          {weekdays.map((day) => (
            <div key={day} className="flex h-6 items-center justify-center">
              {day}
            </div>
          ))}
        </div>

        {/* 日历格子网格 */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((cell, idx) => {
            const isChecked = cellChecked[idx];
            const isToday = cell.dateStr === todayDateStr;

            // 连接线计算
            const hasLeft = isChecked && (idx % 7 !== 0) && cellChecked[idx - 1];
            const hasRight = isChecked && (idx % 7 !== 6) && cellChecked[idx + 1];

            let circleClass = '';
            if (!cell.inCurrentMonth) {
              circleClass = 'ark-calendar-circle-muted';
            } else {
              if (isToday) {
                circleClass = isChecked ? 'ark-calendar-circle-today-checked' : 'ark-calendar-circle-today-pending';
              } else if (isChecked) {
                circleClass = 'ark-calendar-circle-checked';
              } else if (cell.dateStr < todayDateStr) {
                circleClass = 'ark-calendar-circle-missed';
              } else {
                circleClass = 'ark-calendar-circle-normal';
              }
            }

            return (
              <div
                key={`${cell.day}-${idx}`}
                className="ark-calendar-day-cell"
              >
                {/* 连续打卡的连接线背景 */}
                {isChecked && (hasLeft || hasRight) && (
                  <div
                    className={`ark-calendar-day-connection ${
                      hasLeft && hasRight
                        ? 'connect-full'
                        : hasLeft
                          ? 'connect-left rounded-r-full'
                          : 'connect-right rounded-l-full'
                    }`}
                  />
                )}
                
                {/* 日期数字圈 */}
                <button
                  type="button"
                  onClick={() => {
                    setModalInitialDate(new Date(cell.dateStr));
                    setShowMultiWeekCalendar(true);
                  }}
                  className={`ark-calendar-day-circle ${circleClass} hover:scale-[1.08] active:scale-[0.95]`}
                >
                  {cell.day}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {showMultiWeekCalendar && (
        <MultiWeekCalendarModal
          open={true}
          initialDate={modalInitialDate}
          onClose={() => {
            setShowMultiWeekCalendar(false);
            setModalInitialDate(undefined);
          }}
        />
      )}
    </>
  );
};

export default CalendarWidget;
