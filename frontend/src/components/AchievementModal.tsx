import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { apiJson } from '../lib/api';
import AppModalFrame from './AppModalFrame';
import AchievementBadgeCard from './AchievementBadgeCard';
import type { AchievementEventItem, AchievementSummary } from './achievementTypes';

const EXIT_ANIMATION_MS = 200;

type AchievementModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialSummary: AchievementSummary | null;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);
}

export default function AchievementModal({ isOpen, onClose, initialSummary, returnFocusRef }: AchievementModalProps) {
  const [events, setEvents] = useState<AchievementEventItem[]>([]);
  const [summary, setSummary] = useState<AchievementSummary | null>(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [isRendered, setIsRendered] = useState(isOpen);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      // Re-opening needs to cancel the exit state immediately so the portal stays mounted.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRendered(true);
      return;
    }

    if (!isRendered) return;

    closeTimeoutRef.current = window.setTimeout(() => {
      setIsRendered(false);
      closeTimeoutRef.current = null;
    }, EXIT_ANIMATION_MS);

    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [isOpen, isRendered]);

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const [nextEvents, nextSummary] = await Promise.all([
          apiJson<AchievementEventItem[]>('/todo/events'),
          initialSummary ? Promise.resolve(initialSummary) : apiJson<AchievementSummary>('/todo/achievements/summary'),
        ]);
        setEvents(nextEvents);
        setSummary(nextSummary);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载成就失败');
      }
    })();
  }, [initialSummary, isOpen]);

  useEffect(() => {
    if (!isRendered) return;

    const { overflow: bodyOverflow } = document.body.style;
    const { overflow: htmlOverflow } = document.documentElement.style;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [isRendered]);

  useEffect(() => {
    if (!isRendered) return;

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement || !dialogRef.current?.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement || !dialogRef.current?.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const returnFocusTarget = returnFocusRef?.current ?? null;

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      const target = returnFocusTarget ?? previousActive;
      if (target) {
        target.focus();
      }
    };
  }, [isRendered, returnFocusRef]);

  async function handleSelectEvent(eventId: string): Promise<void> {
    try {
      const nextSummary = await apiJson<AchievementSummary>(`/todo/achievements/summary?event_id=${eventId}`);
      setSummary(nextSummary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换事件失败');
    }
  }

  if (!isRendered) return null;

  const overlayAnimationClass = isOpen ? 'animate-in fade-in duration-200' : 'achievement-modal-overlay-exit';
  const surfaceAnimationClass = isOpen ? 'animate-in zoom-in-95 duration-200' : 'achievement-modal-surface-exit';

  return createPortal(
    <AppModalFrame
      open={isRendered}
      onClose={onClose}
      zIndexClassName="z-[80]"
      ariaLabel="成就弹窗"
      disableDefaultAnimation={true}
      backdropClassName={`bg-ark-overlay backdrop-blur-sm ${overlayAnimationClass}`}
      contentClassName="items-start px-4 md:items-center md:px-6"
      panelClassName={`w-[960px] max-w-[94vw] overflow-y-auto rounded-3xl p-6 md:p-8 ${surfaceAnimationClass}`}
      panelRef={dialogRef}
    >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-ark-text">
              {summary?.active_event ? `成就 · ${summary.active_event.name}` : '成就'}
            </h3>
            <p className="mt-1.5 text-xs text-ark-text-faint">上半部分跟随事件切换，下半部分的全局成就始终显示。</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text transition-colors duration-150"
            aria-label="关闭成就弹窗"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {events.map((eventItem) => (
            <button
              key={eventItem.id}
              type="button"
              onClick={() => void handleSelectEvent(eventItem.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 hover:scale-[1.02] ${
                summary?.active_event?.id === eventItem.id
                  ? 'bg-[var(--ark-arrangement-accent)] text-slate-950 shadow-md shadow-amber-500/10'
                  : 'border border-ark-border bg-ark-surface-subtle text-ark-text hover:bg-ark-surface hover:border-ark-border-strong'
              }`}
            >
              {eventItem.name}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {summary?.event_achievements ? (
          <section className="mt-8">
            <div className="border-l-4 border-amber-400 pl-3">
              <h4 className="text-base font-bold text-ark-text leading-none">当前事件成就</h4>
              <p className="mt-1.5 text-xs text-ark-text-muted">{summary.event_achievements.summary_text}</p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {summary.event_achievements.latest_unlocked.map((item) => (
                <AchievementBadgeCard key={item.id} item={item} />
              ))}
              {summary.event_achievements.upcoming.map((item) => (
                <AchievementBadgeCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-8 rounded-2xl border border-ark-border bg-ark-surface-subtle p-4 text-sm text-ark-text-muted">
            暂无主事件成就，设置主事件后这里会显示当前事件的进展。
          </section>
        )}

        <section className="mt-8 border-t border-ark-border pt-6">
          <div className="border-l-4 border-sky-400 pl-3">
            <h4 className="text-base font-bold text-ark-text leading-none">全局成就</h4>
            <p className="mt-1.5 text-xs text-ark-text-muted">{summary?.global_achievements.summary_text}</p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pb-2">
            {summary?.global_achievements.latest_unlocked.map((item) => (
              <AchievementBadgeCard key={item.id} item={item} tone="global" />
            ))}
            {summary?.global_achievements.upcoming.map((item) => (
              <AchievementBadgeCard key={item.id} item={item} tone="global" />
            ))}
          </div>
        </section>
    </AppModalFrame>,
    document.body,
  );
}
