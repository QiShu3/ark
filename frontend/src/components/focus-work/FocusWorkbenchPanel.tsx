import { Fragment } from 'react';
import type React from 'react';
import type { ReactNode } from 'react';

import type { FocusPhaseRuntimeState, FocusWorkRendererProps } from './focusWorkTypes';
import type { FocusWorkDefinition } from './focusWorkTypes';
import { normalizeFocusWorkType } from './focusWorkTypes';

const primaryButtonClass =
  'rounded-full bg-white px-6 py-3 text-sm font-medium text-slate-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass =
  'rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-6 py-3 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50';

function formatSummaryDuration(secondsLike: unknown): string {
  const seconds = typeof secondsLike === 'number' ? secondsLike : 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}分钟`;
}

type ActionPanelProps = {
  label: string;
  heading: string;
  description: string;
  primaryLabel: string;
  primaryDisabled: boolean;
  onPrimary: () => void;
  secondaryLabel?: string;
  secondaryDisabled?: boolean;
  onSecondary?: () => void;
  children?: ReactNode;
};

function ActionPanel({
  label,
  heading,
  description,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  secondaryLabel,
  secondaryDisabled,
  onSecondary,
  children,
}: ActionPanelProps) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center p-8 text-center">
      <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">{label}</div>
      <h3 className="mt-4 text-xl font-semibold text-[var(--focus-work-text)]">{heading}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">{description}</p>
      {children && (
        <div className="mt-4 text-left">
          {children}
        </div>
      )}
      <div className="mt-8 flex w-full flex-col justify-center gap-4 sm:flex-row">
        <button type="button" disabled={primaryDisabled} onClick={onPrimary} className={primaryButtonClass}>
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button type="button" disabled={secondaryDisabled} onClick={onSecondary} className={secondaryButtonClass}>
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ===================== 结算面板组件 ===================== */

type RunCompletionPanelProps = {
  heading: string;
  subtitle?: string;
  durationSeconds: number;
  summary: Record<string, unknown>;
  focusWorkType?: string;
  masteryCheck?: Record<string, unknown> | null;
  forkChildren?: { config_id: string; label: string; is_recommended: boolean }[];
  onForkWithChild?: (childConfigId: string) => void;
  primaryLabel: string;
  primaryDisabled: boolean;
  onPrimary: () => void;
  secondaryLabel: string;
  secondaryDisabled: boolean;
  onSecondary: () => void;
  busy?: boolean;
};

function CircularProgress({
  value,
  size = 140,
  strokeWidth = 14,
  passed,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  passed: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  const color = passed ? 'var(--completion-pass-progress)' : 'var(--completion-fail-progress)';
  const bgColor = passed ? 'var(--completion-pass-bg)' : 'var(--completion-fail-bg)';

  return (
    <div className="completion-circular-progress" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill={bgColor}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="completion-circular-label">
        <div className={`completion-circular-status ${passed ? 'pass' : 'fail'}`}>
          {passed ? '通过' : '未通过'}
        </div>
        <div className="completion-circular-value">{value}%</div>
      </div>
    </div>
  );
}

function ClipboardIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

function CheckCircleIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function PercentIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

function ClockIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ClockDecor({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className}>
      {/* 外层光晕 */}
      <circle cx="60" cy="60" r="58" className="completion-decor-clock-glow" />
      {/* 表盘外圈 */}
      <circle cx="60" cy="60" r="52" className="completion-decor-clock-face" />
      {/* 内圈 */}
      <circle cx="60" cy="60" r="48" className="completion-decor-clock-inner" />
      {/* 小时刻度 - 12个 */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 60 + 44 * Math.sin(rad);
        const y1 = 60 - 44 * Math.cos(rad);
        const x2 = 60 + 48 * Math.sin(rad);
        const y2 = 60 - 48 * Math.cos(rad);
        return (
          <line
            key={angle}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className={angle % 90 === 0 ? 'completion-decor-clock-mark-major' : 'completion-decor-clock-mark'}
          />
        );
      })}
      {/* 时针 - 指向10点方向 */}
      <line x1="60" y1="62" x2="60" y2="30" className="completion-decor-clock-hand completion-decor-clock-hand-hour" />
      {/* 分针 - 指向2点方向 */}
      <line x1="60" y1="62" x2="78" y2="48" className="completion-decor-clock-hand" />
      {/* 中心点 */}
      <circle cx="60" cy="60" r="4" className="completion-decor-clock-center" />
    </svg>
  );
}

function SparkleIcon({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M12 3l1.9 5.8L20 10.7l-4.9 4 1.4 6.3L12 17.9 7.5 21l1.4-6.3-4.9-4 6.1-1.9L12 3z" />
    </svg>
  );
}

function RadiateIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function TargetIcon({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function BookIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function PencilIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function RefreshIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function getSummaryStats(summary: Record<string, unknown>, focusWorkType?: string) {
  const reviewedCount = (summary.reviewed_count as number) ?? (summary.answered_count as number) ?? 0;
  const correctCount = (summary.correct_count as number) ?? 0;
  const memorizedCount = (summary.memorized_count as number) ?? correctCount;
  const newCount = (summary.new_count as number) ?? 0;
  const correctRate = (summary.correct_rate as number) ?? (summary.accuracy as number) ?? 0;
  const durationSeconds = (summary.duration_seconds as number) ?? 0;

  const type = normalizeFocusWorkType(focusWorkType);

  if (type === 'flash_card') {
    return [
      { label: '已复习', value: String(reviewedCount), accent: false },
      { label: '已掌握', value: String(memorizedCount), accent: true },
      { label: '新学', value: String(newCount), accent: false },
      { label: '正确率', value: correctRate ? `${Math.round(correctRate * 100)}%` : '0%', accent: false },
    ];
  }

  return [
    { label: '已答题', value: String(reviewedCount), accent: false },
    { label: '正确', value: String(correctCount), accent: true },
    { label: '正确率', value: correctRate ? `${Math.round(correctRate * 100)}%` : '0%', accent: false },
    { label: '用时', value: formatSummaryDuration(durationSeconds), accent: false },
  ];
}

type RecommendPreset = {
  icon: ReactNode;
  title: string;
  desc: string;
  tint: 'blue' | 'violet' | 'green';
  isRecommended?: boolean;
  configId?: string;
};

const DEFAULT_RECOMMEND_PRESETS: RecommendPreset[] = [
  {
    icon: <img src="/icons/book.png" alt="" className="w-12 h-12 object-contain" />,
    title: '不会单词',
    desc: '加强词汇积累，提升阅读理解能力',
    tint: 'blue',
    isRecommended: true,
  },
  {
    icon: <img src="/icons/pencil.png" alt="" className="w-12 h-12 object-contain" />,
    title: '长难句',
    desc: '突破长难句理解，掌握句子结构',
    tint: 'violet',
    isRecommended: true,
  },
  {
    icon: <img src="/icons/target.png" alt="" className="w-12 h-12 object-contain" />,
    title: '针对训练',
    desc: '针对薄弱题型，精准提升正确率',
    tint: 'green',
    isRecommended: true,
  },
];

function RecommendCard({
  icon,
  title,
  desc,
  isRecommended,
  tint,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  isRecommended?: boolean;
  tint: 'blue' | 'violet' | 'green';
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`completion-recommend-card tint-${tint}`}
    >
      <div className="completion-recommend-icon-row">
        <div className={`completion-recommend-icon ${tint}`}>
          {icon}
        </div>
      </div>
      <div className="completion-recommend-title-row">
        <div className="completion-recommend-title">{title}</div>
        {isRecommended && (
          <span className={`completion-recommend-badge ${tint}`}>
            推荐
          </span>
        )}
      </div>
      <div className="completion-recommend-desc-text">{desc}</div>
      <div className={`completion-recommend-action ${tint}`}>
        去练习
        <span className="completion-recommend-action-arrow">›</span>
      </div>
    </button>
  );
}

function RunCompletionPanel({
  heading,
  subtitle,
  durationSeconds,
  summary,
  focusWorkType,
  masteryCheck,
  forkChildren,
  onForkWithChild,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  secondaryLabel,
  secondaryDisabled,
  onSecondary,
  busy = false,
}: RunCompletionPanelProps) {
  const hasMasteryCheck = masteryCheck && masteryCheck.enabled === true;
  const passed = hasMasteryCheck && masteryCheck?.passed === true;
  const accuracy = hasMasteryCheck ? ((masteryCheck?.accuracy as number) ?? 0) : 0;
  const threshold = hasMasteryCheck ? ((masteryCheck?.threshold as number) ?? 0) : 0;
  const stats = getSummaryStats(summary, focusWorkType);
  const hasChildren = forkChildren && forkChildren.length > 0;
  const showRecommend = hasMasteryCheck && !passed;

  // 构建推荐列表：优先用 forkChildren，不足 3 个用预设补
  const recommendList: RecommendPreset[] = showRecommend
    ? (() => {
        if (hasChildren) {
          return forkChildren!.slice(0, 3).map((child, index) => {
            const preset = DEFAULT_RECOMMEND_PRESETS[index] ?? DEFAULT_RECOMMEND_PRESETS[2];
            return {
              ...preset,
              title: child.label || child.config_id,
              isRecommended: child.is_recommended ?? preset.isRecommended,
              configId: child.config_id,
            };
          });
        }
        return DEFAULT_RECOMMEND_PRESETS;
      })()
    : [];

  const handleRecommendClick = (index: number) => {
    const item = recommendList[index];
    if (item?.configId && onForkWithChild) {
      onForkWithChild(item.configId);
    }
  };

  return (
    <div className="ark-focus-work-completion completion-panel h-full flex flex-col">

      <div className="completion-panel-content w-full flex flex-col h-full">
        {/* 标题区 */}
        <div className="completion-heading-row flex-[1] min-h-0">
          <img src="/icons/completion-check.png" alt="" className="completion-heading-icon-img" />
          <div className="completion-heading-content">
            <h2 className="completion-heading">{heading}</h2>
            {subtitle && <p className="completion-subtitle">{subtitle}</p>}
          </div>
        </div>

        {/* 检验结果卡片 */}
        <div className="completion-card flex-[4] min-h-0">
          <div className="completion-section-title">
            <TargetIcon className="w-[18px] h-[18px]" />
            检验结果
          </div>

          <div className="completion-result-grid">
            {/* 左侧状态卡片 - 圆形进度环 */}
            {hasMasteryCheck ? (
              <div className="completion-status-card-wrapper">
                <CircularProgress
                  value={Math.round(accuracy * 100)}
                  passed={passed}
                />
              </div>
            ) : (
              <div className="completion-status-card-wrapper">
                <CircularProgress value={100} passed={true} />
              </div>
            )}

            {/* 右侧数据指标 - 2x2 网格 */}
            <div className="completion-stats-grid">
              {stats.map((stat, i) => (
                <div key={i} className="completion-stat-item">
                  <div className="completion-stat-icon">
                    {i === 0 && <ClipboardIcon className="w-5 h-5" />}
                    {i === 1 && <CheckCircleIcon className="w-5 h-5" />}
                    {i === 2 && <PercentIcon className="w-5 h-5" />}
                    {i === 3 && <ClockIcon className="w-5 h-5" />}
                  </div>
                  <div className={`completion-stat-value ${stat.accent ? 'accent' : ''}`}>
                    {stat.value}
                  </div>
                  <div className="completion-stat-label">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 推荐练习 */}
        <div className={`completion-recommend-section flex-[6] min-h-0 ${!showRecommend ? 'completion-recommend-section-empty' : ''}`}>
          {showRecommend && (
            <>
              <div className="completion-section-title">
                <TargetIcon className="w-[18px] h-[18px]" />
                推荐继续练习
              </div>
              <div className="completion-recommend-grid">
                {recommendList.map((item, index) => (
                  <RecommendCard
                    key={item.configId ?? `preset-${index}`}
                    icon={item.icon}
                    title={item.title}
                    desc={item.desc}
                    isRecommended={item.isRecommended}
                    tint={item.tint}
                    onClick={() => handleRecommendClick(index)}
                    disabled={busy || !item.configId}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="completion-buttons flex-[1] min-h-0">
          <button
            type="button"
            disabled={secondaryDisabled}
            onClick={onSecondary}
            className="completion-btn completion-btn-secondary"
          >
            <RefreshIcon className="w-[18px] h-[18px]" />
            {secondaryLabel}
          </button>
          <button
            type="button"
            disabled={primaryDisabled}
            onClick={onPrimary}
            className="completion-btn completion-btn-primary"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================== 旧的 RunSummaryCard（保留用于其他场景） ===================== */

function RunSummaryCard({ summary, focusWorkType, masteryCheckFromProgress }: { summary: Record<string, unknown>; focusWorkType?: string; masteryCheckFromProgress?: Record<string, unknown> | null }) {
  if (!summary || Object.keys(summary).length === 0) return null;

  const masteryCheck = masteryCheckFromProgress ?? summary.mastery_check as Record<string, unknown> | undefined;
  const hasMasteryCheck = masteryCheck && masteryCheck.enabled === true;

  const reviewedCount = (summary.reviewed_count as number) ?? (summary.answered_count as number) ?? 0;
  const correctCount = (summary.correct_count as number) ?? 0;
  const memorizedCount = (summary.memorized_count as number) ?? correctCount;
  const newCount = (summary.new_count as number) ?? 0;
  const correctRate = (summary.correct_rate as number) ?? (summary.accuracy as number) ?? 0;
  const durationSeconds = (summary.duration_seconds as number) ?? 0;

  return (
    <div className="rounded-lg border border-ark-border bg-ark-surface p-4 text-sm">
      <div className="mb-3 text-xs font-medium text-ark-text-muted">本轮专注数据</div>

      {hasMasteryCheck && (
        <div className={`mb-3 rounded-md p-3 ${masteryCheck.passed === true ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ark-text-muted">检验结果</span>
            <span className={`text-sm font-semibold ${masteryCheck.passed === true ? 'text-green-500' : 'text-red-400'}`}>
              {masteryCheck.passed === true ? '通过' : '未通过'}
            </span>
          </div>
          <div className="mt-1 text-xs text-ark-text-muted">
            正确率 {Math.round((masteryCheck.accuracy as number) * 100)}% / {Math.round((masteryCheck.threshold as number) * 100)}%
          </div>
        </div>
      )}

      {normalizeFocusWorkType(focusWorkType) === 'flash_card' && (
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">{String(reviewedCount)}</div>
            <div className="text-xs text-ark-text-muted">已复习</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-500">{String(memorizedCount)}</div>
            <div className="text-xs text-ark-text-muted">已掌握</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-yellow-500">{String(newCount)}</div>
            <div className="text-xs text-ark-text-muted">新学</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">
              {correctRate ? `${Math.round(correctRate * 100)}%` : '0%'}
            </div>
            <div className="text-xs text-ark-text-muted">正确率</div>
          </div>
        </div>
      )}

      {normalizeFocusWorkType(focusWorkType) === 'choice' && (
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">{String(reviewedCount)}</div>
            <div className="text-xs text-ark-text-muted">已答题</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-500">{String(correctCount)}</div>
            <div className="text-xs text-ark-text-muted">正确</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">
              {correctRate ? `${Math.round(correctRate * 100)}%` : '0%'}
            </div>
            <div className="text-xs text-ark-text-muted">正确率</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">
              {formatSummaryDuration(durationSeconds)}
            </div>
            <div className="text-xs text-ark-text-muted">用时</div>
          </div>
        </div>
      )}

      {focusWorkType === 'input' && (
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">{String(reviewedCount)}</div>
            <div className="text-xs text-ark-text-muted">已答题</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-500">{String(correctCount)}</div>
            <div className="text-xs text-ark-text-muted">正确</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">
              {correctRate ? `${Math.round(correctRate * 100)}%` : '0%'}
            </div>
            <div className="text-xs text-ark-text-muted">正确率</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ark-text">
              {formatSummaryDuration(durationSeconds)}
            </div>
            <div className="text-xs text-ark-text-muted">用时</div>
          </div>
        </div>
      )}
    </div>
  );
}

