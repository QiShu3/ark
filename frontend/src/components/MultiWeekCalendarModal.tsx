import React, { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/api';
import CalendarDateDrawer from './CalendarDateDrawer';
import MultiWeekCalendarGrid from './MultiWeekCalendarGrid';
import AppointmentEditModal from './AppointmentEditModal';
import TaskEditModal from './TaskEditModal';
import {
  addDays,
  buildVisibleDays,
  CalendarAppointment,
  CalendarDot,
  CalendarTask,
  formatRangeParam,
  getStoredWeekCount,
  groupAppointmentsByDay,
  groupCalendarDotsByDay,
  groupCalendarTaskItemsByDay,
  groupTasksByDay,
  isScheduledCalendarTask,
  setStoredWeekCount,
  toDayKey,
  WeekCount,
} from './calendarUtils';

type MultiWeekCalendarModalProps = {
  open: boolean;
  onClose: () => void;
  initialDate?: Date;
};

const MultiWeekCalendarModal: React.FC<MultiWeekCalendarModalProps> = ({ open, onClose, initialDate }) => {
  const [anchorDate, setAnchorDate] = useState(() => initialDate || new Date());
  const [weekCount, setWeekCount] = useState<WeekCount>(() => getStoredWeekCount());
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingTask, setEditingTask] = useState<CalendarTask | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<CalendarAppointment | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => (initialDate || new Date()).getFullYear());
  const [reloadVersion, setReloadVersion] = useState(0);

  const visibleDays = useMemo(() => buildVisibleDays(anchorDate, weekCount), [anchorDate, weekCount]);
  const scheduledTasks = useMemo(() => tasks.filter(isScheduledCalendarTask), [tasks]);
  const groupedTasks = useMemo(() => groupTasksByDay(scheduledTasks, visibleDays), [scheduledTasks, visibleDays]);
  const groupedTaskItems = useMemo(() => groupCalendarTaskItemsByDay(tasks, visibleDays), [tasks, visibleDays]);
  const groupedAppointments = useMemo(() => groupAppointmentsByDay(appointments, visibleDays), [appointments, visibleDays]);
  const groupedDots = useMemo(() => groupCalendarDotsByDay(tasks, appointments, visibleDays), [tasks, appointments, visibleDays]);
  const itemCounts = useMemo(() => (
    Object.fromEntries(visibleDays.map((day) => {
      const key = toDayKey(day);
      return [key, (groupedTaskItems[key] || []).length + (groupedAppointments[key] || []).length];
    }))
  ), [groupedAppointments, groupedTaskItems, visibleDays]);
  const todayKey = toDayKey(new Date());
  const selectedTasks = selectedDate ? groupedTaskItems[toDayKey(selectedDate)] || [] : [];
  const selectedAppointments = selectedDate ? groupedAppointments[toDayKey(selectedDate)] || [] : [];

  useEffect(() => {
    if (!open) return;
    const start = visibleDays[0];
    const end = addDays(visibleDays[visibleDays.length - 1], 1);
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });

    Promise.all([
      apiJson<CalendarTask[]>(`/todo/tasks/calendar?start=${formatRangeParam(start)}&end=${formatRangeParam(end)}`),
      apiJson<CalendarAppointment[]>('/todo/appointments?view=all'),
    ])
      .then(([nextTasks, nextAppointments]) => {
        if (cancelled) return;
        setTasks(nextTasks);
        setAppointments(nextAppointments.filter((appointment) => {
          const endsAt = new Date(appointment.ends_at);
          return endsAt >= start && endsAt < end;
        }));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load calendar arrangements', err);
        setError(err instanceof Error ? err.message : '加载安排日历失败');
        setTasks([]);
        setAppointments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, visibleDays, reloadVersion]);

  if (!open) return null;

  const monthLabel = `${anchorDate.getFullYear()}年${anchorDate.getMonth() + 1}月`;
  const selectedMonth = anchorDate.getMonth();
  const monthOptions = Array.from({ length: 12 }, (_, index) => index);

  function updateWeekCount(next: WeekCount) {
    setWeekCount(next);
    setStoredWeekCount(next);
  }

  function toggleMonthPicker() {
    setPickerYear(anchorDate.getFullYear());
    setShowMonthPicker((current) => !current);
  }

  function jumpToMonth(year: number, month: number) {
    setAnchorDate(new Date(year, month, 1));
    setSelectedDate(null);
    setShowMonthPicker(false);
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" role="dialog" aria-label="多周安排日历">
      <div className="flex h-[86vh] w-[92vw] max-w-[1500px] overflow-hidden rounded-[2rem] border border-white/15 bg-slate-950/75 text-white shadow-2xl backdrop-blur-2xl">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative z-20 flex h-20 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-6">
            <div className="relative flex items-center gap-3 text-2xl font-black tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/20 bg-white/[0.06] text-sm">▦</span>
              <button
                type="button"
                aria-label={`打开年月选择器，当前 ${monthLabel}`}
                aria-expanded={showMonthPicker}
                onClick={toggleMonthPicker}
                className="rounded-xl px-2 py-1 text-left transition-colors hover:bg-white/[0.06]"
              >
                {monthLabel}
              </button>
              {showMonthPicker ? (
                <div
                  role="dialog"
                  aria-label="选择年份和月份"
                  className="absolute left-10 top-14 z-30 w-[320px] rounded-2xl border border-white/15 bg-slate-950 p-4 shadow-2xl"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      aria-label="上一年"
                      onClick={() => setPickerYear((year) => year - 1)}
                      className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1 text-sm text-white/80 hover:bg-white/[0.08]"
                    >
                      ‹
                    </button>
                    <div className="text-base font-bold text-white">{pickerYear}年</div>
                    <button
                      type="button"
                      aria-label="下一年"
                      onClick={() => setPickerYear((year) => year + 1)}
                      className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1 text-sm text-white/80 hover:bg-white/[0.08]"
                    >
                      ›
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {monthOptions.map((month) => {
                      const isActive = pickerYear === anchorDate.getFullYear() && month === selectedMonth;
                      return (
                        <button
                          key={month}
                          type="button"
                          aria-label={`切换到 ${pickerYear}年${month + 1}月`}
                          onClick={() => jumpToMonth(pickerYear, month)}
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                            isActive
                              ? 'border-cyan-300/40 bg-cyan-300/18 text-cyan-50'
                              : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'
                          }`}
                        >
                          {month + 1}月
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {loading ? <span aria-label="日历加载中" className="h-2.5 w-2.5 rounded-full bg-cyan-300/80 animate-pulse" /> : null}
              <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/[0.06] text-xl hover:bg-white/[0.1]">
                +
              </button>
              <div className="flex h-10 overflow-hidden rounded-xl border border-white/20 bg-white/[0.06]">
                <button
                  type="button"
                  aria-pressed={weekCount === 2}
                  aria-label="显示 2 周"
                  onClick={() => updateWeekCount(2)}
                  className={`px-4 text-sm font-bold ${weekCount === 2 ? 'bg-cyan-300/20 text-cyan-50' : 'text-white/60'}`}
                >
                  2 周
                </button>
                <button
                  type="button"
                  aria-pressed={weekCount === 3}
                  aria-label="显示 3 周"
                  onClick={() => updateWeekCount(3)}
                  className={`px-4 text-sm font-bold ${weekCount === 3 ? 'bg-cyan-300/20 text-cyan-50' : 'text-white/60'}`}
                >
                  3 周
                </button>
              </div>
              <div className="flex h-10 overflow-hidden rounded-xl border border-white/20 bg-white/[0.06]">
                <button type="button" aria-label="上一段日期" onClick={() => setAnchorDate((date) => addDays(date, -weekCount * 7))} className="px-4 text-xl text-white/80">
                  ‹
                </button>
                <button type="button" onClick={() => setAnchorDate(new Date())} className="border-x border-white/10 px-4 text-sm font-bold">
                  今天
                </button>
                <button type="button" aria-label="下一段日期" onClick={() => setAnchorDate((date) => addDays(date, weekCount * 7))} className="px-4 text-xl text-white/80">
                  ›
                </button>
              </div>
              <button type="button" onClick={onClose} className="rounded-xl border border-white/20 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/75 hover:bg-white/[0.1]">
                关闭
              </button>
            </div>
          </header>
          {error ? <div className="border-b border-red-300/20 bg-red-400/10 px-6 py-2 text-sm text-red-100">{error}</div> : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <MultiWeekCalendarGrid
              days={visibleDays}
              groupedTasks={groupedTasks}
              groupedDots={groupedDots}
              itemCounts={itemCounts}
              todayKey={todayKey}
              onDateClick={setSelectedDate}
              onTaskClick={setEditingTask}
              onDotClick={(item: CalendarDot) => {
                if (item.kind === 'appointment' && item.appointment) {
                  setEditingAppointment(item.appointment);
                  return;
                }
                if (item.task) {
                  setEditingTask(item.task);
                }
              }}
            />
          </div>
        </div>
        <CalendarDateDrawer
          date={selectedDate}
          tasks={selectedTasks}
          appointments={selectedAppointments}
          onClose={() => setSelectedDate(null)}
          onTaskClick={setEditingTask}
          onAppointmentClick={setEditingAppointment}
        />
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
      </div>
    </div>
  );
};

export default MultiWeekCalendarModal;
