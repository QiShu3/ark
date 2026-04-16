import React from 'react';

import type { WorkflowSnapshot } from './workflowProgress';
import { computeWorkflowProgress, formatClockTime, getWorkflowPhaseTimerMode, phaseLabel } from './workflowProgress';

type WorkflowProgressBarProps = {
  workflow: WorkflowSnapshot;
  className?: string;
};

const WorkflowProgressBar: React.FC<WorkflowProgressBarProps> = ({ workflow, className }) => {
  const phases = React.useMemo(() => (Array.isArray(workflow.phases) ? workflow.phases : []), [workflow.phases]);
  const metrics = computeWorkflowProgress(workflow);
  const showProgress = workflow.state !== 'normal' && phases.length > 0 && metrics.totalSeconds > 0;

  const currentPhase = phases[metrics.activePhaseIndex];
  const phaseType = currentPhase?.phase_type ?? 'focus';
  const timerMode = getWorkflowPhaseTimerMode(workflow);
  const isCountup = phaseType === 'focus' && timerMode === 'countup';
  const isFocus = phaseType === 'focus';
  const activeColorText = isFocus ? 'text-blue-400' : 'text-orange-400';
  const activeColorBg = isFocus ? 'bg-blue-400' : 'bg-orange-400';
  const targetDuration = Math.max(0, Math.round(currentPhase?.duration ?? workflow.phase_planned_duration ?? 0));
  const elapsedSeconds = Math.max(0, Math.round(workflow.elapsed_seconds ?? 0));
  const timerText = workflow.pending_task_selection
    ? '待选任务'
    : formatClockTime(isCountup ? elapsedSeconds : Math.max(0, Math.round(workflow.remaining_seconds ?? 0)));
  const targetHint = isCountup && targetDuration > 0 ? `目标 ${formatClockTime(targetDuration)}` : null;

  if (!showProgress) {
    return null;
  }

  return (
    <div
      className={`w-full h-full px-4 py-3 flex flex-col justify-center ${className ?? ''}`}
      aria-label={`工作流进度 ${Math.round(metrics.percent)}%，当前${phaseLabel(phaseType)}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(metrics.percent)}
    >
      {/* 顶部信息栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {/* 活跃状态的小圆点呼吸灯 */}
          <div className={`w-2 h-2 rounded-full ${activeColorBg} animate-pulse shadow-[0_0_8px_currentColor] ${activeColorText}`}></div>
          <span className={`font-bold text-sm tracking-wide ${activeColorText}`}>
            {phaseLabel(phaseType)}阶段 {metrics.activePhaseIndex + 1}
          </span>
          <span className="font-mono text-sm text-white/90 font-medium bg-black/20 px-1.5 py-0.5 rounded">
            {timerText}
          </span>
          {targetHint ? (
            <span className="text-xs font-medium text-white/55 bg-white/5 px-2 py-0.5 rounded-full">
              {targetHint}
            </span>
          ) : null}
        </div>
        <span className="text-xs font-bold text-white/40 tracking-wider">
          {Math.round(metrics.percent)}%
        </span>
      </div>

      {/* 分段胶囊进度条 (Segmented Capsules) */}
      <div className="relative h-2 w-full flex gap-[3px] mt-2">
        {phases.map((phase, idx) => {
          const duration = Math.max(0, Math.round(phase.duration || 0));
          
          let fillPercent = 0;
          if (idx < metrics.activePhaseIndex) {
            fillPercent = 100;
          } else if (idx === metrics.activePhaseIndex) {
            if (workflow.pending_task_selection) {
              fillPercent = 0;
            } else if (phase.phase_type === 'focus' && timerMode === 'countup') {
              fillPercent = duration > 0 ? Math.min(100, (elapsedSeconds / duration) * 100) : 0;
            } else {
              const currentRemaining = workflow.pending_confirmation ? 0 : Math.max(0, Math.round(workflow.remaining_seconds ?? 0));
              const elapsed = Math.max(0, duration - currentRemaining);
              fillPercent = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
            }
          }

          const isFocusPhase = phase.phase_type === 'focus';
          const trackBg = 'bg-white/10';
          const fillGradient = isFocusPhase 
            ? 'linear-gradient(90deg, #60a5fa, #3b82f6)' 
            : 'linear-gradient(90deg, #fb923c, #f97316)';
          const boxShadow = isFocusPhase
            ? '0 0 10px rgba(59,130,246,0.4)'
            : '0 0 10px rgba(251,146,60,0.4)';

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
                  transition: 'width 400ms linear',
                  background: fillGradient,
                  boxShadow: fillPercent > 0 ? boxShadow : 'none'
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkflowProgressBar;
