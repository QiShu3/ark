import { useCallback, useEffect, useState } from 'react';
import { Database, Search, X } from 'lucide-react';
import AppModalFrame from '../AppModalFrame';
import QuestionDetailModal from './QuestionDetailModal';
import {
  fetchBankPreview,
  fetchBankQuestions,
  type BankPreviewData,
  type BankPreviewQuestion,
  type DeliberateKind,
} from '../../lib/deliberate/api';

type Props = {
  open: boolean;
  bankId: string;
  bankName: string;
  bankKind: DeliberateKind;
  totalCount: number;
  onClose: () => void;
};

function QuestionItem({
  question,
  kind,
  onClick,
}: {
  question: BankPreviewQuestion;
  kind: string;
  onClick: () => void;
}) {
  const typeLabel =
    kind === 'flash_card'
      ? '单词'
      : question.type === 'choice'
        ? '选择'
        : question.type === 'fill'
          ? '填空'
          : '主观';
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-ark-border bg-ark-surface px-3 py-2 text-left transition hover:border-ark-accent/50 hover:bg-ark-surface-subtle"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-block rounded bg-ark-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-ark-accent">
              {typeLabel}
            </span>
            {question.subject && (
              <span className="text-xs text-ark-text-faint">{question.subject}</span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-ark-text">{question.stem}</p>
          {question.options && kind === 'choice' && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ark-text-muted">
              {Object.entries(question.options).map(([key, val]) => (
                <span key={key}>
                  <span className="font-medium text-ark-text">{key}.</span>{' '}
                  {String(val).slice(0, 40)}
                  {String(val).length > 40 ? '…' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export default function BankDetailModal({
  open,
  bankId,
  bankName,
  bankKind,
  totalCount,
  onClose,
}: Props) {
  const [preview, setPreview] = useState<BankPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<BankPreviewQuestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<BankPreviewQuestion | null>(null);

  const loadPreview = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const data = await fetchBankPreview(bankId);
      setPreview(data);
    } catch {
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [bankId, open]);

  useEffect(() => {
    if (open) {
      setPreview(null);
      setSearch('');
      setSearchResults(null);
      setSelectedQuestion(null);
      void loadPreview();
    }
  }, [open, bankId, loadPreview]);

  const handleSearch = useCallback(async () => {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const data = await fetchBankQuestions(bankId, { search: search.trim(), limit: 50 });
      setSearchResults(data.questions);
    } catch {
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  }, [bankId, search]);

  const displayQuestions = searchResults ?? preview?.questions ?? [];
  const subjectCount = preview?.subjects?.length ?? 0;
  const kindLabel = bankKind === 'flash_card' ? '闪卡' : bankKind === 'choice' ? '选择题' : '输入题';

  return (
    <>
      <AppModalFrame open={open} onClose={onClose} ariaLabel="题库详情">
        <div className="w-[680px] max-w-[92vw] max-h-[80vh] flex flex-col rounded-xl border border-ark-border bg-ark-surface shadow-xl">
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-ark-border px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ark-accent/10">
                <Database className="h-5 w-5 text-ark-accent" aria-hidden="true" />
              </div>
              <div>
                <div className="text-base font-semibold text-ark-text">{bankName}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ark-text-muted">
                  <span className="inline-block rounded bg-ark-surface-strong px-1.5 py-0.5">
                    {kindLabel}
                  </span>
                  <span>
                    {totalCount} {bankKind === 'flash_card' ? '词' : '题'}
                  </span>
                  {subjectCount > 0 && <span>· {subjectCount} 个科目</span>}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 搜索栏 */}
          <div className="border-b border-ark-border px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ark-text-faint"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSearch();
                  }}
                  placeholder="搜索题目内容..."
                  className="w-full rounded-md border border-ark-border bg-ark-input py-2 pl-9 pr-3 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-1 focus:ring-[var(--ark-focus-ring)]"
                />
              </div>
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setSearchResults(null);
                  }}
                  className="text-xs text-ark-text-muted hover:text-ark-text"
                >
                  清除
                </button>
              )}
            </div>
            {searchResults !== null && (
              <div className="mt-2 text-xs text-ark-text-faint">
                找到 {searchResults.length} 条结果
                {searchResults.length >= 50 && '（最多显示 50 条）'}
              </div>
            )}
          </div>

          {/* 题目列表 */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading && !preview ? (
              <div className="py-10 text-center text-sm text-ark-text-muted">加载中...</div>
            ) : displayQuestions.length === 0 ? (
              <div className="py-10 text-center text-sm text-ark-text-muted">
                {search ? '没有找到匹配的题目' : '暂无题目'}
              </div>
            ) : (
              <div className="space-y-2">
                {displayQuestions.map((q) => (
                  <QuestionItem
                    key={q.id}
                    question={q}
                    kind={bankKind}
                    onClick={() => setSelectedQuestion(q)}
                  />
                ))}
              </div>
            )}

            {searching && (
              <div className="mt-3 text-center text-xs text-ark-text-muted">搜索中...</div>
            )}
          </div>

          {/* 底部操作 */}
          <div className="border-t border-ark-border px-5 py-3 text-right">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-1.5 text-sm text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text"
            >
              关闭
            </button>
          </div>
        </div>
      </AppModalFrame>

      <QuestionDetailModal
        question={selectedQuestion}
        bankKind={bankKind}
        onClose={() => setSelectedQuestion(null)}
      />
    </>
  );
}
