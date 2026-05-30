import React from 'react';

import QuizRenderer from './QuizRenderer';
import StudyCard from './StudyCard';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { useVocabTodaySession } from '../../hooks/vocab/useVocabTodaySession';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';

const actions: Array<{ label: string; hint: string; value: 'again' | 'hard' | 'good' | 'easy' }> = [
  { label: '没记住', hint: '今天稍后再看', value: 'again' },
  { label: '有点难', hint: '进入较短间隔', value: 'hard' },
  { label: '记住了', hint: '进入正常间隔', value: 'good' },
  { label: '很轻松', hint: '延后更久再看', value: 'easy' },
];

type VocabTodayFocusWorkProps = Partial<FocusWorkRendererProps>;

export default function VocabTodayFocusWork({ workflow, onCompleteTaskAndFinish }: VocabTodayFocusWorkProps) {
  const { activeDeck, activeDeckVersion } = useVocabDeck();
  const session = useVocabTodaySession(activeDeck?.id ?? null, activeDeckVersion);
  const completedRef = React.useRef(false);
  const isPaused = workflow?.is_paused === true;

  React.useEffect(() => {
    if (completedRef.current) return;
    if (isPaused) return;
    if (!activeDeck) return;
    if (!session.ready) return;
    if (session.loading || session.error || session.isBatchReview || session.currentItem) return;
    completedRef.current = true;
    onCompleteTaskAndFinish?.();
  }, [
    onCompleteTaskAndFinish,
    activeDeck,
    isPaused,
    session.currentBatchNumber,
    session.currentItem,
    session.error,
    session.isBatchReview,
    session.loading,
    session.memorizedCount,
    session.ready,
    session.totalBatchCount,
  ]);

  return (
    <div className="h-full w-full overflow-y-auto px-4 pb-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="pt-2">
          <div className="text-sm text-[var(--focus-work-text)]">
            {session.loading
              ? '批次加载中…'
              : `第 ${session.currentBatchNumber} 批 / 共 ${session.totalBatchCount} 批`}
          </div>
        </header>

        <p className="text-sm leading-6 text-[var(--focus-work-text-muted)]">
          {session.isBatchReview ? '上一批先简单回顾一下，再继续今天的词。' : '先完成今天这一个词，再进入下一步。'}
        </p>

        {session.loading ? <p className="text-sm text-[var(--focus-work-text-muted)]">今日单词加载中…</p> : null}
        {session.error ? <p className="text-sm text-rose-200">{session.error}</p> : null}

        {session.isBatchReview ? (
          <section className="rounded-[1.75rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-5">
            <div className="text-sm text-[var(--focus-work-text-muted)]">{`上一批已完成 ${session.batchReviewCount} 个单词。`}</div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={isPaused || session.loading || session.submitting}
                onClick={session.continueBatchReview}
                className="rounded-full border border-[var(--focus-work-border)] bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-[var(--focus-work-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {session.batchReviewActionLabel}
              </button>
            </div>
          </section>
        ) : session.currentItem ? (
          <div className="space-y-6">
            {session.currentMode === 'review' ? <QuizRenderer item={session.currentItem} /> : <StudyCard key={session.currentItem.id} item={session.currentItem} />}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {actions.map((action) => (
                <button
                  key={action.value}
                  type="button"
                  disabled={isPaused || session.submitting}
                  onClick={() => void session.submit(action.value)}
                  className="rounded-[1.5rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-4 text-left transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="text-base font-medium text-[var(--focus-work-text)]">{action.label}</div>
                  <div className="mt-1 text-sm text-[var(--focus-work-text-muted)]">{action.hint}</div>
                </button>
              ))}
            </div>
            <a href={`#/vocab/words/${session.currentItem.id}`} className="inline-block text-sm text-[var(--focus-work-text-muted)] transition hover:text-[var(--focus-work-text)]">
              查看完整词条
            </a>
          </div>
        ) : null}

        {!session.isBatchReview && !session.loading && !session.error && !session.currentItem ? (
          <div className="rounded-[1.75rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-6 text-[var(--focus-work-text-muted)]">
            <div>今天这本词书的单词已经完成了。</div>
            {onCompleteTaskAndFinish ? (
              <button
                type="button"
                disabled={isPaused}
                onClick={onCompleteTaskAndFinish}
                className="mt-5 rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-[var(--focus-work-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                完成今日单词
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
