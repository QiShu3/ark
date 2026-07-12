import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, Loader2 } from 'lucide-react';
import { useAuthStore } from '../lib/auth';
import { apiJson } from '../lib/api';
import { clearAppRegistryCache } from '../lib/appRegistry';
import { GUEST_ONBOARDING_RESTART_EVENT, GUEST_ONBOARDING_STORAGE_KEY, ONBOARDING_EVENTS } from '../lib/onboardingEvents';

const STORAGE_KEY = GUEST_ONBOARDING_STORAGE_KEY;

type GuestPhase =
  | 'idle'
  | 'experience'
  | 'creating'
  | 'guide-event'
  | 'guide-event-close'
  | 'guide-start'
  | 'guide-learning-select'
  | 'guide-workflow-start'
  | 'learning-open'
  | 'done';

// --- Guided tour steps ---

type GuideStep = {
  id: string;
  anchor: string;
  title: string;
  body: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
};

const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'event-button',
    anchor: 'primary-event',
    title: '这是你的事件',
    body: '点击这里查看 22408 考研事件的详细内容和倒计时。',
    placement: 'right',
  },
  {
    id: 'close-event-workbench',
    anchor: 'event-workbench-close',
    title: '先关闭事件工作台',
    body: '事件已经准备好了。关闭工作台回到首页，继续启动第一轮学习。',
    placement: 'left',
  },
  {
    id: 'start-learning',
    anchor: 'guest-learning-entry',
    title: '开始学习',
    body: '准备好后，点击这里选择并启动你的 408 学习工作流。',
    placement: 'left',
  },
  {
    id: 'select-learning-app',
    anchor: 'workflow-sub-app',
    title: '选择学习应用',
    body: '先选择 408 学习应用，再查看本次学习的任务安排。',
    placement: 'left',
  },
  {
    id: 'start-workflow',
    anchor: 'workflow-start-button',
    title: '启动第一轮学习',
    body: '确认任务后，点击这里启动工作流，进入第一道练习。',
    placement: 'top',
  },
];

// --- Helper: get anchor element rect ---

function useAnchorRect(anchor: string | null, visible: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!anchor || !visible) {
      setRect(null);
      return;
    }
    let observedElement: HTMLElement | null = null;
    const observer = new ResizeObserver(() => {
      if (observedElement) setRect(observedElement.getBoundingClientRect());
    });
    const updateRect = () => {
      const element = document.querySelector<HTMLElement>(`[data-onboarding-anchor="${anchor}"]`);
      if (!element) {
        setRect(null);
        return;
      }
      if (element !== observedElement) {
        observer.disconnect();
        observedElement = element;
        observer.observe(element);
      }
      setRect(element.getBoundingClientRect());
    };
    const mutationObserver = new MutationObserver(updateRect);

    updateRect();
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', updateRect, { passive: true });
    window.addEventListener('resize', updateRect, { passive: true });
    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('scroll', updateRect);
      window.removeEventListener('resize', updateRect);
    };
  }, [anchor, visible]);

  return rect;
}

// --- Highlight overlay + bubble ---

