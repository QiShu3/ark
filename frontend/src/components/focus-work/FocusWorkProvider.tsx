import React from 'react';

import { apiJson } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { fetchCurrentFocusWorkflow, forkFocusWorkRun, returnToParentFocusWork, confirmWorkflowSettlement } from '../../lib/focusWorkflow';
import AppModalFrame from '../AppModalFrame';
import FocusWorkModalShell from './FocusWorkModalShell';
import FocusWorkbenchPanel from './FocusWorkbenchPanel';
import Guest408DemoOnboarding from './Guest408DemoOnboarding';
import WorkflowSettlementModal from './WorkflowSettlementModal';
import { getFocusWorkDefinition } from './focusWorkRegistry';
import {
  START_FOCUS_WORK_EVENT,
  type FocusPhaseRuntimeState,
  type FocusWorkRunSummary,
  type FocusWorkSnapshot,
  type FocusWorkStartDetail,
  type FocusWorkType,
} from './focusWorkTypes';

/**
 * 专注工作 header 右侧内容注入 context
 * 内层答题组件可以通过此 context 设置外层弹窗标题栏右侧的内容
 */
const FocusWorkHeaderRightContext = React.createContext<{
  setHeaderRight: (node: React.ReactNode) => void;
}>({ setHeaderRight: () => {} });

export function useFocusWorkHeaderRight() {
  return React.useContext(FocusWorkHeaderRightContext);
}

type FocusWorkProviderProps = {
  children: React.ReactNode;
};

type PendingStart = {
  focusWorkType: FocusWorkType;
  bankId?: string;
};

function isFocusWorkType(value: unknown): value is FocusWorkType {
  return value === 'flash_card' || value === 'choice' || value === 'input' || value === 'task_focus';
}

