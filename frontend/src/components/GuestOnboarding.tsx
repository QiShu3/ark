import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Lock, GraduationCap, BookOpen, PenTool, Music, Loader2 } from 'lucide-react';
import { useAuthStore } from '../lib/auth';
import { apiJson } from '../lib/api';
import { clearAppRegistryCache } from '../lib/appRegistry';
import { ONBOARDING_EVENTS } from '../lib/onboardingEvents';

const STORAGE_KEY = 'ark-guest-onboarding-v1';

type GuestPhase = 'idle' | 'event-type' | 'major' | 'creating' | 'guide-event' | 'guide-event-wait' | 'guide-start' | 'done';

// --- Event type options ---

type EventTypeOption = {
  id: string;
  label: string;
  description: string;
  icon: typeof GraduationCap;
  available: boolean;
};

const EVENT_TYPES: EventTypeOption[] = [
  { id: 'kaoyan', label: '考研', description: '全国硕士研究生统一招生考试', icon: GraduationCap, available: true },
  { id: 'kaogong', label: '考公', description: '公务员考试', icon: BookOpen, available: false },
  { id: 'lunwen', label: '写论文', description: '学术论文写作', icon: PenTool, available: false },
  { id: 'yinyue', label: '学音乐', description: '音乐学习与练习', icon: Music, available: false },
];

// --- Major options (for kaoyan) ---

type MajorOption = {
  id: string;
  label: string;
  available: boolean;
};

