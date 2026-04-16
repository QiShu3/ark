import React from 'react';
import CalendarDayCell from './CalendarDayCell';
import CalendarTaskBar from './CalendarTaskBar';
import {
  CALENDAR_DAY_HEADER_HEIGHT,
  CALENDAR_MIN_CELL_HEIGHT,
  CALENDAR_TASK_FOOTER_PADDING,
  CALENDAR_TASK_LAYER_TOP,
  CALENDAR_TASK_ROW_HEIGHT,
} from './calendarLayout';
import { buildCalendarWeekSegments, CalendarTask, toDayKey } from './calendarUtils';

type CalendarWeekRowProps = {
  weekDays: Date[];
  groupedTasks: Record<string, CalendarTask[]>;
  todayKey: string;
  onDateClick: (day: Date) => void;
  onTaskClick?: (task: CalendarTask) => void;
};

const CalendarWeekRow: React.FC<CalendarWeekRowProps> = ({ weekDays, groupedTasks, todayKey, onDateClick, onTaskClick }) => {
  const segments = buildCalendarWeekSegments(weekDays, groupedTasks);
  const laneCount = segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0);
  const rowHeight = Math.max(
    CALENDAR_MIN_CELL_HEIGHT,
    CALENDAR_TASK_LAYER_TOP + Math.max(laneCount, 1) * CALENDAR_TASK_ROW_HEIGHT + CALENDAR_TASK_FOOTER_PADDING,
  );

  return (
    <div className="relative">
      <div className="grid grid-cols-7">
        {weekDays.map((day) => {
          const key = toDayKey(day);
          return (
            <CalendarDayCell
              key={key}
              day={day}
              tasks={groupedTasks[key] || []}
              todayKey={todayKey}
              onDateClick={onDateClick}
              rowHeight={rowHeight}
            />
          );
        })}
      </div>
      {segments.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{
            top: CALENDAR_TASK_LAYER_TOP,
          }}
        >
          <div
            className="grid grid-cols-7 gap-y-1.5"
            style={{
              gridAutoRows: `${CALENDAR_TASK_ROW_HEIGHT - 6}px`,
            }}
          >
            {segments.map((segment) => (
              <CalendarTaskBar key={`${segment.task.id}-${segment.startCol}-${segment.endCol}`} segment={segment} onTaskClick={onTaskClick} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CalendarWeekRow;