export default function FocusWorkProvider({ children }: FocusWorkProviderProps) {
  const isGuest = useAuthStore((state) => state.user?.is_guest === true);
  const [snapshot, setSnapshot] = React.useState<FocusWorkSnapshot | null>(null);
  const [pendingStart, setPendingStart] = React.useState<PendingStart | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = React.useState(false);
  const [headerRight, setHeaderRight] = React.useState<React.ReactNode>(null);
  const creatingRunRef = React.useRef(false);
  const autoRunAttemptRef = React.useRef<string | null>(null);

  const activeRun = snapshot?.active_run ?? null;
  const activeFocusWorkType = activeRun?.focus_work_type ?? snapshot?.active_focus_work_type ?? null;
  const activeDefinition = getFocusWorkDefinition(activeFocusWorkType);
  const derivedPhaseRuntimeState: FocusPhaseRuntimeState | null = snapshot?.phase_runtime_state
    ?? (activeRun?.status === 'content_completed'
      ? activeRun.counts_for_task_completion
        ? 'counted_run_completed_confirming'
        : 'extra_run_completed'
      : activeRun
        ? 'running_run'
        : null);
  const isFullscreen = snapshot?.state === 'focus'
    && (snapshot.focus_work_display_state === 'fullscreen' || Boolean(derivedPhaseRuntimeState))
    && activeDefinition;
  const recordFocus = snapshot?.record_focus ?? true;

  // 动态副标题：优先用题库名/配置名，fallback 到题型默认描述
  const configSnapshot = activeRun?.config_snapshot as Record<string, unknown> | undefined;
  const displaySubtitle =
    ((configSnapshot?.bank_name as string) || (configSnapshot?.config_name as string)) ||
    activeDefinition?.subtitle ||
    '';

  const loadSnapshot = React.useCallback(async () => {
    try {
      const next = await fetchCurrentFocusWorkflow<FocusWorkSnapshot>();
      setSnapshot(next);
    } catch (err) {
      console.error('Failed to load focus work snapshot', err);
      setSnapshot(null);
    }
  }, []);

  React.useEffect(() => {
    void loadSnapshot();
    const handleReload = () => void loadSnapshot();
    window.addEventListener('ark:reload-focus', handleReload);
    return () => window.removeEventListener('ark:reload-focus', handleReload);
  }, [loadSnapshot]);

  React.useEffect(() => {
    const handleStart = (event: Event) => {
      const detail = (event as CustomEvent<FocusWorkStartDetail>).detail;
      if (!detail || !isFocusWorkType(detail.focusWorkType)) return;
      setPendingStart({ focusWorkType: detail.focusWorkType, bankId: detail.bankId });
    };
    window.addEventListener(START_FOCUS_WORK_EVENT, handleStart);
    return () => window.removeEventListener(START_FOCUS_WORK_EVENT, handleStart);
  }, []);

  async function startFocusWork(record: boolean) {
    if (!pendingStart || busy) return false;
    setBusy(true);
    try {
      const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/start-app-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focus_work_type: pendingStart.focusWorkType,
          record_focus: record,
          bank_id: pendingStart.bankId ?? null,
        }),
      });
      setSnapshot(next);
      setPendingStart(null);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      return true;
    } catch (err) {
      console.error('Failed to start focus work', err);
      alert(err instanceof Error ? err.message : '进入专注工作失败');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createRun(mode: 'counted' | 'extra') {
    if (busy || creatingRunRef.current) return false;
    creatingRunRef.current = true;
    setBusy(true);
    try {
      const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      setSnapshot(next);
      return true;
    } catch (err) {
      console.error('Failed to create focus work run', err);
      alert(err instanceof Error ? err.message : '创建专注轮次失败');
      return false;
    } finally {
      creatingRunRef.current = false;
      setBusy(false);
    }
  }

  async function completeRunContent(progressSnapshot: Record<string, unknown> = {}) {
    if (!activeRun || busy) return false;
    setBusy(true);
    try {
      const next = await apiJson<FocusWorkSnapshot>(`/todo/focus/workflow/runs/${activeRun.id}/content-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress_snapshot: progressSnapshot }),
      });
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      return true;
    } catch (err) {
      console.error('Failed to complete focus work run content', err);
      alert(err instanceof Error ? err.message : '提交本轮内容完成失败');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function completeGuest408Demo(run: FocusWorkRunSummary) {
    const config = run.config_snapshot as Record<string, unknown> | undefined;
    const progress = run.progress_snapshot as Record<string, unknown> | undefined;
    const name = String(config?.deliberate_name ?? '');
    const isCombinedCheck = name === '408 综合检测';
    const answeredCount = isCombinedCheck ? 10 : 3;
    const rotationOffset = Number(progress?.unified_rotation_offset ?? 0);
    const shouldPassCombinedCheck = isCombinedCheck && (
      config?.guest_demo_next_combined_should_pass === true || rotationOffset > 0
    );
    const correctCount = isCombinedCheck ? (shouldPassCombinedCheck ? 8 : 6) : 2;
    const accuracy = correctCount / answeredCount;

    await completeRunContent({
      article_count: 1,
      target_article_count: answeredCount,
      correct_count: correctCount,
      question_count: answeredCount,
      run_summary: {
        total_questions: answeredCount,
        answered_count: answeredCount,
        correct_count: correctCount,
        accuracy,
        duration_seconds: 3,
        question_details: [],
      },
    });
  }

  async function completeTaskAndEndPhase() {
    if (!activeRun || busy) return;
    setBusy(true);
    try {
      const next = await apiJson<FocusWorkSnapshot>(`/todo/focus/workflow/runs/${activeRun.id}/complete-task-and-end-phase`, {
        method: 'POST',
      });
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to complete task and end phase', err);
      alert(err instanceof Error ? err.message : '完成任务并结束阶段失败');
    } finally {
      setBusy(false);
    }
  }

  async function endPhase() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/end-phase', { method: 'POST' });
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to end focus phase', err);
      alert(err instanceof Error ? err.message : '结束阶段失败');
    } finally {
      setBusy(false);
    }
  }

  async function extendPhase() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/extend-phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extend_seconds: 300 }),
      });
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to extend focus phase', err);
      alert(err instanceof Error ? err.message : '延长阶段失败');
    } finally {
      setBusy(false);
    }
  }

  async function pauseFocusWork() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/pause', { method: 'POST' });
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to pause focus work', err);
      alert(err instanceof Error ? err.message : '暂停专注失败');
    } finally {
      setBusy(false);
    }
  }

  async function resumeFocusWork() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/resume', { method: 'POST' });
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to resume focus work', err);
      alert(err instanceof Error ? err.message : '继续专注失败');
    } finally {
      setBusy(false);
    }
  }

  function abandonCurrentWork() {
    setShowAbandonConfirm(true);
  }

  async function confirmAbandonWork() {
    setBusy(true);
    try {
      const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/skip_phase', { method: 'POST' });
      setSnapshot(next);
      setShowAbandonConfirm(false);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to abandon focus phase', err);
      // 用项目内弹窗提示错误
      alert(err instanceof Error ? err.message : '放弃本阶段失败');
    } finally {
      setBusy(false);
    }
  }

  async function forkToWeakArea(parentRun: FocusWorkRunSummary) {
    const progressSnapshot = parentRun.progress_snapshot as Record<string, unknown> | undefined;
    const runSummary = progressSnapshot?.run_summary as Record<string, unknown> | undefined;
    const masteryCheck = (progressSnapshot?.mastery_check ?? runSummary?.mastery_check) as Record<string, unknown> | undefined;
    const questionDetails = runSummary?.question_details as Array<Record<string, unknown>> | undefined;

    const wrongQuestions = questionDetails?.filter(q => q.correct === false) ?? [];
    const subjects = [...new Set(wrongQuestions.map(q => q.subject as string).filter(Boolean))];

    const scope: Record<string, unknown> = {};
    if (subjects.length > 0) {
      scope.subjects = subjects;
    }

    try {
      setBusy(true);
      await forkFocusWorkRun({
        parent_run_id: parentRun.id,
        focus_work_type: parentRun.focus_work_type,
        bank_id: parentRun.config_snapshot?.bank_id as string | undefined,
        scope,
      });
      const next = await fetchCurrentFocusWorkflow<FocusWorkSnapshot>();
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to fork focus work', err);
      alert(err instanceof Error ? err.message : 'fork失败');
    } finally {
      setBusy(false);
    }
  }

  async function forkToChild(parentRun: FocusWorkRunSummary, childConfigId: string) {
    try {
      setBusy(true);
      const response = await apiJson(`/api/deliberate-workflows/${childConfigId}`);
      const childConfig = response as Record<string, unknown>;

      await forkFocusWorkRun({
        parent_run_id: parentRun.id,
        child_config_id: childConfigId,
        focus_work_type: childConfig.focus_work_type as string,
        bank_id: childConfig.bank_id as string | undefined,
        scope: (childConfig.scope as Record<string, unknown>) || {},
        completion: (childConfig.completion as Record<string, unknown>) || {},
        pass_criteria: (childConfig.pass_criteria as Record<string, unknown>) || {},
      });
      const next = await fetchCurrentFocusWorkflow<FocusWorkSnapshot>();
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to fork to child', err);
      alert(err instanceof Error ? err.message : 'fork失败');
    } finally {
      setBusy(false);
    }
  }

  async function returnToParent(runId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await returnToParentFocusWork(runId);
      const next = await fetchCurrentFocusWorkflow<FocusWorkSnapshot>();
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to return to parent', err);
      alert(err instanceof Error ? err.message : '回到原专注工作失败');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSettlement() {
    if (busy) return;
    setBusy(true);
    try {
      await confirmWorkflowSettlement();
      const next = await fetchCurrentFocusWorkflow<FocusWorkSnapshot>();
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to confirm settlement', err);
      alert(err instanceof Error ? err.message : '结束工作流失败');
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    if (!snapshot || busy || creatingRunRef.current) return;
    if (snapshot.state !== 'focus' || !activeDefinition) return;
    if (snapshot.pending_task_selection || snapshot.is_paused) return;
    if (activeRun || derivedPhaseRuntimeState) {
      autoRunAttemptRef.current = null;
      return;
    }
    const currentPhase = snapshot.phases?.[snapshot.current_phase_index ?? 0];
    const phaseConfigId = currentPhase && 'deliberate_config_id' in currentPhase
      ? String(currentPhase.deliberate_config_id ?? '')
      : '';
    const attemptKey = `${snapshot.current_phase_index ?? 0}:${snapshot.active_focus_work_type ?? ''}:${phaseConfigId}`;
    if (autoRunAttemptRef.current === attemptKey) return;
    autoRunAttemptRef.current = attemptKey;
    void createRun('counted');
  }, [
    activeDefinition,
    activeRun,
    busy,
    derivedPhaseRuntimeState,
    snapshot?.is_paused,
    snapshot?.pending_task_selection,
    snapshot?.current_phase_index,
    snapshot?.active_focus_work_type,
    snapshot?.phases,
    snapshot?.runtime_task_id,
    snapshot?.state,
    snapshot?.task_id,
  ]);

  return (
    <>
      {children}

      {pendingStart ? (
        <AppModalFrame
          open={true}
          zIndexClassName="z-[90]"
          backdropClassName="ark-focus-work-shell ark-focus-work-backdrop"
          ariaLabelledBy="focus-work-record-title"
          panelClassName="ark-focus-work-dialog w-[min(92vw,30rem)] rounded-[2rem] border p-6 shadow-2xl"
        >
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Focus Work</div>
            <h2 id="focus-work-record-title" className="mt-3 text-2xl font-semibold text-[var(--focus-work-text)]">
              记录这次专注吗？
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">
              选择记录后，这次应用工作会进入专注时间；不记录也会进入专注状态，只是不会写入专注时间。
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void startFocusWork(true)}
                disabled={busy}
                className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-[var(--focus-work-surface-soft)] disabled:opacity-60"
              >
                记录并进入
              </button>
              <button
                type="button"
                onClick={() => void startFocusWork(false)}
                disabled={busy}
                className="rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-3 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] disabled:opacity-60"
              >
                不记录，直接进入
              </button>
            </div>
        </AppModalFrame>
      ) : null}

      {isFullscreen && activeDefinition ? (
        <FocusWorkModalShell
          title={activeDefinition.title}
          subtitle={displaySubtitle}
          recordFocus={recordFocus}
          isPaused={snapshot.is_paused === true}
          busy={busy}
          headerRight={headerRight}
          onPause={() => void pauseFocusWork()}
          onResume={() => void resumeFocusWork()}
          onAbandon={abandonCurrentWork}
        >
          <FocusWorkHeaderRightContext.Provider value={{ setHeaderRight }}>
            <FocusWorkbenchPanel
              phaseRuntimeState={derivedPhaseRuntimeState}
              activeRun={activeRun}
              activeDefinition={activeDefinition}
              busy={busy}
              isPaused={snapshot?.is_paused === true}
              onCompleteTaskAndEndPhase={() => void completeTaskAndEndPhase()}
              onEndPhase={() => void endPhase()}
              onExtendPhase={() => void extendPhase()}
              onCreateExtraRun={() => void createRun('extra')}
              onFork={activeRun ? () => void forkToWeakArea(activeRun) : undefined}
              onForkWithChild={activeRun ? (childId) => void forkToChild(activeRun, childId) : undefined}
              forkChildren={activeRun?.config_snapshot?.children as { config_id: string; label: string; is_recommended: boolean }[] | undefined}
              onReturnToParent={activeRun ? () => returnToParent(activeRun.id) : undefined}
              guestDemoAction={isGuest && activeRun?.focus_work_type === 'choice' && (
                (activeRun.config_snapshot as Record<string, unknown> | undefined)?.deliberate_name === '408 综合检测'
                || ['数据结构巩固', '计算机组成原理巩固', '操作系统巩固', '计算机网络巩固'].includes(
                  String((activeRun.config_snapshot as Record<string, unknown> | undefined)?.deliberate_name ?? ''),
                )
              ) ? {
                label: (activeRun.config_snapshot as Record<string, unknown> | undefined)?.deliberate_name === '408 综合检测'
                  ? '一键完成综合检测'
                  : '一键完成专项检测',
                onClick: () => void completeGuest408Demo(activeRun),
              } : null}
              isGuest408Demo={isGuest && activeRun?.focus_work_type === 'choice' && (
                (activeRun.config_snapshot as Record<string, unknown> | undefined)?.deliberate_name === '408 综合检测'
                || ['数据结构巩固', '计算机组成原理巩固', '操作系统巩固', '计算机网络巩固'].includes(
                  String((activeRun.config_snapshot as Record<string, unknown> | undefined)?.deliberate_name ?? ''),
                )
              )}
              onContentCompleted={(progressSnapshot) => void completeRunContent(progressSnapshot)}
              />
          </FocusWorkHeaderRightContext.Provider>
        </FocusWorkModalShell>
      ) : null}

      {/* 放弃阶段确认弹窗 */}
      {showAbandonConfirm && (
        <AppModalFrame
          open={true}
          zIndexClassName="z-[100]"
          backdropClassName="ark-focus-work-backdrop"
          ariaLabelledBy="abandon-confirm-title"
          panelClassName="ark-focus-work-dialog w-[min(92vw,28rem)] rounded-[2rem] border p-6 shadow-2xl"
        >
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Warning</div>
          <h2 id="abandon-confirm-title" className="mt-3 text-2xl font-semibold text-[var(--focus-work-text)]">
            确定要放弃当前阶段吗？
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">
            放弃当前专注阶段后会进入下一阶段，不会结束整个工作流。
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setShowAbandonConfirm(false)}
              disabled={busy}
              className="rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-3 text-sm font-medium text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void confirmAbandonWork()}
              disabled={busy}
              className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-gray-100 disabled:opacity-60"
            >
              {busy ? '放弃中…' : '确认放弃'}
            </button>
          </div>
        </AppModalFrame>
      )}

      {snapshot?.phase_runtime_state === 'workflow_settlement' && snapshot?.workflow_settlement ? (
        <WorkflowSettlementModal
          open={true}
          settlement={snapshot.workflow_settlement}
          busy={busy}
          onConfirm={() => void confirmSettlement()}
          onboardingAnchor={isGuest && snapshot.workflow_settlement.workflow_name.includes('408') ? 'guest-408-finish-workflow' : undefined}
          onboardingContentAnchor={isGuest && snapshot.workflow_settlement.workflow_name.includes('408') ? 'guest-408-settlement-overview' : undefined}
        />
      ) : null}
      {isGuest ? <Guest408DemoOnboarding snapshot={snapshot} /> : null}
    </>
  );
}
