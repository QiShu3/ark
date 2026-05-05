import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import StudyCard from '../../components/Vocab/StudyCard';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { useVocabReviewQueue } from '../../hooks/vocab/useVocabReviewQueue';

export default function VocabStudy() {
  const { decks, activeDeck, setActiveDeck } = useVocabDeck();
  const { currentItem, loading, error } = useVocabReviewQueue(activeDeck?.id ?? null, 'study');

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-8 pb-10 pt-20">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">新词学习</h1>
        <p className="mt-3 text-white/65">按词书切换今天待学的新词，先把词形、音标和基本释义看熟。</p>

        <div className="mt-8">
          <DeckSwitcher decks={decks} activeDeck={activeDeck} onChange={setActiveDeck} />
        </div>

        <div className="mt-8">
          {loading ? <p className="text-sm text-white/55">新词加载中…</p> : null}
          {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          {currentItem ? <StudyCard item={currentItem} /> : null}
          {!loading && !error && !currentItem ? (
            <div className="rounded-[2rem] border border-white/10 bg-black/20 p-8 text-white/65">当前词书没有待学新词。</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
