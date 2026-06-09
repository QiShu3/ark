import React from 'react';

import { apiJson } from '../../lib/api';
import { fetchCurrentFocusWorkflow } from '../../lib/focusWorkflow';
import AppModalFrame from '../AppModalFrame';
import FocusWorkModalShell from './FocusWorkModalShell';
import { getFocusWorkDefinition } from './focusWorkRegistry';
import {
  START_FOCUS_WORK_EVENT,
  type FocusPhaseRuntimeState,
  type FocusWorkSnapshot,
  type FocusWorkStartDetail,
  type FocusWorkType,
} from './focusWorkTypes';

type FocusWorkProviderProps = {
  children: React.ReactNode;
};

type PendingStart = {
  focusWorkType: FocusWorkType;
};

function isFocusWorkType(value: unknown): value is FocusWorkType {
  return value === 'vocab_today' || value === 'erc_review' || value === 'erc_practice' || value === 'task_focus';
}

export default function FocusWorkProvider({ children }: FocusWorkProviderProps) {
  const [snapshot, setSnapshot] = React.useState<FocusWorkSnapshot | null>(null);
  const [pendingStart, setPendingStart] = React.useState<PendingStart | null>(null);
  const [busy, setBusy] = React.useState(false);
  const creatingRunRef = React.useRef(false);

  const activeRun = snapshot?.active_run ?? null;
  const activeFocusWorkType = activeRun?.focus_work_type ?? snapshot?.active_focus_work_type ?? null;
  const activeDefinition = getFocusWorkDefinition(activeFocusWorkType);
  const derivedPhaseRuntimeState: FocusPhaseRuntimeState | null = snapshot?.phase_runtime_state
    ?? (snapshot?.is_task_completed_today && !activeRun ? 'task_already_completed' : null)
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
      setPendingStart({ focusWorkType: detail.focusWorkType });
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
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
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
    if (!window.confirm('确定要放弃当前专注阶段吗？这只会结束当前阶段，不会结束整个工作流。')) return;
    void apiJson<FocusWorkSnapshot>('/todo/focus/workflow/skip_phase', { method: 'POST' })
      .then((next) => {
        setSnapshot(next);
        window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      })
      .catch((err) => {
        console.error('Failed to abandon focus phase', err);
        alert(err instanceof Error ? err.message : '放弃本阶段失败');
      });
  }

  React.useEffect(() => {
    if (!snapshot || busy || creatingRunRef.current) return;
    if (snapshot.state !== 'focus' || !activeDefinition) return;
    if (snapshot.pending_task_selection || snapshot.is_paused) return;
    if (activeRun || derivedPhaseRuntimeState) return;
    if (snapshot.is_task_completed_today) return;
    const mode = snapshot.task_id || snapshot.runtime_task_id ? 'counted' : 'extra';
    void createRun(mode);
  }, [
    activeDefinition,
    activeRun,
    busy,
    derivedPhaseRuntimeState,
    snapshot?.is_paused,
    snapshot?.is_task_completed_today,
    snapshot?.pending_task_selection,
    snapshot?.runtime_task_id,
    snapshot?.state,
    snapshot?.task_id,
  ]);

  function renderWorkbenchPanel() {
    const primaryButtonClass = 'rounded-full bg-white px-6 py-3 text-sm font-medium text-slate-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
    const secondaryButtonClass = 'rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-6 py-3 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50';

    if (derivedPhaseRuntimeState === 'counted_run_completed_confirming') {
      return (
        <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center p-8 text-center">
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Round Complete</div>
          <h3 className="mt-4 text-xl font-semibold text-[var(--focus-work-text)]">本轮专注工作已完成</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">本轮计入当前任务。确认后会记录任务完成并结束当前阶段。</p>
          <div className="mt-8 flex w-full flex-col justify-center gap-4 sm:flex-row">
            <button type="button" disabled={busy || !activeRun} onClick={() => void completeTaskAndEndPhase()} className={primaryButtonClass}>
              完成任务并结束阶段
            </button>
            <button type="button" disabled={busy} onClick={() => void createRun('extra')} className={secondaryButtonClass}>
              再来一轮
            </button>
          </div>
        </div>
      );
    }

    if (derivedPhaseRuntimeState === 'extra_run_completed') {
      return (
        <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center p-8 text-center">
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Extra Round</div>
          <h3 className="mt-4 text-xl font-semibold text-[var(--focus-work-text)]">本轮额外专注已完成</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">本轮不计入任务完成。你可以结束当前阶段，或在同一阶段再来一轮。</p>
          <div className="mt-8 flex w-full flex-col justify-center gap-4 sm:flex-row">
            <button type="button" disabled={busy} onClick={() => void endPhase()} className={primaryButtonClass}>
              结束阶段
            </button>
            <button type="button" disabled={busy} onClick={() => void createRun('extra')} className={secondaryButtonClass}>
              再来一轮
            </button>
          </div>
        </div>
      );
    }

    if (derivedPhaseRuntimeState === 'task_already_completed') {
      return (
        <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center p-8 text-center">
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Task Complete</div>
          <h3 className="mt-4 text-xl font-semibold text-[var(--focus-work-text)]">当前任务今日已完成</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">可以结束当前阶段，也可以再进行一轮额外专注。额外轮次会保存内容进度，但不计入任务完成。</p>
          <div className="mt-8 flex w-full flex-col justify-center gap-4 sm:flex-row">
            <button type="button" disabled={busy} onClick={() => void endPhase()} className={primaryButtonClass}>
              结束阶段
            </button>
            <button type="button" disabled={busy} onClick={() => void createRun('extra')} className={secondaryButtonClass}>
              再来一轮
            </button>
          </div>
        </div>
      );
    }

    if (derivedPhaseRuntimeState === 'phase_time_expired_prompt') {
      return (
        <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center p-8 text-center">
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Time Is Up</div>
          <h3 className="mt-4 text-xl font-semibold text-[var(--focus-work-text)]">本阶段时间已到</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">可以延长 5 分钟，或结束该阶段。结束阶段会正常记录已完成的专注工作，但不会自动完成任务。</p>
          <div className="mt-8 flex w-full flex-col justify-center gap-4 sm:flex-row">
            <button type="button" disabled={busy} onClick={() => void extendPhase()} className={primaryButtonClass}>
              延长时间
            </button>
            <button type="button" disabled={busy} onClick={() => void endPhase()} className={secondaryButtonClass}>
              结束该阶段
            </button>
          </div>
        </div>
      );
    }

    if (activeRun && activeDefinition) {
      return activeDefinition.render({
        run: activeRun,
        disabled: snapshot?.is_paused === true,
        onContentCompleted: (progressSnapshot) => void completeRunContent(progressSnapshot),
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
              选择记录后，这次子应用工作会进入专注时间；不记录也会进入专注状态，只是不会写入专注时间。
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
          subtitle={activeDefinition.subtitle}
          recordFocus={recordFocus}
          isPaused={snapshot.is_paused === true}
          busy={busy}
          onPause={() => void pauseFocusWork()}
          onResume={() => void resumeFocusWork()}
          onAbandon={abandonCurrentWork}
        >
          {renderWorkbenchPanel()}
        </FocusWorkModalShell>
      ) : null}
    </>
  );
}