function runHasNoAvailableContent(run: FocusWorkRendererProps['run'] | null) {
  return run?.progress_snapshot?.no_available_content === true;
}

type FocusWorkbenchPanelProps = {
  phaseRuntimeState: FocusPhaseRuntimeState | null;
  activeRun: FocusWorkRendererProps['run'] | null;
  activeDefinition: FocusWorkDefinition | null;
  busy: boolean;
  isPaused: boolean;
  onCompleteTaskAndEndPhase: () => void;
  onEndPhase: () => void;
  onExtendPhase: () => void;
  onCreateExtraRun: () => void;
  onFork?: () => void;
  onForkWithChild?: (childConfigId: string) => void;
  forkChildren?: { config_id: string; label: string; is_recommended: boolean }[];
  onReturnToParent?: () => void;
  onContentCompleted: (progressSnapshot?: Record<string, unknown>) => void;
};

export default function FocusWorkbenchPanel({
  phaseRuntimeState,
  activeRun,
  activeDefinition,
  busy,
  isPaused,
  onCompleteTaskAndEndPhase,
  onEndPhase,
  onExtendPhase,
  onCreateExtraRun,
  onFork,
  onForkWithChild,
  forkChildren,
  onReturnToParent,
  onContentCompleted,
}: FocusWorkbenchPanelProps) {
  const noAvailableContent = runHasNoAvailableContent(activeRun);
  const progressSnapshot = activeRun?.progress_snapshot as Record<string, unknown> | undefined;
  const runSummary = progressSnapshot?.run_summary as Record<string, unknown> | undefined;
  const focusWorkType = activeRun?.config_snapshot?.focus_work_type as string | undefined;
  const masteryCheck = (progressSnapshot?.mastery_check ?? runSummary?.mastery_check) as Record<string, unknown> | undefined;
  const hasMasteryCheckFailed = masteryCheck && masteryCheck.enabled === true && masteryCheck.passed === false;
  const configSnapshot = activeRun?.config_snapshot as Record<string, unknown> | undefined;

  const hasChildren = forkChildren && forkChildren.length > 0;
  const isChildRun = Boolean(activeRun?.source_run_id);
  const durationSeconds = (runSummary?.duration_seconds as number) ?? 0;
  const durationMinutes = Math.ceil(durationSeconds / 60);
  const completionSubtitle = `🎉 棒极了！你刚刚完成了 ${durationMinutes} 分钟的专注`;

  // ===== 结算阶段 =====
  if (phaseRuntimeState === 'counted_run_completed_confirming') {
    if (isChildRun) {
      return (
        <RunCompletionPanel
          heading="本轮专注已完成"
          subtitle={completionSubtitle}
          durationSeconds={durationSeconds}
          summary={runSummary ?? {}}
          focusWorkType={focusWorkType}
          masteryCheck={masteryCheck ?? null}
          forkChildren={hasMasteryCheckFailed ? (hasChildren ? forkChildren : undefined) : undefined}
          onForkWithChild={onForkWithChild}
          primaryLabel="回到原专注工作"
          primaryDisabled={busy || !activeRun}
          onPrimary={() => onReturnToParent?.()}
          secondaryLabel="再来一轮"
          secondaryDisabled={busy || !activeRun}
          onSecondary={onCreateExtraRun}
          busy={busy}
        />
      );
    }

      return (
        <RunCompletionPanel
          heading="本轮专注已完成"
        subtitle={completionSubtitle}
        durationSeconds={durationSeconds}
        summary={runSummary ?? {}}
        focusWorkType={focusWorkType}
        masteryCheck={masteryCheck ?? null}
        forkChildren={hasMasteryCheckFailed ? (hasChildren ? forkChildren : undefined) : undefined}
        onForkWithChild={onForkWithChild}
        primaryLabel="进入下一阶段"
        primaryDisabled={busy || !activeRun}
        onPrimary={onCompleteTaskAndEndPhase}
        secondaryLabel="再来一轮"
        secondaryDisabled={busy || !activeRun}
        onSecondary={onCreateExtraRun}
        busy={busy}
      />
    );
  }

  if (phaseRuntimeState === 'extra_run_completed') {
    if (noAvailableContent) {
      return (
        <ActionPanel
          label="No Content"
          heading="暂无可加练内容"
          description={isChildRun ? "当前为 fork 的子阶段，请回到原专注工作继续。" : "当前题库暂时没有可继续练习的内容，可以先结束本阶段。"}
          primaryLabel={isChildRun ? "回到原专注工作" : "结束阶段"}
          primaryDisabled={busy}
          onPrimary={isChildRun ? () => onReturnToParent?.() : onEndPhase}
        />
      );
    }

    if (isChildRun) {
      return (
        <RunCompletionPanel
          heading="本轮专注已完成"
          subtitle={completionSubtitle}
          durationSeconds={durationSeconds}
          summary={runSummary ?? {}}
          focusWorkType={focusWorkType}
          masteryCheck={masteryCheck ?? null}
          forkChildren={hasMasteryCheckFailed ? (hasChildren ? forkChildren : undefined) : undefined}
          onForkWithChild={onForkWithChild}
          primaryLabel="回到原专注工作"
          primaryDisabled={busy || !activeRun}
          onPrimary={() => onReturnToParent?.()}
          secondaryLabel="再来一轮"
          secondaryDisabled={busy || !activeRun}
          onSecondary={onCreateExtraRun}
          busy={busy}
        />
      );
    }

    return (
      <RunCompletionPanel
        heading="本轮专注已完成"
        subtitle={completionSubtitle}
        durationSeconds={durationSeconds}
        summary={runSummary ?? {}}
        focusWorkType={focusWorkType}
        masteryCheck={masteryCheck ?? null}
        forkChildren={hasMasteryCheckFailed ? (hasChildren ? forkChildren : undefined) : undefined}
        onForkWithChild={onForkWithChild}
        primaryLabel="结束阶段"
        primaryDisabled={busy || !activeRun}
        onPrimary={onEndPhase}
        secondaryLabel="再来一轮"
        secondaryDisabled={busy || !activeRun}
        onSecondary={onCreateExtraRun}
        busy={busy}
      />
    );
  }

  if (phaseRuntimeState === 'task_already_completed') {
    return (
      <RunCompletionPanel
        heading="当前任务今日已完成"
        subtitle={completionSubtitle}
        durationSeconds={durationSeconds}
        summary={runSummary ?? {}}
        focusWorkType={focusWorkType}
        masteryCheck={masteryCheck ?? null}
        primaryLabel="结束阶段"
        primaryDisabled={busy}
        onPrimary={onEndPhase}
        secondaryLabel="再来一轮"
        secondaryDisabled={true}
        onSecondary={onCreateExtraRun}
        busy={busy}
      />
    );
  }

  // ===== 其他阶段 =====
  if (phaseRuntimeState === 'phase_time_expired_prompt') {
    return (
      <ActionPanel
        label="Time Is Up"
        heading="本阶段时间已到"
        description="可以延长 5 分钟，或结束该阶段。结束阶段会正常记录已完成的专注工作，但不会自动完成任务。"
        primaryLabel="延长时间"
        primaryDisabled={busy}
        onPrimary={onExtendPhase}
        secondaryLabel="结束该阶段"
        secondaryDisabled={busy}
        onSecondary={onEndPhase}
      />
    );
  }

  if (activeRun && activeDefinition) {
    return <Fragment key={activeRun.id}>{activeDefinition.render({
      run: activeRun,
      disabled: isPaused,
      onContentCompleted,
    })}</Fragment>;
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center p-8 text-center">
      <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">Preparing</div>
      <h3 className="mt-4 text-xl font-semibold text-[var(--focus-work-text)]">正在准备本轮专注工作</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--focus-work-text-muted)]">工作台正在识别当前任务并创建对应的专注轮次。</p>
    </div>
  );
}
