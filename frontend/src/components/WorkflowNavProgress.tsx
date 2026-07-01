import React from 'react';

import {
  formatClockTime,
  getActiveWorkflowPhase,
  getWorkflowPhaseTimerMode,
  WorkflowSnapshot,
} from './workflowProgress';
import { apiJson } from '../lib/api';
import { Coffee, Flame, Sparkles } from 'lucide-react';
import { normalizeFocusWorkType } from './focus-work/focusWorkTypes';

type WorkflowNavProgressProps = {
  workflow: WorkflowSnapshot;
};

type WorkflowConfirmResponse = WorkflowSnapshot & {
  completed_workflow_name?: string | null;
};

function phaseStatusLabel(phaseType: 'focus' | 'break'): string {
  return phaseType === 'focus' ? '专注中' : '休息中';
}

const FOCUS_WORK_LABELS = {
  flash_card: '背单词',
  choice: '选择练习',
  input: '输入练习',
  task_focus: '任务专注',
} as const;

function resolveFocusWorkLabel(value: string | null | undefined): string | null {
  const normalized = normalizeFocusWorkType(value);
  if (!normalized) return null;
  return FOCUS_WORK_LABELS[normalized] ?? null;
}

function resolveFeedbackCopy(
  prevState: WorkflowSnapshot['state'],
  nextState: WorkflowSnapshot['state'],
): string | null {
  if (prevState === 'focus' && nextState === 'break') return '开始休息';
  if (prevState === 'break' && nextState === 'focus') return '继续专注';
  if (prevState === 'focus' && nextState === 'focus') return '专注完成';
  if (prevState === 'break' && nextState === 'break') return '休息结束';
  return null;
}

/**
 * 导航栏中间的工作流进度条（紧凑版）。
 */
