import React from 'react';

import QuizRenderer from './QuizRenderer';
import StudyCard from './StudyCard';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { useVocabTodaySession } from '../../hooks/vocab/useVocabTodaySession';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import { apiJson } from '../../lib/api';
import type { VocabReviewItem } from '../../lib/vocab/types';
import { Frown, Meh, CheckCircle2, Rocket } from 'lucide-react';

const actions = [
  {
    label: '没记住',
    hint: '今天稍后再看',
    value: 'again' as const,
    icon: Frown,
    bgClass: 'hover:bg-[var(--focus-work-rose-bg)] hover:border-[var(--focus-work-rose-border)] focus-visible:bg-[var(--focus-work-rose-bg)] focus-visible:border-[var(--focus-work-rose-border)]',
    iconColor: 'text-[var(--focus-work-rose-text)]',
    shortcut: '1',
  },
  {
    label: '有点难',
    hint: '进入较短间隔',
    value: 'hard' as const,
    icon: Meh,
    bgClass: 'hover:bg-[var(--focus-work-amber-bg)] hover:border-[var(--focus-work-amber-border)] focus-visible:bg-[var(--focus-work-amber-bg)] focus-visible:border-[var(--focus-work-amber-border)]',
    iconColor: 'text-[var(--focus-work-amber-text)]',
    shortcut: '2',
  },
  {
    label: '记住了',
    hint: '进入正常间隔',
    value: 'good' as const,
    icon: CheckCircle2,
    bgClass: 'hover:bg-[var(--focus-work-emerald-bg)] hover:border-[var(--focus-work-emerald-border)] focus-visible:bg-[var(--focus-work-emerald-bg)] focus-visible:border-[var(--focus-work-emerald-border)]',
    iconColor: 'text-[var(--focus-work-emerald-text)]',
    shortcut: '3',
  },
  {
    label: '很轻松',
    hint: '延后更久再看',
    value: 'easy' as const,
    icon: Rocket,
    bgClass: 'hover:bg-[var(--focus-work-sky-bg)] hover:border-[var(--focus-work-sky-border)] focus-visible:bg-[var(--focus-work-sky-bg)] focus-visible:border-[var(--focus-work-sky-border)]',
    iconColor: 'text-[var(--focus-work-sky-text)]',
    shortcut: '4',
  },
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

  // Lift revealed state up to allow keyboard control and automatic reset
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    setRevealed(false);
  }, [session.currentItem?.id, extraIndex]);

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
      interface CurrentWordBrief {
        id: string;
      }
      const currentWords = await apiJson<CurrentWordBrief[]>(`/api/vocab/decks/${activeDeck.id}/overview/current-words?state=all`);
      if (!currentWords || currentWords.length === 0) {
        throw new Error('当前词书没有任何单词');
      }
      const shuffled = [...currentWords].sort(() => 0.5 - Math.random());
      const selectedWords = shuffled.slice(0, 10);
      const details = await Promise.all(selectedWords.map((w) => apiJson<VocabWordDetail>(`/api/vocab/words/${w.id}`)));
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

  const handleRatingSubmit = React.useCallback(async (value: 'again' | 'hard' | 'good' | 'easy') => {
    if (isPaused) return;
    if (isExtraPractice) {
      setExtraIndex((prev) => prev + 1);
    } else {
      await session.submit(value);
    }
  }, [isPaused, isExtraPractice, session]);

  // Keyboard shortcut listeners
  React.useEffect(() => {
    if (isPaused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in a form input
      const activeEl = document.activeElement;
      if (activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName)) {
        return;
      }

      const hasActiveItem = isExtraPractice
        ? (extraQueue.length > 0 && extraIndex < extraQueue.length)
        : !!session.currentItem;

      if (!hasActiveItem) return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          if (!session.submitting) {
            void handleRatingSubmit('again');
          }
          break;
        case '2':
          e.preventDefault();
          if (!session.submitting) {
            void handleRatingSubmit('hard');
          }
          break;
        case '3':
          e.preventDefault();
          if (!session.submitting) {
            void handleRatingSubmit('good');
          }
          break;
        case '4':
          e.preventDefault();
          if (!session.submitting) {
            void handleRatingSubmit('easy');
          }
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          setRevealed((prev) => !prev);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (!isExtraPractice) {
            session.goToPrev?.();
          } else {
            setExtraIndex((prev) => Math.max(0, prev - 1));
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (!isExtraPractice) {
            session.goToNext?.();
          } else {
            setExtraIndex((prev) => Math.min(extraQueue.length - 1, prev + 1));
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPaused, isExtraPractice, extraQueue, extraIndex, session, handleRatingSubmit]);

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

  // Premium progress bars
  const renderProgressBar = () => {
    const total = session.totalBatchCount;
    const current = session.currentBatchNumber;

    const getDotPosition = (index: number) => {
      if (total <= 1) return 50;
      return 10 + (index / (total - 1)) * 80;
    };

    const fillWidth = total > 1 ? 10 + ((current - 1) / (total - 1)) * 80 : 100;

    return (
      <div className="relative mt-3 h-4 w-full flex items-center">
        <div className="absolute left-0 right-0 h-1 bg-[var(--focus-work-surface-soft)] rounded-full border border-[var(--focus-work-border)]" />
        <div
          className="absolute left-0 h-1 bg-emerald-500 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]"
          style={{ width: `${fillWidth}%` }}
        />
        {Array.from({ length: total }).map((_, i) => {
          const pos = getDotPosition(i);
          const isNodeActive = i < current;
          const isCurrent = i === current - 1;

          return (
            <div
              key={i}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full border transition-all duration-300 ${
                isNodeActive
                  ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                  : 'bg-slate-800 border-slate-700'
              } ${isCurrent ? 'scale-125 border-emerald-200' : ''}`}
              style={{ left: `${pos}%` }}
              title={`第 ${i + 1} 批`}
            />
          );
        })}
      </div>
    );
  };

  const renderExtraProgressBar = () => {
    const total = extraQueue.length;
    const current = extraIndex;
    const progress = total > 0 ? (current / total) * 100 : 0;

    return (
      <div className="relative mt-3 h-2 w-full bg-[var(--focus-work-surface-soft)] rounded-full border border-[var(--focus-work-border)] overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(16,185,129,0.5)]"
          style={{ width: `${progress}%` }}
        />
      </div>
    );
  };

  return (
    <div className="h-full w-full overflow-y-auto px-4 pb-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="pt-2">
          <div className="text-sm font-medium text-[var(--focus-work-text)] text-center">
            {isExtraPractice
              ? `加练进度：第 ${extraIndex + 1} 个 / 共 ${extraQueue.length} 个`
              : session.loading
              ? '批次加载中…'
              : `第 ${session.currentBatchNumber} 批 / 共 ${session.totalBatchCount} 批`}
          </div>
          {isExtraPractice ? renderExtraProgressBar() : renderProgressBar()}
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
              <StudyCard
                key={extraQueue[extraIndex].id}
                item={extraQueue[extraIndex]}
                revealed={revealed}
                onToggleRevealed={() => setRevealed((r) => !r)}
              />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.value}
                      type="button"
                      disabled={isPaused}
                      onClick={() => void handleRatingSubmit(action.value)}
                      className={`flex items-center gap-4 rounded-[1.5rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${action.bgClass}`}
                    >
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--focus-work-surface-muted)] border border-[var(--focus-work-border)] ${action.iconColor}`}>
                        <Icon className="h-5.5 w-5.5" />
                      </div>
                      <div>
                        <div className="text-base font-semibold text-[var(--focus-work-text)] flex items-center gap-2">
                          <span>{action.label}</span>
                          <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-[var(--focus-work-surface-muted)] border border-[var(--focus-work-border)] text-[10px] font-mono text-[var(--focus-work-text-faint)]">
                            {action.shortcut}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--focus-work-text-muted)] leading-tight">{action.hint}</div>
                      </div>
                    </button>
                  );
                })}
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
            <p className="text-sm leading-6 text-[var(--focus-work-text-muted)] text-center">
              {session.isBatchReview ? '上一批先简单回顾一下，再继续今天的词。' : '先完成今天这一个词，再进入下一步。'}
            </p>

            {session.loading ? <p className="text-sm text-[var(--focus-work-text-muted)] text-center">今日单词加载中…</p> : null}
            {session.error ? <p className="text-sm text-rose-200 text-center">{session.error}</p> : null}

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
                {session.currentMode === 'review' ? (
                  <QuizRenderer item={session.currentItem} />
                ) : (
                  <StudyCard
                    key={session.currentItem.id}
                    item={session.currentItem}
                    revealed={revealed}
                    onToggleRevealed={() => setRevealed((r) => !r)}
                  />
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {actions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.value}
                        type="button"
                        disabled={isPaused || session.submitting}
                        onClick={() => void handleRatingSubmit(action.value)}
                        className={`flex items-center gap-4 rounded-[1.5rem] border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${action.bgClass}`}
                      >
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--focus-work-surface-muted)] border border-[var(--focus-work-border)] ${action.iconColor}`}>
                          <Icon className="h-5.5 w-5.5" />
                        </div>
                        <div>
                          <div className="text-base font-semibold text-[var(--focus-work-text)] flex items-center gap-2">
                            <span>{action.label}</span>
                            <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-[var(--focus-work-surface-muted)] border border-[var(--focus-work-border)] text-[10px] font-mono text-[var(--focus-work-text-faint)]">
                              {action.shortcut}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--focus-work-text-muted)] leading-tight">{action.hint}</div>
                        </div>
                      </button>
                    );
                  })}
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

        {/* Premium Shortcuts Info Footer */}
        <footer className="mt-8 flex items-center justify-center border-t border-[var(--focus-work-border)] pt-4 text-xs text-[var(--focus-work-text-faint)]">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--focus-work-surface-soft)] border border-[var(--focus-work-border)] text-[10px] font-mono">💡</span>
            <span>键盘快捷键：[1-4] 选择记忆度并提交，[←/→] 切换单词，[Space/Enter] 显示/隐藏释义</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
