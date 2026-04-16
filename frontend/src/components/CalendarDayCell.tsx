import React from 'react';
import { CalendarTask, CalendarTaskContinuation, toDayKey } from './calendarUtils';

const TASK_COLORS = ['sky', 'mint', 'lavender', 'pink', 'green', 'yellow', 'violet'] as const;

function taskColor(task: CalendarTask): string {
  const source = task.tags?.[0] || task.task_type || task.id;
  const code = Array.from(source).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return TASK_COLORS[code % TASK_COLORS.length];
}

type CalendarDayCellProps = {
  day: Date;
  tasks: CalendarTask[];
  todayKey: string;
  onDateClick: (day: Date) => void;
  onTaskClick?: (task: CalendarTask) => void;
  taskContinuations?: Record<string, CalendarTaskContinuation>;
};

const CalendarDayCell: React.FC<CalendarDayCellProps> = ({ day, tasks, todayKey, onDateClick, onTaskClick, taskContinuations = {} }) => {
  const key = toDayKey(day);
  const visibleTasks = tasks.slice(0, 4);
  const overflow = Math.max(0, tasks.length - visibleTasks.length);
  const isToday = key === todayKey;

  return (
    <button
      type="button"
      data-testid="calendar-day-cell"
      onClick={() => onDateClick(day)}
      className={`relative min-h-[236px] min-w-0 overflow-visible border-r border-b border-white/[0.08] bg-white/[0.018] p-3 text-left transition-colors ${
        isToday ? 'bg-cyan-300/[0.08]' : ''
      }`}
      aria-label={`${key}${isToday ? ' 今天' : ''}，${tasks.length} 项任务`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent" />
      <div className="relative z-10 mb-3 flex min-h-8 items-center justify-between gap-2 text-white/80">
        <span
          className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${
            isToday ? 'bg-cyan-300 text-slate-950 shadow-[0_0_0_4px_rgba(103,232,249,0.10)]' : ''
          }`}
        >
          {day.getDate()}
        </span>
        <span className="text-xs font-semibold text-white/35">{tasks.length} 项</span>
      </div>
      <div className="relative z-10 flex flex-col gap-1.5">
        {visibleTasks.map((task) => {
          const continuation = taskContinuations[task.id];
          return (
            <span
              key={task.id}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onTaskClick?.(task);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onTaskClick?.(task);
                }
              }}
              className={`calendar-task-label calendar-task-interactive calendar-task-${taskColor(task)} ${
                continuation?.continuesFromPrev ? 'calendar-task-continued-prev' : ''
              } ${continuation?.continuesToNext ? 'calendar-task-continued-next' : ''}`}
            >
              <span className="calendar-task-dot" />
              <span className="truncate">{task.title}</span>
            </span>
          );
        })}
        {overflow > 0 ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onDateClick(day);
            }}
            className="calendar-task-interactive flex h-7 items-center rounded-[10px] border border-dashed border-white/15 bg-white/[0.025] px-2 text-xs text-white/60"
            aria-label={`${key} 还有 ${overflow} 项任务，打开详情`}
          >
            +{overflow} 项折叠
          </span>
        ) : null}
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
    </button>
  );
};

export default CalendarDayCell;
