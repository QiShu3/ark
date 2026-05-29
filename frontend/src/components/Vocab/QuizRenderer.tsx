import type { VocabReviewItem } from '../../lib/vocab/types';

export default function QuizRenderer({ item }: { item: VocabReviewItem }) {
  return (
    <section className="rounded-[2rem] border border-ark-border bg-ark-surface-subtle p-6 backdrop-blur-md">
      <div className="text-xs uppercase tracking-[0.24em] text-ark-text-faint">{item.review_mode}</div>
      <div className="mt-3 text-4xl font-semibold tracking-tight">{item.word}</div>
      <div className="mt-2 flex gap-4 text-sm text-ark-text-muted">
        {item.us_pronunciation ? <span>US /{item.us_pronunciation}/</span> : null}
        {item.uk_pronunciation ? <span>UK /{item.uk_pronunciation}/</span> : null}
      </div>

      <div className="mt-6 rounded-2xl border border-ark-border bg-ark-surface-subtle p-4">
        <div className="text-sm text-ark-text-muted">请先回忆中文含义，再查看提示</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.translations.map((translation, index) => (
            <span key={`${translation.translation}-${index}`} className="rounded-full bg-ark-surface-subtle px-3 py-2 text-sm">
              {translation.translation}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
