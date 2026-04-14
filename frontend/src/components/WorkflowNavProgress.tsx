import React from 'react';

import { computeWorkflowProgress, phaseLabel, WorkflowSnapshot } from './workflowProgress';

type WorkflowNavProgressProps = {
  workflow: WorkflowSnapshot;
};

/**
 * 导航栏中间的工作流进度条（紧凑版）。
 */
const WorkflowNavProgress: React.FC<WorkflowNavProgressProps> = ({ workflow }) => {
  const [now, setNow] = React.useState(0);
  const [endTime, setEndTime] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
  }, []);

  React.useEffect(() => {
    if (workflow.state === 'normal' || workflow.pending_confirmation || !Number.isFinite(workflow.remaining_seconds ?? NaN)) {
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
  }, [workflow]);

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

  const workflowForMetrics = React.useMemo<WorkflowSnapshot>(() => {
    if (workflow.state === 'normal' || workflow.pending_confirmation || liveRemaining === null) {
      return workflow;
    }
    if (workflow.remaining_seconds === liveRemaining) {
      return workflow;
    }
    return { ...workflow, remaining_seconds: liveRemaining };
  }, [workflow, liveRemaining]);

  const phases = Array.isArray(workflowForMetrics.phases) ? workflowForMetrics.phases : [];
  const metrics = computeWorkflowProgress(workflowForMetrics);
  const showProgress = workflowForMetrics.state !== 'normal' && phases.length > 0 && metrics.totalSeconds > 0;

  if (!showProgress) {
    return null;
  }

  const currentPhase = phases[metrics.activePhaseIndex];
  const phaseType = currentPhase?.phase_type ?? 'focus';
  const isFocus = phaseType === 'focus';
  const activeColorText = isFocus ? 'text-blue-400' : 'text-orange-400';
  const activeColorBg = isFocus ? 'bg-blue-400' : 'bg-orange-400';
  const activeColorGradient = isFocus
    ? 'linear-gradient(90deg, #60a5fa, #3b82f6)'
    : 'linear-gradient(90deg, #fb923c, #f97316)';

  /**
   * 将秒数格式化成 MM:SS。
   */
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const remaining = workflowForMetrics.pending_confirmation ? 0 : Math.max(0, Math.round(workflowForMetrics.remaining_seconds ?? 0));

  return (
    <button
      type="button"
      className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors max-w-[520px] w-full"
      onClick={() => window.dispatchEvent(new Event('ark:open-workflow-modal'))}
      aria-label={`工作流进度：${phaseLabel(phaseType)}，剩余 ${formatTime(remaining)}`}
    >
      <span className={`w-2 h-2 rounded-full ${activeColorBg} animate-pulse shadow-[0_0_10px_currentColor] ${activeColorText}`} />
      <span className={`text-xs font-bold whitespace-nowrap ${activeColorText}`}>
        {isFocus ? '🧠' : '☕'} {formatTime(remaining)}
      </span>
      <div className="relative flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${metrics.percent}%`,
            transition: 'width 600ms linear',
            background: activeColorGradient,
          }}
        />
      </div>
      <span className="text-[11px] font-bold text-white/40 whitespace-nowrap">
        {metrics.activePhaseIndex + 1}/{phases.length}
      </span>
    </button>
  );
};

export default WorkflowNavProgress;
