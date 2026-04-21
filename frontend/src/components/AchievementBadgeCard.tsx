import type { AchievementItem } from './achievementTypes';

type AchievementBadgeCardProps = {
  item: AchievementItem;
  tone?: 'event' | 'global';
};

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  if (Number.isInteger(hours)) return `${hours} 小时`;
  return `${Number(hours.toFixed(1))} 小时`;
}

function getProgressLabel(item: AchievementItem): string | null {
  if (item.current_value === null || item.target_value === null) return null;
  if (item.id.includes('focus')) return `已专注 ${formatHours(item.current_value)}`;
  if (item.id.includes('complete')) return `已完成 ${item.current_value} 项`;
  if (item.id.includes('streak') || item.id.includes('usage')) return `连续 ${item.current_value} 天`;
  if (item.id.includes('appointment')) return `已确认 ${item.current_value} 个日程`;
  return item.progress_text;
}

export default function AchievementBadgeCard({ item, tone = 'event' }: AchievementBadgeCardProps) {
  const baseTone = tone === 'global'
    ? 'border-sky-400/20 bg-sky-400/10'
    : 'border-amber-300/20 bg-amber-200/10';
  const lockedTone = item.status === 'locked' ? 'opacity-60 grayscale-[0.25]' : '';
  const canShowProgress = item.current_value !== null && item.target_value !== null && item.target_value > 0;
  const progressPercent = canShowProgress
    ? Math.min(100, Math.max(0, Math.round((item.current_value / item.target_value) * 100)))
    : 0;
  const progressFill = tone === 'global' ? 'bg-sky-300' : 'bg-amber-300';
  const progressLabel = getProgressLabel(item);

  return (
    <div className={`rounded-2xl border p-3 ${baseTone} ${lockedTone}`}>
      <div className="text-sm font-semibold text-white">{item.title}</div>
      <div className="mt-2 text-xs leading-5 text-white/60">{item.description}</div>
      {canShowProgress ? (
        <div className="mt-3">
          {progressLabel ? <div className="text-xs text-white/70">{progressLabel}</div> : null}
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label={`${item.title}进度`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <div className={`h-full rounded-full ${progressFill}`} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
