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
        className="ark-panel-card flex h-full w-full flex-col justify-center rounded-lg p-3 text-left transition-colors hover:bg-[var(--ark-surface-subtle)]"
      >
        <span className="text-center text-[var(--ark-text)] font-medium">成就</span>
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
