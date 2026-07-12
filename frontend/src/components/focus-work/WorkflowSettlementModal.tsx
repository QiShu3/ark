import type { ComponentType, ReactNode } from 'react';
import {
  Award,
  Check,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock3,
  Flag,
  GitBranch,
  Sparkles,
  Star,
  Target,
  Trophy,
} from 'lucide-react';

import AppModalFrame from '../AppModalFrame';
import type { WorkflowSettlement, WorkflowSettlementNode } from './focusWorkTypes';

type WorkflowSettlementModalProps = {
  open: boolean;
  settlement: WorkflowSettlement | null;
  title?: string;
  loading?: boolean;
  busy?: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  onConfirm?: () => void;
  onClose?: () => void;
  onboardingAnchor?: string;
  onboardingContentAnchor?: string;
};

type IconType = ComponentType<{ className?: string }>;

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '';
  if (seconds < 60) return '<1m';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remain = mins % 60;
  if (remain === 0) return `${hours}h`;
  return `${hours}h${remain}m`;
}

function formatDurationOrZero(seconds: number): string {
  return formatDuration(seconds) || '0m';
}

function formatDateTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '-';
  const percent = value >= 0 && value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}%`;
}

function displayNodeName(name: string): { marker: string | null; title: string } {
  const match = name.match(/^([A-Z])\s+(.+)$/);
  if (!match) return { marker: null, title: name };
  return { marker: match[1], title: match[2] };
}

function routeParts(workflowName: string, nodes: WorkflowSettlementNode[]): string[] {
  const cleaned = workflowName.replace(/^刻意学习流[:：]\s*/, '').trim();
  const explicitParts = cleaned.split(/\s*(?:→|->)\s*/).filter(Boolean);
  if (explicitParts.length > 1) return explicitParts;
  const nodeNames = nodes.map((node) => displayNodeName(node.name).title).filter(Boolean);
  return nodeNames.length > 1 ? nodeNames : [cleaned];
}

function statusLabel(status: WorkflowSettlementNode['status']): string {
  switch (status) {
    case 'passed':
      return '达标';
    case 'failed':
      return '未达标';
    case 'completed':
      return '完成';
    case 'return':
      return '返回';
    default:
      return '';
  }
}

function statusBadgeClass(status: WorkflowSettlementNode['status']): string {
  switch (status) {
    case 'passed':
    case 'completed':
      return 'border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)]';
    case 'failed':
      return 'border-[var(--focus-work-amber-border)] bg-[var(--focus-work-amber-bg)] text-[var(--focus-work-amber-text)]';
    case 'return':
      return 'border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] text-[var(--focus-work-blue-text)]';
    default:
      return 'border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] text-[var(--focus-work-text-muted)]';
  }
}

function statusDotClass(status: WorkflowSettlementNode['status'], isReturn: boolean): string {
  if (isReturn || status === 'return') {
    return 'border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] text-[var(--focus-work-blue-text)]';
  }
  if (status === 'failed') {
    return 'border-[var(--focus-work-amber-border)] bg-[var(--focus-work-amber-bg)] text-[var(--focus-work-amber-text)]';
  }
  return 'border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-text)] text-[var(--focus-work-primary-button-text)]';
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: IconType;
  label: string;
  value: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--focus-work-blue-border)] bg-[var(--focus-work-surface-raised)] p-4 shadow-[var(--focus-work-card-shadow)]">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[var(--focus-work-blue-text)] opacity-35" />
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--focus-work-text-muted)]">
        <Icon className="h-4 w-4 text-[var(--focus-work-blue-text)]" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="mt-4 text-3xl font-semibold tabular-nums text-[var(--focus-work-text)]">{value}</div>
      <div className="mt-2 text-xs text-[var(--focus-work-text-faint)]">{detail}</div>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
  onboardingAnchor,
}: {
  icon: IconType;
  title: string;
  children: ReactNode;
  onboardingAnchor?: string;
}) {
  return (
    <section
      data-onboarding-anchor={onboardingAnchor}
      className="rounded-xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-5 shadow-[var(--focus-work-card-shadow)]"
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--focus-work-text)]">
        <Icon className="h-4 w-4 text-[var(--focus-work-blue-text)]" aria-hidden="true" />
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: WorkflowSettlementNode['status'] }) {
  return (
    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

function PathNode({
  node,
  depth = 0,
  isLast = false,
}: {
  node: WorkflowSettlementNode;
  depth?: number;
  isLast?: boolean;
}) {
  const { marker, title } = displayNodeName(node.name);
  const duration = formatDuration(node.duration_seconds);
  const meta = [
    duration ? `用时 ${duration}` : null,
    node.answered_count > 0 ? `答题 ${node.answered_count}` : null,
    node.correct_count > 0 ? `正确 ${node.correct_count}` : null,
  ].filter(Boolean);
  const hasChildren = node.children.length > 0;
  const dot = depth === 0 ? (
    <Circle className="h-4 w-4" aria-hidden="true" />
  ) : (
    <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
  );

  return (
    <div className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
      <div className="relative flex justify-center">
        {!isLast ? (
          <span className="absolute top-7 bottom-[-1rem] w-px bg-[var(--focus-work-blue-text)] opacity-50" />
        ) : null}
        <span
          className={`relative z-10 mt-1 flex h-7 w-7 items-center justify-center rounded-full border ${statusDotClass(node.status, node.is_return_node)}`}
        >
          {dot}
        </span>
      </div>

      <div className="min-w-0 space-y-2 pb-3">
        <div className="rounded-lg border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-4 py-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                {marker ? (
                  <span className="font-mono text-xs font-semibold text-[var(--focus-work-blue-text)]">{marker}</span>
                ) : null}
                <div className="truncate text-sm font-semibold text-[var(--focus-work-text)]">{title}</div>
              </div>
              {meta.length ? (
                <div className="mt-1 text-xs tabular-nums text-[var(--focus-work-text-faint)]">{meta.join(' · ')}</div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {node.accuracy != null ? (
                <span className="text-sm font-semibold tabular-nums text-[var(--focus-work-text)]">
                  {formatPercent(node.accuracy)}
                </span>
              ) : null}
              <StatusBadge status={node.status} />
              <ChevronRight className="h-4 w-4 text-[var(--focus-work-text-faint)]" aria-hidden="true" />
            </div>
          </div>
        </div>

        {hasChildren ? (
          <div className="ml-2 space-y-2 border-l border-[var(--focus-work-border)] pl-4">
            {node.children.map((child, index) => (
              <PathNode
                key={`${child.name}-${child.status}-${index}`}
                node={child}
                depth={depth + 1}
                isLast={index === node.children.length - 1}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryLine({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">
      <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--focus-work-blue-text)]" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export default function WorkflowSettlementModal({
  open,
  settlement,
  title,
  loading = false,
  busy = false,
  startedAt,
  completedAt,
  onConfirm,
  onClose,
  onboardingAnchor,
  onboardingContentAnchor,
}: WorkflowSettlementModalProps) {
  if (!open) return null;

  const workflowName = settlement?.workflow_name ?? title ?? '工作流';
  const nodes = settlement?.nodes ?? [];
  const showConfirm = onConfirm != null;
  const totalDuration = settlement ? formatDurationOrZero(settlement.total_duration_seconds) : '0m';
  const bestAccuracy = settlement ? formatPercent(settlement.best_accuracy) : '-';
  const isLoading = loading && settlement == null;
  const isMissing = !loading && settlement == null;
  const route = routeParts(workflowName, nodes);
  const displayTime = formatDateTime(completedAt) || formatDateTime(startedAt);
  const completionText = isLoading ? '结算记录加载中' : isMissing ? '结算记录不可用' : '工作流完成';

  return (
    <AppModalFrame
      open={open}
      onClose={onClose}
      zIndexClassName="z-[90]"
      backdropClassName="ark-focus-work-shell ark-focus-work-backdrop"
      ariaLabel="工作流结算"
      panelClassName="ark-focus-work-dialog w-[min(94vw,52rem)] rounded-[2rem] border border-[var(--focus-work-border-strong)] p-0 shadow-2xl max-h-[82vh] overflow-y-auto"
    >
      <div className="relative overflow-hidden rounded-[2rem] bg-[var(--focus-work-surface)]">
        <div className="relative min-h-[19rem] overflow-hidden px-6 pb-16 pt-6 sm:px-8 sm:pt-8">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <img
              src="/images/workflow-settlement-clear.webp"
              alt=""
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-[center_44%]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--focus-work-surface)_0%,var(--focus-work-surface)_22%,transparent_68%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--focus-work-surface)_0%,transparent_46%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,var(--focus-work-blue-bg),transparent_32%),radial-gradient(circle_at_66%_12%,var(--focus-work-emerald-bg),transparent_24%)]" />
          </div>

          <div className="relative z-10 max-w-[29rem]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] px-3 py-1 text-xs font-semibold tracking-[0.22em] text-[var(--focus-work-blue-text)]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              LEVEL CLEAR
            </div>

            <div className="mt-4 flex items-center gap-4">
              <span className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.25rem] bg-[var(--focus-work-blue-text)] text-[var(--focus-work-primary-button-text)] shadow-[0_18px_44px_var(--focus-work-blue-shadow)]">
                <span className="absolute -inset-1 rounded-[1.5rem] border border-[var(--focus-work-blue-border)] opacity-70" />
                <Trophy className="h-8 w-8" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-3xl font-semibold leading-tight text-[var(--focus-work-blue-text)] sm:text-4xl">{completionText}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--focus-work-text-muted)]">
                  {isMissing ? '这条历史记录暂时没有可展示的结算内容。' : '本次工作流的关卡路线已通关。'}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {route.map((part, index) => (
                <span key={`${part}-${index}`} className="inline-flex items-center gap-2">
                  <span className="rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] px-3 py-1.5 text-sm font-semibold text-[var(--focus-work-text)] shadow-[var(--focus-work-card-shadow)]">
                    {part}
                  </span>
                  {index < route.length - 1 ? (
                    <span className="text-[var(--focus-work-blue-text)]">→</span>
                  ) : null}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--focus-work-emerald-text)]">
                <Award className="h-3.5 w-3.5" aria-hidden="true" />
                通关结算已生成
              </span>
              {displayTime ? (
                <span className="rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-3 py-1.5 text-xs tabular-nums text-[var(--focus-work-text-muted)]">
                  {displayTime}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative -mt-12 space-y-3 px-5 pb-4 sm:px-6">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-28 rounded-lg bg-[var(--focus-work-surface-soft)]" />
              ))}
            </div>
          ) : settlement ? (
            <div className="grid gap-3 sm:grid-cols-4">
              <MetricCard icon={Clock3} label="总专注时间" value={totalDuration} detail="本次工作流" />
              <MetricCard
                icon={ClipboardCheck}
                label="完成任务"
                value={settlement.total_phases}
                detail="全部完成"
              />
              <MetricCard icon={GitBranch} label="扩展学习" value={settlement.fork_count} detail="触发次数" />
              <MetricCard icon={Target} label="最佳正确率" value={bestAccuracy} detail={`一次达标 ${settlement.first_try_passed_count} 段`} />
            </div>
          ) : null}

          {isLoading ? (
            <SectionCard icon={Star} title="学习路径">
              <div className="space-y-3">
                <div className="h-5 w-[38%] rounded-full bg-[var(--focus-work-surface-soft)]" />
                <div className="h-12 rounded-lg bg-[var(--focus-work-surface-soft)]" />
                <div className="h-12 rounded-lg bg-[var(--focus-work-surface-soft)]" />
              </div>
            </SectionCard>
          ) : nodes.length > 0 ? (
            <SectionCard icon={Star} title="学习路径" onboardingAnchor={onboardingContentAnchor}>
              <div className="space-y-1">
                {nodes.map((node, index) => (
                  <PathNode key={`${node.name}-${node.status}-${index}`} node={node} isLast={index === nodes.length - 1} />
                ))}
              </div>
            </SectionCard>
          ) : isMissing ? (
            <SectionCard icon={Star} title="学习路径">
              <p className="text-sm leading-6 text-[var(--focus-work-text-muted)]">记录已打开，但没有可显示的结算内容。</p>
            </SectionCard>
          ) : null}

          <SectionCard icon={Star} title="本次总结">
            {settlement ? (
              <ul className="space-y-2">
                <SummaryLine>成功完成 {settlement.total_phases} 个专注工作，继续保持！</SummaryLine>
                <SummaryLine>
                  {settlement.fork_count > 0
                    ? `本次触发 ${settlement.fork_count} 次扩展学习，补足更多知识点。`
                    : '本次主线推进很顺，没有额外扩展学习。'}
                </SummaryLine>
                <SummaryLine>
                  {settlement.best_accuracy != null && settlement.best_accuracy < 80
                    ? '建议复盘低正确率节点，提升稳定性。'
                    : '最佳正确率表现稳定，可以继续沿用当前节奏。'}
                </SummaryLine>
              </ul>
            ) : (
              <p className="text-sm leading-6 text-[var(--focus-work-text-muted)]">
                {isLoading ? '正在生成本次总结。' : '暂无可展示总结。'}
              </p>
            )}
          </SectionCard>

          <div className="flex justify-center pt-2">
            {showConfirm && !isLoading && !isMissing ? (
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                data-onboarding-anchor={onboardingAnchor}
                className="inline-flex min-w-[14rem] items-center justify-center gap-2 rounded-full bg-[var(--focus-work-blue-text)] px-8 py-3 text-sm font-semibold text-[var(--focus-work-primary-button-text)] shadow-[0_14px_34px_var(--focus-work-blue-shadow)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Flag className="h-4 w-4" aria-hidden="true" />
                结束工作流
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-w-[10rem] items-center justify-center gap-2 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-8 py-3 text-sm font-medium text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border-strong)] hover:bg-[var(--focus-work-surface-soft)]"
              >
                关闭
              </button>
            )}
          </div>
        </div>
      </div>
    </AppModalFrame>
  );
}
