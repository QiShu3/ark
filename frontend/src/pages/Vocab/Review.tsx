import SubAppPageHeader from '../../components/SubAppPageHeader';
import SubAppPageShell from '../../components/SubAppPageShell';
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
    <SubAppPageShell>
      <SubAppPageHeader
        title="今日复习"
        description="先回忆，再提交结果。间隔和掌握度由后端统一推进。"
        tracking="tight"
      />

      <a href="#/flash/mistakes" className="inline-block mt-6 text-sm text-ark-text-muted transition hover:text-ark-text">
        查看错题池
      </a>

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
        {session.loading ? <p className="text-sm text-ark-text-muted">复习队列加载中…</p> : null}
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
                  className="rounded-2xl border border-ark-border bg-ark-surface-subtle px-4 py-3 text-sm transition hover:border-ark-border hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
            <a href={`#/flash/words/${session.currentItem.id}`} className="inline-block text-sm text-ark-text-muted transition hover:text-ark-text">
              查看单词详情
            </a>
          </>
        ) : null}

        {session.lastResult ? <ReviewResultPanel result={session.lastResult} /> : null}

        {!session.loading && !session.error && !session.currentItem ? (
          <div className="rounded-[2rem] border border-ark-border bg-ark-surface-subtle p-8 text-ark-text-muted">当前没有到期复习词。</div>
        ) : null}
      </div>
    </SubAppPageShell>
  );
}
