import type { VocabTodaySummary } from '../../lib/vocab/types';

const items = [
  { key: 'learning_count', label: 'Learning', accent: 'from-lime-400/30 to-emerald-300/10' },
  { key: 'new_count', label: '新词', accent: 'from-sky-400/30 to-cyan-300/10' },
  { key: 'review_count', label: '复习', accent: 'from-amber-400/30 to-orange-300/10' },
  { key: 'mistake_count', label: '错题', accent: 'from-rose-400/30 to-pink-300/10' },
] as const;

export default function ProgressSummary({ summary }: { summary: VocabTodaySummary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.key}
          className={`rounded-3xl border border-ark-border bg-gradient-to-br ${item.accent} p-5 backdrop-blur-md`}
        >
          <div className="text-sm text-ark-text-muted">{item.label}</div>
          <div className="mt-2 text-3xl font-semibold text-ark-text">
            {summary[item.key]}
          </div>
        </div>
      ))}
    </div>
  );
}
