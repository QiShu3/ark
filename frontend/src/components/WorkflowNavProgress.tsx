import React from 'react';

import {
  formatClockTime,
  getActiveWorkflowPhase,
  getWorkflowPhaseTimerMode,
  WorkflowSnapshot,
} from './workflowProgress';
import { apiJson } from '../lib/api';

type WorkflowNavProgressProps = {
  workflow: WorkflowSnapshot;
};

type WorkflowConfirmResponse = WorkflowSnapshot & {
  completed_workflow_name?: string | null;
};

function phaseStatusLabel(phaseType: 'focus' | 'break'): string {
  return phaseType === 'focus' ? '专注中' : '休息中';
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
  const [isHovered, setIsHovered] = React.useState(false);
  const [feedbackText, setFeedbackText] = React.useState<string | null>(null);
  const previousPhaseRef = React.useRef<{ state: WorkflowSnapshot['state']; index: number | null } | null>(null);
  const timerMode = getWorkflowPhaseTimerMode(workflow);
  const isCountup = workflow.state === 'focus' && timerMode === 'countup';

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

  React.useEffect(() => {
    setNow(Date.now());
  }, []);

  React.useEffect(() => {
    if (
      workflow.state === 'normal'
      || workflow.pending_confirmation
      || workflow.pending_task_selection
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
  }, [workflow, isCountup]);

  React.useEffect(() => {
    if (
      workflow.state !== 'focus'
      || workflow.pending_confirmation
      || workflow.pending_task_selection
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
  }, [workflow, isCountup]);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const liveRemaining = React.useMemo(() => {
    if (workflow.pending_confirmation) return 0;
    if (workflow.state === 'normal' || endTime === null) return null;
    return Math.max(0, Math.round((endTime - now) / 1000));
  }, [workflow.pending_confirmation, workflow.state, endTime, now]);

  const liveElapsed = React.useMemo(() => {
    if (!isCountup || workflow.pending_confirmation || workflow.pending_task_selection) return null;
    if (workflow.state !== 'focus' || phaseStartTime === null) return null;
    return Math.max(0, Math.round((now - phaseStartTime) / 1000));
  }, [workflow.pending_confirmation, workflow.pending_task_selection, workflow.state, isCountup, phaseStartTime, now]);

  const workflowForMetrics = React.useMemo<WorkflowSnapshot>(() => {
    if (workflow.state === 'normal' || workflow.pending_confirmation) {
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
  }, [workflow, liveRemaining, liveElapsed, isCountup]);

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
  const activeColorText = isFocus ? 'text-blue-300' : 'text-orange-300';
  const activeColorBg = isFocus ? 'bg-blue-400' : 'bg-orange-400';
  const pulseBgStrong = isFocus ? 'bg-blue-300/85' : 'bg-orange-300/85';
  const pulseBgMid = isFocus ? 'bg-blue-300/25' : 'bg-orange-300/25';
  const pulseBgWeak = isFocus ? 'bg-blue-300/12' : 'bg-orange-300/12';

  const currentDuration = Math.max(0, Math.round(currentPhase?.duration ?? workflowForMetrics.phase_planned_duration ?? 0));
  const remaining = workflowForMetrics.pending_confirmation ? 0 : Math.max(0, Math.round(workflowForMetrics.remaining_seconds ?? 0));
  const elapsed = Math.max(0, Math.round(workflowForMetrics.elapsed_seconds ?? 0));
  const timerText = workflowForMetrics.pending_task_selection
    ? '待选任务'
    : formatClockTime(isCountup ? elapsed : remaining);
  const targetHint = isCountup && currentDuration > 0 ? `目标 ${formatClockTime(currentDuration)}` : null;
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
  const showPulse = !workflowForMetrics.pending_confirmation && !workflowForMetrics.pending_task_selection;
  const titleText = showFeedback
    ? feedbackText!
    : workflowForMetrics.pending_task_selection
      ? '选择任务'
      : workflowForMetrics.pending_confirmation
        ? '等待继续'
        : phaseStatusLabel(phaseType);
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
      role="button"
      tabIndex={0}
      data-layout={layoutMode}
      className={`hidden md:flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-[width,padding,background-color] duration-300 cursor-pointer overflow-hidden ${widthClass}`}
      onClick={() => window.dispatchEvent(new Event('ark:open-workflow-modal'))}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.dispatchEvent(new Event('ark:open-workflow-modal'));
        }
      }}
      aria-label={`工作流进度：${titleText}，${ariaText}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${activeColorBg} shadow-[0_0_12px_currentColor] ${activeColorText}`} />

      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Current</p>
        <div className="flex items-baseline gap-2 min-w-0">
          <span className={`text-sm font-semibold whitespace-nowrap ${activeColorText}`}>
            {titleText}
          </span>
          {showHoverTask ? (
            <span className="min-w-0 truncate text-xs text-white/55">
              {workflowForMetrics.task_title}
            </span>
          ) : null}
          {targetHint ? <span className="text-[10px] text-white/45 whitespace-nowrap">{targetHint}</span> : null}
        </div>
      </div>

      {showPulse ? (
        <div
          data-testid="workflow-nav-pulse"
          data-phase={phaseType}
          aria-hidden="true"
          className={`flex items-center gap-1.5 transition-transform duration-300 ${layoutMode === 'feedback' ? 'scale-110' : ''}`}
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
          className={`text-[11px] font-bold whitespace-nowrap px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors ${activeColorText}`}
        >
          {confirming ? '确认中...' : '▶ 继续'}
        </button>
      ) : (
        <span className={`text-sm font-semibold whitespace-nowrap ${activeColorText}`}>
          {timerText}
        </span>
      )}
    </div>
  );
};

export default WorkflowNavProgress;
