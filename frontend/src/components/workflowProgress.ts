export type WorkflowPhase = {
  phase_type: 'focus' | 'break';
  duration: number;
};

export type WorkflowSnapshot = {
  state: 'normal' | 'focus' | 'break';
  current_phase_index?: number | null;
  phases?: WorkflowPhase[];
  pending_confirmation: boolean;
  remaining_seconds: number | null;
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
  const remaining = clamp(Math.round(workflow.remaining_seconds ?? currentDuration), 0, currentDuration);
  const currentElapsed = workflow.pending_confirmation ? currentDuration : currentDuration - remaining;
  const elapsedSeconds = clamp(completedBefore + currentElapsed, 0, totalSeconds);
  const percent = totalSeconds > 0 ? clamp((elapsedSeconds / totalSeconds) * 100, 0, 100) : 0;

  return {
    totalSeconds,
    elapsedSeconds,
    percent,
    activePhaseIndex,
  };
}
