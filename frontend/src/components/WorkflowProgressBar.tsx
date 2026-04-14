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
        {phases.map((phase, idx) => {
          const offset = phases.length === 1 ? 0 : (idx / (phases.length - 1)) * 100;
          const isActive = idx === metrics.activePhaseIndex;
          
          // isPassed 定义：
          // 1. 如果是之前的节点 (idx < activePhaseIndex)，必定 passed。
          // 2. 如果进度 percent 大于当前节点的位置（并且加上一个微小容差），视为 passed
          const isPassed = idx < metrics.activePhaseIndex || metrics.percent >= offset - 0.01;
          
          const isOddNode = idx % 2 === 0; // 0, 2, 4 are focus
          
          return (
            <div
              key={`${phase.phase_type}-${idx}`}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center transition-all duration-500"
              style={{ 
                left: `calc(8px + ${offset}% * calc(1 - 16px / 100%))`,
                zIndex: isActive ? 10 : 1 
              }}
            >
              {isActive && !workflow.pending_confirmation ? (
                // 活跃节点 (大尺寸 + 图标 + 光晕)
                <div 
                  className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-transform duration-300 scale-110`}
                  style={{
                    background: activeColorBg,
                    boxShadow: `0 0 15px ${isFocus ? 'rgba(59,130,246,0.6)' : 'rgba(251,146,60,0.6)'}`
                  }}
                >
                  <span className="text-[10px]">
                    {isFocus ? '🧠' : '☕'}
                  </span>
                </div>
              ) : isPassed ? (
                // 已完成节点 (或者处于 pending_confirmation 状态的当前节点)
                <div 
                  className={`w-3 h-3 rounded-full border-2 transition-colors duration-300 ${isOddNode ? 'border-blue-500 bg-blue-500' : 'border-orange-500 bg-orange-500'} ${isActive && workflow.pending_confirmation ? 'shadow-[0_0_12px_currentColor] animate-pulse scale-125' : ''}`}
                />
              ) : (
                // 未到达节点 (小尺寸 + 空心)
                <div 
                  className="w-3 h-3 rounded-full border-2 border-white/20 bg-[#1a1a1a]"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkflowProgressBar;
