import React from 'react';

import type { WorkflowSnapshot } from './workflowProgress';
import { computeWorkflowProgress, phaseLabel } from './workflowProgress';

type WorkflowProgressBarProps = {
  workflow: WorkflowSnapshot;
  className?: string;
};

const WorkflowProgressBar: React.FC<WorkflowProgressBarProps> = ({ workflow, className }) => {
  const phases = React.useMemo(() => (Array.isArray(workflow.phases) ? workflow.phases : []), [workflow.phases]);
  const metrics = computeWorkflowProgress(workflow);
  const showProgress = workflow.state !== 'normal' && phases.length > 0 && metrics.totalSeconds > 0;

  // 格式化倒计时 MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentPhase = phases[metrics.activePhaseIndex];
  const phaseType = currentPhase?.phase_type ?? 'focus';
  const isFocus = phaseType === 'focus';
  const activeColorText = isFocus ? 'text-blue-400' : 'text-orange-400';
  const activeColorBg = isFocus ? 'bg-blue-400' : 'bg-orange-400';
  const activeColorGradient = isFocus 
    ? 'linear-gradient(90deg, #60a5fa, #3b82f6)' 
    : 'linear-gradient(90deg, #fb923c, #f97316)';

  const boundaryOffsets = React.useMemo(() => {
    const safeDurations = phases.map((phase) => Math.max(0, Math.round(phase.duration || 0)));
    const total = safeDurations.reduce((sum, value) => sum + value, 0);
    const offsets: number[] = [];
    let acc = 0;
    offsets.push(0);
    for (let i = 0; i < safeDurations.length; i++) {
      acc += safeDurations[i];
      offsets.push(total > 0 ? (acc / total) * 100 : 0);
    }
    if (offsets.length > 0) {
      offsets[offsets.length - 1] = 100;
    }
    return offsets;
  }, [phases]);

  const activeNodeIndex = workflow.pending_confirmation
    ? Math.min(metrics.activePhaseIndex + 1, boundaryOffsets.length - 1)
    : Math.min(metrics.activePhaseIndex, boundaryOffsets.length - 1);

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
            {formatTime(workflow.remaining_seconds ?? 0)}
          </span>
        </div>
        <span className="text-xs font-bold text-white/40 tracking-wider">
          {Math.round(metrics.percent)}%
        </span>
      </div>

      {/* 节点步进器 (Node Stepper) */}
      <div className="relative h-8 w-full px-2">
        {/* 背景底线 */}
        <div className="absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
        
        {/* 进度填充线 */}
        <div
          className="absolute left-2 top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{
            width: `calc(${metrics.percent}% - ${metrics.percent === 100 ? 16 : 16 * (metrics.percent / 100)}px)`,
            transition: 'width 1s linear',
            background: activeColorGradient,
            boxShadow: `0 0 10px ${isFocus ? 'rgba(59,130,246,0.4)' : 'rgba(251,146,60,0.4)'}`
          }}
        />

        {/* 节点渲染 */}
        {boundaryOffsets.map((offset, idx) => {
          const isActive = idx === activeNodeIndex;
          const isPassed = idx < activeNodeIndex || metrics.percent >= offset - 0.01;
          const phaseForNode = phases[Math.min(idx, Math.max(0, phases.length - 1))];
          const nodePhaseType = phaseForNode?.phase_type ?? 'focus';
          const nodeIsFocus = nodePhaseType === 'focus';
          const nodeColorBg = nodeIsFocus ? 'bg-blue-400' : 'bg-orange-400';
          const nodeColorSolid = nodeIsFocus ? 'border-blue-500 bg-blue-500' : 'border-orange-500 bg-orange-500';

          return (
            <div
              key={`boundary-${idx}`}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center transition-all duration-500"
              style={{ 
                left: `calc(8px + ${offset}% * calc(1 - 16px / 100%))`,
                zIndex: isActive ? 10 : 1 
              }}
            >
              {isActive ? (
                <div 
                  className="w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-transform duration-300 scale-110"
                  style={{
                    background: nodeColorBg,
                    boxShadow: `0 0 15px ${nodeIsFocus ? 'rgba(59,130,246,0.6)' : 'rgba(251,146,60,0.6)'}`
                  }}
                >
                  <span className="text-[10px]">
                    {nodeIsFocus ? '🧠' : '☕'}
                  </span>
                </div>
              ) : isPassed ? (
                <div className={`w-3 h-3 rounded-full border-2 transition-colors duration-300 ${nodeColorSolid}`} />
              ) : (
                <div className="w-3 h-3 rounded-full border-2 border-white/20 bg-[#1a1a1a]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkflowProgressBar;
