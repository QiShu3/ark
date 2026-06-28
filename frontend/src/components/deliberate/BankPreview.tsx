import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Database, Search } from 'lucide-react';
import { fetchBankPreview, fetchBankQuestions, type BankPreviewData, type BankPreviewQuestion } from '../../lib/deliberate/api';
import QuestionDetailModal from './QuestionDetailModal';

function QuestionItem({ question, kind, onClick }: { question: BankPreviewQuestion; kind: string; onClick: () => void }) {
  const typeLabel = kind === 'flashcard' ? '单词' : question.type === 'choice' ? '选择' : question.type === 'fill' ? '填空' : '主观';
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-ark-border bg-ark-surface px-3 py-2 text-left transition hover:border-ark-accent/50 hover:bg-ark-surface-subtle"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-block rounded bg-ark-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-ark-accent">{typeLabel}</span>
            {question.subject && (
              <span className="text-xs text-ark-text-faint">{question.subject}</span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-ark-text">{question.stem}</p>
          {question.options && kind === 'choice' && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ark-text-muted">
              {Object.entries(question.options).map(([key, val]) => (
                <span key={key}>
                  <span className="font-medium text-ark-text">{key}.</span> {String(val).slice(0, 40)}
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

type Props = {
  bankId: string;
  bankKind: string;
  bankName: string;
  totalCount: number;
};

export default function BankPreview({ bankId, bankKind, bankName, totalCount }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<BankPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [fullQuestions, setFullQuestions] = useState<BankPreviewQuestion[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<BankPreviewQuestion | null>(null);

  const loadPreview = useCallback(async () => {
    if (preview || loading) return;
    setLoading(true);
    try {
      const data = await fetchBankPreview(bankId);
      setPreview(data);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [bankId, preview, loading]);

  useEffect(() => {
    if (expanded && !preview) {
      void loadPreview();
    }
  }, [expanded, preview, loadPreview]);

  const handleSearch = useCallback(async () => {
    if (!search.trim()) {
      setFullQuestions(null);
      return;
    }
    setLoadingMore(true);
    try {
      const data = await fetchBankQuestions(bankId, { search: search.trim(), limit: 50 });
      setFullQuestions(data.questions);
    } catch {
      setFullQuestions(null);
    } finally {
      setLoadingMore(false);
    }
  }, [bankId, search]);

  const displayQuestions = fullQuestions ?? preview?.questions ?? [];
  const subjectCount = preview?.subjects?.length ?? 0;

  return (
    <>
      <div className="rounded-lg border border-ark-border bg-ark-surface-subtle">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-ark-accent" aria-hidden="true" />
            <span className="text-sm font-medium text-ark-text">题库内容</span>
            {preview && (
              <span className="text-xs text-ark-text-faint">
                {preview.total_count} 题{subjectCount > 0 ? ` · ${subjectCount} 个科目` : ''}
              </span>
            )}
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-ark-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-ark-text-muted" />
          )}
        </button>

        {expanded && (
          <div className="border-t border-ark-border px-4 py-3">
            <div className="mb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ark-text-faint" aria-hidden="true" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
                  placeholder="搜索题目..."
                  className="w-full rounded-md border border-ark-border bg-ark-input py-1.5 pl-8 pr-3 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-1 focus:ring-[var(--ark-focus-ring)]"
                />
              </div>
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setFullQuestions(null); }}
                  className="text-xs text-ark-text-muted hover:text-ark-text"
                >
                  清除
                </button>
              )}
            </div>

            {loading && !preview ? (
              <div className="py-6 text-center text-sm text-ark-text-muted">加载中...</div>
            ) : displayQuestions.length === 0 ? (
              <div className="py-6 text-center text-sm text-ark-text-muted">暂无题目</div>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
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

            {loadingMore && (
              <div className="mt-2 text-center text-xs text-ark-text-muted">搜索中...</div>
            )}
          </div>
        )}
      </div>

      <QuestionDetailModal
        question={selectedQuestion}
        bankKind={bankKind}
        onClose={() => setSelectedQuestion(null)}
      />
    </>
  );
}
