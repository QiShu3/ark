import React from 'react';
import CalendarDayCell from './CalendarDayCell';
import { CalendarTask, toDayKey } from './calendarUtils';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type MultiWeekCalendarGridProps = {
  days: Date[];
  groupedTasks: Record<string, CalendarTask[]>;
  todayKey: string;
  onDateClick: (day: Date) => void;
  onTaskClick?: (task: CalendarTask) => void;
};

const MultiWeekCalendarGrid: React.FC<MultiWeekCalendarGridProps> = ({
  days,
  groupedTasks,
  todayKey,
  onDateClick,
  onTaskClick,
}) => (
  <div className="min-w-[1080px]">
    <div className="grid h-12 grid-cols-7 border-b border-white/10 bg-white/[0.02]">
      {WEEKDAYS.map((weekday) => (
        <div key={weekday} className="grid place-items-center text-sm font-bold text-white/55">
          {weekday}
        </div>
      ))}
    </div>
    <div className="grid grid-cols-7">
      {days.map((day) => {
        const key = toDayKey(day);
        return (
          <CalendarDayCell
            key={key}
            day={day}
            tasks={groupedTasks[key] || []}
            todayKey={todayKey}
            onDateClick={onDateClick}
            onTaskClick={onTaskClick}
          />
        );
      })}
    </div>
  </div>
);

export default MultiWeekCalendarGrid;
