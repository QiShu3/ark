import React from 'react';
import CalendarDayCell from './CalendarDayCell';
import CalendarTaskBar from './CalendarTaskBar';
import {
  CALENDAR_DAY_HEADER_HEIGHT,
  CALENDAR_MIN_CELL_HEIGHT,
  CALENDAR_TASK_FOOTER_PADDING,
  CALENDAR_TASK_LAYER_TOP,
  CALENDAR_TASK_ROW_HEIGHT,
  getCalendarDotStackHeight,
} from './calendarLayout';
import { buildCalendarWeekSegments, CalendarDot, CalendarTask, toDayKey } from './calendarUtils';

type CalendarWeekRowProps = {
  weekDays: Date[];
  groupedTasks: Record<string, CalendarTask[]>;
  groupedDots: Record<string, CalendarDot[]>;
  itemCounts: Record<string, number>;
  todayKey: string;
  onDateClick: (day: Date) => void;
  onTaskClick?: (task: CalendarTask) => void;
  onDotClick?: (item: CalendarDot) => void;
};

const CalendarWeekRow: React.FC<CalendarWeekRowProps> = ({
  weekDays,
  groupedTasks,
  groupedDots,
  itemCounts,
  todayKey,
  onDateClick,
  onTaskClick,
  onDotClick,
}) => {
  const segments = buildCalendarWeekSegments(weekDays, groupedTasks);
  const laneCount = segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0);
  const dotStackHeight = weekDays.reduce((max, day) => (
    Math.max(max, getCalendarDotStackHeight((groupedDots[toDayKey(day)] || []).length))
  ), 0);
  const taskLayerTop = CALENDAR_TASK_LAYER_TOP + dotStackHeight;
  const rowHeight = Math.max(
    CALENDAR_MIN_CELL_HEIGHT,
    taskLayerTop + Math.max(laneCount, 1) * CALENDAR_TASK_ROW_HEIGHT + CALENDAR_TASK_FOOTER_PADDING,
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
              itemCount={itemCounts[key] || 0}
              dotItems={groupedDots[key] || []}
              todayKey={todayKey}
              onDateClick={onDateClick}
              onDotClick={onDotClick}
              rowHeight={rowHeight}
            />
          );
        })}
      </div>
      {segments.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{
            top: taskLayerTop,
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
