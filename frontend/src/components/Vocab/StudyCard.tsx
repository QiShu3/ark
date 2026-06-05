import { useState } from 'react';

import type { VocabReviewItem } from '../../lib/vocab/types';

interface StudyCardProps {
  item: VocabReviewItem;
  revealed?: boolean;
  onToggleRevealed?: () => void;
}

export default function StudyCard({ item, revealed: propRevealed, onToggleRevealed }: StudyCardProps) {
  const [localRevealed, setLocalRevealed] = useState(false);
  const isRevealed = propRevealed !== undefined ? propRevealed : localRevealed;
  const toggleRevealed = onToggleRevealed || (() => setLocalRevealed((prev) => !prev));

  // Extract unique part of speech tags
  const posTags = Array.from(new Set(item.translations.map((t) => t.pos).filter(Boolean)));

  // Helper to highlight the keyword case-insensitively in the example sentence
  const highlightKeyword = (sentence: string, keyword: string) => {
    if (!keyword) return <span>{sentence}</span>;
    // Escape special regex characters in the keyword
    const escapedKeyword = keyword.replace(/[\\^$*+?.()|[\]{}-]/g, '\\$&');
    // Match only standalone words using word boundaries
    const regex = new RegExp(`\\b(${escapedKeyword})\\b`, 'gi');
    const parts = sentence.split(regex);
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === keyword.toLowerCase() ? (
            <span key={i} className="text-[var(--focus-work-emerald-text)] font-semibold">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <section className="relative rounded-[2rem] border border-[var(--focus-work-border-strong)] bg-[var(--focus-work-surface-soft)] p-8 text-center backdrop-blur-md overflow-hidden shadow-[var(--focus-work-card-shadow)] h-[420px] flex flex-col justify-between">
      {/* Radial Background Mesh Glow */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.06),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(147,197,253,0.1),transparent_60%)]" />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-center items-center overflow-y-auto min-h-0 w-full pr-1 vocab-scrollable-content">
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

        {!isRevealed ? (
          <>
            {/* Separator Decorator */}
            <div className="my-5 flex items-center justify-center">
              <div className="h-[1px] w-12 bg-[var(--focus-work-border)] opacity-60" />
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/80 mx-3 shadow-[0_0_8px_rgba(110,231,183,0.6)] animate-pulse" />
              <div className="h-[1px] w-12 bg-[var(--focus-work-border)] opacity-60" />
            </div>

            {/* Recall Hint */}
            <div className="text-sm text-[var(--focus-work-text-faint)] select-none">
              先在脑中回忆释义
            </div>
          </>
        ) : (
          <>
            {/* Centered Translations */}
            <div className="text-3xl font-medium text-[var(--focus-work-text)] my-6 leading-normal tracking-wide animate-fade-in">
              {item.translations.map((t) => t.translation).join('；')}
            </div>

            {/* Separator Decorator */}
            <div className="my-5 flex items-center justify-center animate-fade-in">
              <div className="h-[1px] w-24 bg-[var(--focus-work-border)] opacity-60" />
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/80 mx-3 shadow-[0_0_8px_rgba(110,231,183,0.6)] animate-pulse" />
              <div className="h-[1px] w-24 bg-[var(--focus-work-border)] opacity-60" />
            </div>

            {/* First Example Sentence */}
            {item.sentences && item.sentences.length > 0 && (
              <div className="mt-4 mb-6 max-w-xl mx-auto text-center animate-fade-in">
                <div className="text-base text-[var(--focus-work-text-muted)] leading-relaxed flex items-start justify-center gap-1.5">
                  <span className="text-emerald-400 font-serif text-xl font-bold leading-none select-none">“</span>
                  <p className="inline text-lg">
                    {highlightKeyword(item.sentences[0].sentence, item.word)}
                  </p>
                </div>
                <div className="mt-2 text-sm text-[var(--focus-work-text-faint)]">
                  {item.sentences[0].translation}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Display Toggle Button */}
      <div className="mt-4 flex justify-center shrink-0">
        <button
          type="button"
          onClick={toggleRevealed}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-2.5 text-xs font-medium text-[var(--focus-work-text-muted)] transition hover:border-[var(--focus-work-border-strong)] hover:bg-[var(--focus-work-surface-soft)] active:scale-95"
        >
          <span>{isRevealed ? '收起释义' : '显示释义'}</span>
          <svg
            className={`h-3.5 w-3.5 transition-transform duration-300 ${isRevealed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </section>
  );
}
