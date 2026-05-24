import { useEffect, useRef, useState } from 'react';

import { apiJson } from '../lib/api';
import AchievementModal from './AchievementModal';
import type { AchievementSummary } from './achievementTypes';

export default function AchievementCard() {
  const [summary, setSummary] = useState<AchievementSummary | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const nextSummary = await apiJson<AchievementSummary>('/todo/achievements/summary');
        setSummary(nextSummary);
      } catch {
        // summary stays null, modal handles empty state
      }
    })();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="成就"
        onClick={() => setIsOpen(true)}
        className="flex h-full w-full flex-col justify-center rounded-lg border border-white/20 bg-white/10 p-3 text-left transition-colors hover:bg-white/15"
      >
        <span className="text-center text-white/80 font-medium">成就</span>
      </button>

      <AchievementModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialSummary={summary}
        returnFocusRef={triggerRef}
      />
    </>
  );
}
