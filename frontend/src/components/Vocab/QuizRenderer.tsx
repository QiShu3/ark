import type { VocabReviewItem } from '../../lib/vocab/types';

export default function QuizRenderer({ item }: { item: VocabReviewItem }) {
  // Extract unique part of speech tags
  const posTags = Array.from(new Set(item.translations.map((t) => t.pos).filter(Boolean)));

  return (
    <section className="relative rounded-[2rem] border border-[var(--focus-work-border-strong)] bg-[var(--focus-work-surface-soft)] p-8 text-center backdrop-blur-md overflow-hidden shadow-[var(--focus-work-card-shadow)] min-h-[360px] flex flex-col justify-center">
      {/* Radial Background Mesh Glow */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.06),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(147,197,253,0.1),transparent_60%)]" />

      <div className="text-xs uppercase tracking-[0.24em] text-[var(--focus-work-text-faint)]">{item.review_mode}</div>

      <div className="mt-3 flex flex-col items-center">
        {/* Word and POS Tags */}
        <div className="flex items-center justify-center flex-wrap gap-2">
          <h2 className="text-5xl font-bold tracking-tight text-[var(--focus-work-text)]">{item.word}</h2>
          {posTags.map((pos) => (
            <span
              key={pos}
              className="inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)] border border-[var(--focus-work-emerald-border)] align-middle uppercase"
            >
              {pos}
            </span>
          ))}
        </div>

        {/* Phonetics Display */}
        <div className="mt-3 flex items-center justify-center gap-4 text-sm text-[var(--focus-work-text-muted)] font-mono">
          {item.us_pronunciation ? <span>US /{item.us_pronunciation}/</span> : null}
          {item.uk_pronunciation ? <span>UK /{item.uk_pronunciation}/</span> : null}
        </div>

        {/* Separator Decorator */}
        <div className="my-5 flex items-center justify-center">
          <div className="h-[1px] w-12 bg-[var(--focus-work-border)] opacity-60" />
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/80 mx-3 shadow-[0_0_8px_rgba(110,231,183,0.6)] animate-pulse" />
          <div className="h-[1px] w-12 bg-[var(--focus-work-border)] opacity-60" />
        </div>

        {/* Quiz Hint & Card Body */}
        <div className="mt-2 w-full rounded-2xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-5 text-left">
          <div className="text-sm font-medium text-[var(--focus-work-text-muted)]">请先回忆中文含义，再查看提示</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.translations.map((translation, index) => (
              <span
                key={`${translation.translation}-${index}`}
                className="rounded-full bg-[var(--focus-work-surface-soft)] border border-[var(--focus-work-border)] px-3 py-1.5 text-sm text-[var(--focus-work-text)]"
              >
                {translation.pos ? `${translation.pos}. ` : ''}
                {translation.translation}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
