import React from 'react';
import { CALENDAR_DAY_HEADER_HEIGHT } from './calendarLayout';
import { CalendarDot, toDayKey } from './calendarUtils';

type CalendarDayCellProps = {
  day: Date;
  itemCount: number;
  dotItems: CalendarDot[];
  todayKey: string;
  onDateClick: (day: Date) => void;
  onDotClick?: (item: CalendarDot) => void;
  rowHeight?: number;
};

function dotClassName(item: CalendarDot): string {
  if (item.kind === 'appointment') {
    if (item.status === 'needs_confirmation') return 'bg-amber-300 ring-2 ring-amber-300/30';
    if (item.status === 'cancelled') return 'bg-white/35';
    return 'bg-fuchsia-300';
  }
  return item.status === 'done' ? 'bg-emerald-300/70' : 'bg-cyan-300';
}

const CalendarDayCell: React.FC<CalendarDayCellProps> = ({ day, itemCount, dotItems, todayKey, onDateClick, onDotClick, rowHeight }) => {
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
        aria-label={`${key}${isToday ? ' 今天' : ''}，${itemCount} 项安排`}
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
        <span className="text-xs font-semibold text-white/35">{itemCount} 项</span>
      </div>
      {dotItems.length ? (
        <div className="relative z-20 mt-3 flex flex-col items-end gap-1.5">
          {dotItems.slice(0, 6).map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              aria-label={`打开${item.kind === 'appointment' ? '日程' : '任务'} ${item.title}`}
              title={item.title}
              onClick={(event) => {
                event.stopPropagation();
                onDotClick?.(item);
              }}
              className="flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-medium text-white/72 shadow-sm transition-colors hover:bg-white/10 hover:text-white"
            >
              <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClassName(item)}`} />
              <span className="min-w-0 max-w-[7.5rem] truncate">{item.title}</span>
            </button>
          ))}
          {dotItems.length > 6 ? (
            <span className="text-[10px] font-semibold text-white/45">+{dotItems.length - 6}</span>
          ) : null}
        </div>
      ) : null}
      {itemCount > 0 ? (
        <span
          className={`absolute inset-x-0 bottom-0 h-0.5 ${
            itemCount > 4
              ? 'bg-gradient-to-r from-rose-400/50 to-amber-300/50'
              : 'bg-gradient-to-r from-cyan-300/40 to-emerald-300/40'
          }`}
        />
      ) : null}
    </div>
  );
};

export default CalendarDayCell;
