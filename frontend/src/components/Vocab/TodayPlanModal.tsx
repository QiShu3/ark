import { useEffect, useState } from 'react';
import { BookOpen, Clock } from 'lucide-react';

import AppModalFrame from '../AppModalFrame';
import DeckSwitcher from './DeckSwitcher';
import type { VocabDeck } from '../../lib/vocab/types';

type DeckInheritancePrompt = {
  deck: VocabDeck;
  inheritableWordCount: number;
  submitting: boolean;
};

type Props = {
  initialTargetCount: number;
  initialFocusDuration: number; // in seconds
  isCompleted: boolean;
  isSaving: boolean;
  syncNotice?: string | null;
  decks?: VocabDeck[];
  activeDeck?: VocabDeck | null;
  inheritancePrompt?: DeckInheritancePrompt | null;
  onDeckChange?: (deck: VocabDeck) => void;
  onConfirmInheritance?: () => Promise<void> | void;
  onDismissInheritance?: () => void;
  onClose: () => void;
  onSave: (totalTargetCount: number, addToTodayPlan: boolean, focusDuration: number) => Promise<void> | void;
};

export default function TodayPlanModal({
  initialTargetCount,
  initialFocusDuration,
  isCompleted,
  isSaving,
  syncNotice,
  decks,
  activeDeck,
  inheritancePrompt = null,
  onDeckChange,
  onConfirmInheritance,
  onDismissInheritance,
  onClose,
  onSave,
}: Props) {
  const [targetCountValue, setTargetCountValue] = useState(String(initialTargetCount));
  const [focusDurationValue, setFocusDurationValue] = useState(String(Math.round(initialFocusDuration / 60)));

  useEffect(() => {
    setTargetCountValue(String(initialTargetCount));
  }, [initialTargetCount]);

  useEffect(() => {
    setFocusDurationValue(String(Math.round(initialFocusDuration / 60)));
  }, [initialFocusDuration]);

  const parsedTargetCount = Number(targetCountValue);
  const totalTargetCount = targetCountValue === '' || !Number.isFinite(parsedTargetCount) ? 0 : Math.max(1, parsedTargetCount);
  const canSave = totalTargetCount >= 1 && totalTargetCount <= 500;

  const parsedFocusDuration = Number(focusDurationValue);
  const focusDurationSeconds = (focusDurationValue === '' || !Number.isFinite(parsedFocusDuration) ? 25 : Math.max(5, Math.min(120, parsedFocusDuration))) * 60;

  const title = '配置今日单词';
  const canChooseDeck = decks && activeDeck && onDeckChange;

  return (
    <AppModalFrame
      open={true}
      onClose={onClose}
      zIndexClassName="z-[80]"
      ariaLabel={title}
      panelClassName="w-full max-w-2xl rounded-lg border border-ark-border bg-ark-surface-strong p-6 text-ark-text shadow-2xl shadow-black/40 overflow-y-auto"
    >
        <div className="flex items-start justify-between gap-4 border-b border-ark-border pb-5">
          <div>
            <div className="text-sm uppercase tracking-[0.28em] text-[var(--ark-text-faint)] font-semibold">Configuration</div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2>
            <p className="mt-2 text-xs text-ark-text-muted">
              {isCompleted ? '今天这本词书已经完成，可调整目标继续再来一轮。' : '配置词书上下文、今日目标和默认专注时长。'}
            </p>
            {syncNotice ? <p className="mt-2 text-xs text-emerald-200">{syncNotice}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-ark-border px-4 py-2 text-sm text-ark-text transition hover:border-ark-border hover:text-ark-text"
            aria-label="关闭配置今日单词弹窗"
          >
            关闭
          </button>
        </div>

        <div className="mt-6 space-y-5">
          {canChooseDeck ? (
            <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-5">
              <div className="mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[var(--ark-accent)]" />
                <h3 className="text-base font-semibold text-ark-text">上下文</h3>
              </div>
              <DeckSwitcher
                decks={decks}
                activeDeck={activeDeck}
                onChange={onDeckChange}
                inheritancePrompt={inheritancePrompt}
                onConfirmInheritance={onConfirmInheritance}
                onDismissInheritance={onDismissInheritance}
              />
            </div>
          ) : null}

          <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-ark-border pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[var(--ark-accent)]" />
                <h3 className="text-base font-semibold text-ark-text">托管任务</h3>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="today-target-count" className="block text-xs text-ark-text-muted mb-2">
                  今日总量
                </label>
                <input
                  id="today-target-count"
                  type="number"
                  min={1}
                  max={500}
                  value={targetCountValue}
                  onChange={(event) => setTargetCountValue(event.target.value)}
                  className="w-full rounded-lg border border-ark-border bg-ark-surface-subtle px-4 py-3 text-sm text-ark-text outline-none transition focus:border-ark-border"
                />
              </div>
              <div>
                <label htmlFor="focus-duration" className="block text-xs text-ark-text-muted mb-2">
                  默认专注时长 (分钟)
                </label>
                <div className="relative">
                  <input
                    id="focus-duration"
                    type="number"
                    min={5}
                    max={120}
                    value={focusDurationValue}
                    onChange={(event) => setFocusDurationValue(event.target.value)}
                    className="w-full rounded-lg border border-ark-border bg-ark-surface-subtle pl-4 pr-12 py-3 text-sm text-ark-text outline-none transition focus:border-ark-border"
                  />
                  <Clock className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ark-text-faint" />
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3 border-t border-ark-border pt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-ark-border px-5 py-3 text-sm text-ark-text transition hover:border-ark-border hover:text-ark-text"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isSaving || !canSave}
            onClick={() => void onSave(totalTargetCount, true, focusDurationSeconds)}
            className="rounded-lg border border-ark-border bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCompleted ? '保存并继续' : '保存配置'}
          </button>
        </div>
    </AppModalFrame>
  );
}
