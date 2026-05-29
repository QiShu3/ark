import { useState } from 'react';

import DeckInheritanceModal from './DeckInheritanceModal';
import type { VocabDeck } from '../../lib/vocab/types';

type Props = {
  decks: VocabDeck[];
  activeDeck: VocabDeck | null;
  onChange: (deck: VocabDeck) => void;
  inheritancePrompt?: {
    deck: VocabDeck;
    inheritableWordCount: number;
    submitting: boolean;
  } | null;
  onConfirmInheritance?: () => Promise<void> | void;
  onDismissInheritance?: () => void;
};

export default function DeckSwitcher({
  decks,
  activeDeck,
  onChange,
  inheritancePrompt = null,
  onConfirmInheritance,
  onDismissInheritance,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-[1.5rem] border border-ark-border bg-ark-surface-subtle px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-ark-text-faint">当前词书</div>
          <div className="mt-1 text-base font-medium text-ark-text">{activeDeck?.name ?? '未选择词书'}</div>
          {activeDeck ? <div className="mt-1 text-sm text-ark-text-muted">{activeDeck.word_count} 个单词</div> : null}
        </div>

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="rounded-full border border-ark-border bg-ark-surface-subtle px-4 py-2 text-sm text-ark-text transition hover:border-ark-border hover:bg-ark-surface-subtle"
        >
          {open ? '收起词书' : '切换词书'}
        </button>
      </div>

      {open ? (
        <div className="rounded-[1.75rem] border border-ark-border bg-ark-surface-subtle p-4 backdrop-blur-md">
          <div className="mb-3 text-sm text-ark-text-muted">选择词书</div>
          <div className="flex max-h-72 flex-wrap gap-3 overflow-y-auto pr-1">
            {decks.map((deck) => {
              const active = deck.id === activeDeck?.id;
              return (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => {
                    onChange(deck);
                    setOpen(false);
                  }}
                  className={[
                    'rounded-full border px-4 py-2 text-sm transition',
                    active
                      ? 'border-ark-border bg-white text-slate-900 shadow-lg shadow-white/15'
                      : 'border-ark-border bg-ark-surface-subtle text-ark-text hover:border-ark-border hover:bg-ark-surface-subtle',
                  ].join(' ')}
                >
                  {deck.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {inheritancePrompt ? (
        <DeckInheritanceModal
          deckName={inheritancePrompt.deck.name}
          inheritableWordCount={inheritancePrompt.inheritableWordCount}
          submitting={inheritancePrompt.submitting}
          onConfirm={async () => {
            await onConfirmInheritance?.();
          }}
          onCancel={() => onDismissInheritance?.()}
        />
      ) : null}
    </div>
  );
}
