import React from 'react';
import type { Appointment } from './taskTypes';
import { CalendarTask, toDayKey } from './calendarUtils';

type CalendarDateDrawerProps = {
  date: Date | null;
  tasks: CalendarTask[];
  appointments: Appointment[];
  onClose: () => void;
  onTaskClick?: (task: CalendarTask) => void;
  onAppointmentClick?: (appointment: Appointment) => void;
};

const CalendarDateDrawer: React.FC<CalendarDateDrawerProps> = ({
  date,
  tasks,
  appointments,
  onClose,
  onTaskClick,
  onAppointmentClick,
}) => {
  if (!date) return null;
  const key = toDayKey(date);
  const activeTasks = tasks.filter((task) => task.status !== 'done');
  const completedTasks = tasks.filter((task) => task.status === 'done');

  return (
    <aside
      role="complementary"
      aria-label={`${key} 日期详情`}
      className="w-[320px] shrink-0 border-l border-white/10 bg-black/20 p-4 backdrop-blur-xl"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Day Detail</div>
          <h3 className="text-lg font-bold text-white">{key}</h3>
        </div>
        <button type="button" onClick={onClose} className="rounded-full bg-white/5 px-3 py-1 text-white/70 hover:bg-white/10">
          关闭
        </button>
      </div>
      <button
        type="button"
        className="mb-4 w-full rounded-xl border border-cyan-200/20 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/15"
      >
        + 创建这一天的安排
      </button>
      <section className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-widest text-white/40">日程 ({appointments.length})</h4>
        {appointments.length ? (
          appointments.map((appointment) => (
            <button
              key={appointment.id}
              type="button"
              onClick={() => onAppointmentClick?.(appointment)}
              className="w-full rounded-xl border border-fuchsia-300/15 bg-fuchsia-300/[0.06] p-3 text-left text-sm text-white/85 transition-colors hover:bg-fuchsia-300/[0.12]"
            >
              <div className="font-medium">{appointment.title}</div>
              <div className="mt-1 text-xs text-white/45">{appointment.status}</div>
            </button>
          ))
        ) : (
          <div className="text-sm text-white/35">这一天暂无日程</div>
        )}
      </section>
      <section className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-widest text-white/40">待办 ({activeTasks.length})</h4>
        {activeTasks.length ? (
          activeTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onTaskClick?.(task)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left text-sm text-white/85 transition-colors hover:bg-white/[0.08]"
            >
              {task.title}
            </button>
          ))
        ) : (
          <div className="text-sm text-white/35">这一天暂无待办</div>
        )}
      </section>
      {completedTasks.length ? (
        <section className="mt-5 space-y-2 opacity-70">
          <h4 className="text-xs font-bold uppercase tracking-widest text-white/40">已完成 ({completedTasks.length})</h4>
          {completedTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onTaskClick?.(task)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.025] p-3 text-left text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
            >
              {task.title}
            </button>
          ))}
        </section>
      ) : null}
    </aside>
  );
};

export default CalendarDateDrawer;
