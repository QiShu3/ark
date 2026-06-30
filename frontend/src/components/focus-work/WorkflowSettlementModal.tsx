import React from 'react';
import { CheckCircle2 } from 'lucide-react';

import AppModalFrame from '../AppModalFrame';
import type { WorkflowSettlement, WorkflowSettlementNode } from './focusWorkTypes';

type WorkflowSettlementModalProps = {
  open: boolean;
  settlement: WorkflowSettlement | null;
  title?: string;
  loading?: boolean;
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

function statusBadgeClass(status: WorkflowSettlementNode['status']): string {
  switch (status) {
    case 'passed':
      return 'border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)]';
    case 'failed':
      return 'border-[var(--focus-work-amber-border)] bg-[var(--focus-work-amber-bg)] text-[var(--focus-work-amber-text)]';
    case 'completed':
      return 'border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] text-[var(--focus-work-blue-text)]';
    default:
      return 'border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] text-[var(--focus-work-text-muted)]';
  }
}

function statusDotClass(status: WorkflowSettlementNode['status'], isReturn: boolean): string {
  if (isReturn) return 'border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)]';
  switch (status) {
    case 'passed':
      return 'border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-text)]';
    case 'failed':
      return 'border-[var(--focus-work-amber-border)] bg-[var(--focus-work-amber-text)]';
    case 'completed':
      return 'border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-text)]';
    default:
      return 'border-[var(--focus-work-border)] bg-[var(--focus-work-text-faint)]';
  }
}

function ProcessTree({ nodes, depth = 0 }: { nodes: WorkflowSettlementNode[]; depth?: number }) {
  if (!nodes || nodes.length === 0) return null;

  return (
    <div className={depth === 0 ? 'space-y-1' : 'mt-1 space-y-1'}>
      {nodes.map((node, i) => {
        const isLast = i === nodes.length - 1;
        const isReturn = node.is_return_node;
        const hasChildren = node.children.length > 0;
        const nodeKey = `${depth}-${i}-${node.name}-${node.status}`;

        return (
          <div key={nodeKey} className="relative">
            <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-3">
              <div className="relative flex justify-center pt-[0.6rem]">
                {!isLast && (
                  <span className="absolute top-5 bottom-[-0.55rem] w-px bg-[var(--focus-work-border)]" />
                )}
                <span
                  className={`relative z-10 h-2.5 w-2.5 rounded-full border ${statusDotClass(node.status, isReturn)}`}
                />
              </div>

              <div className="min-w-0 py-1">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div
                    className={`min-w-0 flex-1 text-sm leading-6 ${
                      isReturn
                        ? 'text-[var(--focus-work-text-muted)]'
                        : 'font-semibold text-[var(--focus-work-text)]'
                    }`}
                  >
                    {node.name}
                  </div>

                  {!isReturn && (
                    <div className="flex shrink-0 items-center justify-end gap-2">
                      {node.accuracy != null && (
                        <span className="text-sm font-semibold tabular-nums text-[var(--focus-work-text)]">
                          {node.accuracy}%
                        </span>
                      )}
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(node.status)}`}>
                        {statusLabel(node.status)}
                      </span>
                    </div>
                  )}
                </div>

                {node.duration_seconds > 0 && (
                  <div className="text-xs tabular-nums text-[var(--focus-work-text-faint)]">
                    用时 {formatDuration(node.duration_seconds)}
                  </div>
                )}

                {hasChildren && (
                  <div className="mt-1 pl-4">
                    <ProcessTree nodes={node.children} depth={depth + 1} />
                  </div>
                )}
              </div>
            </div>

          </div>
        );
      })}
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[var(--focus-work-text-faint)]">{label}</span>
      <span className="font-semibold text-[var(--focus-work-text)]">{value}</span>
    </span>
  );
}

export default function WorkflowSettlementModal({
  open,
  settlement,
  title,
  loading = false,
  busy = false,
  onConfirm,
  onClose,
}: WorkflowSettlementModalProps) {
  if (!open) return null;

  const workflowName = settlement?.workflow_name ?? title ?? '工作流';
  const nodes = settlement?.nodes ?? [];
  const showConfirm = onConfirm != null;
  const totalDuration = settlement ? formatDuration(settlement.total_duration_seconds) || '0m' : '0m';
  const isLoading = loading && settlement == null;
  const isMissing = !loading && settlement == null;

  return (
    <AppModalFrame
      open={open}
      onClose={onClose}
      zIndexClassName="z-[90]"
      backdropClassName="ark-focus-work-shell ark-focus-work-backdrop"
      ariaLabel="工作流结算"
      panelClassName="ark-focus-work-dialog w-[min(92vw,35rem)] rounded-[2rem] border border-[var(--focus-work-border-strong)] p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
    >
      <div className="text-center">
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
          isLoading
            ? 'border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] text-[var(--focus-work-blue-text)]'
            : 'border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)]'
        }`}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isLoading ? '结算记录加载中' : isMissing ? '结算记录不可用' : '工作流完成'}
        </div>
        <h2 className="mx-auto mt-3 max-w-[30rem] text-xl font-semibold leading-7 text-[var(--focus-work-text)]">
          {workflowName}
        </h2>
        <div className="mt-1 text-sm text-[var(--focus-work-text-muted)]">
          结果：{isLoading ? '加载中' : isMissing ? '暂无可展示记录' : settlement?.result}
        </div>
        {settlement && !isLoading ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
            <HeaderMetric label="总用时" value={totalDuration} />
            <span className="text-[var(--focus-work-text-faint)]">·</span>
            <HeaderMetric label="主任务" value={`${settlement.total_phases} 个`} />
            <span className="text-[var(--focus-work-text-faint)]">·</span>
            <HeaderMetric label="可扩展学习" value={`${settlement.fork_count} 次`} />
            <span className="text-[var(--focus-work-text-faint)]">·</span>
            <HeaderMetric label="再尝试" value={`${settlement.retry_count} 次`} />
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-[var(--focus-work-text-faint)]">
            <span className="h-4 w-20 rounded-full bg-[var(--focus-work-surface-soft)]" />
            <span className="text-[var(--focus-work-text-faint)]">·</span>
            <span className="h-4 w-16 rounded-full bg-[var(--focus-work-surface-soft)]" />
            <span className="text-[var(--focus-work-text-faint)]">·</span>
            <span className="h-4 w-20 rounded-full bg-[var(--focus-work-surface-soft)]" />
            <span className="text-[var(--focus-work-text-faint)]">·</span>
            <span className="h-4 w-16 rounded-full bg-[var(--focus-work-surface-soft)]" />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="mt-5 border-t border-[var(--focus-work-border)] pt-4">
          <div className="mb-2 text-xs tracking-[0.18em] text-[var(--focus-work-text-faint)]">
            加载中
          </div>
          <div className="space-y-3">
            <div className="h-5 w-[42%] rounded-full bg-[var(--focus-work-surface-soft)] animate-pulse" />
            <div className="h-5 w-[66%] rounded-full bg-[var(--focus-work-surface-soft)] animate-pulse" />
            <div className="h-5 w-[54%] rounded-full bg-[var(--focus-work-surface-soft)] animate-pulse" />
          </div>
        </div>
      ) : nodes.length > 0 ? (
        <div className="mt-5 border-t border-[var(--focus-work-border)] pt-4">
          <div className="mb-2 text-xs tracking-[0.18em] text-[var(--focus-work-text-faint)]">
            学习路径
          </div>
          <ProcessTree nodes={nodes} />
        </div>
      ) : isMissing ? (
        <div className="mt-5 border-t border-[var(--focus-work-border)] pt-4">
          <div className="text-sm text-[var(--focus-work-text-muted)]">
            记录已打开，但没有可显示的结算内容。
          </div>
        </div>
      ) : null}

      <div className="mt-5 border-t border-[var(--focus-work-border)] pt-4">
        <div className="mb-2 text-xs tracking-[0.18em] text-[var(--focus-work-text-faint)]">
          汇总
        </div>
        {isLoading ? (
          <div className="h-6 w-[72%] rounded-full bg-[var(--focus-work-surface-soft)]" />
        ) : settlement ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-6 text-[var(--focus-work-text-muted)]">
            <span>总答题 <strong className="font-semibold text-[var(--focus-work-text)]">{settlement.total_answered}</strong></span>
            <span className="text-[var(--focus-work-text-faint)]">·</span>
            <span>总正确 <strong className="font-semibold text-[var(--focus-work-text)]">{settlement.total_correct}</strong></span>
            <span className="text-[var(--focus-work-text-faint)]">·</span>
            <span>最好一次 <strong className="font-semibold text-[var(--focus-work-text)]">{settlement.best_accuracy != null ? `${settlement.best_accuracy}%` : '-'}</strong></span>
            <span className="text-[var(--focus-work-text-faint)]">·</span>
            <span>可扩展学习 <strong className="font-semibold text-[var(--focus-work-text)]">{settlement.fork_count} 次</strong></span>
            <span className="text-[var(--focus-work-text-faint)]">·</span>
            <span>再尝试 <strong className="font-semibold text-[var(--focus-work-text)]">{settlement.retry_count} 次</strong></span>
            <span className="text-[var(--focus-work-text-faint)]">·</span>
            <span>一次达标 <strong className="font-semibold text-[var(--focus-work-text)]">{settlement.first_try_passed_count} 段</strong></span>
          </div>
        ) : (
          <div className="text-sm text-[var(--focus-work-text-faint)]">暂无汇总</div>
        )}
      </div>

      <div className="mt-5 flex justify-center">
        {showConfirm && !isLoading && !isMissing ? (
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-gray-200 disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            结束工作流
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-8 py-3 text-sm font-medium text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border-strong)] hover:bg-[var(--focus-work-surface-soft)]"
          >
            {isLoading ? '加载中' : isMissing ? '关闭' : '关闭'}
          </button>
        )}
      </div>
    </AppModalFrame>
  );
}
