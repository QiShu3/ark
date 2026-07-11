import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Box, Calendar, Check, ListTodo, Play, Trophy } from 'lucide-react';

import { apiJson } from '../lib/api';
import { fetchCurrentFocusWorkflow, startMultiDeliberateWorkflow } from '../lib/focusWorkflow';
import { useEventArrangements } from '../hooks/useEventArrangements';
import { usePrimaryEvent } from '../hooks/usePrimaryEvent';
import { useAuthStore } from '../lib/auth';
import type { Appointment, Task } from './taskTypes';
import CalendarWidget from './CalendarWidget';
import AchievementModal from './AchievementModal';
import type { AchievementSummary } from './achievementTypes';
import HomeCard from './HomeCard';
import HomeSectionHeader from './HomeSectionHeader';
import DeliberateWorkflowPreviewModal from './deliberate/DeliberateWorkflowPreviewModal';
import { isDeliberateWorkflowPreset, type WorkflowPreset } from './workflowPresetForm';
import WorkflowPhaseChips from './WorkflowPhaseChips';
import { normalizeFocusWorkType, type FocusWorkType } from './focus-work/focusWorkTypes';
import timerClockPng from '../assets/timer-clock.png';

type FocusWorkflowPhase = {
  phase_type: 'focus' | 'break';
  duration: number;
  timer_mode: 'countdown' | 'countup' | null;
  task_id: string | null;
  focus_work_type: FocusWorkType | null;
};

