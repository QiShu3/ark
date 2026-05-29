import React from 'react';

import { apiJson } from '../../lib/api';
import { dispatchOnboardingEvent, ONBOARDING_EVENTS } from '../../lib/onboardingEvents';
import FocusWorkModalShell from './FocusWorkModalShell';
import { getFocusWorkDefinition } from './focusWorkRegistry';
import {
  START_FOCUS_WORK_EVENT,
  type FocusWorkResult,
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
  const activeDefinition = getFocusWorkDefinition(snapshot?.active_focus_work_type);
  const isFullscreen = snapshot?.state === 'focus'
    && snapshot.focus_work_display_state === 'fullscreen'
    && activeDefinition;
  const recordFocus = snapshot?.record_focus ?? true;

  const loadSnapshot = React.useCallback(async () => {
    try {
      const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/current');
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

  async function submitResult(result: FocusWorkResult, progressSnapshot: Record<string, unknown> = {}) {
    if (!snapshot?.active_focus_work_type || busy) return false;
    setBusy(true);
    try {
      const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/focus-work-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focus_work_type: snapshot.active_focus_work_type,
          result,
          progress_snapshot: progressSnapshot,
        }),
      });
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      return true;
    } catch (err) {
      console.error('Failed to submit focus work result', err);
      alert(err instanceof Error ? err.message : '提交专注结果失败');
      return false;
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

  async function completeTaskAndFinishCurrentFocus() {
    if (!snapshot?.task_id || busy) return;
    const isUserTaskFocus = snapshot.active_focus_work_type === 'task_focus'
      && (snapshot.active_task_source_type ?? 'user') === 'user';
    setBusy(true);
    try {
      if (isUserTaskFocus) {
        await apiJson(`/todo/tasks/${snapshot.task_id}/complete`, { method: 'POST' });
      }
      const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/focus-work-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focus_work_type: snapshot.active_focus_work_type,
          result: 'completed',
          progress_snapshot: {
            taskId: snapshot.task_id,
            completedTask: true,
            appTaskType: snapshot.active_task_app_task_type ?? null,
          },
        }),
      });
      setSnapshot(next);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to complete task and finish focus work', err);
      alert(err instanceof Error ? err.message : '完成任务并结束专注失败');
    } finally {
      setBusy(false);
    }
  }

  function abandonCurrentWork() {
    if (!window.confirm('确定要放弃当前专注阶段吗？这只会结束当前阶段，不会结束整个工作流。')) return;
    void submitResult('abandoned');
  }

  async function completeCurrentFocusRound() {
    const succeeded = await submitResult('completed', { completedTask: false });
    if (succeeded) {
      dispatchOnboardingEvent(ONBOARDING_EVENTS.workflowPhaseEnded);
    }
  }

  return (
    <>
      {children}

      {pendingStart ? (
        <div className="ark-focus-work-shell ark-focus-work-backdrop fixed inset-x-0 bottom-0 top-16 z-[90] flex items-center justify-center backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="focus-work-record-title"
            className="ark-focus-work-dialog w-[min(92vw,30rem)] rounded-[2rem] border p-6 shadow-2xl"
          >
            <div className="text-xs uppercase tracking-[0.24em] text-white/35">Focus Work</div>
            <h2 id="focus-work-record-title" className="mt-3 text-2xl font-semibold text-white">
              记录这次专注吗？
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/60">
              选择记录后，这次子应用工作会进入专注时间；不记录也会进入专注状态，只是不会写入专注时间。
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void startFocusWork(true)}
                disabled={busy}
                className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
              >
                记录并进入
              </button>
              <button
                type="button"
                onClick={() => void startFocusWork(false)}
                disabled={busy}
                className="rounded-full border border-white/14 bg-white/8 px-5 py-3 text-sm text-white/80 transition hover:border-white/24 hover:bg-white/12 disabled:opacity-60"
              >
                不记录，直接进入
              </button>
            </div>
          </section>
        </div>
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
          onCompleteRound={() => void completeCurrentFocusRound()}
          onAbandon={abandonCurrentWork}
        >
          {activeDefinition.render({
            workflow: snapshot,
            recordFocus,
            onPause: undefined,
            onResume: undefined,
            onComplete: (progressSnapshot) => void submitResult('completed', progressSnapshot),
            onCompleteTaskAndFinish: snapshot.task_id
              ? () => void completeTaskAndFinishCurrentFocus()
              : undefined,
            onInterrupt: (progressSnapshot) => void submitResult('interrupted', progressSnapshot),
            onAbandon: undefined,
          })}
        </FocusWorkModalShell>
      ) : null}
    </>
  );
}