function GuideHighlight({
  step,
  visible,
  onTargetAction,
  onBubbleAction,
  onSkip,
}: {
  step: GuideStep;
  visible: boolean;
  onTargetAction: () => void;
  onBubbleAction?: () => void;
  onSkip: () => void;
}) {
  const rect = useAnchorRect(step.anchor, visible);

  useEffect(() => {
    if (!visible || !rect) return;
    const el = document.querySelector<HTMLElement>(`[data-onboarding-anchor="${step.anchor}"]`);
    if (!el) return;
    const handler = () => onTargetAction();
    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, [visible, rect, step.anchor, onTargetAction]);

  if (!visible || !rect) return null;

  const pad = 8;
  const top = rect.top - pad;
  const left = rect.left - pad;
  const width = rect.width + pad * 2;
  const height = rect.height + pad * 2;

  // Bubble position
  let bubbleTop: number;
  let bubbleLeft: number;
  const bubbleWidth = 280;
  switch (step.placement) {
    case 'bottom':
      bubbleTop = top + height + 12;
      bubbleLeft = left + width / 2 - bubbleWidth / 2;
      break;
    case 'top':
      bubbleTop = top - 12 - 100;
      bubbleLeft = left + width / 2 - bubbleWidth / 2;
      break;
    case 'right':
      bubbleTop = top + height / 2 - 50;
      bubbleLeft = left + width + 12;
      break;
    case 'left':
      bubbleTop = top + height / 2 - 50;
      bubbleLeft = left - bubbleWidth - 12;
      break;
  }

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 9998,
    pointerEvents: 'none',
  };

  return createPortal(
    <>
      {/* 4-side masks */}
      <div style={overlayStyle}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: top, background: 'rgba(0,0,0,0.5)' }} />
        <div style={{ position: 'absolute', top: top + height, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)' }} />
        <div style={{ position: 'absolute', top, left: 0, width: left, height, background: 'rgba(0,0,0,0.5)' }} />
        <div style={{ position: 'absolute', top, left: left + width, right: 0, height, background: 'rgba(0,0,0,0.5)' }} />
      </div>

      {/* Highlight border */}
      <div
        style={{
          position: 'fixed',
          top,
          left,
          width,
          height,
          borderRadius: 12,
          border: '3px solid var(--ark-accent, #3b82f6)',
          zIndex: 9999,
          pointerEvents: 'none',
          boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)',
        }}
      />

      {/* Bubble */}
      <div
        style={{
          position: 'fixed',
          top: bubbleTop,
          left: Math.max(16, Math.min(bubbleLeft, window.innerWidth - bubbleWidth - 16)),
          width: bubbleWidth,
          zIndex: 10000,
          pointerEvents: 'auto',
        }}
        className="rounded-2xl border border-ark-border bg-ark-surface p-5 shadow-2xl"
      >
        <div className="text-sm font-bold text-ark-text mb-1">{step.title}</div>
        <div className="text-xs text-ark-text-muted leading-relaxed mb-3">{step.body}</div>
        {onBubbleAction ? (
          <button
            type="button"
            onClick={onBubbleAction}
            className="w-full h-9 rounded-lg text-xs font-medium text-white transition-all"
            style={{ background: '#3b82f6' }}
          >
            去看看
          </button>
        ) : (
          <div className="text-xs font-medium text-[var(--ark-accent)]">请点击高亮按钮继续</div>
        )}
        <button
          type="button"
          onClick={onSkip}
          className="mt-3 w-full text-center text-xs text-ark-text-muted transition-colors hover:text-ark-text"
        >
          跳过引导
        </button>
      </div>
    </>,
    document.body,
  );
}

// --- Main component ---

