import { useEffect, useState } from 'react';

import { apiJson } from '../lib/api';
import AchievementModal from './AchievementModal';
import type { AchievementSummary } from './achievementTypes';

export default function AchievementCard() {
  const [summary, setSummary] = useState<AchievementSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const nextSummary = await apiJson<AchievementSummary>('/todo/achievements/summary');
        setSummary(nextSummary);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '成就加载失败');
      }
    })();
  }, []);

  const latestEventItem = summary?.event_achievements?.latest_unlocked[0] ?? null;
  const nextEventItem = summary?.event_achievements?.upcoming[0] ?? null;
  const nextGlobalItem = summary?.global_achievements?.upcoming[0] ?? null;

  return (
    <>
      <button
        type="button"
        aria-label="成就"
        onClick={() => setIsOpen(true)}
        className="flex h-full w-full flex-col justify-between rounded-lg border border-white/20 bg-white/10 p-3 text-left transition-colors hover:bg-white/15"
      >
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-white/50">成就</div>
          <div className="mt-2 text-base font-semibold text-white">
            {summary?.active_event?.name ?? '暂无主事件成就'}
          </div>
          <div className="mt-2 text-sm text-amber-200">
            {latestEventItem
              ? `事件已解锁 ${summary?.event_achievements?.stats.unlocked_count ?? 0} 项 · 最近「${latestEventItem.title}」`
              : error
                ? '成就加载失败，可稍后重试'
                : '设置主事件后可查看事件成就'}
          </div>
          <div className="mt-2 text-xs leading-5 text-white/60">
            {nextEventItem ? `再推进一点：${nextEventItem.title}` : '先完成一个绑定安排，解锁首个事件徽章。'}
          </div>
        </div>

        <div className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-sky-200">
          {nextGlobalItem ? `全局：${nextGlobalItem.title} · ${nextGlobalItem.progress_text ?? '已解锁'}` : '全局成就持续累计中'}
        </div>
      </button>

      <AchievementModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialSummary={summary}
      />
    </>
  );
}
