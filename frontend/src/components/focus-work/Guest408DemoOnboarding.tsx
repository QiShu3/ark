import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import type { FocusWorkRunSummary, FocusWorkSnapshot } from './focusWorkTypes';

type GuideStep = {
  key: string;
  contentAnchor: string;
  actionAnchor: string;
  title: string;
  body: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
};

const SPECIALIST_NAMES = new Set(['数据结构巩固', '计算机组成原理巩固', '操作系统巩固', '计算机网络巩固']);

function getRunName(run: FocusWorkRunSummary | null): string {
  return String((run?.config_snapshot as Record<string, unknown> | undefined)?.deliberate_name ?? '');
}

function isGuest408Run(run: FocusWorkRunSummary | null): boolean {
  const name = getRunName(run);
  return name === '408 综合检测' || SPECIALIST_NAMES.has(name);
}

function getMasteryCheck(run: FocusWorkRunSummary | null): Record<string, unknown> | undefined {
  const progress = run?.progress_snapshot as Record<string, unknown> | undefined;
  const summary = progress?.run_summary as Record<string, unknown> | undefined;
  return (progress?.mastery_check ?? summary?.mastery_check) as Record<string, unknown> | undefined;
}

function getGuideStep(snapshot: FocusWorkSnapshot | null): GuideStep | null {
  const run = snapshot?.active_run ?? null;
  const isSettlement = snapshot?.phase_runtime_state === 'workflow_settlement';
  const is408Settlement = String(snapshot?.workflow_settlement?.workflow_name ?? '').includes('408');
  if (!isGuest408Run(run) && !(isSettlement && is408Settlement)) return null;

  const name = getRunName(run);
  const isCombinedCheck = name === '408 综合检测';
  const runtimeState = snapshot?.phase_runtime_state;
  const masteryCheck = getMasteryCheck(run);
  const passed = masteryCheck?.passed === true;
  const failed = masteryCheck?.passed === false;

  if (runtimeState === 'running_run') {
    const progress = run?.progress_snapshot as Record<string, unknown> | undefined;
    const isRetry = Number(progress?.unified_rotation_offset ?? 0) > 0;
    if (isCombinedCheck) {
      return {
        key: isRetry ? 'combined-retry' : 'combined-first',
        contentAnchor: 'guest-408-demo-overview',
        actionAnchor: 'guest-408-demo-complete',
        title: isRetry ? '重新检测新的题组' : '完成首轮综合检测',
        body: isRetry
          ? '专项巩固后回到综合检测。这里会使用一组新题，快速确认补强是否有效。'
          : '点击一键完成，体验 10 道综合题的检测结果。首轮会识别出需要补强的方向。',
        placement: 'left',
      };
    }
    return {
      key: 'specialist-check',
      contentAnchor: 'guest-408-demo-overview',
      actionAnchor: 'guest-408-demo-complete',
      title: '完成专项巩固',
      body: '点击一键完成专项检测。通过后将回到刚才的综合检测，进入一组新题。',
      placement: 'left',
    };
  }

  if (runtimeState === 'counted_run_completed_confirming' && failed && !run?.source_run_id) {
    return {
      key: 'fork-recommendation',
      contentAnchor: 'guest-408-result-overview',
      actionAnchor: 'guest-408-fork-option',
      title: '按薄弱项 Fork',
      body: '首轮未通过后，选择推荐的专项巩固。系统会暂时分流到这个任务，完成后再回到综合检测。',
      placement: 'top',
    };
  }

  if (runtimeState === 'counted_run_completed_confirming' && passed && run?.source_run_id) {
    return {
      key: 'return-to-parent',
      contentAnchor: 'guest-408-result-overview',
      actionAnchor: 'guest-408-return-parent',
      title: '回流到综合检测',
      body: '专项已经通过。点击这里回到原任务，系统会给你一组新的综合检测题。',
      placement: 'top',
    };
  }

  if (runtimeState === 'counted_run_completed_confirming' && passed && isCombinedCheck) {
    return {
      key: 'combined-passed',
      contentAnchor: 'guest-408-result-overview',
      actionAnchor: 'guest-408-complete-task',
      title: '完成这条学习路径',
      body: '复检已达标。点击结束阶段，查看本次检测、专项补强与回流复检的完整路径。',
      placement: 'top',
    };
  }

  if (runtimeState === 'workflow_settlement') {
    return {
      key: 'workflow-settlement',
      contentAnchor: 'guest-408-settlement-overview',
      actionAnchor: 'guest-408-finish-workflow',
      title: '查看并结束体验',
      body: '这里汇总了你的学习路径：综合检测未通过、专项巩固、回流复检和最终达标。',
      placement: 'top',
    };
  }

  return null;
}

