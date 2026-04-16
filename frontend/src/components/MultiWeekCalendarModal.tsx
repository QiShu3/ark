import React, { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/api';
import CalendarDateDrawer from './CalendarDateDrawer';
import MultiWeekCalendarGrid from './MultiWeekCalendarGrid';
import {
  addDays,
  buildVisibleDays,
  CalendarTask,
  formatRangeParam,
  getStoredWeekCount,
  groupTasksByDay,
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const visibleDays = useMemo(() => buildVisibleDays(anchorDate, weekCount), [anchorDate, weekCount]);
  const groupedTasks = useMemo(() => groupTasksByDay(tasks, visibleDays), [tasks, visibleDays]);
  const todayKey = toDayKey(new Date());
  const selectedTasks = selectedDate ? groupedTasks[toDayKey(selectedDate)] || [] : [];

  useEffect(() => {
    if (!open) return;
    const start = visibleDays[0];
    const end = addDays(visibleDays[visibleDays.length - 1], 1);
    setLoading(true);
    setError(null);
    apiJson<CalendarTask[]>(`/todo/tasks/calendar?start=${formatRangeParam(start)}&end=${formatRangeParam(end)}`)
      .then(setTasks)
      .catch((err) => {
        console.error('Failed to load calendar tasks', err);
        setError(err instanceof Error ? err.message : '加载日历任务失败');
        setTasks([]);
      })
      .finally(() => setLoading(false));
  }, [open, visibleDays]);

  if (!open) return null;

  const monthLabel = `${anchorDate.getMonth() + 1} 月`;

  function updateWeekCount(next: WeekCount) {
    setWeekCount(next);
    setStoredWeekCount(next);
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" role="dialog" aria-label="多周任务日历">
      <div className="flex h-[86vh] w-[92vw] max-w-[1500px] overflow-hidden rounded-[2rem] border border-white/15 bg-slate-950/75 text-white shadow-2xl backdrop-blur-2xl">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-20 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-6">
            <div className="flex items-center gap-3 text-2xl font-black tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/20 bg-white/[0.06] text-sm">▦</span>
              <span>{monthLabel}</span>
            </div>
            <div className="flex items-center gap-3">
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
          {loading ? <div className="border-b border-white/10 px-6 py-2 text-sm text-white/45">加载中...</div> : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <MultiWeekCalendarGrid days={visibleDays} groupedTasks={groupedTasks} todayKey={todayKey} onDateClick={setSelectedDate} />
          </div>
        </div>
        <CalendarDateDrawer date={selectedDate} tasks={selectedTasks} onClose={() => setSelectedDate(null)} />
      </div>
    </div>
  );
};

export default MultiWeekCalendarModal;
