import type { WorkflowPresetPhase } from './workflowPresetForm';

type WorkflowPhaseChipsProps = {
  phases: WorkflowPresetPhase[];
  className?: string;
  getTaskTitle?: (taskId: string) => string | null | undefined;
  emptyText?: string;
  maxTaskWidthClassName?: string;
};

const FOCUS_WORK_LABELS: Record<string, string> = {
  vocab_today: '今日单词',
  erc_practice: 'ERC 真题练习',
  erc_review: 'ERC 复习',
  task_focus: '任务专注',
};

function getPhaseTaskLabel(phase: WorkflowPresetPhase, getTaskTitle?: WorkflowPhaseChipsProps['getTaskTitle']): string | null {
  if (phase.task_id && getTaskTitle) {
    return getTaskTitle(phase.task_id) ?? null;
  }
  if (phase.focus_work_type) {
    return FOCUS_WORK_LABELS[phase.focus_work_type] ?? '应用任务';
  }
  return null;
}

export default function WorkflowPhaseChips({
  phases,
  className = '',
  getTaskTitle,
  emptyText = '暂无阶段',
  maxTaskWidthClassName = 'max-w-[90px]',
}: WorkflowPhaseChipsProps) {
  if (!phases.length) {
    return <div className={`text-xs text-ark-text-faint ${className}`.trim()}>{emptyText}</div>;
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      {phases.map((phase, index) => {
        const minutes = Math.round(phase.duration / 60);
        const isFocus = phase.phase_type === 'focus';
        const taskLabel = isFocus ? getPhaseTaskLabel(phase, getTaskTitle) : null;

        return (
          <span key={`${phase.phase_type}-${index}-${phase.duration}-${phase.task_id ?? phase.focus_work_type ?? ''}`} className="inline-flex items-center gap-1.5">
            {index > 0 ? <span className="text-[10px] text-ark-text-faint">→</span> : null}
            <span
              className={
                isFocus
                  ? 'ark-workflow-phase-chip ark-workflow-phase-chip-focus'
                  : 'ark-workflow-phase-chip ark-workflow-phase-chip-break'
              }
            >
              <span>{isFocus ? '🎯' : '☕'} {minutes}m</span>
              {taskLabel ? (
                <>
                  <span className="ark-workflow-phase-separator">|</span>
                  <span className={`ark-workflow-phase-task truncate ${maxTaskWidthClassName}`} title={taskLabel}>
                    {taskLabel}
                  </span>
                </>
              ) : null}
            </span>
          </span>
        );
      })}
    </div>
  );
}
