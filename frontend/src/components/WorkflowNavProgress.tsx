import React from 'react';

import { computeWorkflowProgress, phaseLabel, WorkflowSnapshot } from './workflowProgress';
import { apiJson } from '../lib/api';

type WorkflowNavProgressProps = {
  workflow: WorkflowSnapshot;
};

type WorkflowConfirmResponse = WorkflowSnapshot & {
  completed_workflow_name?: string | null;
};

/**
 * 导航栏中间的工作流进度条（紧凑版）。
 */
const WorkflowNavProgress: React.FC<WorkflowNavProgressProps> = ({ workflow }) => {
  const [now, setNow] = React.useState(0);
  const [endTime, setEndTime] = React.useState<number | null>(null);
  const [confirming, setConfirming] = React.useState(false);

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
    <div
      role="button"
      tabIndex={0}
      className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors max-w-[520px] w-full cursor-pointer"
      onClick={() => window.dispatchEvent(new Event('ark:open-workflow-modal'))}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.dispatchEvent(new Event('ark:open-workflow-modal')); }}
      aria-label={`工作流进度：${phaseLabel(phaseType)}，剩余 ${formatTime(remaining)}`}
    >
      <span className={`w-2 h-2 rounded-full ${activeColorBg} animate-pulse shadow-[0_0_10px_currentColor] ${activeColorText}`} />
      
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
        <span className={`text-xs font-bold whitespace-nowrap ${activeColorText}`}>
          {isFocus ? '🧠' : '☕'} {formatTime(remaining)}
        </span>
      )}

      <div className="flex-1 flex gap-[3px] h-1.5">
        {phases.map((phase, idx) => {
          const duration = Math.max(0, Math.round(phase.duration || 0));
          
          let fillPercent = 0;
          if (idx < metrics.activePhaseIndex) {
            fillPercent = 100;
          } else if (idx === metrics.activePhaseIndex) {
            const currentRemaining = workflowForMetrics.pending_confirmation ? 0 : Math.max(0, Math.round(workflowForMetrics.remaining_seconds ?? 0));
            const elapsed = Math.max(0, duration - currentRemaining);
            fillPercent = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
          }

          const isFocusPhase = phase.phase_type === 'focus';
          const trackBg = isFocusPhase ? 'bg-white/10' : 'bg-white/10';
          const fillGradient = isFocusPhase 
            ? 'linear-gradient(90deg, #60a5fa, #3b82f6)' 
            : 'linear-gradient(90deg, #fb923c, #f97316)';

          return (
            <div
              key={idx}
              className={`relative h-full rounded-full overflow-hidden ${trackBg}`}
              style={{ flexGrow: duration, flexBasis: 0 }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ 
                  width: `${fillPercent}%`,
                  transition: 'width 1000ms linear',
                  background: fillGradient
                }}
              />
            </div>
          );
        })}
      </div>

      <span className="text-[11px] font-bold text-white/40 whitespace-nowrap">
        {metrics.activePhaseIndex + 1}/{phases.length}
      </span>
    </div>
  );
};

export default WorkflowNavProgress;