const MAJORS: MajorOption[] = [
  { id: '22408', label: '408计算机学科专业基础', available: true },
  { id: 'law', label: '法学', available: false },
  { id: 'biology', label: '生物学', available: false },
  { id: 'chemistry', label: '化学', available: false },
  { id: 'medicine', label: '医学', available: false },
  { id: 'finance', label: '金融学', available: false },
  { id: 'education', label: '教育学', available: false },
];

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
    id: 'start-learning',
    anchor: 'workflow-start-button',
    title: '开始学习',
    body: '准备好后，点击这里开始你的学习工作流。',
    placement: 'left',
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
    const el = document.querySelector<HTMLElement>(`[data-onboarding-anchor="${anchor}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    setRect(el.getBoundingClientRect());
    const observer = new ResizeObserver(() => {
      setRect(el.getBoundingClientRect());
    });
    observer.observe(el);
    window.addEventListener('scroll', () => setRect(el.getBoundingClientRect()), { passive: true });
    window.addEventListener('resize', () => setRect(el.getBoundingClientRect()), { passive: true });
    return () => observer.disconnect();
  }, [anchor, visible]);

  return rect;
}

// --- Highlight overlay + bubble ---

function GuideHighlight({
  step,
  visible,
  onAction,
}: {
  step: GuideStep;
  visible: boolean;
  onAction: () => void;
}) {
  const rect = useAnchorRect(step.anchor, visible);

  useEffect(() => {
    if (!visible || !rect) return;
    const el = document.querySelector<HTMLElement>(`[data-onboarding-anchor="${step.anchor}"]`);
    if (!el) return;
    const handler = () => onAction();
    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, [visible, rect, step.anchor, onAction]);

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
        <button
          type="button"
          onClick={onAction}
          className="w-full h-9 rounded-lg text-xs font-medium text-white transition-all"
          style={{ background: '#3b82f6' }}
        >
          {step.id === 'event-button' ? '去看看' : '知道了'}
        </button>
      </div>
    </>,
    document.body,
  );
}

// --- Main component ---

export default function GuestOnboarding() {
  const isGuest = useAuthStore((s) => s.user?.is_guest ?? false);
  const [phase, setPhase] = useState<GuestPhase>('idle');
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
  const [selectedMajor, setSelectedMajor] = useState<string | null>(null);
  const [guideStep, setGuideStep] = useState(0);

  // Check if already completed
  useEffect(() => {
    if (!isGuest) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === 'done') {
        setPhase('done');
        return;
      }
    } catch { /* ignore */ }
    setPhase('event-type');
  }, [isGuest]);

  // Listen for event overview closed (guide step transition)
  useEffect(() => {
    if (phase !== 'guide-event-wait') return;
    const handler = () => {
      setPhase('guide-start');
      setGuideStep(1);
    };
    window.addEventListener(ONBOARDING_EVENTS.eventOverviewClosed, handler);
    return () => window.removeEventListener(ONBOARDING_EVENTS.eventOverviewClosed, handler);
  }, [phase]);

  const handleEventTypeSelect = useCallback((typeId: string) => {
    setSelectedEventType(typeId);
    setPhase('major');
  }, []);

  const handleMajorSelect = useCallback(async (majorId: string) => {
    setSelectedMajor(majorId);
    setPhase('creating');
    try {
      await apiJson('/auth/guest/setup-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: selectedEventType, major: majorId }),
      });
      // Refresh app registry so new sub-apps appear
      clearAppRegistryCache();
      setPhase('guide-event');
    } catch (err) {
      console.error('Guest event setup failed:', err);
      // Still proceed to guide
      setPhase('guide-event');
    }
  }, [selectedEventType]);

  const handleGuideAction = useCallback(() => {
    if (phase === 'guide-event') {
      // User clicked "去看看" — highlight the event button, they should click it
      setPhase('guide-event-wait');
    }
  }, [phase]);

  const handleGuideStartAction = useCallback(() => {
    // User acknowledged "开始学习" step
    try {
      window.localStorage.setItem(STORAGE_KEY, 'done');
    } catch { /* ignore */ }
    setPhase('done');
  }, []);

  if (!isGuest || phase === 'idle' || phase === 'done') return null;

  return (
    <>
      {/* Event Type Selection Modal */}
      {phase === 'event-type' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-3xl border border-ark-border bg-ark-surface p-8 mx-4 shadow-2xl">
            <h2 className="text-2xl font-bold text-ark-text text-center mb-2">选择你的目标</h2>
            <p className="text-sm text-ark-text-muted text-center mb-8">选择一个事件类型开始你的学习之旅</p>

            <div className="grid grid-cols-2 gap-4">
              {EVENT_TYPES.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={!opt.available}
                    onClick={() => opt.available && handleEventTypeSelect(opt.id)}
                    className={`relative flex flex-col items-center gap-3 rounded-2xl border p-6 transition-all ${
                      opt.available
                        ? 'border-ark-border bg-ark-surface-subtle hover:border-[var(--ark-accent)] hover:bg-[var(--ark-accent-soft)] cursor-pointer'
                        : 'border-ark-border bg-ark-surface-subtle opacity-40 cursor-not-allowed'
                    }`}
                  >
                    {!opt.available && (
                      <Lock className="absolute top-3 right-3 h-4 w-4 text-ark-text-faint" />
                    )}
                    <Icon className={`h-8 w-8 ${opt.available ? 'text-[var(--ark-accent)]' : 'text-ark-text-faint'}`} />
                    <span className="text-base font-semibold text-ark-text">{opt.label}</span>
                    <span className="text-xs text-ark-text-muted text-center">{opt.description}</span>
                    {!opt.available && (
                      <span className="text-[10px] text-ark-text-faint">即将开放</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Major Selection Modal */}
      {phase === 'major' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-3xl border border-ark-border bg-ark-surface p-8 mx-4 shadow-2xl">
            <button
              type="button"
              onClick={() => { setPhase('event-type'); setSelectedEventType(null); }}
              className="text-sm text-ark-text-muted hover:text-ark-text mb-4 flex items-center gap-1 transition-colors"
            >
              ← 返回
            </button>
            <h2 className="text-2xl font-bold text-ark-text text-center mb-2">选择目标专业</h2>
            <p className="text-sm text-ark-text-muted text-center mb-8">选择你要报考的专业方向</p>

            <div className="space-y-3">
              {MAJORS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!opt.available}
                  onClick={() => opt.available && handleMajorSelect(opt.id)}
                  className={`relative flex items-center gap-4 w-full rounded-xl border p-4 transition-all text-left ${
                    opt.available
                      ? 'border-ark-border bg-ark-surface-subtle hover:border-[var(--ark-accent)] hover:bg-[var(--ark-accent-soft)] cursor-pointer'
                      : 'border-ark-border bg-ark-surface-subtle opacity-40 cursor-not-allowed'
                  }`}
                >
                  {!opt.available && (
                    <Lock className="absolute top-3 right-3 h-4 w-4 text-ark-text-faint" />
                  )}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    opt.available ? 'bg-[var(--ark-accent-soft)]' : 'bg-ark-surface-subtle'
                  }`}>
                    <GraduationCap className={`h-5 w-5 ${opt.available ? 'text-[var(--ark-accent)]' : 'text-ark-text-faint'}`} />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-ark-text">{opt.label}</span>
                  </div>
                  {!opt.available && (
                    <span className="text-[10px] text-ark-text-faint">即将开放</span>
                  )}
                </button>
              ))}
            </div>
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
      {(phase === 'guide-event' || phase === 'guide-event-wait') && (
        <GuideHighlight
          step={GUIDE_STEPS[0]}
          visible={true}
          onAction={handleGuideAction}
        />
      )}

      {/* Guided tour: highlight start learning */}
      {phase === 'guide-start' && (
        <GuideHighlight
          step={GUIDE_STEPS[1]}
          visible={true}
          onAction={handleGuideStartAction}
        />
      )}
    </>
  );
}
