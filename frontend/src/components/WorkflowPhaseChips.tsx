import { normalizeFocusWorkType } from './focus-work/focusWorkTypes';

type WorkflowPhaseChipsProps = {
  phases: WorkflowPhaseChipPhase[];
  className?: string;
  getTaskTitle?: (taskId: string) => string | null | undefined;
  emptyText?: string;
  maxTaskWidthClassName?: string;
};

type WorkflowPhaseChipPhase = {
  phase_type: 'focus' | 'break';
  duration: number;
  task_id?: string | null;
  focus_work_type?: string | null;
};

const FOCUS_WORK_LABELS: Record<string, string> = {
  flash_card: '今日单词',
  choice: '选择练习',
  input: '输入练习',
  task_focus: '任务专注',
};

function getPhaseTaskLabel(phase: WorkflowPhaseChipPhase, getTaskTitle?: WorkflowPhaseChipsProps['getTaskTitle']): string | null {
  if (phase.task_id && getTaskTitle) {
    return getTaskTitle(phase.task_id) ?? null;
  }
  if (phase.focus_work_type) {
    const canonical = normalizeFocusWorkType(phase.focus_work_type) ?? phase.focus_work_type;
    return FOCUS_WORK_LABELS[canonical] ?? '应用任务';
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
