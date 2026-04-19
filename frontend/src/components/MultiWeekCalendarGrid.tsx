import React from 'react';
import CalendarWeekRow from './CalendarWeekRow';
import { CalendarDot, CalendarTask } from './calendarUtils';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type MultiWeekCalendarGridProps = {
  days: Date[];
  groupedTasks: Record<string, CalendarTask[]>;
  groupedDots: Record<string, CalendarDot[]>;
  itemCounts: Record<string, number>;
  todayKey: string;
  onDateClick: (day: Date) => void;
  onTaskClick?: (task: CalendarTask) => void;
  onDotClick?: (item: CalendarDot) => void;
};

const MultiWeekCalendarGrid: React.FC<MultiWeekCalendarGridProps> = ({
  days,
  groupedTasks,
  groupedDots,
  itemCounts,
  todayKey,
  onDateClick,
  onTaskClick,
  onDotClick,
}) => (
  <div className="min-w-[1080px]">
    <div className="grid h-12 grid-cols-7 border-b border-white/10 bg-white/[0.02]">
      {WEEKDAYS.map((weekday) => (
        <div key={weekday} className="grid place-items-center text-sm font-bold text-white/55">
          {weekday}
        </div>
      ))}
    </div>
    <div>
      {Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIndex) => {
        const weekDays = days.slice(weekIndex * 7, weekIndex * 7 + 7);
        return (
          <CalendarWeekRow
            key={weekDays[0]?.toISOString() || weekIndex}
            weekDays={weekDays}
            groupedTasks={groupedTasks}
            groupedDots={groupedDots}
            itemCounts={itemCounts}
            todayKey={todayKey}
            onDateClick={onDateClick}
            onTaskClick={onTaskClick}
            onDotClick={onDotClick}
          />
        );
      })}
    </div>
  </div>
);

export default MultiWeekCalendarGrid;