const WorkflowNavProgress: React.FC<WorkflowNavProgressProps> = ({ workflow }) => {
  const [now, setNow] = React.useState(0);
  const [endTime, setEndTime] = React.useState<number | null>(null);
  const [phaseStartTime, setPhaseStartTime] = React.useState<number | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [skipping, setSkipping] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [feedbackText, setFeedbackText] = React.useState<string | null>(null);
  const previousPhaseRef = React.useRef<{ state: WorkflowSnapshot['state']; index: number | null } | null>(null);
  const expiredPhaseReloadRef = React.useRef<string | null>(null);
  const timerMode = getWorkflowPhaseTimerMode(workflow);
  const isCountup = workflow.state === 'focus' && timerMode === 'countup';
  const isPausedFocus = workflow.state === 'focus' && Boolean(workflow.is_paused);

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirming) return;
    setConfirming(true);
    try {
      const res = await apiJson<WorkflowConfirmResponse>('/todo/focus/workflow/confirm', { method: 'POST' });
      if (res.state === 'normal' && res.completed_workflow_name) {
        alert(`恭喜完成${res.completed_workflow_name}工作流`);
      }
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to confirm focus workflow phase', err);
      alert('阶段确认失败');
    } finally {
      setConfirming(false);
    }
  };

  const handleSkipPhase = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (skipping) return;
    setSkipping(true);
    try {
      await apiJson('/todo/focus/workflow/skip_phase', { method: 'POST' });
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to skip focus workflow phase', err);
      alert('结束休息失败');
    } finally {
      setSkipping(false);
    }
  };

  React.useEffect(() => {
    setNow(Date.now());
  }, []);

  React.useEffect(() => {
    if (
      workflow.state === 'normal'
      || workflow.pending_confirmation
      || workflow.pending_task_selection
      || isPausedFocus
      || isCountup
      || !Number.isFinite(workflow.remaining_seconds ?? NaN)
    ) {
      setEndTime(null);
      return;
    }
    const remaining = Math.max(0, Math.round(workflow.remaining_seconds ?? 0));
    const nextEnd = Date.now() + remaining * 1000;
    setEndTime((prev) => {
      if (prev === null) return nextEnd;
      if (Math.abs(nextEnd - prev) >= 3000) return nextEnd;
      return prev;
    });
  }, [workflow, isCountup, isPausedFocus]);

  React.useEffect(() => {
    if (
      workflow.state !== 'focus'
      || workflow.pending_confirmation
      || workflow.pending_task_selection
      || isPausedFocus
      || !isCountup
      || !workflow.phase_started_at
    ) {
      setPhaseStartTime(null);
      return;
    }
    const nextStart = new Date(workflow.phase_started_at).getTime();
    if (!Number.isFinite(nextStart)) {
      setPhaseStartTime(null);
      return;
    }
    setPhaseStartTime(nextStart);
  }, [workflow, isCountup, isPausedFocus]);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const liveRemaining = React.useMemo(() => {
    if (workflow.pending_confirmation) return 0;
    if (isPausedFocus) return workflow.remaining_seconds ?? null;
    if (workflow.state === 'normal' || endTime === null) return null;
    return Math.max(0, Math.round((endTime - now) / 1000));
  }, [workflow.pending_confirmation, workflow.remaining_seconds, workflow.state, endTime, isPausedFocus, now]);

  const liveElapsed = React.useMemo(() => {
    if (!isCountup || workflow.pending_confirmation || workflow.pending_task_selection || isPausedFocus) return null;
    if (workflow.state !== 'focus' || phaseStartTime === null) return null;
    return Math.max(0, Math.round((now - phaseStartTime) / 1000));
  }, [workflow.pending_confirmation, workflow.pending_task_selection, workflow.state, isCountup, isPausedFocus, phaseStartTime, now]);

  const workflowForMetrics = React.useMemo<WorkflowSnapshot>(() => {
    if (workflow.state === 'normal' || workflow.pending_confirmation || isPausedFocus) {
      return workflow;
    }
    if (isCountup) {
      if (liveElapsed === null || workflow.elapsed_seconds === liveElapsed) {
        return workflow;
      }
      return { ...workflow, elapsed_seconds: liveElapsed };
    }
    if (liveRemaining === null || workflow.remaining_seconds === liveRemaining) {
      return workflow;
    }
    return { ...workflow, remaining_seconds: liveRemaining };
  }, [workflow, liveRemaining, liveElapsed, isCountup, isPausedFocus]);

  React.useEffect(() => {
    if (
      workflow.state === 'normal'
      || workflow.pending_confirmation
      || workflow.pending_task_selection
      || isPausedFocus
      || isCountup
      || liveRemaining !== 0
    ) {
      return;
    }
    const expiredPhaseKey = [
      workflow.state,
      workflow.current_phase_index ?? 'none',
      workflow.phase_started_at ?? 'unknown-start',
    ].join(':');
    if (expiredPhaseReloadRef.current === expiredPhaseKey) return;
    expiredPhaseReloadRef.current = expiredPhaseKey;
    window.dispatchEvent(new CustomEvent('ark:reload-focus'));
  }, [
    isCountup,
    liveRemaining,
    workflow.current_phase_index,
    workflow.pending_confirmation,
    workflow.pending_task_selection,
    workflow.phase_started_at,
    workflow.state,
    isPausedFocus,
  ]);

  React.useEffect(() => {
    const nextPhase = {
      state: workflowForMetrics.state,
      index: workflowForMetrics.current_phase_index ?? null,
    };
    const prevPhase = previousPhaseRef.current;

    if (
      prevPhase
      && prevPhase.state !== 'normal'
      && nextPhase.state !== 'normal'
      && !workflowForMetrics.pending_confirmation
      && !workflowForMetrics.pending_task_selection
      && (prevPhase.state !== nextPhase.state || prevPhase.index !== nextPhase.index)
    ) {
      setFeedbackText(resolveFeedbackCopy(prevPhase.state, nextPhase.state));
    }

    previousPhaseRef.current = nextPhase;
  }, [
    workflowForMetrics.current_phase_index,
    workflowForMetrics.pending_confirmation,
    workflowForMetrics.pending_task_selection,
    workflowForMetrics.state,
  ]);

  React.useEffect(() => {
    if (!feedbackText) return;
    const timer = window.setTimeout(() => {
      setFeedbackText(null);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [feedbackText]);

  const phases = Array.isArray(workflowForMetrics.phases) ? workflowForMetrics.phases : [];
  const showProgress = workflowForMetrics.state !== 'normal' && phases.length > 0;

  if (!showProgress) {
    return null;
  }

  const currentPhase = getActiveWorkflowPhase(workflowForMetrics);
  const phaseType = currentPhase?.phase_type ?? 'focus';
  const isFocus = phaseType === 'focus';
  const activeColorText = isFocus
    ? 'text-[var(--focus-work-blue-text)]'
    : 'text-[var(--focus-work-amber-text)]';
  const activeBgClass = 'bg-[var(--workflow-capsule-bg)]';
  const activeBorderClass = 'border border-[var(--workflow-capsule-border)] ring-1 ring-[var(--workflow-capsule-ring)]';
  const activeShadowClass = 'shadow-[0_12px_30px_-4px_var(--workflow-capsule-shadow)]';

  const pulseBgStrong = 'bg-current/85';
  const pulseBgMid = 'bg-current/25';
  const pulseBgWeak = 'bg-current/12';

  const IconComponent = workflowForMetrics.pending_confirmation || workflowForMetrics.pending_task_selection
    ? Sparkles
    : isFocus
      ? Flame
      : Coffee;

  const currentDuration = Math.max(0, Math.round(currentPhase?.duration ?? workflowForMetrics.phase_planned_duration ?? 0));
  const remaining = workflowForMetrics.pending_confirmation ? 0 : Math.max(0, Math.round(workflowForMetrics.remaining_seconds ?? 0));
  const elapsed = Math.max(0, Math.round(workflowForMetrics.elapsed_seconds ?? 0));
  const timerText = workflowForMetrics.pending_task_selection
    ? '待选任务'
    : formatClockTime(isCountup ? elapsed : remaining);
  const targetHint = isCountup && currentDuration > 0 && !currentPhase?.is_temporary
    ? `目标 ${formatClockTime(currentDuration)}`
    : null;
  const hasTaskTitle = Boolean(workflowForMetrics.task_title?.trim());
  const isInteractiveFocus = workflowForMetrics.state === 'focus'
    && !workflowForMetrics.pending_confirmation
    && !workflowForMetrics.pending_task_selection;
  const showFeedback = Boolean(feedbackText)
    && !workflowForMetrics.pending_confirmation
    && !workflowForMetrics.pending_task_selection;
  const showHoverTask = isInteractiveFocus && isHovered && hasTaskTitle && !showFeedback;
  const layoutMode: 'compact' | 'hover' | 'feedback' = showFeedback
    ? 'feedback'
    : showHoverTask
      ? 'hover'
      : 'compact';
  const showPulse = !isPausedFocus && !workflowForMetrics.pending_confirmation && !workflowForMetrics.pending_task_selection;
  const titleText = showFeedback
    ? feedbackText!
    : workflowForMetrics.pending_task_selection
      ? '选择任务'
      : workflowForMetrics.pending_confirmation
        ? '等待继续'
        : isPausedFocus
          ? '已暂停'
        : phaseStatusLabel(phaseType);
  const activeFocusWorkLabel = workflowForMetrics.active_focus_work_type
    ? resolveFocusWorkLabel(workflowForMetrics.active_focus_work_type)
    : null;
  const nextFocusWorkLabel = workflowForMetrics.next_focus_work_type
    ? resolveFocusWorkLabel(workflowForMetrics.next_focus_work_type)
    : null;
  const focusWorkHint = workflowForMetrics.state === 'break'
    ? nextFocusWorkLabel
    : activeFocusWorkLabel;
  const ariaText = workflowForMetrics.pending_confirmation
    ? '等待确认继续'
    : workflowForMetrics.pending_task_selection
      ? '等待选择任务'
      : `时间 ${timerText}`;
  const widthClass = layoutMode === 'compact'
    ? 'w-[320px]'
    : layoutMode === 'hover'
      ? 'w-[460px]'
      : 'w-[500px]';

  return (
    <div
      data-layout={layoutMode}
      className={`hidden md:flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-md transition-all duration-300 overflow-hidden ${activeBgClass} ${activeBorderClass} ${activeShadowClass} ${widthClass}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label={`工作流进度：${titleText}，${ariaText}`}
    >
      <IconComponent
        size={15}
        className={`shrink-0 ${activeColorText} drop-shadow-[0_0_3px_currentColor] animate-[workflow-pulse_2s_ease-in-out_infinite]`}
      />

      <div className="min-w-0 flex-1">
        <p className="ark-font-display text-[9px] font-bold uppercase tracking-[0.2em] text-ark-text-faint">Current</p>
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="ark-font-display text-sm font-bold tracking-wide whitespace-nowrap text-ark-text">
            {titleText}
          </span>
          {showHoverTask ? (
            <span className="ark-font-display min-w-0 truncate text-xs font-medium text-ark-text-muted">
              {workflowForMetrics.task_title}
            </span>
          ) : null}
          {targetHint ? <span className="ark-font-mono text-[10px] text-ark-text-faint whitespace-nowrap">{targetHint}</span> : null}
          {focusWorkHint ? (
            <span className="ark-font-display rounded-full bg-ark-surface-subtle px-2.5 py-0.5 text-[10px] font-medium text-ark-text-muted whitespace-nowrap">
              {workflowForMetrics.state === 'break' ? `下个 ${focusWorkHint}` : focusWorkHint}
            </span>
          ) : null}
          {workflowForMetrics.has_minimized_work ? (
            <span className="ark-font-display rounded-full bg-[var(--focus-work-amber-bg)] border border-[var(--focus-work-amber-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--focus-work-amber-text)] whitespace-nowrap">
              已挂起
            </span>
          ) : null}
        </div>
      </div>

      {showPulse ? (
        <div
          data-testid="workflow-nav-pulse"
          data-phase={phaseType}
          aria-hidden="true"
          className="sr-only"
        >
          <span className={`h-2 w-4 rounded-full ${pulseBgStrong} animate-[workflow-pulse_1.4s_ease-in-out_infinite]`} />
          <span className={`h-1.5 w-2.5 rounded-full ${pulseBgMid}`} />
          <span className={`h-1.5 w-2 rounded-full ${pulseBgWeak}`} />
        </div>
      ) : null}

      {workflowForMetrics.pending_confirmation ? (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming}
          className="text-[11px] font-bold whitespace-nowrap px-3 py-1 rounded-full bg-ark-surface-subtle hover:bg-ark-surface border border-ark-border text-ark-text active:scale-95 hover:scale-105 transition-all duration-200 shadow-sm"
        >
          {confirming ? '确认中...' : '▶ 继续'}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="ark-font-mono text-sm font-bold whitespace-nowrap text-ark-text">
            {timerText}
          </span>
          {workflowForMetrics.state === 'break' && (
            <button
              type="button"
              onClick={handleSkipPhase}
              disabled={skipping}
              className="text-[10px] font-bold whitespace-nowrap px-2.5 py-1 rounded-full bg-current/10 border border-current/25 text-current hover:bg-current/20 active:scale-95 hover:scale-105 transition-all duration-200 shadow-sm ml-2"
            >
              {skipping ? '请稍候...' : '结束休息'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkflowNavProgress;
