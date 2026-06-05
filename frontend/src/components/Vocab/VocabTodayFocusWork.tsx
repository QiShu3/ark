import React from 'react';

import QuizRenderer from './QuizRenderer';
import StudyCard from './StudyCard';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { useVocabTodaySession } from '../../hooks/vocab/useVocabTodaySession';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import { apiJson } from '../../lib/api';
import type { VocabReviewItem } from '../../lib/vocab/types';

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

  const [exiting, setExiting] = React.useState(false);
  const [isExtraPractice, setIsExtraPractice] = React.useState(false);
  const [extraQueue, setExtraQueue] = React.useState<VocabReviewItem[]>([]);
  const [extraIndex, setExtraIndex] = React.useState(0);
  const [loadingExtra, setLoadingExtra] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleExitFocus = async () => {
    setExiting(true);
    try {
      await apiJson('/todo/focus/stop', { method: 'POST' });
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (err) {
      console.error('Failed to stop focus session', err);
      alert(err instanceof Error ? err.message : '结束专注失败');
    } finally {
      setExiting(false);
    }
  };

  const handlePracticeAgain = async () => {
    if (isPaused || !activeDeck) return;
    setLoadingExtra(true);
    setIsExtraPractice(true);
    setError(null);
    try {
      const currentWords = await apiJson<any[]>(`/api/vocab/decks/${activeDeck.id}/overview/current-words?state=all`);
      if (!currentWords || currentWords.length === 0) {
        throw new Error('当前词书没有任何单词');
      }
      const shuffled = [...currentWords].sort(() => 0.5 - Math.random());
      const selectedWords = shuffled.slice(0, 10);
      const details = await Promise.all(selectedWords.map(w => apiJson<any>(`/api/vocab/words/${w.id}`)));
      const extraItems: VocabReviewItem[] = details.map((detail) => ({
        ...detail,
        prompt_type: 'en_to_zh',
        review_mode: 'study',
        mastery_score: 0,
      }));
      setExtraQueue(extraItems);
      setExtraIndex(0);
    } catch (err) {
      console.error('Failed to load extra vocab items', err);
      setError(err instanceof Error ? err.message : '加载加练单词失败');
    } finally {
      setLoadingExtra(false);
    }
  };

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
            {isExtraPractice
              ? `加练进度：第 ${extraIndex + 1} 个 / 共 ${extraQueue.length} 个`
              : session.loading
                ? '批次加载中…'
                : `第 ${session.currentBatchNumber} 批 / 共 ${session.totalBatchCount} 批`}
          </div>
        </header>

        {isExtraPractice ? (
          loadingExtra ? (
            <div className="flex h-48 w-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[var(--focus-work-border)] border-t-white" />
                <p className="mt-4 text-sm text-[var(--focus-work-text-muted)]">正在为您加载加练单词…</p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-[1.75rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-6 text-[var(--focus-work-text-muted)]">
              <p className="text-sm text-rose-200">{error}</p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  disabled={isPaused || exiting}
                  onClick={handleExitFocus}
                  className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exiting ? '正在结束...' : '结束本轮专注'}
                </button>
                <button
                  type="button"
                  disabled={isPaused || loadingExtra}
                  onClick={handlePracticeAgain}
                  className="rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-3 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] disabled:opacity-50"
                >
                  再试一次
                </button>
              </div>
            </div>
          ) : extraQueue.length > 0 && extraIndex < extraQueue.length ? (
            <div className="space-y-6">
              <StudyCard key={extraQueue[extraIndex].id} item={extraQueue[extraIndex]} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {actions.map((action) => (
                  <button
                    key={action.value}
                    type="button"
                    disabled={isPaused}
                    onClick={() => setExtraIndex((prev) => prev + 1)}
                    className="rounded-[1.5rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-4 text-left transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="text-base font-medium text-[var(--focus-work-text)]">{action.label}</div>
                    <div className="mt-1 text-sm text-[var(--focus-work-text-muted)]">{action.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-[1.75rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-6 text-[var(--focus-work-text-muted)]">
              <div className="text-xl font-bold text-[var(--focus-work-text)] mb-3">加练已全部完成！</div>
              <div>您已完成了本轮加练单词。您可以选择再次加练，或者结束专注。</div>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  disabled={isPaused || exiting}
                  onClick={handleExitFocus}
                  className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exiting ? '正在结束...' : '结束本轮专注'}
                </button>
                <button
                  type="button"
                  disabled={isPaused || loadingExtra}
                  onClick={handlePracticeAgain}
                  className="rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-3 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] disabled:opacity-50"
                >
                  再来一次
                </button>
              </div>
            </div>
          )
        ) : (
          <>
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
              </div>
            ) : null}

            {!session.isBatchReview && !session.loading && !session.error && !session.currentItem ? (
              <div className="rounded-[1.75rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-muted)] p-6 text-[var(--focus-work-text-muted)]">
                <div>今天这本词书的单词已经完成了。</div>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    disabled={isPaused || exiting}
                    onClick={handleExitFocus}
                    className="mt-5 rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {exiting ? '正在结束...' : '完成今日单词'}
                  </button>
                  <button
                    type="button"
                    disabled={isPaused || loadingExtra}
                    onClick={handlePracticeAgain}
                    className="mt-5 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-3 text-sm text-[var(--focus-work-text)] transition hover:border-[var(--focus-work-border)] hover:bg-[var(--focus-work-surface-soft)] disabled:opacity-50"
                  >
                    {loadingExtra ? '正在加载...' : '再来一次'}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
