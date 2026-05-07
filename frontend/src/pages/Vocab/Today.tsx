import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import QuizRenderer from '../../components/Vocab/QuizRenderer';
import TodayBatchReview from '../../components/Vocab/TodayBatchReview';
import ReviewResultPanel from '../../components/Vocab/ReviewResultPanel';
import StudyCard from '../../components/Vocab/StudyCard';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { useVocabTodaySession } from '../../hooks/vocab/useVocabTodaySession';

const actions: Array<{ label: string; hint: string; value: 'again' | 'hard' | 'good' | 'easy' }> = [
  { label: '没记住', hint: '今天稍后再看', value: 'again' },
  { label: '有点难', hint: '进入较短间隔', value: 'hard' },
  { label: '记住了', hint: '进入正常间隔', value: 'good' },
  { label: '很轻松', hint: '延后更久再看', value: 'easy' },
];

export default function VocabToday() {
  const { decks, activeDeck, activeDeckVersion, inheritancePrompt, setActiveDeck, confirmInheritance, dismissInheritance } = useVocabDeck();
  const session = useVocabTodaySession(activeDeck?.id ?? null, activeDeckVersion);

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-8 pb-10 pt-20">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">今日单词</h1>
            <p className="mt-3 text-white/65">先完成今日复习，再进入今天的新词。</p>
          </div>
          <div className="grid gap-3 text-sm text-white/70 md:min-w-[24rem]">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              {`批次：当前处于第 ${session.currentBatchNumber} 批 / 共 ${session.totalBatchCount} 批`}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">{`已记忆 ${session.memorizedCount} 个单词`}</div>
          </div>
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
          {session.loading ? <p className="text-sm text-white/55">今日单词加载中…</p> : null}
          {session.error ? <p className="text-sm text-rose-200">{session.error}</p> : null}

          {session.isBatchReview ? (
            <TodayBatchReview
              count={session.batchReviewCount}
              groups={session.batchReviewGroups}
              actionLabel={session.batchReviewActionLabel}
              onContinue={session.continueBatchReview}
            />
          ) : session.currentItem ? (
            <>
              {session.currentMode === 'review' ? <QuizRenderer item={session.currentItem} /> : <StudyCard item={session.currentItem} />}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {actions.map((action) => (
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
              <a href={`#/vocab/words/${session.currentItem.id}`} className="inline-block text-sm text-white/65 transition hover:text-white">
                查看完整词条
              </a>
            </>
          ) : null}

          {session.lastResult ? <ReviewResultPanel result={session.lastResult} /> : null}

          {!session.isBatchReview && !session.loading && !session.error && !session.currentItem ? (
            <div className="rounded-[2rem] border border-white/10 bg-black/20 p-8 text-white/65">今天这本词书的单词已经完成了。</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
