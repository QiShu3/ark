import SubAppPageHeader from '../../components/SubAppPageHeader';
import SubAppPageShell from '../../components/SubAppPageShell';
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
    <SubAppPageShell>
      <SubAppPageHeader
        title="新词学习"
        description="按词书切换今天待学的新词，先把词形、音标和基本释义看熟。"
        tracking="tight"
      />

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
        {session.loading ? <p className="text-sm text-ark-text-muted">新词加载中…</p> : null}
        {session.error ? <p className="text-sm text-rose-200">{session.error}</p> : null}

        {session.currentItem ? (
          <div className="space-y-6">
            <StudyCard key={session.currentItem.id} item={session.currentItem} />

            <div className="rounded-[2rem] border border-ark-border bg-ark-surface-subtle p-5 text-sm text-ark-text-muted">
              看完释义后，直接给这张卡一个结果，系统会自动推进到下一词并安排后续复习。
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {studyActions.map((action) => (
                <button
                  key={action.value}
                  type="button"
                  disabled={session.submitting}
                  onClick={() => void session.submit(action.value)}
                  className="rounded-[1.5rem] border border-ark-border bg-ark-surface-subtle px-5 py-4 text-left transition hover:border-ark-border hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="text-base font-medium text-ark-text">{action.label}</div>
                  <div className="mt-1 text-sm text-ark-text-muted">{action.hint}</div>
                </button>
              ))}
            </div>

            <a
              href={`#/vocab/words/${session.currentItem.id}`}
              className="inline-block text-sm text-ark-text-muted transition hover:text-ark-text"
            >
              查看完整词条
            </a>
          </div>
        ) : null}

        {session.lastResult ? <ReviewResultPanel result={session.lastResult} /> : null}

        {!session.loading && !session.error && !session.currentItem ? (
          <div className="rounded-[2rem] border border-ark-border bg-ark-surface-subtle p-8 text-ark-text-muted">
            当前词书今天没有待学新词了。
          </div>
        ) : null}
      </div>
    </SubAppPageShell>
  );
}