type FocusWorkflow = {
  state: 'normal' | 'focus' | 'break' | 'settlement';
  workflow_name?: string | null;
  current_phase_index?: number | null;
  phases?: FocusWorkflowPhase[];
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

function filterDeliberateWorkflowPresets(presets: WorkflowPreset[]): WorkflowPreset[] {
  return presets.filter(isDeliberateWorkflowPreset);
}

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



function TimerCardArt() {
  return (
    <>
      <img className="ark-home-timer-clock" src={timerClockPng} alt="" aria-hidden="true" />
      <svg className="ark-home-timer-waves" viewBox="0 0 720 220" aria-hidden="true" focusable="false">
        <path d="M-44 190C78 142 139 167 236 132C337 96 371 26 493 50C585 68 630 135 765 88" />
        <path d="M-28 224C112 159 197 205 313 151C418 102 452 61 557 85C642 105 695 126 766 79" />
      </svg>
      <span className="ark-home-timer-sparkle ark-home-timer-sparkle-main" aria-hidden="true" />
      <span className="ark-home-timer-sparkle ark-home-timer-sparkle-soft" aria-hidden="true" />
      <span className="ark-home-timer-dot-field" aria-hidden="true" />
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
  const isGuest = useAuthStore((s) => s.user?.is_guest ?? false);
  const [workflow, setWorkflow] = useState<FocusWorkflow | null>(null);
  const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
  const { primaryEvent } = usePrimaryEvent();
  const { tasks, appointments, refetch: refetchArrangements } = useEventArrangements(primaryEvent?.id ?? null);
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
    const [workflowRes, todayFocusRes, achievementRes, presetsRes] = await Promise.allSettled([
      fetchCurrentFocusWorkflow<FocusWorkflow>(),
      apiJson<TodayFocusSummary>('/todo/focus/today'),
      apiJson<AchievementSummary>('/todo/achievements/summary'),
      apiJson<WorkflowPreset[]>('/todo/focus/workflows'),
    ]);

    if (workflowRes.status === 'fulfilled') setWorkflow(workflowRes.value);
    if (todayFocusRes.status === 'fulfilled') setTodayFocusMinutes(todayFocusRes.value.minutes);
    if (achievementRes.status === 'fulfilled') setAchievementSummary(achievementRes.value);
    if (presetsRes.status === 'fulfilled') {
      const allPresets = Array.isArray(presetsRes.value) ? presetsRes.value : [];
      setWorkflowStartPresets(filterDeliberateWorkflowPresets(allPresets));
    }
  }

  useEffect(() => {
    void loadDashboard();
    const reload = () => {
      void loadDashboard();
      void refetchArrangements();
    };
    window.addEventListener('ark:reload-focus', reload);
    const refreshTimer = window.setInterval(reload, 60000);
    return () => {
      window.removeEventListener('ark:reload-focus', reload);
      window.clearInterval(refreshTimer);
    };
  }, [refetchArrangements]);

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
  const workflowIsActive = !!(workflow && workflow.state !== 'normal' && workflow.phases && workflow.phases.length > 0);
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
  const phaseLabel = workflow?.state === 'break' ? '休息阶段' : workflow?.state === 'settlement' ? '结算阶段' : '当前阶段';
  const actionLabel = workflow?.pending_task_selection
    ? '选择任务'
    : !workflow || workflow.state === 'normal'
    ? '开始学习'
    : workflow.state === 'settlement'
      ? '结束工作流'
      : workflow.state === 'break'
        ? '结束休息'
        : workflow.pending_confirmation
          ? '确认流转'
          : '结束阶段';
  const selectedWorkflowStartPreset = useMemo(
    () => workflowStartPresets.find((preset) => preset.id === selectedWorkflowStartId) ?? workflowStartPresets[0] ?? null,
    [selectedWorkflowStartId, workflowStartPresets],
  );

  const defaultWorkflowName = useMemo(() => {
    const defaultPreset = workflowStartPresets.find((item) => item.is_default) ?? workflowStartPresets[0];
    return defaultPreset?.name || '默认工作流';
  }, [workflowStartPresets]);

  const currentWorkflowName = workflow?.workflow_name || defaultWorkflowName;

  const nextFocusTaskLabel = useMemo(() => {
    if (
      !workflow ||
      !workflow.phases ||
      workflow.current_phase_index === null ||
      workflow.current_phase_index === undefined
    ) {
      return '';
    }

    const nextFocusPhase = workflow.phases
      .slice(workflow.current_phase_index + 1)
      .find((p) => p.phase_type === 'focus');

    if (!nextFocusPhase) {
      return '无后续任务';
    }

    let taskLabel = '任务专注';
    if (nextFocusPhase.task_id) {
      taskLabel = tasks.find((t) => t.id === nextFocusPhase.task_id)?.title || '任务专注';
    } else if (nextFocusPhase.focus_work_type) {
      const canonical = normalizeFocusWorkType(nextFocusPhase.focus_work_type) ?? nextFocusPhase.focus_work_type;
      const FOCUS_WORK_LABELS: Record<string, string> = {
        flash_card: '今日单词',
        choice: '选择练习',
        input: '输入练习',
        task_focus: '任务专注',
      };
      taskLabel = FOCUS_WORK_LABELS[canonical] ?? '应用任务';
    }

    return taskLabel;
  }, [workflow, tasks]);

  async function handlePrimaryAction() {
    if (isSubmittingAction) return;
    setIsSubmittingAction(true);
    try {
      if (workflow?.pending_task_selection) {
        window.dispatchEvent(new Event('ark:open-focus-task-picker'));
        return;
      }
      if (!workflow || workflow.state === 'normal') {
        const allPresets = await apiJson<WorkflowPreset[]>('/todo/focus/workflows');
        const presets = filterDeliberateWorkflowPresets(allPresets);
        const preset = presets.find((item) => item.is_default) ?? presets[0];
        if (!preset) {
          navigate(isGuest ? '/guest-english' : '/deliberate-workflow');
          return;
        }
        setWorkflowStartPresets(presets);
        setSelectedWorkflowStartId(preset.id);
        setWorkflowStartOpen(true);
        return;
      } else if (workflow.state === 'break') {
        await apiJson('/todo/focus/workflow/skip_phase', { method: 'POST' });
      } else if (workflow.state === 'settlement') {
        await apiJson('/todo/focus/workflow/confirm-settlement', { method: 'POST' });
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

  async function handlePreviewStart(configIds: string[]) {
    if (configIds.length === 0 || isSubmittingAction) return;
    setIsSubmittingAction(true);
    try {
      await startMultiDeliberateWorkflow(configIds);
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
      <div className="grid h-full grid-rows-[1.25fr_0.9fr_1.1fr_1.8fr_0.9fr] gap-3">
        <HomeCard variant="hero" className="px-6 py-4">
          <TimerCardArt />

          <div className="relative z-10 flex h-full min-h-[120px] flex-col justify-between">
            <div className="ark-home-timer-phase flex items-center gap-2 text-base font-semibold">
              <span className="ark-home-timer-phase-dot h-2.5 w-2.5 rounded-full" />
              {workflowIsActive ? '下个任务' : phaseLabel}
            </div>

            <div className="pb-1">
              {workflowIsActive ? (
                <div className="text-xl md:text-2xl font-bold text-ark-text tracking-wide leading-tight mt-1 mb-2 line-clamp-2 max-w-[280px]">
                  {nextFocusTaskLabel}
                </div>
              ) : (
                <div className="ark-home-timer-digits font-bold leading-none ark-font-display">
                  {formatTimer(timerSeconds)}
                </div>
              )}
              <div className="ark-home-timer-target mt-2 text-sm font-medium">
                当前工作流：{currentWorkflowName}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isSubmittingAction}
            className="ark-home-primary-button absolute bottom-6 right-6 z-20 flex h-[58px] min-w-[240px] items-center justify-center gap-3 rounded-[24px] px-7 text-xl font-semibold transition hover:scale-[1.01] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
          >
            <span className="ark-home-play-dot flex h-8 w-8 items-center justify-center rounded-full">
              <Play className="h-4.5 w-4.5 fill-current" aria-hidden="true" />
            </span>
            {actionLabel}
          </button>
        </HomeCard>

        <HomeCard className="px-6 py-2.5 flex flex-col justify-center min-h-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
                <path
                  className="text-ark-border/30 dark:text-white/10"
                  strokeWidth="4.2"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[var(--ark-accent)] transition-[stroke-dasharray] duration-500"
                  strokeWidth="4.2"
                  strokeDasharray={`${progressPercent}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <h3 className="text-base font-semibold text-[var(--ark-text)] flex items-center gap-1.5">
                <span>今日进度</span>
                {workflowIsActive && workflow?.workflow_name && (
                  <>
                    <span className="text-[var(--ark-text-faint)] font-normal">|</span>
                    <span className="text-[var(--ark-text-muted)] font-normal">{workflow.workflow_name}</span>
                  </>
                )}
              </h3>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent leading-none">
                {progressPercent}%
              </span>
              <span className="text-[10px] text-[var(--ark-text-faint)] mt-0.5 font-medium">整体进度</span>
            </div>
          </div>

          {workflowIsActive && workflow?.phases ? (
            <div className="mt-2 overflow-x-auto scrollbar-none py-0.5">
              <WorkflowPhaseChips
                phases={workflow.phases}
                getTaskTitle={(taskId) => tasks.find((task) => task.id === taskId)?.title}
                className="flex-nowrap"
                maxTaskWidthClassName="max-w-[120px]"
              />
            </div>
          ) : (
            <div className="mt-3.5 flex flex-col justify-center gap-2">
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--ark-surface-subtle)]">
                <div
                  className={`ark-home-progress-fill h-full rounded-full transition-[width] duration-500 ${progressIsZero ? 'ark-home-progress-fill-idle' : ''}`}
                  style={{ width: `${progressVisualPercent}%` }}
                />
              </div>
            </div>
          )}
        </HomeCard>

        <HomeCard className="relative flex min-h-0 flex-col px-6 py-4">
          <button
            type="button"
            onClick={openArrangementEntry}
            className="absolute right-6 top-4 inline-flex items-center rounded-full border border-ark-border bg-ark-surface-subtle px-4 py-1.5 text-sm font-semibold text-[var(--ark-accent)] transition-colors hover:bg-[var(--ark-accent-soft)]"
          >
            安排
          </button>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] gap-5 pt-2">
            <div className="flex min-h-0 flex-col">
              <HomeSectionHeader title="任务" className="mb-3" />
              <div
                ref={taskListRef}
                className={`relative flex min-h-0 flex-1 flex-col ${todayTasks.length ? 'justify-start gap-2' : 'justify-center'}`}
              >
                {todayTasks.length ? visibleTasks.map((task) => renderDashboardTaskRow(task, workflow)) : (
                  <div className="ark-home-empty-task flex min-h-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--ark-border)] text-[var(--ark-accent)]">
                      <ListTodo className="h-4.5 w-4.5" aria-hidden="true" />
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
              <HomeSectionHeader title="日程" className="mb-3" />
              <div
                ref={appointmentListRef}
                className={`relative flex min-h-0 flex-1 flex-col ${upcomingAppointments.length ? 'justify-start gap-3' : 'justify-center'}`}
              >
                {upcomingAppointments.length ? visibleAppointments.map((appointment, index) => (
                  renderDashboardAppointmentRow(appointment, index, visibleAppointments.length)
                )) : (
                  <div className="ark-home-empty-task flex min-h-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--ark-border)] text-[var(--ark-accent)]">
                      <Calendar className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--ark-text)]">暂无近期日程</div>
                      <div className="mt-1 text-xs text-[var(--ark-text-faint)]">点击右上角安排今日日程</div>
                    </div>
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
        </HomeCard>

        <CalendarWidget className="ark-home-card min-h-0 rounded-[24px]" />

        <section className="grid min-h-0 grid-cols-3 gap-3">
          <HomeCard
            as="button"
            type="button"
            variant="shortcut"
            className="flex min-w-0 flex-col justify-center px-5 text-left"
          >
            <span className="ark-home-shortcut-icon mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] text-[var(--ark-accent)]">
              <BarChart3 className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-[var(--ark-text)]">数据分析</span>
          </HomeCard>

          <HomeCard
            as="button"
            ref={achievementButtonRef}
            type="button"
            variant="shortcut"
            className="flex min-w-0 flex-col justify-center px-5 text-left"
            onClick={() => setAchievementOpen(true)}
          >
            <span className="ark-home-shortcut-icon mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] text-[var(--ark-accent)]">
              <Trophy className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-[var(--ark-text)]">成就</span>
          </HomeCard>

          <HomeCard
            as="button"
            type="button"
            variant="shortcut"
            className="flex min-w-0 flex-col justify-center px-5 text-left"
            onClick={() => navigate('/apps')}
          >
            <span className="ark-home-shortcut-icon mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] text-[var(--ark-accent)]">
              <Box className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-[var(--ark-text)]">应用中心</span>
          </HomeCard>
        </section>
      </div>

      <DeliberateWorkflowPreviewModal
        open={workflowStartOpen}
        preset={selectedWorkflowStartPreset}
        presets={workflowStartPresets}
        onClose={() => {
          if (!isSubmittingAction) setWorkflowStartOpen(false);
        }}
        onStart={(configIds) => void handlePreviewStart(configIds)}
        onEdit={() => {
          setWorkflowStartOpen(false);
          navigate('/deliberate-workflow');
        }}
        onPresetChange={(presetId) => setSelectedWorkflowStartId(presetId)}
      />

      <AchievementModal
        isOpen={achievementOpen}
        onClose={() => setAchievementOpen(false)}
        initialSummary={achievementSummary}
        returnFocusRef={achievementButtonRef}
      />
    </>
  );
}
