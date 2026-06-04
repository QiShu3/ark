import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getCheckInStatus, checkIn, apiJson, CheckInStatus } from '../lib/api';
import { getPrimaryEvent } from '../lib/events/api';
import MultiWeekCalendarModal from './MultiWeekCalendarModal';
import AppModalFrame from './AppModalFrame';
import CalendarDateDrawer from './CalendarDateDrawer';
import TaskEditModal from './TaskEditModal';
import AppointmentEditModal from './AppointmentEditModal';
import HomeCard from './HomeCard';
import { cn } from '../lib/utils';
import {
  CalendarTask,
  CalendarAppointment,
  toDayKey,
  formatRangeParam,
  groupCalendarTaskItemsByDay,
  groupAppointmentsByDay,
} from './calendarUtils';

interface CalendarWidgetProps {
  className?: string;
}

// Helper to calculate milestone dates (dates where the consecutive streak reaches multiples of 7)
function getMilestoneDates(checkedDatesList: string[]): Set<string> {
  const milestoneSet = new Set<string>();
  if (!checkedDatesList.length) return milestoneSet;

  const sortedDates = [...checkedDatesList].sort((a, b) => a.localeCompare(b));

  let currentStreak = 0;
  let prevDateStr: string | null = null;

  for (const dateStr of sortedDates) {
    if (!prevDateStr) {
      currentStreak = 1;
    } else {
      const prev = new Date(prevDateStr);
      const curr = new Date(dateStr);
      const diffTime = curr.getTime() - prev.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak += 1;
      } else if (diffDays > 1) {
        currentStreak = 1;
      }
    }

    if (currentStreak > 0 && currentStreak % 7 === 0) {
      milestoneSet.add(dateStr);
    }
    prevDateStr = dateStr;
  }

  return milestoneSet;
}

