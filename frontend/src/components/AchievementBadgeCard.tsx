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

const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-ark-text-faint">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const TargetIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10"></circle>
    <circle cx="12" cy="12" r="6"></circle>
    <circle cx="12" cy="12" r="2"></circle>
  </svg>
);

const TrophyIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
    <path d="M4 22h16"></path>
    <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"></path>
    <path d="M12 2a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z"></path>
  </svg>
);

export default function AchievementBadgeCard({ item, tone = 'event' }: AchievementBadgeCardProps) {
  const isUnlocked = item.status === 'unlocked';
  const isInProgress = item.status === 'in_progress';
  const isLocked = item.status === 'locked';

  const cardTypeClass = tone === 'global' ? 'achievement-card-global' : 'achievement-card-event';
  const cardStatusClass = isUnlocked
    ? (tone === 'global' ? 'achievement-card-unlocked-global' : 'achievement-card-unlocked-event')
    : (isLocked ? 'achievement-card-locked' : 'achievement-card-in-progress');

  const canShowProgress = item.current_value !== null && item.target_value !== null && item.target_value > 0;
  const progressPercent = canShowProgress
    ? Math.min(100, Math.max(0, Math.round((item.current_value / item.target_value) * 100)))
    : 0;
  const progressLabel = getProgressLabel(item);

  return (
    <div className={`achievement-card ${cardTypeClass} ${cardStatusClass}`}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-semibold text-ark-text leading-tight">{item.title}</div>
          <span className="shrink-0 mt-0.5">
            {isUnlocked && <TrophyIcon className={tone === 'global' ? 'text-sky-400' : 'text-amber-400'} />}
            {isInProgress && <TargetIcon className={tone === 'global' ? 'text-sky-400/90 animate-pulse' : 'text-amber-400/90 animate-pulse'} />}
            {isLocked && <LockIcon />}
          </span>
        </div>
        <div className="mt-2 text-xs leading-5 text-ark-text-muted">{item.description}</div>
      </div>
      {canShowProgress ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span className="text-ark-text-muted">{progressLabel}</span>
            <span className={tone === 'global' ? 'text-sky-400/90' : 'text-amber-400/90'}>
              {isUnlocked ? '已达成' : `${progressPercent}%`}
            </span>
          </div>
          <div
            className="mt-1.5 achievement-progress-track"
            role="progressbar"
            aria-label={`${item.title}进度`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                tone === 'global' ? 'achievement-progress-fill-global' : 'achievement-progress-fill-event'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
