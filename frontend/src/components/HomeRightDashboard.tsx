import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Box, Check, ChevronRight, Circle, Play, Trophy } from 'lucide-react';

import { apiJson } from '../lib/api';
import type { Task } from './taskTypes';
import CalendarWidget from './CalendarWidget';
import AchievementModal from './AchievementModal';
import type { AchievementSummary } from './achievementTypes';

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

type WorkflowPreset = {
  id: string;
  name: string;
  is_default?: boolean;
};

const DAILY_GOAL_MINUTES = 120;

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

function DecorativeClock() {
  const ticks = Array.from({ length: 12 }, (_, index) => index * 30);

  return (
    <svg
      className="ark-home-decorative-clock absolute right-8 top-3 z-0 h-[92px] w-[92px]"
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="ark-home-clock-halo" cx="50" cy="50" r="48" />
      <circle className="ark-home-clock-face" cx="50" cy="50" r="39" />
      {ticks.map((rotation) => (
        <line
          key={rotation}
          className="ark-home-clock-tick"
          x1="50"
          y1="14"
          x2="50"
          y2={rotation % 90 === 0 ? '20' : '18'}
          transform={`rotate(${rotation} 50 50)`}
        />
      ))}
      <line className="ark-home-clock-hand" x1="50" y1="50" x2="50" y2="27" transform="rotate(40 50 50)" />
      <line className="ark-home-clock-hand ark-home-clock-hand-short" x1="50" y1="50" x2="50" y2="33" transform="rotate(230 50 50)" />
      <circle className="ark-home-clock-center" cx="50" cy="50" r="4" />
    </svg>
  );
}

