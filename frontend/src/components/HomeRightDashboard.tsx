import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Box, Check, Circle, Play, Trophy, X } from 'lucide-react';

import { apiJson } from '../lib/api';
import type { Appointment, Task } from './taskTypes';
import CalendarWidget from './CalendarWidget';
import AchievementModal from './AchievementModal';
import type { AchievementSummary } from './achievementTypes';
import AppModalFrame from './AppModalFrame';
import { getWorkflowPresetPhases, type WorkflowPreset } from './workflowPresetForm';
import WorkflowPhaseChips from './WorkflowPhaseChips';
import clockPng from '../assets/timer-clock.png';

type FocusWorkflow = {
  state: 'normal' | 'focus' | 'break';
  task_id: string | null;
  task_title: string | null;
  pending_confirmation: boolean;
  pending_task_selection?: boolean;
  remaining_seconds: number | null;
  is_paused?: boolean;
};

type TodayFocusSummary = {
  minutes: number;
};

const DAILY_GOAL_MINUTES = 120;
const DISPLAY_COUNT_SWITCH_TOLERANCE_PX = 10;

function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const restSeconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
}

function isToday(value: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function taskMatchesToday(task: Task): boolean {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const start = task.start_date ? new Date(task.start_date) : null;
  const end = task.due_date ? new Date(task.due_date) : null;
  const okStart = start ? start < tomorrowStart : true;
  const okEnd = end ? end >= todayStart : true;
  return okStart && okEnd;
}

function formatClock(value: string | null): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTaskWindow(task: Task): string {
  const start = formatClock(task.start_date);
  const end = formatClock(task.due_date);
  if (start !== '--' && end !== '--') return `${start} - ${end}`;
  if (end !== '--') return end;
  if (start !== '--') return start;
  return '未安排';
}

/** 判断日程是否适合显示在首页日程栏。 */
function isDashboardAppointment(appointment: Appointment): boolean {
  if (appointment.completion_state?.hidden_from_action_list) return false;
  return !['attended', 'missed', 'cancelled'].includes(appointment.status);
}

/** 计算首页日程排序时间，优先使用开始时间。 */
function getAppointmentSortTime(appointment: Appointment): number {
  const value = appointment.starts_at ?? appointment.ends_at;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/** 格式化首页日程时间标签。 */
function formatAppointmentTime(appointment: Appointment): string {
  return formatClock(appointment.starts_at ?? appointment.ends_at);
}

function getWorkflowSummary(preset: WorkflowPreset | null): string {
  if (!preset) return '尚未选择工作流';
  const phases = getWorkflowPresetPhases(preset);
  const focusMinutes = Math.round(phases.filter((phase) => phase.phase_type === 'focus').reduce((total, phase) => total + phase.duration, 0) / 60);
  const breakMinutes = Math.round(phases.filter((phase) => phase.phase_type === 'break').reduce((total, phase) => total + phase.duration, 0) / 60);
  return `${phases.length} 个阶段 · 专注 ${focusMinutes} 分钟 · 休息 ${breakMinutes} 分钟`;
}

function DecorativeCardOverlay() {
  return (
    <>
      {/* 比例居中靠右定位的时钟 PNG 贴图 */}
      <img
        src={clockPng}
        alt="Decorative Clock"
        className="ark-home-card-clock-img"
        aria-hidden="true"
      />

      {/* 流畅波浪线条与闪烁星星的 SVG 容器 */}
      <svg
        className="ark-home-card-overlay-svg"
        viewBox="0 0 500 150"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* 背景流动波纹曲线 */}
        <path
          d="M-20,110 C80,60 180,140 280,90 C380,40 430,90 520,30"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.6"
        />
        <path
          d="M-40,130 C70,80 160,160 260,110 C360,60 410,110 540,40"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.3"
        />

        {/* 闪烁的四角星星 */}
        <path
          className="ark-home-card-sparkle"
          d="M310,32 Q310,37 315,37 Q310,37 310,42 Q310,37 305,37 Q310,37 310,32 Z"
          fill="currentColor"
        />
        <path
          className="ark-home-card-sparkle"
          d="M335,22 Q335,29 342,29 Q335,29 335,36 Q335,29 328,29 Q335,29 335,22 Z"
          fill="currentColor"
        />
      </svg>
    </>
  );
}

/** 渲染首页任务行，供实际展示与隐藏测量共用。 */
function renderDashboardTaskRow(task: Task, workflow: FocusWorkflow | null) {
  const completed = task.status === 'done' || task.completion_state?.completion_state === 'period_complete';
  const active = workflow?.task_id === task.id;
  const statusLabel = completed ? '已完成' : active ? '进行中' : formatTaskWindow(task);

  return (
    <div key={task.id} className="grid h-[36px] grid-cols-[22px_minmax(0,1fr)_96px] items-center gap-3">
      <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border ${
        completed ? 'ark-home-task-check border-[var(--ark-accent)] bg-[var(--ark-accent)] text-[var(--ark-on-accent)]' : 'border-[var(--ark-border-strong)] bg-[var(--ark-glass-surface-soft)]'
      }`}>
        {completed ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      </span>
      <span className="truncate text-sm font-medium text-[var(--ark-text)]">{task.title}</span>
      <span className={`truncate text-right text-sm ${completed ? 'text-emerald-500' : active ? 'text-[var(--ark-accent)]' : 'text-[var(--ark-text-muted)]'}`}>
        {statusLabel}
      </span>
    </div>
  );
}

/** 渲染首页日程行，供实际展示与隐藏测量共用。 */
function renderDashboardAppointmentRow(appointment: Appointment, index: number, totalCount: number) {
  return (
    <div key={appointment.id} className="grid grid-cols-[56px_16px_minmax(0,1fr)] items-center gap-3">
      <span className="text-sm font-semibold text-[var(--ark-text)]">{formatAppointmentTime(appointment)}</span>
      <span className="relative flex h-8 items-center justify-center" aria-hidden="true">
        {index < totalCount - 1 ? (
          <span className="absolute left-1/2 top-5 h-9 w-px -translate-x-1/2 bg-ark-border" />
        ) : null}
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--ark-accent)] shadow-[0_0_8px_var(--ark-accent)]" />
      </span>
      <span className="truncate text-sm font-medium text-[var(--ark-text-muted)]">{appointment.title}</span>
    </div>
  );
}

export default function HomeRightDashboard() {
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<FocusWorkflow | null>(null);
  const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [achievementSummary, setAchievementSummary] = useState<AchievementSummary | null>(null);
  const [achievementOpen, setAchievementOpen] = useState(false);
  const [workflowStartOpen, setWorkflowStartOpen] = useState(false);
  const [workflowStartPresets, setWorkflowStartPresets] = useState<WorkflowPreset[]>([]);
  const [selectedWorkflowStartId, setSelectedWorkflowStartId] = useState<string | null>(null);
  const achievementButtonRef = useRef<HTMLButtonElement | null>(null);
  const taskListRef = useRef<HTMLDivElement | null>(null);
  const taskMeasureRef = useRef<HTMLDivElement | null>(null);
  const appointmentListRef = useRef<HTMLDivElement | null>(null);
  const appointmentMeasureRef = useRef<HTMLDivElement | null>(null);
  const [visibleTaskCount, setVisibleTaskCount] = useState(3);
  const [visibleAppointmentCount, setVisibleAppointmentCount] = useState(3);

  async function loadDashboard() {
    const [workflowRes, todayFocusRes, tasksRes, appointmentsRes, achievementRes] = await Promise.allSettled([
      apiJson<FocusWorkflow>('/todo/focus/workflow/current'),
      apiJson<TodayFocusSummary>('/todo/focus/today'),
      apiJson<Task[]>('/todo/tasks?limit=100'),
      apiJson<Appointment[]>('/todo/appointments'),
      apiJson<AchievementSummary>('/todo/achievements/summary'),
    ]);

    if (workflowRes.status === 'fulfilled') setWorkflow(workflowRes.value);
    if (todayFocusRes.status === 'fulfilled') setTodayFocusMinutes(todayFocusRes.value.minutes);
    if (tasksRes.status === 'fulfilled') setTasks(Array.isArray(tasksRes.value) ? tasksRes.value : []);
    if (appointmentsRes.status === 'fulfilled') setAppointments(Array.isArray(appointmentsRes.value) ? appointmentsRes.value : []);
    if (achievementRes.status === 'fulfilled') setAchievementSummary(achievementRes.value);
  }

  useEffect(() => {
    void loadDashboard();
    const reload = () => void loadDashboard();
    window.addEventListener('ark:reload-focus', reload);
    const refreshTimer = window.setInterval(reload, 60000);
    return () => {
      window.removeEventListener('ark:reload-focus', reload);
      window.clearInterval(refreshTimer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const timerSeconds = useMemo(() => {
    if (!workflow || workflow.state === 'normal') return 0;
    return workflow.remaining_seconds ?? 0;
  }, [workflow]);

  const progressPercent = Math.min(100, Math.round((todayFocusMinutes / DAILY_GOAL_MINUTES) * 100));
  const progressIsZero = progressPercent === 0;
  const progressVisualPercent = progressIsZero ? 4 : progressPercent;
  const todayTasks = useMemo(
    () => tasks
      .filter((task) => !task.completion_state?.hidden_from_action_list && taskMatchesToday(task))
      .sort((a, b) => Number(isToday(b.due_date)) - Number(isToday(a.due_date)))
      .slice(0, 4),
    [tasks],
  );
  const upcomingAppointments = useMemo(
    () => appointments
      .filter(isDashboardAppointment)
      .sort((a, b) => {
        const aTime = getAppointmentSortTime(a);
        const bTime = getAppointmentSortTime(b);
        const aPast = aTime < nowMs;
        const bPast = bTime < nowMs;
        if (aPast !== bPast) return Number(aPast) - Number(bPast);
        return aPast ? bTime - aTime : aTime - bTime;
      })
      .slice(0, 3),
    [appointments, nowMs],
  );
  const taskProbeItems = useMemo(() => todayTasks.slice(0, 3), [todayTasks]);
  const appointmentProbeItems = useMemo(() => upcomingAppointments.slice(0, 3), [upcomingAppointments]);
  const visibleTasks = useMemo(() => todayTasks.slice(0, visibleTaskCount), [todayTasks, visibleTaskCount]);
  const visibleAppointments = useMemo(
    () => upcomingAppointments.slice(0, visibleAppointmentCount),
    [upcomingAppointments, visibleAppointmentCount],
  );
  const phaseLabel = workflow?.state === 'break' ? '休息阶段' : '当前阶段';
  const actionLabel = workflow?.pending_task_selection
    ? '选择任务'
    : !workflow || workflow.state === 'normal'
    ? '开始学习'
    : workflow.state === 'break'
      ? '结束休息'
      : workflow.pending_confirmation
        ? '确认流转'
        : '结束阶段';
  const selectedWorkflowStartPreset = useMemo(
    () => workflowStartPresets.find((preset) => preset.id === selectedWorkflowStartId) ?? workflowStartPresets[0] ?? null,
    [selectedWorkflowStartId, workflowStartPresets],
  );
  const selectedWorkflowPhases = useMemo(
    () => getWorkflowPresetPhases(selectedWorkflowStartPreset),
    [selectedWorkflowStartPreset],
  );

  async function handlePrimaryAction() {
    if (isSubmittingAction) return;
    setIsSubmittingAction(true);
    try {
      if (workflow?.pending_task_selection) {
        window.dispatchEvent(new Event('ark:open-focus-task-picker'));
        return;
      }
      if (!workflow || workflow.state === 'normal') {
        const presets = await apiJson<WorkflowPreset[]>('/todo/focus/workflows');
        const preset = presets.find((item) => item.is_default) ?? presets[0];
        if (!preset) {
          window.dispatchEvent(new Event('ark:open-workflow-modal'));
          return;
        }
        setWorkflowStartPresets(presets);
        setSelectedWorkflowStartId(preset.id);
        setWorkflowStartOpen(true);
        return;
      } else if (workflow.state === 'break') {
        await apiJson('/todo/focus/workflow/skip_phase', { method: 'POST' });
      } else {
        await apiJson('/todo/focus/workflow/confirm', { method: 'POST' });
      }
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      await loadDashboard();
    } catch (error) {
      console.error('Failed to run focus action', error);
    } finally {
      setIsSubmittingAction(false);
    }
  }

  async function startSelectedWorkflow() {
    if (!selectedWorkflowStartPreset || isSubmittingAction) return;
    setIsSubmittingAction(true);
    try {
      await apiJson(`/todo/focus/workflows/${selectedWorkflowStartPreset.id}/start`, { method: 'POST' });
      setWorkflowStartOpen(false);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      await loadDashboard();
    } catch (error) {
      console.error('Failed to start workflow', error);
    } finally {
      setIsSubmittingAction(false);
    }
  }

  function openArrangementEntry() {
    window.dispatchEvent(new Event('ark:open-arrangements-modal'));
  }

  /** 根据任务列可用高度在 3 条和 2 条之间切换，避免卡片溢出。 */
  useLayoutEffect(() => {
    if (todayTasks.length <= 2) {
      setVisibleTaskCount(3);
      return;
    }

    let frameId = 0;
    const updateVisibleCount = () => {
      const listElement = taskListRef.current;
      const measureElement = taskMeasureRef.current;
      if (!listElement || !measureElement) return;
      const nextCount =
        measureElement.offsetHeight <= listElement.clientHeight + DISPLAY_COUNT_SWITCH_TOLERANCE_PX ? 3 : 2;
      setVisibleTaskCount(nextCount);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateVisibleCount);
    };

    scheduleUpdate();
    const observer = new ResizeObserver(scheduleUpdate);
    if (taskListRef.current) observer.observe(taskListRef.current);
    if (taskMeasureRef.current) observer.observe(taskMeasureRef.current);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [todayTasks]);

  /** 根据日程列可用高度在 3 条和 2 条之间切换，避免卡片溢出。 */
  useLayoutEffect(() => {
    if (upcomingAppointments.length <= 2) {
      setVisibleAppointmentCount(3);
      return;
    }

    let frameId = 0;
    const updateVisibleCount = () => {
      const listElement = appointmentListRef.current;
      const measureElement = appointmentMeasureRef.current;
      if (!listElement || !measureElement) return;
      const nextCount =
        measureElement.offsetHeight <= listElement.clientHeight + DISPLAY_COUNT_SWITCH_TOLERANCE_PX ? 3 : 2;
      setVisibleAppointmentCount(nextCount);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateVisibleCount);
    };

    scheduleUpdate();
    const observer = new ResizeObserver(scheduleUpdate);
    if (appointmentListRef.current) observer.observe(appointmentListRef.current);
    if (appointmentMeasureRef.current) observer.observe(appointmentMeasureRef.current);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [upcomingAppointments]);

  return (
    <>
      <div className="grid h-full grid-rows-[1.25fr_0.85fr_1.15fr_1.7fr_1fr] gap-3">
        <section className="ark-home-card ark-home-timer-card relative overflow-hidden rounded-[24px] px-6 py-5 flex items-center justify-between gap-4">
          <div className="relative z-10 flex flex-col justify-between h-full min-h-[120px]">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ark-text-muted)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb] shadow-[0_0_10px_#2563eb] dark:bg-[var(--ark-accent)] dark:shadow-[0_0_10px_var(--ark-accent)]" />
              {phaseLabel}
            </div>

            <div className="my-1">
              <div className="ark-home-timer-digits text-[3.8rem] sm:text-[4.4rem] font-bold leading-none ark-font-display">
                {formatTimer(timerSeconds)}
              </div>
            </div>

            <div className="text-xs sm:text-sm text-[var(--ark-text-faint)]">
              今日目标 <span className="font-semibold text-[var(--ark-text-muted)]">{DAILY_GOAL_MINUTES}</span> 分钟
            </div>
          </div>

          <DecorativeCardOverlay />

          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isSubmittingAction}
            className="ark-home-primary-button relative z-20 flex h-[48px] sm:h-[52px] min-w-[140px] sm:min-w-[190px] shrink-0 items-center justify-center gap-2 rounded-full px-5 sm:px-6 text-base sm:text-lg font-semibold"
          >
            <span className="flex h-5 w-5 sm:h-6 sm:w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#2563eb] dark:text-[#1d4ed8]">
              <Play className="h-2.5 w-2.5 sm:h-3 sm:w-3 fill-current" aria-hidden="true" />
            </span>
            <span>{actionLabel}</span>
          </button>
        </section>

        <section className="ark-home-card rounded-[24px] px-6 py-3">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-base font-semibold text-[var(--ark-text)]">今日进度</span>
            <span className={`text-2xl font-medium ark-font-display ${progressIsZero ? 'text-[var(--ark-text-faint)]' : 'text-[var(--ark-accent)]'}`}>
              {progressPercent}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[var(--ark-surface-subtle)]">
            <div
              className={`ark-home-progress-fill h-full rounded-full transition-[width] duration-500 ${progressIsZero ? 'ark-home-progress-fill-idle' : ''}`}
              style={{ width: `${progressVisualPercent}%` }}
            />
          </div>
          <div className="mt-2 text-sm text-[var(--ark-text-faint)]">
            已完成 {todayFocusMinutes} 分钟 / {DAILY_GOAL_MINUTES} 分钟
          </div>
        </section>

        <section className="ark-home-card relative flex min-h-0 flex-col rounded-[24px] px-6 py-4">
          <button
            type="button"
            onClick={openArrangementEntry}
            className="absolute right-6 top-4 inline-flex items-center rounded-full border border-ark-border bg-ark-surface-subtle px-4 py-1.5 text-sm font-semibold text-[var(--ark-accent)] transition-colors hover:bg-[var(--ark-accent-soft)]"
          >
            安排
          </button>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] gap-5 pt-2">
            <div className="flex min-h-0 flex-col">
              <div className="mb-3 text-base font-semibold text-[var(--ark-text)]">任务</div>
              <div
                ref={taskListRef}
                className={`relative flex min-h-0 flex-1 flex-col ${todayTasks.length ? 'justify-start gap-2' : 'justify-center'}`}
              >
                {todayTasks.length ? visibleTasks.map((task) => renderDashboardTaskRow(task, workflow)) : (
                  <div className="ark-home-empty-task flex min-h-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--ark-border)] text-[var(--ark-accent)]">
                      <Circle className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--ark-text)]">今日暂无任务</div>
                      <div className="mt-1 text-xs text-[var(--ark-text-faint)]">点击右上角添加今日计划</div>
                    </div>
                  </div>
                )}
                {taskProbeItems.length >= 3 ? (
                  <div
                    ref={taskMeasureRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 invisible flex flex-col gap-2"
                  >
                    {taskProbeItems.map((task) => renderDashboardTaskRow(task, workflow))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="w-px bg-ark-border" aria-hidden="true" />

            <div className="flex min-h-0 flex-col">
              <div className="mb-3 text-base font-semibold text-[var(--ark-text)]">日程</div>
              <div
                ref={appointmentListRef}
                className={`relative flex min-h-0 flex-1 flex-col ${upcomingAppointments.length ? 'justify-start gap-3' : 'justify-center'}`}
              >
                {upcomingAppointments.length ? visibleAppointments.map((appointment, index) => (
                  renderDashboardAppointmentRow(appointment, index, visibleAppointments.length)
                )) : (
                  <div className="flex min-h-0 flex-1 items-center rounded-2xl px-4 py-3 text-sm text-[var(--ark-text-faint)]">
                    暂无近期日程
                  </div>
                )}
                {appointmentProbeItems.length >= 3 ? (
                  <div
                    ref={appointmentMeasureRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 invisible flex flex-col gap-3"
                  >
                    {appointmentProbeItems.map((appointment, index) => (
                      renderDashboardAppointmentRow(appointment, index, appointmentProbeItems.length)
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <CalendarWidget className="ark-home-card min-h-0 rounded-[24px]" />

        <section className="grid min-h-0 grid-cols-3 gap-3">
          <button
            type="button"
            className="ark-home-card ark-home-shortcut-card flex min-w-0 flex-col justify-center rounded-[20px] px-5 text-left"
          >
            <span className="ark-home-shortcut-icon mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] text-[var(--ark-accent)]">
              <BarChart3 className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-[var(--ark-text)]">数据分析</span>
            <span className="mt-1 truncate text-xs font-medium text-[var(--ark-text-faint)]">学习数据可视化</span>
          </button>

          <button
            ref={achievementButtonRef}
            type="button"
            className="ark-home-card ark-home-shortcut-card flex min-w-0 flex-col justify-center rounded-[20px] px-5 text-left"
            onClick={() => setAchievementOpen(true)}
          >
            <span className="ark-home-shortcut-icon mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] text-[var(--ark-accent)]">
              <Trophy className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-[var(--ark-text)]">成就</span>
            <span className="mt-1 max-w-full truncate text-xs font-medium text-[var(--ark-text-faint)]">解锁成长里程碑</span>
          </button>

          <button
            type="button"
            className="ark-home-card ark-home-shortcut-card flex min-w-0 flex-col justify-center rounded-[20px] px-5 text-left"
            onClick={() => navigate('/apps')}
          >
            <span className="ark-home-shortcut-icon mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] text-[var(--ark-accent)]">
              <Box className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-[var(--ark-text)]">应用中心</span>
            <span className="mt-1 max-w-full truncate text-xs font-medium text-[var(--ark-text-faint)]">更多学习工具</span>
          </button>
        </section>
      </div>

      <AppModalFrame
        open={workflowStartOpen}
        onClose={() => {
          if (!isSubmittingAction) setWorkflowStartOpen(false);
        }}
        zIndexClassName="z-[70]"
        ariaLabelledBy="workflow-start-title"
        panelClassName="w-[760px] max-w-[94vw] overflow-hidden rounded-2xl border border-ark-border bg-ark-surface-strong text-ark-text shadow-2xl"
      >
        <div className="flex h-14 items-center justify-between border-b border-ark-border bg-ark-surface-subtle px-5">
          <div>
            <h3 id="workflow-start-title" className="text-base font-semibold text-ark-text">开始学习</h3>
            <p className="mt-0.5 text-xs text-ark-text-muted">本次将启动选中的工作流</p>
          </div>
          <button
            type="button"
            onClick={() => setWorkflowStartOpen(false)}
            disabled={isSubmittingAction}
            className="rounded-full p-2 text-ark-text-muted transition hover:bg-ark-surface-subtle hover:text-ark-text disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="关闭开始学习提示"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid max-h-[calc(82vh-7rem)] grid-cols-[240px_minmax(0,1fr)] overflow-hidden">
          <aside className="min-h-0 border-r border-ark-border bg-ark-surface-subtle p-4">
            <div className="mb-3 text-xs font-medium text-ark-text-faint">可选工作流</div>
            <div className="flex max-h-[calc(82vh-12rem)] flex-col gap-2 overflow-y-auto pr-1">
              {workflowStartPresets.map((preset) => {
                const selected = preset.id === selectedWorkflowStartPreset?.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedWorkflowStartId(preset.id)}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      selected
                        ? 'border-ark-border bg-ark-surface-strong text-ark-text'
                        : 'border-ark-border bg-ark-surface-subtle text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{preset.name}</span>
                      {preset.is_default ? (
                        <span className="shrink-0 rounded-full bg-ark-surface-subtle px-2 py-0.5 text-[10px] text-ark-text-muted">
                          默认
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-ark-text-faint">{getWorkflowSummary(preset)}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto p-5">
            <div className="mb-5">
              <div className="text-xs text-ark-text-faint">本次工作流</div>
              <h4 className="mt-1 text-2xl font-semibold text-ark-text">{selectedWorkflowStartPreset?.name ?? '未选择工作流'}</h4>
              <div className="mt-2 text-sm text-ark-text-muted">{getWorkflowSummary(selectedWorkflowStartPreset)}</div>
            </div>

            <div className="rounded-xl border border-ark-border bg-ark-surface-subtle px-4 py-4">
              <WorkflowPhaseChips
                phases={selectedWorkflowPhases}
                getTaskTitle={(taskId) => tasks.find((task) => task.id === taskId)?.title}
                maxTaskWidthClassName="max-w-[150px]"
              />
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-ark-border bg-ark-surface-strong p-5 pt-3">
          <button
            type="button"
            onClick={() => setWorkflowStartOpen(false)}
            disabled={isSubmittingAction}
            className="rounded-lg border border-ark-border bg-ark-surface-subtle px-4 py-2 text-sm text-ark-text transition hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void startSelectedWorkflow()}
            disabled={!selectedWorkflowStartPreset || isSubmittingAction}
            className="inline-flex items-center gap-2 rounded-lg border border-ark-border bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            开始本次工作流
          </button>
        </div>
      </AppModalFrame>

      <AchievementModal
        isOpen={achievementOpen}
        onClose={() => setAchievementOpen(false)}
        initialSummary={achievementSummary}
        returnFocusRef={achievementButtonRef}
      />
    </>
  );
}
