import AppModalFrame from '../AppModalFrame';
import type { WorkflowSettlement } from './focusWorkTypes';

type WorkflowSettlementModalProps = {
  open: boolean;
  settlement: WorkflowSettlement;
  busy: boolean;
  onConfirm: () => void;
};

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}分`;
  const hours = Math.floor(mins / 60);
  const remain = mins % 60;
  if (remain === 0) return `${hours}小时`;
  return `${hours}小时${remain}分`;
}

function phaseTypeLabel(focusWorkType: string): string {
  const labels: Record<string, string> = {
    vocab_today: '今日单词',
    practice: '真题练习',
    review: '错题复习',
    input: '输入练习',
    task_focus: '任务专注',
  };
  return labels[focusWorkType] ?? focusWorkType;
}

export default function WorkflowSettlementModal({ open, settlement, busy, onConfirm }: WorkflowSettlementModalProps) {
  if (!open) return null;

  return (
    <AppModalFrame
      open={open}
      zIndexClassName="z-[90]"
      backdropClassName="ark-focus-work-shell ark-focus-work-backdrop"
      ariaLabel="工作流结算"
      panelClassName="ark-focus-work-dialog w-[min(92vw,32rem)] rounded-[2rem] border p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
    >
      <div className="text-center">
        <div className="text-3xl mb-2">🎉</div>
        <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Workflow Complete</div>
        <h2 className="mt-2 text-xl font-semibold text-[var(--focus-work-text)]">
          {settlement.workflow_name}
        </h2>
      </div>

      <div className="mt-6 space-y-4">
        {settlement.phases.map((phase, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--focus-work-text)]">
                  阶段 {idx + 1}：{phase.name}
                </div>
                <div className="mt-1 text-xs text-[var(--focus-work-text-muted)]">
                  类型：{phaseTypeLabel(phase.focus_work_type)}
                  {phase.focus_work_type !== 'vocab_today' && (
                    <span> · 答题 {phase.answered_count} / 正确 {phase.correct_count}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                {phase.accuracy != null && (
                  <div className="text-sm font-semibold text-[var(--focus-work-text)]">
                    {phase.accuracy}%
                  </div>
                )}
                <div className="text-xs text-[var(--focus-work-text-muted)]">
                  {formatDuration(phase.duration_seconds)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-[var(--focus-work-border)] pt-4">
        <div className="grid grid-cols-2 gap-2 text-center text-sm">
          <div>
            <div className="text-[var(--focus-work-text-faint)] text-xs">总阶段</div>
            <div className="text-[var(--focus-work-text)] font-semibold">{settlement.total_phases}</div>
          </div>
          <div>
            <div className="text-[var(--focus-work-text-faint)] text-xs">总用时</div>
            <div className="text-[var(--focus-work-text)] font-semibold">{formatDuration(settlement.total_duration_seconds)}</div>
          </div>
          {settlement.total_answered > 0 && (
            <>
              <div>
                <div className="text-[var(--focus-work-text-faint)] text-xs">总答题 / 总正确</div>
                <div className="text-[var(--focus-work-text)] font-semibold">
                  {settlement.total_answered} / {settlement.total_correct}
                </div>
              </div>
              <div>
                <div className="text-[var(--focus-work-text-faint)] text-xs">总正确率</div>
                <div className="text-[var(--focus-work-text)] font-semibold">
                  {settlement.total_accuracy != null ? `${settlement.total_accuracy}%` : '-'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-6">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="w-full rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-gray-200 disabled:opacity-60"
        >
          结束工作流
        </button>
      </div>
    </AppModalFrame>
  );
}
