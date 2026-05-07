import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import QuizRenderer from '../../components/Vocab/QuizRenderer';
import ReviewResultPanel from '../../components/Vocab/ReviewResultPanel';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { useVocabSession } from '../../hooks/vocab/useVocabSession';

const actions: Array<{ label: string; value: 'again' | 'hard' | 'good' | 'easy' }> = [
  { label: '没记住', value: 'again' },
  { label: '有点难', value: 'hard' },
  { label: '记住了', value: 'good' },
  { label: '很轻松', value: 'easy' },
];

export default function VocabReview() {
  const { decks, activeDeck, activeDeckVersion, inheritancePrompt, setActiveDeck, confirmInheritance, dismissInheritance } = useVocabDeck();
  const session = useVocabSession(activeDeck?.id ?? null, 'review', activeDeckVersion);

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-8 pb-10 pt-20">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">今日复习</h1>
            <p className="mt-3 text-white/65">先回忆，再提交结果。间隔和掌握度由后端统一推进。</p>
          </div>
          <a href="#/vocab/mistakes" className="text-sm text-white/65 transition hover:text-white">
            查看错题池
          </a>
        </div>

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

        <div className="mt-8 space-y-6">
          {session.loading ? <p className="text-sm text-white/55">复习队列加载中…</p> : null}
          {session.error ? <p className="text-sm text-rose-200">{session.error}</p> : null}

          {session.currentItem ? (
            <>
              <QuizRenderer item={session.currentItem} />
              <div className="grid gap-3 sm:grid-cols-4">
                {actions.map((action) => (
                  <button
                    key={action.value}
                    type="button"
                    disabled={session.submitting}
                    onClick={() => void session.submit(action.value)}
                    className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-sm transition hover:border-white/30 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <a href={`#/vocab/words/${session.currentItem.id}`} className="inline-block text-sm text-white/65 transition hover:text-white">
                查看单词详情
              </a>
            </>
          ) : null}

          {session.lastResult ? <ReviewResultPanel result={session.lastResult} /> : null}

          {!session.loading && !session.error && !session.currentItem ? (
            <div className="rounded-[2rem] border border-white/10 bg-black/20 p-8 text-white/65">当前没有到期复习词。</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
