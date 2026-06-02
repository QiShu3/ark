import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import AppModalFrame from './AppModalFrame';

import {
  FIRST_GUIDE_STORAGE_KEY,
  FIRST_GUIDE_RESTART_EVENT,
  FIRST_GUIDE_EVENTS,
  type FirstGuideEventName,
} from '../lib/onboardingEvents';

type OnboardingStep = {
  id: string;
  anchor: string;
  title: string;
  body: string;
  waitFor: FirstGuideEventName;
  placement?: 'top' | 'bottom' | 'left' | 'right';
};

type FirstGuidePhase = 'idle' | 'intro' | 'steps' | 'complete';

type AnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
} | null;

const STEPS: OnboardingStep[] = [
  {
    id: 'primary-event',
    anchor: 'primary-event',
    title: '先从主事件开始',
    body: 'Ark 会围绕一个阶段目标组织安排、工作流和专注记录。先点击这里进入事件总览。',
    waitFor: FIRST_GUIDE_EVENTS.primaryEventOpened,
    placement: 'right',
  },
  {
    id: 'add-event',
    anchor: 'event-add-button',
    title: '创建你的第一个事件',
    body: '点击“添加事件”，用模板快速生成一套可执行的学习安排。',
    waitFor: FIRST_GUIDE_EVENTS.addEventOpened,
    placement: 'top',
  },
  {
    id: 'event-store',
    anchor: 'event-store-button',
    title: '从事件商店选择模板',
    body: '这里有内置事件模板。点击“事件商店”，选择适合当前目标的模板。',
    waitFor: FIRST_GUIDE_EVENTS.eventStoreOpened,
    placement: 'bottom',
  },
  {
    id: 'store-template',
    anchor: 'event-store-template-kaoyan',
    title: '查看考研英语模板',
    body: '点击模板先查看内容。这个模板会带出事件、安排和工作流，让你直接看到 Ark 的完整使用链路。',
    waitFor: FIRST_GUIDE_EVENTS.storeTemplateSelected,
    placement: 'left',
  },
  {
    id: 'save-template',
    anchor: 'event-store-save-selected',
    title: '保存到我的模板',
    body: '确认预览内容后，点击弹窗里的“保存”，把内置模板保存到你的事件模板中。',
    waitFor: FIRST_GUIDE_EVENTS.storeTemplateSaved,
    placement: 'left',
  },
  {
    id: 'apply-template',
    anchor: 'event-template-apply-button',
    title: '套用刚保存的模板',
    body: '回到添加事件窗口后，点击“套用模板”，表单会自动填入事件、安排和工作流草案。',
    waitFor: FIRST_GUIDE_EVENTS.templateApplied,
    placement: 'bottom',
  },
  {
    id: 'create-event',
    anchor: 'event-create-button',
    title: '确认并创建事件',
    body: '模板内容已经填好。向下滑到底部，点击“创建事件”，把它变成你的正式计划。',
    waitFor: FIRST_GUIDE_EVENTS.eventCreated,
    placement: 'top',
  },
  {
    id: 'close-event-overview',
    anchor: 'event-overview-close',
    title: '回到首页查看结果',
    body: '事件已经创建完成。关闭事件总览，回到首页看看它带来的安排和工作流。',
    waitFor: FIRST_GUIDE_EVENTS.eventOverviewClosed,
    placement: 'left',
  },
  {
    id: 'open-arrangements',
    anchor: 'home-arrangements',
    title: '模板已经生成安排',
    body: '点击首页右侧的“安排”，可以看到新事件生成的任务和日程。',
    waitFor: FIRST_GUIDE_EVENTS.arrangementsOpened,
    placement: 'left',
  },
  {
    id: 'close-arrangements',
    anchor: 'arrangements-close',
    title: '先回到首页',
    body: '看完模板生成的安排后，关闭安排管理，继续查看对应的工作流。',
    waitFor: FIRST_GUIDE_EVENTS.arrangementsClosed,
    placement: 'left',
  },
  {
    id: 'open-workflow-settings',
    anchor: 'workflow-settings-button',
    title: '模板也生成了工作流',
    body: '点击第二行工作流板块右侧的齿轮，可以看到模板创建的专注流程。',
    waitFor: FIRST_GUIDE_EVENTS.workflowSettingsOpened,
    placement: 'left',
  },
  {
    id: 'close-workflow-settings',
    anchor: 'workflow-settings-close',
    title: '回到首页启动它',
    body: '确认工作流已经生成后，关闭工作流预设窗口，准备开始第一轮专注。',
    waitFor: FIRST_GUIDE_EVENTS.workflowSettingsClosed,
    placement: 'left',
  },
  {
    id: 'start-workflow',
    anchor: 'workflow-start-button',
    title: '从一次专注开始推进',
    body: '点击“开始工作流”，Ark 会进入这个事件对应的专注节奏。',
    waitFor: FIRST_GUIDE_EVENTS.workflowStarted,
    placement: 'left',
  },
  {
    id: 'end-phase',
    anchor: 'focus-work-complete-round',
    title: '完成本轮专注',
    body: '在专注工作弹窗里点击“结束本轮专注”，这会结束当前阶段并回到工作流节奏。',
    waitFor: FIRST_GUIDE_EVENTS.workflowPhaseEnded,
    placement: 'bottom',
  },
  {
    id: 'stop-workflow',
    anchor: 'workflow-stop-button',
    title: '随时可以结束工作流',
    body: '在运行态悬浮到右侧第一行第一个板块，点击右上角的结束按钮，就能退出本次工作流。',
    waitFor: FIRST_GUIDE_EVENTS.workflowStopped,
    placement: 'left',
  },
];

