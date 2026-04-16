import React from 'react';
import { CALENDAR_DAY_HEADER_HEIGHT } from './calendarLayout';
import { CalendarTask, toDayKey } from './calendarUtils';

type CalendarDayCellProps = {
  day: Date;
  tasks: CalendarTask[];
  todayKey: string;
  onDateClick: (day: Date) => void;
  rowHeight?: number;
};

const CalendarDayCell: React.FC<CalendarDayCellProps> = ({ day, tasks, todayKey, onDateClick, rowHeight }) => {
  const key = toDayKey(day);
  const isToday = key === todayKey;

  return (
    <div
      data-testid="calendar-day-cell"
      className={`relative min-h-[236px] min-w-0 overflow-visible border-r border-b border-white/[0.08] bg-white/[0.018] p-3 text-left transition-colors ${
        isToday ? 'bg-cyan-300/[0.08]' : ''
      }`}
      style={rowHeight ? { minHeight: rowHeight } : undefined}
    >
      <button
        type="button"
        onClick={() => onDateClick(day)}
        className="absolute inset-0 z-0 cursor-default"
        aria-label={`${key}${isToday ? ' 今天' : ''}，${tasks.length} 项任务`}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent" />
      <div
        className="pointer-events-none relative z-10 flex items-start justify-between gap-2 text-white/80"
        style={{ minHeight: CALENDAR_DAY_HEADER_HEIGHT }}
      >
        <span
          className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${
            isToday ? 'bg-cyan-300 text-slate-950 shadow-[0_0_0_4px_rgba(103,232,249,0.10)]' : ''
          }`}
        >
          {day.getDate()}
        </span>
        <span className="text-xs font-semibold text-white/35">{tasks.length} 项</span>
      </div>
      {tasks.length > 0 ? (
        <span
          className={`absolute inset-x-0 bottom-0 h-0.5 ${
            tasks.length > 4
              ? 'bg-gradient-to-r from-rose-400/50 to-amber-300/50'
              : 'bg-gradient-to-r from-cyan-300/40 to-emerald-300/40'
          }`}
        />
      ) : null}
    </div>
  );
};

export default CalendarDayCell;
