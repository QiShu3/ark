import type React from 'react';
import { useState, type ReactNode } from 'react';

import type { FocusPhaseRuntimeState, FocusWorkRendererProps } from './focusWorkTypes';
import type { FocusWorkDefinition } from './focusWorkTypes';

const primaryButtonClass =
  'rounded-full bg-white px-6 py-3 text-sm font-medium text-slate-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass =
  'rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-6 py-3 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50';

type ActionPanelProps = {
  label: string;
  heading: string;
  description: string;
  primaryLabel: string;
  primaryDisabled: boolean;
  onPrimary: () => void;
  secondaryLabel?: string;
  secondaryDisabled?: boolean;
  onSecondary?: () => void;
  children?: ReactNode;
};

function ActionPanel({
  label,
  heading,
  description,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  secondaryLabel,
  secondaryDisabled,
  onSecondary,
  children,
}: ActionPanelProps) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center p-8 text-center">
      <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">{label}</div>
      <h3 className="mt-4 text-xl font-semibold text-[var(--focus-work-text)]">{heading}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">{description}</p>
      {children && (
        <div className="mt-4 text-left">
          {children}
        </div>
      )}
      <div className="mt-8 flex w-full flex-col justify-center gap-4 sm:flex-row">
        <button type="button" disabled={primaryDisabled} onClick={onPrimary} className={primaryButtonClass}>
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button type="button" disabled={secondaryDisabled} onClick={onSecondary} className={secondaryButtonClass}>
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RunSummaryCard({ summary, focusWorkType, masteryCheckFromProgress }: { summary: Record<string, unknown>; focusWorkType?: string; masteryCheckFromProgress?: Record<string, unknown> | null }) {
  if (!summary || Object.keys(summary).length === 0) return null;

  const masteryCheck = masteryCheckFromProgress ?? summary.mastery_check as Record<string, unknown> | undefined;
  const hasMasteryCheck = masteryCheck && masteryCheck.enabled === true;

  return (
    <div className="rounded-lg border border-ark-border bg-ark-surface p-4 text-sm">
      <div className="mb-3 text-xs font-medium text-ark-text-muted">本轮专注数据</div>

      {hasMasteryCheck && (
        <div className={`mb-3 rounded-md p-3 ${masteryCheck.passed === true ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ark-text-muted">检验结果</span>
            <span className={`text-sm font-semibold ${masteryCheck.passed === true ? 'text-green-500' : 'text-red-400'}`}>
              {masteryCheck.passed === true ? '通过' : '未通过'}
            </span>
          </div>
          <div className="mt-1 text-xs text-ark-text-muted">
            正确率 {Math.round((masteryCheck.accuracy as number) * 100)}% / {Math.round((masteryCheck.threshold as number) * 100)}%
          </div>
        </div>
      )}

      {focusWorkType === 'vocab_today' && (
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">{String((summary.reviewed_count as number) ?? 0)}</div>
            <div className="text-xs text-ark-text-muted">已复习</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-500">{String((summary.memorized_count as number) ?? 0)}</div>
            <div className="text-xs text-ark-text-muted">已掌握</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-yellow-500">{String((summary.new_count as number) ?? 0)}</div>
            <div className="text-xs text-ark-text-muted">新学</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">
              {summary.correct_rate ? `${Math.round((summary.correct_rate as number) * 100)}%` : '0%'}
            </div>
            <div className="text-xs text-ark-text-muted">正确率</div>
          </div>
        </div>
      )}

      {(focusWorkType === 'practice' || focusWorkType === 'review') && (
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">{String((summary.answered_count as number) ?? 0)}</div>
            <div className="text-xs text-ark-text-muted">已答题</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-500">{String((summary.correct_count as number) ?? 0)}</div>
            <div className="text-xs text-ark-text-muted">正确</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">
              {summary.accuracy ? `${Math.round((summary.accuracy as number) * 100)}%` : '0%'}
            </div>
            <div className="text-xs text-ark-text-muted">正确率</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">
              {summary.duration_seconds ? `${Math.round((summary.duration_seconds as number) / 60)}m` : '0m'}
            </div>
            <div className="text-xs text-ark-text-muted">用时</div>
          </div>
        </div>
      )}

      {focusWorkType === 'input' && (
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">{String((summary.answered_count as number) ?? 0)}</div>
            <div className="text-xs text-ark-text-muted">已答题</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-500">{String((summary.correct_count as number) ?? 0)}</div>
            <div className="text-xs text-ark-text-muted">正确</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">
              {summary.accuracy ? `${Math.round((summary.accuracy as number) * 100)}%` : '0%'}
            </div>
            <div className="text-xs text-ark-text-muted">正确率</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">
              {summary.duration_seconds ? `${Math.round((summary.duration_seconds as number) / 60)}m` : '0m'}
            </div>
            <div className="text-xs text-ark-text-muted">用时</div>
          </div>
        </div>
      )}
    </div>
  );
}

function runHasNoAvailableContent(run: FocusWorkRendererProps['run'] | null) {
  return run?.progress_snapshot?.no_available_content === true;
}

type FocusWorkbenchPanelProps = {
  phaseRuntimeState: FocusPhaseRuntimeState | null;
  activeRun: FocusWorkRendererProps['run'] | null;
  activeDefinition: FocusWorkDefinition | null;
  busy: boolean;
  isPaused: boolean;
  onCompleteTaskAndEndPhase: () => void;
  onEndPhase: () => void;
  onExtendPhase: () => void;
  onCreateExtraRun: () => void;
  onFork?: () => void;
  onForkWithChild?: (childConfigId: string) => void;
  forkChildren?: { config_id: string; label: string; is_recommended: boolean }[];
  onContentCompleted: (progressSnapshot?: Record<string, unknown>) => void;
};

export default function FocusWorkbenchPanel({
  phaseRuntimeState,
  activeRun,
  activeDefinition,
  busy,
  isPaused,
  onCompleteTaskAndEndPhase,
  onEndPhase,
  onExtendPhase,
  onCreateExtraRun,
  onFork,
  onForkWithChild,
  forkChildren,
  onContentCompleted,
}: FocusWorkbenchPanelProps) {
  const noAvailableContent = runHasNoAvailableContent(activeRun);
  const progressSnapshot = activeRun?.progress_snapshot as Record<string, unknown> | undefined;
  const runSummary = progressSnapshot?.run_summary as Record<string, unknown> | undefined;
  const focusWorkType = activeRun?.config_snapshot?.focus_work_type as string | undefined;
  const masteryCheck = (progressSnapshot?.mastery_check ?? runSummary?.mastery_check) as Record<string, unknown> | undefined;
  const hasMasteryCheckFailed = masteryCheck && masteryCheck.enabled === true && masteryCheck.passed === false;

  const [selectedChildId, setSelectedChildId] = useState<string>(() => {
    if (forkChildren && forkChildren.length > 0) {
      const recommended = forkChildren.find(c => c.is_recommended);
      return recommended?.config_id || forkChildren[0].config_id;
    }
    return '';
  });

  const hasChildren = forkChildren && forkChildren.length > 0;

  if (phaseRuntimeState === 'counted_run_completed_confirming') {
    const handleFork = () => {
      if (hasChildren && onForkWithChild) {
        onForkWithChild(selectedChildId);
      } else if (onFork) {
        onFork();
      }
    };

    return (
      <ActionPanel
        label="Round Complete"
        heading="本轮专注工作已完成"
        description={hasMasteryCheckFailed ? "检验未通过。你可以fork到弱项进行针对性练习，或直接完成任务。" : "本轮计入当前任务。确认后会记录任务完成并结束当前阶段。"}
        primaryLabel={hasMasteryCheckFailed ? "完成任务并结束阶段" : "完成任务并结束阶段"}
        primaryDisabled={busy || !activeRun}
        onPrimary={onCompleteTaskAndEndPhase}
        secondaryLabel={hasMasteryCheckFailed ? "fork到弱项" : "再来一轮"}
        secondaryDisabled={hasMasteryCheckFailed ? busy || !(onFork || onForkWithChild) : true}
        onSecondary={hasMasteryCheckFailed ? handleFork : onCreateExtraRun}
      >
        {hasMasteryCheckFailed && hasChildren && (
          <div className="mb-3">
            <label className="mb-1 block text-xs text-[var(--focus-work-text-muted)]">fork 到：</label>
            <select
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="w-full rounded border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-2 py-1 text-sm text-[var(--focus-work-text)]"
            >
              {forkChildren.map((child) => (
                <option key={child.config_id} value={child.config_id}>
                  {child.label || child.config_id}
                </option>
              ))}
            </select>
          </div>
        )}
        {runSummary && Object.keys(runSummary).length > 0 && (
          <RunSummaryCard summary={runSummary} focusWorkType={focusWorkType} masteryCheckFromProgress={masteryCheck} />
        )}
      </ActionPanel>
    );
  }

  if (phaseRuntimeState === 'extra_run_completed') {
    const handleFork = () => {
      if (hasChildren && onForkWithChild) {
        onForkWithChild(selectedChildId);
      } else if (onFork) {
        onFork();
      }
    };

    return (
      <ActionPanel
        label="Round Complete"
        heading="本轮专注已完成"
        description={hasMasteryCheckFailed ? "检验未通过。你可以fork到弱项进行针对性练习，或直接完成任务。" : "本轮计入当前任务。确认后会记录任务完成并结束当前阶段。"}
        primaryLabel={hasMasteryCheckFailed ? "完成任务并结束阶段" : "完成任务并结束阶段"}
        primaryDisabled={busy || !activeRun}
        onPrimary={onCompleteTaskAndEndPhase}
        secondaryLabel={hasMasteryCheckFailed ? "fork到弱项" : "再来一轮"}
        secondaryDisabled={hasMasteryCheckFailed ? busy || !(onFork || onForkWithChild) : true}
        onSecondary={hasMasteryCheckFailed ? handleFork : onCreateExtraRun}
      >
        {hasMasteryCheckFailed && hasChildren && (
          <div className="mb-3">
            <label className="mb-1 block text-xs text-[var(--focus-work-text-muted)]">fork 到：</label>
            <select
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="w-full rounded border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-2 py-1 text-sm text-[var(--focus-work-text)]"
            >
              {forkChildren.map((child) => (
                <option key={child.config_id} value={child.config_id}>
                  {child.label || child.config_id}
                </option>
              ))}
            </select>
          </div>
        )}
        {runSummary && Object.keys(runSummary).length > 0 && (
          <RunSummaryCard summary={runSummary} focusWorkType={focusWorkType} masteryCheckFromProgress={masteryCheck} />
        )}
      </ActionPanel>
    );
  }

  if (phaseRuntimeState === 'task_already_completed') {
    return (
      <ActionPanel
        label="Task Complete"
        heading="当前任务今日已完成"
        description="可以结束当前阶段，也可以再进行一轮额外专注。额外轮次会保存内容进度，但不计入任务完成。"
        primaryLabel="结束阶段"
        primaryDisabled={busy}
        onPrimary={onEndPhase}
        secondaryLabel="再来一轮"
        secondaryDisabled={true}
        onSecondary={onCreateExtraRun}
      >
        {runSummary && Object.keys(runSummary).length > 0 && (
          <RunSummaryCard summary={runSummary} focusWorkType={focusWorkType} masteryCheckFromProgress={masteryCheck} />
        )}
      </ActionPanel>
    );
  }

  if (phaseRuntimeState === 'phase_time_expired_prompt') {
    return (
      <ActionPanel
        label="Time Is Up"
        heading="本阶段时间已到"
        description="可以延长 5 分钟，或结束该阶段。结束阶段会正常记录已完成的专注工作，但不会自动完成任务。"
        primaryLabel="延长时间"
        primaryDisabled={busy}
        onPrimary={onExtendPhase}
        secondaryLabel="结束该阶段"
        secondaryDisabled={busy}
        onSecondary={onEndPhase}
      />
    );
  }

  if (activeRun && activeDefinition) {
    return activeDefinition.render({
      run: activeRun,
      disabled: isPaused,
      onContentCompleted,
    });
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center p-8 text-center">
      <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Preparing</div>
      <h3 className="mt-4 text-xl font-semibold text-[var(--focus-work-text)]">正在准备本轮专注工作</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">工作台正在识别当前任务并创建对应的专注轮次。</p>
    </div>
  );
}
