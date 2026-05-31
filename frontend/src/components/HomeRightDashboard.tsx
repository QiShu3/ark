import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Box, Check, Circle, Clock3, Play, Plus, Trophy } from 'lucide-react';

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
  const actionLabel = !workflow || workflow.state === 'normal'
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

  return (
    <>
      <div className="grid h-full grid-rows-[1.25fr_0.85fr_1.15fr_1.7fr_1fr] gap-3">
        <section className="ark-home-card relative rounded-[24px] px-6 py-5">
          <div className="flex h-full items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-base font-medium text-[var(--ark-text)]">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--ark-accent)] shadow-[0_0_12px_var(--ark-accent)]" />
                {phaseLabel}
              </div>
              <div className="mt-4 text-6xl font-semibold leading-none text-[var(--ark-text)] ark-font-display">
                {formatTimer(timerSeconds)}
              </div>
              <div className="mt-4 text-sm text-[var(--ark-text-muted)]">
                今日目标&nbsp;&nbsp;{DAILY_GOAL_MINUTES} 分钟
              </div>
            </div>

            <div className="flex h-full min-w-[158px] flex-col items-end justify-between pr-1">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--ark-border)] bg-[var(--ark-accent-soft)] text-[var(--ark-accent)] opacity-75">
                <Clock3 className="h-7 w-7" aria-hidden="true" />
              </div>
              <button
                type="button"
                onClick={handlePrimaryAction}
                disabled={isSubmittingAction}
                className="ark-home-primary-button flex h-11 min-w-[150px] items-center justify-center gap-2 rounded-[16px] px-4 text-base font-semibold transition hover:scale-[1.01] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
              >
                <span className="ark-home-play-dot flex h-5.5 w-5.5 items-center justify-center rounded-full">
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                </span>
                {actionLabel}
              </button>
            </div>
          </div>
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

        <section className="ark-home-card flex min-h-0 flex-col rounded-[24px] px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-base font-semibold text-[var(--ark-text)]">今日任务</span>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('ark:open-workflow-modal'))}
              className="ark-home-mini-action flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-[var(--ark-text-muted)]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              添加计划
            </button>
          </div>
          <div className={`flex min-h-0 flex-1 flex-col gap-2 ${todayTasks.length ? 'justify-start pt-2' : 'justify-center'}`}>
            {todayTasks.length ? todayTasks.map((task) => {
              const completed = task.status === 'done' || task.completion_state?.completion_state === 'period_complete';
              const active = workflow?.task_id === task.id;
              const statusLabel = completed ? '已完成' : active ? '进行中' : '待开始';
              return (
                <div key={task.id} className="grid grid-cols-[minmax(0,1fr)_92px_58px] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      completed ? 'border-[var(--ark-accent)] bg-[var(--ark-accent)] text-[var(--ark-on-accent)]' : 'border-[var(--ark-border-strong)]'
                    }`}>
                      {completed ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    </span>
                    <span className="truncate text-sm font-medium text-[var(--ark-text)]">{task.title}</span>
                  </div>
                  <span className="text-right text-sm text-[var(--ark-text-muted)]">{formatTaskWindow(task)}</span>
                  <span className={completed ? 'text-right text-xs font-medium text-emerald-500' : active ? 'text-right text-xs font-medium text-[var(--ark-accent)]' : 'text-right text-xs font-medium text-[var(--ark-text-faint)]'}>
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