export default function HomeRightDashboard() {
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<FocusWorkflow | null>(null);
  const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [achievementSummary, setAchievementSummary] = useState<AchievementSummary | null>(null);
  const [achievementOpen, setAchievementOpen] = useState(false);
  const achievementButtonRef = useRef<HTMLButtonElement | null>(null);

  async function loadDashboard() {
    const [workflowRes, todayFocusRes, tasksRes, achievementRes] = await Promise.allSettled([
      apiJson<FocusWorkflow>('/todo/focus/workflow/current'),
      apiJson<TodayFocusSummary>('/todo/focus/today'),
      apiJson<Task[]>('/todo/tasks?limit=100'),
      apiJson<AchievementSummary>('/todo/achievements/summary'),
    ]);

    if (workflowRes.status === 'fulfilled') setWorkflow(workflowRes.value);
    if (todayFocusRes.status === 'fulfilled') setTodayFocusMinutes(todayFocusRes.value.minutes);
    if (tasksRes.status === 'fulfilled') setTasks(Array.isArray(tasksRes.value) ? tasksRes.value : []);
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
  }, [workflow, nowMs]);

  const progressPercent = Math.min(100, Math.round((todayFocusMinutes / DAILY_GOAL_MINUTES) * 100));
  const progressIsZero = progressPercent === 0;
  const progressVisualPercent = progressIsZero ? 4 : progressPercent;
  const todayTasks = tasks
    .filter((task) => !task.completion_state?.hidden_from_action_list && taskMatchesToday(task))
    .sort((a, b) => Number(isToday(b.due_date)) - Number(isToday(a.due_date)))
    .slice(0, 3);
  const phaseLabel = workflow?.state === 'break' ? '休息阶段' : '当前阶段';
  const actionLabel = workflow?.pending_task_selection
    ? '开始学习'
    : !workflow || workflow.state === 'normal'
    ? '开始学习'
    : workflow.state === 'break'
      ? '结束休息'
      : workflow.pending_confirmation
        ? '确认流转'
        : '结束阶段';

  async function handlePrimaryAction() {
    if (isSubmittingAction) return;
    setIsSubmittingAction(true);
    try {
      if (workflow?.pending_task_selection) {
        window.dispatchEvent(new Event('ark:open-workflow-modal'));
        return;
      }
      if (!workflow || workflow.state === 'normal') {
        const presets = await apiJson<WorkflowPreset[]>('/todo/focus/workflows');
        const preset = presets.find((item) => item.is_default) ?? presets[0];
        if (!preset) {
          window.dispatchEvent(new Event('ark:open-workflow-modal'));
          return;
        }
        await apiJson(`/todo/focus/workflows/${preset.id}/start`, { method: 'POST' });
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

  function openArrangementEntry() {
    window.dispatchEvent(new Event('ark:open-arrangements-modal'));
  }

  return (
    <>
      <div className="grid h-full grid-rows-[1.25fr_0.85fr_1.15fr_1.7fr_1fr] gap-3">
        <section className="ark-home-card ark-home-timer-card relative overflow-hidden rounded-[24px] px-6 py-5">
          <div className="relative z-10 flex h-full min-h-[150px] flex-col justify-between">
            <div className="flex items-center gap-2 text-base font-medium text-[var(--ark-text)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--ark-accent)] shadow-[0_0_12px_var(--ark-accent)]" />
              {phaseLabel}
            </div>

            <div className="pb-1">
              <div className="ark-home-timer-digits text-[4.4rem] font-semibold leading-none text-[var(--ark-text)] ark-font-display">
                {formatTimer(timerSeconds)}
              </div>
              <div className="mt-5 text-sm text-[var(--ark-text-muted)]">
                今日目标&nbsp;&nbsp;{DAILY_GOAL_MINUTES} 分钟
              </div>
            </div>
          </div>

          <DecorativeClock />

          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isSubmittingAction}
            className="ark-home-primary-button absolute bottom-6 right-6 z-20 flex h-[52px] min-w-[212px] items-center justify-center gap-2 rounded-[20px] px-6 text-lg font-semibold transition hover:scale-[1.01] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
          >
            <span className="ark-home-play-dot flex h-6 w-6 items-center justify-center rounded-full">
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            </span>
            {actionLabel}
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

        <section className="ark-home-card flex min-h-0 flex-col rounded-[24px] px-6 py-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-base font-semibold text-[var(--ark-text)]">今日任务</span>
            <button
              type="button"
              onClick={openArrangementEntry}
              className="ark-home-text-link flex items-center gap-1.5 text-sm font-medium text-[var(--ark-text-muted)]"
            >
              查看全部
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className={`flex min-h-0 flex-1 flex-col ${todayTasks.length ? 'justify-start gap-2 pt-1' : 'justify-center'}`}>
            {todayTasks.length ? todayTasks.map((task) => {
              const completed = task.status === 'done' || task.completion_state?.completion_state === 'period_complete';
              const active = workflow?.task_id === task.id;
              const statusLabel = completed ? '已完成' : active ? '进行中' : '待开始';
              const statusClass = completed
                ? 'text-emerald-500'
                : active
                  ? 'text-[var(--ark-accent)]'
                  : 'text-[var(--ark-text-faint)]';
              const statusDotClass = completed
                ? 'bg-emerald-400'
                : active
                  ? 'bg-[var(--ark-accent)]'
                  : 'bg-[var(--ark-text-faint)]';
              return (
                <div key={task.id} className="grid h-[36px] grid-cols-[minmax(0,1fr)_118px_76px] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border ${
                      completed ? 'ark-home-task-check border-[var(--ark-accent)] bg-[var(--ark-accent)] text-[var(--ark-on-accent)]' : 'border-[var(--ark-border-strong)] bg-[var(--ark-glass-surface-soft)]'
                    }`}>
                      {completed ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    </span>
                    <span className="truncate text-sm font-medium text-[var(--ark-text)]">{task.title}</span>
                  </div>
                  <span className="text-right text-sm text-[var(--ark-text-muted)]">{formatTaskWindow(task)}</span>
                  <span className={`flex items-center justify-end gap-1.5 text-xs font-medium ${statusClass}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} aria-hidden="true" />
                    {statusLabel}
                  </span>
                </div>
              );
            }) : (
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

      <AchievementModal
        isOpen={achievementOpen}
        onClose={() => setAchievementOpen(false)}
        initialSummary={achievementSummary}
        returnFocusRef={achievementButtonRef}
      />
    </>
  );
}
