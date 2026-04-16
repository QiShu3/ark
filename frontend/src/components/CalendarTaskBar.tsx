import React from 'react';
import { CalendarTask, CalendarWeekSegment } from './calendarUtils';

const TASK_COLORS = ['sky', 'mint', 'lavender', 'pink', 'green', 'yellow', 'violet'] as const;

function taskColor(task: CalendarTask): string {
  const source = task.tags?.[0] || task.task_type || task.id;
  const code = Array.from(source).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return TASK_COLORS[code % TASK_COLORS.length];
}

type CalendarTaskBarProps = {
  segment: CalendarWeekSegment;
  onTaskClick?: (task: CalendarTask) => void;
};

const CalendarTaskBar: React.FC<CalendarTaskBarProps> = ({ segment, onTaskClick }) => (
  <button
    type="button"
    data-testid={`calendar-task-bar-${segment.task.id}`}
    onClick={() => onTaskClick?.(segment.task)}
    className={`calendar-task-label calendar-task-bar calendar-task-interactive calendar-task-${taskColor(segment.task)} ${
      segment.clippedStart ? 'calendar-task-bar-clipped-start' : ''
    } ${segment.clippedEnd ? 'calendar-task-bar-clipped-end' : ''}`}
    style={{
      gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
      gridRow: String(segment.lane + 1),
    }}
    aria-label={segment.task.title}
  >
    <span className="calendar-task-dot" />
    <span className="truncate">{segment.task.title}</span>
  </button>
);

export default CalendarTaskBar;
