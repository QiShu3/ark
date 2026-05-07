import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import ReviewResultPanel from '../../components/Vocab/ReviewResultPanel';
import StudyCard from '../../components/Vocab/StudyCard';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { useVocabSession } from '../../hooks/vocab/useVocabSession';

const studyActions: Array<{ label: string; hint: string; value: 'again' | 'hard' | 'good' | 'easy' }> = [
  { label: '没记住', hint: '今天稍后再看', value: 'again' },
  { label: '有点难', hint: '进入较短间隔', value: 'hard' },
  { label: '记住了', hint: '进入正常间隔', value: 'good' },
  { label: '很轻松', hint: '延后更久再看', value: 'easy' },
];

export default function VocabStudy() {
  const { decks, activeDeck, activeDeckVersion, inheritancePrompt, setActiveDeck, confirmInheritance, dismissInheritance } = useVocabDeck();
  const session = useVocabSession(activeDeck?.id ?? null, 'study', activeDeckVersion);

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-8 pb-10 pt-20">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">新词学习</h1>
        <p className="mt-3 text-white/65">按词书切换今天待学的新词，先把词形、音标和基本释义看熟。</p>

        <div className="mt-8">
          <DeckSwitcher
            decks={decks}
            activeDeck={activeDeck}
            onChange={setActiveDeck}
            inheritancePrompt={inheritancePrompt}
            onConfirmInheritance={confirmInheritance}
            onDismissInheritance={dismissInheritance}
          />
        </div>

        <div className="mt-8">
          {session.loading ? <p className="text-sm text-white/55">新词加载中…</p> : null}
          {session.error ? <p className="text-sm text-rose-200">{session.error}</p> : null}

          {session.currentItem ? (
            <div className="space-y-6">
              <StudyCard item={session.currentItem} />

              <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5 text-sm text-white/68">
                看完释义后，直接给这张卡一个结果，系统会自动推进到下一词并安排后续复习。
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {studyActions.map((action) => (
                  <button
                    key={action.value}
                    type="button"
                    disabled={session.submitting}
                    onClick={() => void session.submit(action.value)}
                    className="rounded-[1.5rem] border border-white/15 bg-white/8 px-5 py-4 text-left transition hover:border-white/30 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="text-base font-medium text-white">{action.label}</div>
                    <div className="mt-1 text-sm text-white/55">{action.hint}</div>
                  </button>
                ))}
              </div>

              <a
                href={`#/vocab/words/${session.currentItem.id}`}
                className="inline-block text-sm text-white/65 transition hover:text-white"
              >
                查看完整词条
              </a>
            </div>
          ) : null}

          {session.lastResult ? <ReviewResultPanel result={session.lastResult} /> : null}

          {!session.loading && !session.error && !session.currentItem ? (
            <div className="rounded-[2rem] border border-white/10 bg-black/20 p-8 text-white/65">
              当前词书今天没有待学新词了。
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