function getStoredState(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(FIRST_GUIDE_STORAGE_KEY);
}

function readAnchorRect(anchor: string): AnchorRect {
  const element = document.querySelector<HTMLElement>(`[data-onboarding-anchor="${anchor}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getBubbleStyle(rect: AnchorRect, placement: OnboardingStep['placement']): CSSProperties {
  const bubbleWidth = 320;
  const margin = 16;
  if (!rect) {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: bubbleWidth,
    };
  }

  const middleY = rect.top + rect.height / 2;
  const middleX = rect.left + rect.width / 2;
  const maxLeft = window.innerWidth - bubbleWidth - margin;
  const clampLeft = (value: number) => Math.max(margin, Math.min(maxLeft, value));
  const clampTop = (value: number) => Math.max(margin, Math.min(window.innerHeight - 180, value));

  if (placement === 'left') {
    return {
      left: clampLeft(rect.left - bubbleWidth - margin),
      top: clampTop(middleY - 80),
      width: bubbleWidth,
    };
  }
  if (placement === 'right') {
    return {
      left: clampLeft(rect.left + rect.width + margin),
      top: clampTop(middleY - 80),
      width: bubbleWidth,
    };
  }
  if (placement === 'top') {
    return {
      left: clampLeft(middleX - bubbleWidth / 2),
      top: clampTop(rect.top - 180),
      width: bubbleWidth,
    };
  }
  return {
    left: clampLeft(middleX - bubbleWidth / 2),
    top: clampTop(rect.top + rect.height + margin),
    width: bubbleWidth,
  };
}

export default function HomeOnboarding() {
  const [phase, setPhase] = useState<FirstGuidePhase>(() => {
    const storedState = getStoredState();
    return storedState === 'done' || storedState === 'skipped' ? 'idle' : 'intro';
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<AnchorRect>(null);
  const step = STEPS[stepIndex];

  useEffect(() => {
    if (phase !== 'steps' || !step) return;
    const syncRect = () => setAnchorRect(readAnchorRect(step.anchor));
    syncRect();
    const frame = window.requestAnimationFrame(syncRect);
    const timer = window.setInterval(syncRect, 400);
    window.addEventListener('resize', syncRect);
    window.addEventListener('scroll', syncRect, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener('resize', syncRect);
      window.removeEventListener('scroll', syncRect, true);
    };
  }, [phase, step]);

  useEffect(() => {
    if (phase !== 'steps' || !step) return;
    const handler = () => {
      if (stepIndex >= STEPS.length - 1) {
        setAnchorRect(null);
        setPhase('complete');
        return;
      }
      setStepIndex((current) => current + 1);
    };
    window.addEventListener(step.waitFor, handler);
    return () => window.removeEventListener(step.waitFor, handler);
  }, [phase, step, stepIndex]);

  useEffect(() => {
    if (phase === 'idle') return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      window.localStorage.setItem(FIRST_GUIDE_STORAGE_KEY, 'skipped');
      setPhase('idle');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase]);

  useEffect(() => {
    const handler = () => {
      setStepIndex(0);
      setAnchorRect(null);
      setPhase('intro');
    };
    window.addEventListener(FIRST_GUIDE_RESTART_EVENT, handler);
    return () => window.removeEventListener(FIRST_GUIDE_RESTART_EVENT, handler);
  }, []);

  const highlightStyle = useMemo<CSSProperties>(() => {
    if (!anchorRect) return { display: 'none' };
    return {
      top: anchorRect.top - 8,
      left: anchorRect.left - 8,
      width: anchorRect.width + 16,
      height: anchorRect.height + 16,
    };
  }, [anchorRect]);

  if (phase === 'idle') return null;

  if (phase === 'intro') {
    return createPortal(
      <AppModalFrame
        open={true}
        zIndexClassName="z-[120]"
        ariaLabel="首次引导"
        backdropClassName="bg-ark-overlay"
        contentClassName="px-4"
        panelClassName="w-[420px] max-w-[94vw] rounded-2xl border border-cyan-200/20 bg-ark-surface-strong p-5 text-ark-text shadow-2xl backdrop-blur-md"
      >
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-200/60">首次引导</div>
          <h2 className="mt-3 text-xl font-semibold">欢迎来到 Ark</h2>
          <p className="mt-3 text-sm leading-6 text-ark-text">
            我会带你走一遍从创建事件、生成安排，到启动工作流的完整链路。
          </p>
          <p className="mt-2 text-sm leading-6 text-ark-text-muted">
            全程只需要按提示点击，不会影响你之后自由使用。
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-full border border-ark-border px-4 py-2 text-sm text-ark-text-muted transition hover:border-ark-border hover:text-ark-text"
              onClick={() => {
                window.localStorage.setItem(FIRST_GUIDE_STORAGE_KEY, 'skipped');
                setPhase('idle');
              }}
            >
              稍后再说
            </button>
            <button
              type="button"
              className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-200"
              onClick={() => {
                setStepIndex(0);
                setPhase('steps');
              }}
            >
              开始体验
            </button>
          </div>
      </AppModalFrame>,
      document.body,
    );
  }

  if (phase === 'complete') {
    return createPortal(
      <AppModalFrame
        open={true}
        zIndexClassName="z-[120]"
        ariaLabel="首次引导"
        backdropClassName="bg-ark-overlay"
        contentClassName="px-4"
        panelClassName="w-[460px] max-w-[94vw] rounded-2xl border border-cyan-200/20 bg-ark-surface-strong p-5 text-ark-text shadow-2xl backdrop-blur-md"
      >
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-200/60">首次引导</div>
          <h2 className="mt-3 text-xl font-semibold">体验完成</h2>
          <p className="mt-3 text-sm leading-6 text-ark-text">
            你刚刚走完了一条 Ark 的核心链路：事件会生成安排，安排可以进入工作流，工作流再把专注推进下去。
          </p>
          <p className="mt-2 text-sm leading-6 text-ark-text-muted">
            之后你可以从导航栏的书本按钮随时重新打开这段引导。
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-200"
              onClick={() => {
                window.localStorage.setItem(FIRST_GUIDE_STORAGE_KEY, 'done');
                setPhase('idle');
              }}
            >
              知道了
            </button>
          </div>
      </AppModalFrame>,
      document.body,
    );
  }

  if (!step) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[120]" aria-live="polite">
      {anchorRect ? (
        <>
          {/* Top backdrop */}
          <div
            className="pointer-events-auto absolute top-0 left-0 right-0 bg-ark-surface-subtle"
            style={{ height: Math.max(0, anchorRect.top - 8) }}
          />
          {/* Bottom backdrop */}
          <div
            className="pointer-events-auto absolute bottom-0 left-0 right-0 bg-ark-surface-subtle"
            style={{ top: Math.max(0, anchorRect.top + anchorRect.height + 8) }}
          />
          {/* Left backdrop */}
          <div
            className="pointer-events-auto absolute left-0 bg-ark-surface-subtle"
            style={{
              top: Math.max(0, anchorRect.top - 8),
              height: Math.max(0, anchorRect.height + 16),
              width: Math.max(0, anchorRect.left - 8),
            }}
          />
          {/* Right backdrop */}
          <div
            className="pointer-events-auto absolute right-0 bg-ark-surface-subtle"
            style={{
              top: Math.max(0, anchorRect.top - 8),
              height: Math.max(0, anchorRect.height + 16),
              left: Math.max(0, anchorRect.left + anchorRect.width + 8),
            }}
          />
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-ark-surface-subtle" />
      )}
      <div
        className="absolute rounded-2xl border-2 border-cyan-300/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.28),0_0_28px_rgba(103,232,249,0.45)] transition-all duration-200"
        style={highlightStyle}
      />
      <div
        role="dialog"
        aria-label="首次体验引导"
        className="pointer-events-none absolute rounded-2xl border border-cyan-200/20 bg-ark-surface-strong p-4 text-ark-text shadow-2xl backdrop-blur-md"
        style={getBubbleStyle(anchorRect, step.placement)}
      >
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-200/60">
          {stepIndex + 1} / {STEPS.length}
        </div>
        <h2 className="mt-2 text-lg font-semibold">{step.title}</h2>
        <p className="mt-2 text-sm leading-6 text-ark-text">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            className="pointer-events-auto rounded-full border border-ark-border px-3 py-1.5 text-sm text-ark-text-muted transition hover:border-ark-border hover:text-ark-text"
            onClick={() => {
              window.localStorage.setItem(FIRST_GUIDE_STORAGE_KEY, 'skipped');
              setPhase('idle');
            }}
          >
            稍后再说
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