function useAnchorRect(anchor: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!anchor) return;
    const updateRect = () => {
      const element = document.querySelector<HTMLElement>(`[data-onboarding-anchor="${anchor}"]`);
      setRect(element?.getBoundingClientRect() ?? null);
    };
    const observer = new MutationObserver(updateRect);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateRect);
    observer.observe(document.body, { childList: true, subtree: true });
    resizeObserver?.observe(document.body);
    updateRect();
    window.addEventListener('resize', updateRect, { passive: true });
    window.addEventListener('scroll', updateRect, { passive: true });
    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect);
    };
  }, [anchor]);

  return rect;
}

export default function Guest408DemoOnboarding({ snapshot }: { snapshot: FocusWorkSnapshot | null }) {
  const step = getGuideStep(snapshot);
  const [explainedStepKey, setExplainedStepKey] = useState<string | null>(null);
  const showingAction = step != null && explainedStepKey === step.key;
  const rect = useAnchorRect(step ? (showingAction ? step.actionAnchor : step.contentAnchor) : null);

  if (!step || !rect) return null;

  const padding = 8;
  const top = rect.top - padding;
  const left = rect.left - padding;
  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;
  const bubbleWidth = 292;
  const bubbleHeight = 142;
  const gap = 12;
  const preferred = {
    top: { top: top - bubbleHeight - gap, left: left + width / 2 - bubbleWidth / 2 },
    bottom: { top: top + height + gap, left: left + width / 2 - bubbleWidth / 2 },
    left: { top: top + height / 2 - bubbleHeight / 2, left: left - bubbleWidth - gap },
    right: { top: top + height / 2 - bubbleHeight / 2, left: left + width + gap },
  }[step.placement];
  const bubbleTop = Math.max(16, Math.min(preferred.top, window.innerHeight - bubbleHeight - 16));
  const bubbleLeft = Math.max(16, Math.min(preferred.left, window.innerWidth - bubbleWidth - 16));
  const overlayStyle: CSSProperties = { position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' };

  return createPortal(
    <>
      <div style={overlayStyle}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: top, background: 'rgba(0, 0, 0, 0.5)' }} />
        <div style={{ position: 'absolute', top: top + height, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)' }} />
        <div style={{ position: 'absolute', top, left: 0, width: left, height, background: 'rgba(0, 0, 0, 0.5)' }} />
        <div style={{ position: 'absolute', top, left: left + width, right: 0, height, background: 'rgba(0, 0, 0, 0.5)' }} />
      </div>
      <div
        style={{ position: 'fixed', top, left, width, height, zIndex: 9999, pointerEvents: 'none' }}
        className="rounded-xl border-[3px] border-[var(--ark-accent)] shadow-[0_0_20px_var(--ark-accent-soft)]"
      />
      <div
        style={{ position: 'fixed', top: bubbleTop, left: bubbleLeft, width: bubbleWidth, zIndex: 10000, pointerEvents: 'auto' }}
        className="rounded-xl border border-ark-border bg-ark-surface p-4 shadow-2xl"
      >
        <div className="text-sm font-semibold text-ark-text">{step.title}</div>
        <p className="mt-1.5 text-xs leading-5 text-ark-text-muted">{step.body}</p>
        {showingAction ? (
          <div className="mt-3 text-xs font-medium text-[var(--ark-accent)]">请点击高亮操作继续</div>
        ) : (
          <button
            type="button"
            onClick={() => setExplainedStepKey(step.key)}
            className="mt-3 h-8 w-full rounded-lg bg-[var(--ark-accent)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            继续查看下一步
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
