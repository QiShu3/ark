import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { apiJson } from '../lib/api';
import AchievementBadgeCard from './AchievementBadgeCard';
import type { AchievementEventItem, AchievementSummary } from './achievementTypes';

type AchievementModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialSummary: AchievementSummary | null;
};

export default function AchievementModal({ isOpen, onClose, initialSummary }: AchievementModalProps) {
  const [events, setEvents] = useState<AchievementEventItem[]>([]);
  const [summary, setSummary] = useState<AchievementSummary | null>(initialSummary);
  const [error, setError] = useState<string | null>(null);

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
    if (!isOpen) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  async function handleSelectEvent(eventId: string): Promise<void> {
    try {
      const nextSummary = await apiJson<AchievementSummary>(`/todo/achievements/summary?event_id=${eventId}`);
      setSummary(nextSummary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换事件失败');
    }
  }

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 pb-6 pt-20 backdrop-blur-sm md:items-center md:px-6 md:py-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="成就弹窗"
    >
      <div
        className="w-[920px] max-w-[94vw] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-3xl border border-white/10 bg-[#0d0f16] p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-white">
              {summary?.active_event ? `成就 · ${summary.active_event.name}` : '成就'}
            </h3>
            <p className="mt-2 text-sm text-white/55">上半部分跟随事件切换，下半部分的全局成就始终显示。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="关闭成就弹窗"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {events.map((eventItem) => (
            <button
              key={eventItem.id}
              type="button"
              onClick={() => void handleSelectEvent(eventItem.id)}
              className={`rounded-full px-3 py-2 text-sm ${
                summary?.active_event?.id === eventItem.id
                  ? 'bg-amber-300 text-black'
                  : 'border border-white/10 bg-white/5 text-white/70'
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
          <section className="mt-6">
            <h4 className="text-sm font-semibold text-white/90">当前事件成就</h4>
            <div className="mt-2 text-xs text-white/55">{summary.event_achievements.summary_text}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {summary.event_achievements.latest_unlocked.map((item) => (
                <AchievementBadgeCard key={item.id} item={item} />
              ))}
              {summary.event_achievements.upcoming.map((item) => (
                <AchievementBadgeCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
            暂无主事件成就，设置主事件后这里会显示当前事件的进展。
          </section>
        )}

        <section className="mt-6 border-t border-white/10 pt-6">
          <h4 className="text-sm font-semibold text-white/90">全局成就</h4>
          <div className="mt-2 text-xs text-white/55">{summary?.global_achievements.summary_text}</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {summary?.global_achievements.latest_unlocked.map((item) => (
              <AchievementBadgeCard key={item.id} item={item} tone="global" />
            ))}
            {summary?.global_achievements.upcoming.map((item) => (
              <AchievementBadgeCard key={item.id} item={item} tone="global" />
            ))}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
