import { useEffect, useMemo, useState } from 'react';

import {
  fetchVocabOverviewCompletedDecks,
  fetchVocabOverviewCurrentWords,
  fetchVocabOverviewMasteredWords,
} from '../../lib/vocab/api';
import type {
  VocabOverviewCompletedDeck,
  VocabOverviewCurrentWord,
  VocabOverviewMasteredWord,
} from '../../lib/vocab/types';

export type OverviewDetailTab = 'completed' | 'mastered' | 'current';
type CurrentWordFilter = 'all' | 'unstarted' | 'learning' | 'mastered';

type Props = {
  isOpen: boolean;
  baseDeckId: string;
  initialTab: OverviewDetailTab;
  initialTargetDeckId?: string | null;
  onClose: () => void;
};

function renderTranslations(translations: { translation: string }[]) {
  return translations.map((item) => item.translation).join('；') || '暂无释义';
}

export default function OverviewDetailModal({ isOpen, baseDeckId, initialTab, initialTargetDeckId, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<OverviewDetailTab>(initialTab);
  const [currentFilter, setCurrentFilter] = useState<CurrentWordFilter>('all');
  const [targetDeckId, setTargetDeckId] = useState<string>(initialTargetDeckId ?? baseDeckId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedDecks, setCompletedDecks] = useState<VocabOverviewCompletedDeck[]>([]);
  const [masteredWords, setMasteredWords] = useState<VocabOverviewMasteredWord[]>([]);
  const [currentWords, setCurrentWords] = useState<VocabOverviewCurrentWord[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setTargetDeckId(initialTargetDeckId ?? baseDeckId);
    setCurrentFilter('all');
    setError(null);
  }, [baseDeckId, initialTab, initialTargetDeckId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (activeTab === 'completed') {
          const items = await fetchVocabOverviewCompletedDecks(baseDeckId);
          if (!cancelled) setCompletedDecks(items);
          return;
        }
        if (activeTab === 'mastered') {
          const items = await fetchVocabOverviewMasteredWords(baseDeckId);
          if (!cancelled) setMasteredWords(items);
          return;
        }
        const items = await fetchVocabOverviewCurrentWords(baseDeckId, currentFilter, targetDeckId);
        if (!cancelled) setCurrentWords(items);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '总览明细加载失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, baseDeckId, currentFilter, isOpen, targetDeckId]);

  const currentDeckName = useMemo(() => {
    if (currentWords[0]?.deck_name) return currentWords[0].deck_name;
    const matchedDeck = completedDecks.find((item) => item.deck_id === targetDeckId);
    return matchedDeck?.deck_name ?? '当前词书';
  }, [completedDecks, currentWords, targetDeckId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/72 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="总览明细">
      <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#101218] text-white shadow-2xl shadow-black/45">
        <div className="border-b border-white/10 px-7 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm uppercase tracking-[0.28em] text-white/40">Overview</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">总览明细</h2>
              <p className="mt-3 text-sm leading-6 text-white/60">从首页的总览数字往下展开，直接看到词书和单词层面的实际内容。</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 px-3 py-2 text-sm text-white/70 transition hover:border-white/25 hover:text-white"
              aria-label="关闭总览明细弹窗"
            >
              关闭
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {[
              ['completed', '已完成词书'],
              ['mastered', '累计掌握单词'],
              ['current', '当前词书掌握度'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key as OverviewDetailTab)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  activeTab === key
                    ? 'border-white/20 bg-white text-slate-950'
                    : 'border-white/10 bg-white/5 text-white/75 hover:border-white/25 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-6">
          {activeTab === 'completed' ? (
            <div className="space-y-4">
              <div className="text-sm text-white/55">这里列出已经全部进入 Review 状态的词书。点击任意词书，可以继续查看它的单词表。</div>
              {loading ? <div className="text-sm text-white/55">已完成词书加载中…</div> : null}
              {error ? <div className="text-sm text-rose-200">{error}</div> : null}
              {!loading && !error && completedDecks.length === 0 ? <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-6 text-sm text-white/55">目前还没有完成的词书。</div> : null}
              <div className="grid gap-3">
                {completedDecks.map((deck) => (
                  <button
                    key={deck.deck_id}
                    type="button"
                    onClick={() => {
                      setTargetDeckId(deck.deck_id);
                      setCurrentFilter('all');
                      setActiveTab('current');
                    }}
                    className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5 text-left transition hover:border-white/25 hover:bg-white/10"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="text-xl font-semibold text-white">{deck.deck_name}</div>
                        <div className="mt-2 text-sm text-white/55">全部 {deck.total_word_count} 个单词都已进入 Review。</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-white/45">已掌握</div>
                        <div className="mt-2 text-2xl font-semibold text-white">{deck.mastered_word_count} / {deck.total_word_count}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === 'mastered' ? (
            <div className="space-y-4">
              <div className="text-sm text-white/55">这里按英文单词去重，同一个词即使出现在不同词书，也只会显示一行。</div>
              {loading ? <div className="text-sm text-white/55">累计掌握单词加载中…</div> : null}
              {error ? <div className="text-sm text-rose-200">{error}</div> : null}
              {!loading && !error ? <div className="text-sm text-white/45">共 {masteredWords.length} 个去重后的已掌握单词</div> : null}
              <div className="grid gap-3">
                {masteredWords.map((item) => (
                  <section key={item.id} className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="text-xl font-semibold text-white">{item.word}</div>
                        <div className="mt-2 text-sm text-white/60">{renderTranslations(item.translations)}</div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {item.source_deck_names.map((deckName) => (
                          <span key={`${item.id}-${deckName}`} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                            {deckName}
                          </span>
                        ))}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === 'current' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-white/45">当前查看</div>
                  <div className="mt-2 text-xl font-semibold text-white">{currentDeckName}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    ['all', '全部'],
                    ['unstarted', '未开始'],
                    ['learning', '学习中'],
                    ['mastered', '已掌握'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCurrentFilter(key as CurrentWordFilter)}
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        currentFilter === key
                          ? 'border-white/20 bg-white text-slate-950'
                          : 'border-white/10 bg-white/5 text-white/75 hover:border-white/25 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {loading ? <div className="text-sm text-white/55">词表加载中…</div> : null}
              {error ? <div className="text-sm text-rose-200">{error}</div> : null}
              {!loading && !error ? <div className="text-sm text-white/45">当前筛选下共 {currentWords.length} 个单词</div> : null}
              <div className="grid gap-3">
                {currentWords.map((item) => (
                  <section key={item.id} className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="text-xl font-semibold text-white">{item.word}</div>
                        <div className="mt-2 text-sm text-white/60">{renderTranslations(item.translations)}</div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                        {item.mastery_state === 'unstarted' ? '未开始' : item.mastery_state === 'learning' ? '学习中' : '已掌握'}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
