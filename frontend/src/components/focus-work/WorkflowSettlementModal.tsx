import React from 'react';

import AppModalFrame from '../AppModalFrame';
import type { WorkflowSettlement, WorkflowSettlementNode } from './focusWorkTypes';

type WorkflowSettlementModalProps = {
  open: boolean;
  settlement: WorkflowSettlement;
  busy?: boolean;
  onConfirm?: () => void;
  onClose?: () => void;
};

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins <= 0) return '';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remain = mins % 60;
  if (remain === 0) return `${hours}h`;
  return `${hours}h${remain}m`;
}

function statusLabel(status: WorkflowSettlementNode['status']): string {
  switch (status) {
    case 'passed':
      return '达标';
    case 'failed':
      return '未达标';
    case 'completed':
      return '完成';
    default:
      return '';
  }
}

function statusColor(status: WorkflowSettlementNode['status']): string {
  switch (status) {
    case 'passed':
      return 'text-green-400';
    case 'failed':
      return 'text-amber-400';
    default:
      return 'text-[var(--focus-work-text-faint)]';
  }
}

function ProcessTree({ nodes, depth = 0 }: { nodes: WorkflowSettlementNode[]; depth?: number }) {
  if (!nodes || nodes.length === 0) return null;

  return (
    <>
      {nodes.map((node, i) => {
        const isLast = i === nodes.length - 1;
        const connector = depth === 0 ? null : isLast ? '└─▶' : '├─▶';
        const indentPx = depth * 20;
        const isReturn = node.is_return_node;

        return (
          <React.Fragment key={i}>
            <div
              className="flex items-center gap-1 py-0.5"
              style={{ paddingLeft: indentPx }}
            >
              {connector != null && (
                <span className="shrink-0 text-[10px] leading-none text-[var(--focus-work-text-faint)]">
                  {connector}
                </span>
              )}
              <span className="shrink-0 text-[10px] leading-none text-[var(--focus-work-text-faint)]">
                ●
              </span>
              <span
                className={`flex-1 text-sm truncate ${
                  isReturn
                    ? 'text-[var(--focus-work-text-faint)] italic'
                    : 'text-[var(--focus-work-text)]'
                }`}
              >
                {node.name}
              </span>
              {node.accuracy != null && !isReturn && (
                <span className="shrink-0 text-sm font-semibold text-[var(--focus-work-text)] tabular-nums">
                  {node.accuracy}%
                </span>
              )}
              {!isReturn && (
                <span
                  className={`shrink-0 text-xs ml-0.5 ${statusColor(node.status)}`}
                >
                  {statusLabel(node.status)}
                </span>
              )}
              {node.duration_seconds > 0 && (
                <span className="shrink-0 text-xs text-[var(--focus-work-text-muted)] tabular-nums ml-0.5">
                  {formatDuration(node.duration_seconds)}
                </span>
              )}
            </div>
            <ProcessTree nodes={node.children} depth={depth + 1} />
          </React.Fragment>
        );
      })}
    </>
  );
}

export default function WorkflowSettlementModal({
  open,
  settlement,
  busy = false,
  onConfirm,
  onClose,
}: WorkflowSettlementModalProps) {
  if (!open) return null;

  const nodes = settlement.nodes ?? [];
  const showConfirm = onConfirm != null;

  return (
    <AppModalFrame
      open={open}
      onClose={onClose}
      zIndexClassName="z-[90]"
      backdropClassName="ark-focus-work-shell ark-focus-work-backdrop"
      ariaLabel="工作流结算"
      panelClassName="ark-focus-work-dialog w-[min(92vw,30rem)] rounded-[2rem] border p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
    >
      <div className="text-center">
        <div className="text-3xl mb-1">🎉</div>
        <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">
          工作流完成
        </div>
        <h2 className="mt-1 text-lg font-semibold text-[var(--focus-work-text)]">
          {settlement.workflow_name}
        </h2>
        <div className="mt-1 text-sm text-[var(--focus-work-text-muted)]">
          结果：{settlement.result}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-xs text-[var(--focus-work-text-faint)]">
          <span>总用时 {formatDuration(settlement.total_duration_seconds)}</span>
          <span className="opacity-40">·</span>
          <span>{settlement.total_phases} 段内容</span>
          <span className="opacity-40">·</span>
          <span>{settlement.fork_count} 次补练</span>
          <span className="opacity-40">·</span>
          <span>{settlement.retry_count} 次再尝试</span>
        </div>
      </div>

      {nodes.length > 0 && (
        <>
          <div className="mt-5 border-t border-[var(--focus-work-border)] pt-4">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)] mb-3">
              过程
            </div>
            <ProcessTree nodes={nodes} />
          </div>
        </>
      )}

      <div className="mt-5 border-t border-[var(--focus-work-border)] pt-4">
        <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)] mb-3">
          汇总
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--focus-work-text-muted)]">
          <span>总答题 {settlement.total_answered}</span>
          <span className="opacity-40">·</span>
          <span>总正确 {settlement.total_correct}</span>
          <span className="opacity-40">·</span>
          <span>最好一次 {settlement.best_accuracy != null ? `${settlement.best_accuracy}%` : '-'}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--focus-work-text-muted)]">
          <span>补练 {settlement.fork_count} 次</span>
          <span className="opacity-40">·</span>
          <span>再尝试 {settlement.retry_count} 次</span>
          <span className="opacity-40">·</span>
          <span>一次达标 {settlement.first_try_passed_count} 段</span>
        </div>
      </div>

      <div className="mt-5 flex justify-center">
        {showConfirm ? (
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-full bg-white px-8 py-3 text-sm font-medium text-slate-950 transition hover:bg-gray-200 disabled:opacity-60"
          >
            结束工作流
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-8 py-3 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)]"
          >
            关闭
          </button>
        )}
      </div>
    </AppModalFrame>
  );
}