export default function GuestOnboarding() {
  const user = useAuthStore((s) => s.user);
  const isGuest = user?.is_guest ?? false;
  const storageKey = `${STORAGE_KEY}:${user?.id ?? 'guest'}`;
  const [phase, setPhase] = useState<GuestPhase>('idle');

  // Check if already completed
  useEffect(() => {
    if (!isGuest) return;
    try {
      if (window.localStorage.getItem(storageKey) === 'done') {
        setPhase('done');
        return;
      }
    } catch { /* ignore */ }
    setPhase('experience');
  }, [isGuest, storageKey]);

  useEffect(() => {
    if (!isGuest) return;
    const handler = () => setPhase('experience');
    window.addEventListener(GUEST_ONBOARDING_RESTART_EVENT, handler);
    return () => window.removeEventListener(GUEST_ONBOARDING_RESTART_EVENT, handler);
  }, [isGuest]);

  // Listen for event overview closed (guide step transition)
  useEffect(() => {
    if (phase !== 'guide-event-close') return;
    const handler = () => {
      setPhase('guide-start');
    };
    window.addEventListener(ONBOARDING_EVENTS.eventOverviewClosed, handler);
    return () => window.removeEventListener(ONBOARDING_EVENTS.eventOverviewClosed, handler);
  }, [phase]);

  // The highlighted event card itself is the primary action. Treat opening it
  // the same as the bubble CTA so the guide does not cover the event overview.
  useEffect(() => {
    if (phase !== 'guide-event') return;
    const handler = () => setPhase('guide-event-close');
    window.addEventListener(ONBOARDING_EVENTS.primaryEventOpened, handler);
    return () => window.removeEventListener(ONBOARDING_EVENTS.primaryEventOpened, handler);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'guide-workflow-start' && phase !== 'learning-open') return;
    const handler = () => {
      try {
        window.localStorage.setItem(storageKey, 'done');
      } catch { /* ignore */ }
      setPhase('done');
    };
    window.addEventListener(ONBOARDING_EVENTS.workflowStarted, handler);
    return () => window.removeEventListener(ONBOARDING_EVENTS.workflowStarted, handler);
  }, [phase, storageKey]);

  const handleExperienceStart = useCallback(async () => {
    setPhase('creating');
    try {
      await apiJson('/auth/guest/setup-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'kaoyan', major: '22408' }),
      });
      // Refresh app registry so new sub-apps appear
      clearAppRegistryCache();
      setPhase('guide-event');
    } catch (err) {
      console.error('Guest event setup failed:', err);
      // Still proceed to guide
      setPhase('guide-event');
    }
  }, []);

  const handleGuideEventAction = useCallback(() => {
    setPhase('guide-event-close');
  }, []);

  const handleLearningEntryClick = useCallback(() => {
    setPhase('guide-learning-select');
  }, []);

  const handleLearningAppClick = useCallback(() => {
    setPhase('guide-workflow-start');
  }, []);

  const handleWorkflowStartClick = useCallback(() => {
    setPhase('learning-open');
  }, []);

  const handleSkip = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, 'done');
    } catch { /* ignore */ }
    setPhase('done');
  }, [storageKey]);

  if (!isGuest || phase === 'idle' || phase === 'done') return null;

  return (
    <>
      {/* Guest experience selection modal */}
      {phase === 'experience' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-3xl border border-ark-border bg-ark-surface p-8 mx-4 shadow-2xl">
            <h2 className="text-2xl font-bold text-ark-text text-center mb-2">开始 408 考研体验</h2>
            <p className="text-sm text-ark-text-muted text-center mb-8">游客体验目前提供计算机 408 学习路径</p>

            <button
              type="button"
              onClick={handleExperienceStart}
              className="flex w-full items-center gap-4 rounded-2xl border border-ark-border bg-ark-surface-subtle p-5 text-left transition-all hover:border-[var(--ark-accent)] hover:bg-[var(--ark-accent-soft)]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--ark-accent-soft)]">
                <GraduationCap className="h-6 w-6 text-[var(--ark-accent)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-ark-text">408 计算机学科专业基础</div>
                <div className="mt-1 text-xs leading-relaxed text-ark-text-muted">创建 408 考研事件和配套学习应用</div>
              </div>
              <span className="shrink-0 text-sm font-medium text-[var(--ark-accent)]">开始体验</span>
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="mt-4 w-full text-center text-sm text-ark-text-muted transition-colors hover:text-ark-text"
            >
              跳过引导
            </button>
          </div>
        </div>
      )}

      {/* Creating overlay */}
      {phase === 'creating' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-ark-border bg-ark-surface p-10 mx-4 shadow-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--ark-accent)]" />
            <span className="text-sm text-ark-text-muted">正在为你准备学习环境...</span>
          </div>
        </div>
      )}

      {/* Guided tour: highlight event button */}
      {phase === 'guide-event' && (
        <GuideHighlight
          step={GUIDE_STEPS[0]}
          visible={true}
          onTargetAction={handleGuideEventAction}
          onSkip={handleSkip}
        />
      )}

      {phase === 'guide-event-close' && (
        <GuideHighlight
          step={GUIDE_STEPS[1]}
          visible={true}
          onTargetAction={() => undefined}
          onSkip={handleSkip}
        />
      )}

      {/* Guided tour: highlight start learning */}
      {phase === 'guide-start' && (
        <GuideHighlight
          step={GUIDE_STEPS[2]}
          visible={true}
          onTargetAction={handleLearningEntryClick}
          onSkip={handleSkip}
        />
      )}

      {phase === 'guide-learning-select' && (
        <GuideHighlight
          step={GUIDE_STEPS[3]}
          visible={true}
          onTargetAction={handleLearningAppClick}
          onSkip={handleSkip}
        />
      )}

      {phase === 'guide-workflow-start' && (
        <GuideHighlight
          step={GUIDE_STEPS[4]}
          visible={true}
          onTargetAction={handleWorkflowStartClick}
          onSkip={handleSkip}
        />
      )}
    </>
  );
}
