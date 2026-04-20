import type { AchievementItem } from './achievementTypes';

type AchievementBadgeCardProps = {
  item: AchievementItem;
  tone?: 'event' | 'global';
};

export default function AchievementBadgeCard({ item, tone = 'event' }: AchievementBadgeCardProps) {
  const baseTone = tone === 'global'
    ? 'border-sky-400/20 bg-sky-400/10'
    : 'border-amber-300/20 bg-amber-200/10';
  const lockedTone = item.status === 'locked' ? 'opacity-60 grayscale-[0.25]' : '';

  return (
    <div className={`rounded-2xl border p-3 ${baseTone} ${lockedTone}`}>
      <div className="text-sm font-semibold text-white">{item.title}</div>
      <div className="mt-2 text-xs leading-5 text-white/60">{item.description}</div>
      {item.progress_text ? (
        <div className="mt-3 text-xs text-white/70">{item.progress_text}</div>
      ) : null}
    </div>
  );
}
