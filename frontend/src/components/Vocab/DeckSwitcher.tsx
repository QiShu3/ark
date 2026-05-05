import type { VocabDeck } from '../../lib/vocab/types';

type Props = {
  decks: VocabDeck[];
  activeDeck: VocabDeck | null;
  onChange: (deck: VocabDeck) => void;
};

export default function DeckSwitcher({ decks, activeDeck, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      {decks.map((deck) => {
        const active = deck.id === activeDeck?.id;
        return (
          <button
            key={deck.id}
            type="button"
            onClick={() => onChange(deck)}
            className={[
              'rounded-full border px-4 py-2 text-sm transition',
              active
                ? 'border-white bg-white text-slate-900 shadow-lg shadow-white/15'
                : 'border-white/15 bg-white/8 text-white/80 hover:border-white/30 hover:bg-white/12',
            ].join(' ')}
          >
            {deck.name}
          </button>
        );
      })}
    </div>
  );
}
