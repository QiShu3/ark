import React from 'react';

import type { WorkflowSnapshot } from './workflowProgress';
import { computeWorkflowProgress, phaseLabel } from './workflowProgress';

type WorkflowProgressBarProps = {
  workflow: WorkflowSnapshot;
  className?: string;
};

const WorkflowProgressBar: React.FC<WorkflowProgressBarProps> = ({ workflow, className }) => {
  const phases = Array.isArray(workflow.phases) ? workflow.phases : [];
  const metrics = computeWorkflowProgress(workflow);
  const showProgress = workflow.state !== 'normal' && phases.length > 0 && metrics.totalSeconds > 0;

  if (!showProgress) {
    return null;
  }

  return (
    <div
      className={`w-full max-w-full px-4 py-4 ${className ?? ''}`}
      aria-label={`工作流进度 ${Math.round(metrics.percent)}%，当前${phaseLabel(phases[metrics.activePhaseIndex]?.phase_type ?? 'focus')}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(metrics.percent)}
    >
      <div className="flex items-center justify-between text-xs text-white/70 mb-3">
        <span className="font-medium">
          当前：{phaseLabel(phases[metrics.activePhaseIndex]?.phase_type ?? 'focus')}
        </span>
        <span>{Math.round(metrics.percent)}%</span>
      </div>

      <div className="relative h-7">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full border border-blue-300/35 bg-transparent" />
        <div
          className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full"
          style={{
            width: `${metrics.percent}%`,
            transition: 'width 400ms linear',
            background: 'linear-gradient(90deg, var(--color-blue-400, #60a5fa), var(--color-blue-500, #3b82f6))',
          }}
        />

        {phases.map((phase, idx) => {
          const offset = phases.length === 1 ? 0 : (idx / (phases.length - 1)) * 100;
          const isActive = idx === metrics.activePhaseIndex;
          const isPassed = idx < metrics.activePhaseIndex || metrics.percent >= offset;
          const isOddNode = idx % 2 === 0;
          const inactiveColor = isOddNode
            ? (isPassed ? 'var(--color-emerald-400, #34d399)' : 'rgba(52,211,153,0.35)')
            : (isPassed ? 'var(--color-orange-400, #fb923c)' : 'rgba(251,146,60,0.35)');
          return (
            <div
              key={`${phase.phase_type}-${idx}`}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${offset}%` }}
            >
              <span
                className={`h-3.5 w-3.5 rounded-full border transition-all ${
                  isActive
                    ? 'border-blue-200 shadow-[0_0_0_4px_rgba(59,130,246,0.25)]'
                    : (isOddNode ? 'border-emerald-300/60' : 'border-orange-300/60')
                }`}
                style={{
                  background: isActive ? 'var(--color-blue-400, #60a5fa)' : inactiveColor,
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
