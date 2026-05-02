export type FocusTimerMode = 'countdown' | 'countup';

export type WorkflowPhase = {
  phase_type: 'focus' | 'break';
  duration: number;
  timer_mode?: FocusTimerMode | null;
  task_id?: string | null;
};

export type WorkflowSnapshot = {
  state: 'normal' | 'focus' | 'break';
  current_phase_index?: number | null;
  phases?: WorkflowPhase[];
  pending_confirmation: boolean;
  pending_task_selection?: boolean;
  remaining_seconds: number | null;
  elapsed_seconds?: number | null;
  phase_timer_mode?: FocusTimerMode | null;
  phase_started_at?: string | null;
  phase_planned_duration?: number | null;
  task_id?: string | null;
  task_title?: string | null;
  runtime_task_id?: string | null;
};

export type WorkflowProgressMetrics = {
  totalSeconds: number;
  elapsedSeconds: number;
  percent: number;
  activePhaseIndex: number;
};

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function estimateFps(frameIntervalMs: number): number {
  if (!Number.isFinite(frameIntervalMs) || frameIntervalMs <= 0) return 0;
  return 1000 / frameIntervalMs;
}

export function phaseLabel(phaseType: 'focus' | 'break'): string {
  return phaseType === 'focus' ? '专注阶段' : '休息阶段';
}

export function formatClockTime(secs: number): string {
  const safe = Math.max(0, Math.round(secs || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function getWorkflowPhaseTimerMode(workflow: WorkflowSnapshot): FocusTimerMode {
  const phases = Array.isArray(workflow.phases) ? workflow.phases : [];
  const activePhaseIndex = clamp(Math.round(workflow.current_phase_index ?? 0), 0, Math.max(phases.length - 1, 0));
  const phase = phases[activePhaseIndex];
  if (workflow.state !== 'focus') return 'countdown';
  return workflow.phase_timer_mode ?? phase?.timer_mode ?? 'countdown';
}

export function getActiveWorkflowPhase(workflow: WorkflowSnapshot): WorkflowPhase | null {
  const phases = Array.isArray(workflow.phases) ? workflow.phases : [];
  if (workflow.state === 'normal' || phases.length === 0) return null;

  const activePhaseIndex = clamp(
    Math.round(workflow.current_phase_index ?? 0),
    0,
    phases.length - 1,
  );

  return phases[activePhaseIndex] ?? null;
}

export function computeWorkflowProgress(workflow: WorkflowSnapshot): WorkflowProgressMetrics {
  const phases = Array.isArray(workflow.phases) ? workflow.phases : [];
  const safePhases = phases
    .map((phase) => ({ ...phase, duration: Math.max(0, Math.round(phase.duration || 0)) }))
    .filter((phase) => phase.duration > 0);

  const totalSeconds = safePhases.reduce((sum, phase) => sum + phase.duration, 0);
  if (workflow.state === 'normal' || safePhases.length === 0 || totalSeconds <= 0) {
    return {
      totalSeconds: 0,
      elapsedSeconds: 0,
      percent: 0,
      activePhaseIndex: 0,
    };
  }

  const activePhaseIndex = clamp(
    Math.round(workflow.current_phase_index ?? 0),
    0,
    safePhases.length - 1,
  );

  const completedBefore = safePhases
    .slice(0, activePhaseIndex)
    .reduce((sum, phase) => sum + phase.duration, 0);
  const currentDuration = safePhases[activePhaseIndex]?.duration ?? 0;
  const timerMode = getWorkflowPhaseTimerMode(workflow);
  const remaining = clamp(Math.round(workflow.remaining_seconds ?? currentDuration), 0, currentDuration);
  const currentElapsed = workflow.pending_confirmation
    ? currentDuration
    : workflow.pending_task_selection
      ? 0
      : timerMode === 'countup' && safePhases[activePhaseIndex]?.phase_type === 'focus'
        ? clamp(Math.round(workflow.elapsed_seconds ?? 0), 0, currentDuration)
        : currentDuration - remaining;
  const elapsedSeconds = clamp(completedBefore + currentElapsed, 0, totalSeconds);
  const percent = totalSeconds > 0 ? clamp((elapsedSeconds / totalSeconds) * 100, 0, 100) : 0;

  return {
    totalSeconds,
    elapsedSeconds,
    percent,
    activePhaseIndex,
  };
}