const CalendarWidget: React.FC<CalendarWidgetProps> = ({ className = '' }) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [checkInState, setCheckInState] = useState<CheckInStatus | null>(null);
  const [showMultiWeekCalendar, setShowMultiWeekCalendar] = useState(false);
  
  // States for Date Drawer
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  // States for Task/Appointment Editing
  const [editingTask, setEditingTask] = useState<CalendarTask | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<CalendarAppointment | null>(null);

  const loadCheckIn = () => {
    getCheckInStatus()
      .then(res => setCheckInState(res))
      .catch(console.error);
  };

  useEffect(() => {
    loadCheckIn();
    window.addEventListener('ark:reload-checkin', loadCheckIn);
    return () => window.removeEventListener('ark:reload-checkin', loadCheckIn);
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthLabel = `${year}年${month + 1}月`;

  const todayDate = new Date();
  const todayYear = todayDate.getFullYear();
  const todayMonth = todayDate.getMonth();
  const todayDay = todayDate.getDate();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  const cells = useMemo(() => {
    return Array.from({ length: 42 }, (_, i) => {
      const offset = i - firstWeekday + 1;
      if (offset < 1) {
        const prevMonthYear = month === 0 ? year - 1 : year;
        const prevMonthVal = month === 0 ? 11 : month - 1;
        const dayVal = daysInPrevMonth + offset;
        return {
          day: dayVal,
          month: prevMonthVal,
          year: prevMonthYear,
          inCurrentMonth: false,
          isToday: false,
        };
      }
      if (offset > daysInMonth) {
        const nextMonthYear = month === 11 ? year + 1 : year;
        const nextMonthVal = month === 11 ? 0 : month + 1;
        const dayVal = offset - daysInMonth;
        return {
          day: dayVal,
          month: nextMonthVal,
          year: nextMonthYear,
          inCurrentMonth: false,
          isToday: false,
        };
      }
      return {
        day: offset,
        month: month,
        year: year,
        inCurrentMonth: true,
        isToday: offset === todayDay && year === todayYear && month === todayMonth,
      };
    });
  }, [year, month, firstWeekday, daysInMonth, daysInPrevMonth, todayDay, todayYear, todayMonth]);

  // Load calendar tasks/appointments for visible cells range
  useEffect(() => {
    let active = true;
    const firstCell = cells[0];
    const lastCell = cells[41];
    const startDate = new Date(firstCell.year, firstCell.month, firstCell.day);
    const endDate = new Date(lastCell.year, lastCell.month, lastCell.day + 1);

    setLoadingItems(true);
    Promise.all([
      apiJson<CalendarTask[]>(`/todo/tasks/calendar?start=${formatRangeParam(startDate)}&end=${formatRangeParam(endDate)}`),
      apiJson<CalendarAppointment[]>('/todo/appointments?view=all'),
      getPrimaryEvent().catch(() => null),
    ])
      .then(([nextTasks, nextAppointments, primaryEvent]) => {
        if (!active) return;
        const eventId = primaryEvent?.id ?? null;
        const filteredTasks = eventId ? nextTasks.filter((t) => t.event_id === eventId) : nextTasks;
        const filteredAppointments = eventId
          ? nextAppointments.filter((a) => a.event_id === eventId)
          : nextAppointments;

        setTasks(filteredTasks);
        setAppointments(filteredAppointments.filter((appointment) => {
          const endsAt = new Date(appointment.ends_at);
          return endsAt >= startDate && endsAt < endDate;
        }));
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoadingItems(false);
      });

    return () => {
      active = false;
    };
  }, [currentDate, reloadVersion, cells]);

  const visibleDays = useMemo(() => {
    return cells.map(c => new Date(c.year, c.month, c.day));
  }, [cells]);

  const groupedTaskItems = useMemo(() => groupCalendarTaskItemsByDay(tasks, visibleDays), [tasks, visibleDays]);
  const groupedAppointments = useMemo(() => groupAppointmentsByDay(appointments, visibleDays), [appointments, visibleDays]);

  const milestoneDates = useMemo(() => {
    return checkInState ? getMilestoneDates(checkInState.checked_dates) : new Set<string>();
  }, [checkInState]);

  const handleCheckIn = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await checkIn();
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      });
      loadCheckIn();
      window.dispatchEvent(new CustomEvent('ark:reload-checkin'));
    } catch (err) {
      console.error('Check-in failed:', err);
    }
  };

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const isCheckedInToday = checkInState?.is_checked_in_today ?? false;
  const streak = checkInState?.current_streak ?? 0;

  const selectedTasks = selectedDate ? groupedTaskItems[toDayKey(selectedDate)] || [] : [];
  const selectedAppointments = selectedDate ? groupedAppointments[toDayKey(selectedDate)] || [] : [];

  return (
    <>
      <HomeCard className={cn("pt-2 pb-1.5 px-3.5 flex flex-col min-h-0 select-none overflow-hidden justify-between h-full", className)}>
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="打开多周任务日历"
            onClick={() => setShowMultiWeekCalendar(true)}
            className="flex items-center gap-1.5 text-left font-semibold text-[var(--ark-text)] hover:opacity-85 transition-opacity focus:outline-none"
          >
            <Calendar className="h-4 w-4 text-[var(--ark-accent)]" />
            <span className="text-xs font-semibold">日历</span>
          </button>
          
          <button
            type="button"
            onClick={() => setShowMultiWeekCalendar(true)}
            className="text-xs font-semibold text-[var(--ark-text)] hover:opacity-85 transition-opacity focus:outline-none"
          >
            {monthLabel}
          </button>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-[var(--ark-surface-subtle)] text-[var(--ark-text-muted)] transition-colors focus:outline-none"
              aria-label="上个月"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-[var(--ark-surface-subtle)] text-[var(--ark-text-muted)] transition-colors focus:outline-none"
              aria-label="下个月"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Check-in Status Indicators */}
        <div className="flex items-center justify-center gap-2 text-[10px] text-[var(--ark-text-muted)] my-0.5">
          {isCheckedInToday ? (
            <span className="flex items-center gap-1 font-medium text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              今日已打卡
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--ark-text-faint)]">
              <span className="h-1.5 w-1.5 rounded-full border border-[var(--ark-accent)] bg-transparent" />
              今日还未打卡
            </span>
          )}
          <span className="text-[var(--ark-text-faint)] opacity-60">·</span>
          <span className="text-[var(--ark-accent)] font-semibold">
            连续 {streak} 天
          </span>
          {!isCheckedInToday && (
            <>
              <span className="text-[var(--ark-text-faint)] opacity-60">·</span>
              <button
                type="button"
                onClick={handleCheckIn}
                className="text-[var(--ark-accent)] hover:underline font-semibold hover:opacity-85 focus:outline-none"
              >
                立即打卡
              </button>
            </>
          )}
        </div>

        {/* Weekday Labels */}
        <div className="grid grid-cols-7 gap-x-1.5 text-center text-[10px] font-semibold text-[var(--ark-text-faint)]">
          {weekdays.map((day) => (
            <div key={day} className="flex h-5 items-center justify-center">
              {day}
            </div>
          ))}
        </div>

        {/* Cells Grid */}
        <div className="grid flex-1 grid-cols-7 gap-x-1.5 gap-y-0 text-center content-start">
          {cells.map((cell, idx) => {
            const cellDateStr = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
            const isChecked = checkInState?.checked_dates.includes(cellDateStr) ?? false;
            const isMilestone = milestoneDates.has(cellDateStr);

            let dotType: 'none' | 'blue' | 'orange' | 'hollow' | 'grey' = 'none';
            if (cell.inCurrentMonth) {
              if (isChecked) {
                dotType = isMilestone ? 'orange' : 'blue';
              } else {
                if (cell.isToday) {
                  dotType = 'hollow';
                } else {
                  dotType = 'grey';
                }
              }
            }

            // Cell styling
            let cellStyle = '';
            if (cell.isToday) {
              cellStyle = isChecked
                ? 'bg-[var(--ark-accent)] text-[var(--ark-on-accent)] shadow-sm'
                : 'border border-[var(--ark-accent)] text-[var(--ark-accent)]';
            } else if (isChecked) {
              cellStyle = 'text-[var(--ark-text)] font-semibold';
            } else if (cell.inCurrentMonth) {
              cellStyle = 'text-[var(--ark-text)]';
            } else {
              cellStyle = 'text-[var(--ark-text-faint)] opacity-35';
            }

            return (
              <button
                key={`${cell.day}-${idx}`}
                type="button"
                onClick={() => setSelectedDate(new Date(cell.year, cell.month, cell.day))}
                className="flex flex-col items-center justify-center rounded-md hover:bg-[var(--ark-surface-subtle)] transition-colors focus:outline-none py-0.5"
              >
                <div className={cn(
                  "flex items-center justify-center text-[10px] font-semibold w-6 h-6 rounded-full transition-all",
                  cellStyle
                )}>
                  {cell.day}
                </div>
                <div className="h-1 flex items-center justify-center mt-0.5">
                  {dotType === 'blue' && <span className="h-1 w-1 rounded-full bg-[var(--ark-accent)]" />}
                  {dotType === 'orange' && <span className="h-1 w-1 rounded-full bg-[var(--ark-arrangement-accent)]" />}
                  {dotType === 'hollow' && <span className="h-1 w-1 rounded-full border border-[var(--ark-accent)] bg-transparent" />}
                  {dotType === 'grey' && <span className="h-1 w-1 rounded-full bg-[var(--ark-text-faint)] opacity-55" />}
                </div>
              </button>
            );
          })}
        </div>
      </HomeCard>

      {/* Multi-Week Modal */}
      <MultiWeekCalendarModal open={showMultiWeekCalendar} onClose={() => setShowMultiWeekCalendar(false)} />

      {/* Date Detail Drawer Modal */}
      <AppModalFrame
        open={Boolean(selectedDate)}
        onClose={() => setSelectedDate(null)}
        zIndexClassName="z-[70]"
        ariaLabel="日程待办详情"
        panelClassName="w-[360px] max-w-[94vw] overflow-hidden rounded-2xl border border-ark-border bg-ark-surface-strong text-ark-text shadow-2xl"
      >
        <CalendarDateDrawer
          date={selectedDate}
          tasks={selectedTasks}
          appointments={selectedAppointments}
          onClose={() => setSelectedDate(null)}
          onTaskClick={setEditingTask}
          onAppointmentClick={setEditingAppointment}
        />
      </AppModalFrame>

      {/* Task & Appointment Editing Modals */}
      <TaskEditModal
        open={Boolean(editingTask)}
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onChanged={() => {
          setEditingTask(null);
          setReloadVersion((value) => value + 1);
        }}
      />
      <AppointmentEditModal
        open={Boolean(editingAppointment)}
        appointment={editingAppointment}
        onClose={() => setEditingAppointment(null)}
        onChanged={() => {
          setEditingAppointment(null);
          setReloadVersion((value) => value + 1);
        }}
      />
    </>
  );
};

export default CalendarWidget;

