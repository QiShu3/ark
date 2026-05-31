import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
        className={`ark-panel-card ark-calendar-widget flex flex-col p-4 text-left transition-colors hover:bg-[var(--ark-surface-subtle)] ${className || 'rounded-[24px]'}`}
      >
        <div className="relative mb-3 flex items-center justify-center">
          <span className="absolute left-0 text-base font-semibold text-[var(--ark-text)]">日历</span>
          <span className="text-base font-semibold text-[var(--ark-text)]">{monthLabel}</span>
          <span className="absolute right-0 flex items-center gap-2">
            <span className="ark-calendar-nav-button flex h-8 w-8 items-center justify-center rounded-full">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="ark-calendar-nav-button flex h-8 w-8 items-center justify-center rounded-full">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </span>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-x-3 text-sm text-[var(--ark-text-faint)]">
          {weekdays.map((day) => (
            <div key={day} className="flex h-6 items-center justify-center">
              {day}
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7 content-start gap-x-3 gap-y-0">
          {cells.map((cell, idx) => {
            let dateStr = '';
            if (cell.inCurrentMonth) {
              dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
            }
            const isChecked = cell.inCurrentMonth && checkedDates.has(dateStr);
            const dayClass = cell.isToday
              ? 'ark-calendar-day-today'
              : isChecked
                ? 'ark-calendar-day-checked'
                : cell.inCurrentMonth
                  ? 'ark-calendar-day-current'
                  : 'ark-calendar-day-muted';
            
            return (
              <div
                key={`${cell.day}-${idx}`}
                className={`ark-calendar-day ${dayClass}`}
              >
                {cell.day}
                {isChecked && (
                  <div className="ark-calendar-check absolute right-[-7px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" />
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
