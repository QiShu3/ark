import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Database, Eye, Search, X } from 'lucide-react';
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

type SortField = 'index' | 'type' | 'subject' | 'stem' | 'answer';
type SortDirection = 'asc' | 'desc';

function getTypeLabel(kind: string, questionType: string) {
  if (kind === 'flash_card') return '单词';
  if (questionType === 'choice') return '选择';
  if (questionType === 'fill') return '填空';
  if (questionType === 'subjective') return '主观';
  return questionType;
}

function normalizeOptions(options: unknown): Record<string, string> | null {
  if (!options) return null;
  if (typeof options === 'string') {
    try {
      const parsed = JSON.parse(options);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      // 解析失败，返回 null
    }
    return null;
  }
  if (typeof options === 'object' && !Array.isArray(options)) {
    return options as Record<string, string>;
  }
  return null;
}

function getAnswerPreview(question: BankPreviewQuestion, kind: string): string {
  const opts = normalizeOptions(question.options);
  if (kind === 'choice' && opts && question.answer) {
    const optVal = opts[question.answer];
    if (optVal) {
      const text = String(optVal);
      return `${question.answer}. ${text.length > 30 ? text.slice(0, 30) + '…' : text}`;
    }
    return question.answer;
  }
  if (question.answer) {
    const text = String(question.answer);
    return text.length > 40 ? text.slice(0, 40) + '…' : text;
  }
  return '—';
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
  const [sortField, setSortField] = useState<SortField>('index');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

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
      setSortField('index');
      setSortDirection('asc');
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const displayQuestions = useMemo(() => {
    const list = searchResults ?? preview?.questions ?? [];
    const sorted = [...list];
    sorted.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'index':
          // 没有原始索引，保持原始顺序（稳定排序）
          return sortDirection === 'asc' ? 0 : 0;
        case 'type':
          aVal = getTypeLabel(bankKind, a.type);
          bVal = getTypeLabel(bankKind, b.type);
          break;
        case 'subject':
          aVal = a.subject || '';
          bVal = b.subject || '';
          break;
        case 'stem':
          aVal = a.stem || '';
          bVal = b.stem || '';
          break;
        case 'answer':
          aVal = a.answer || '';
          bVal = b.answer || '';
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal, 'zh-CN')
          : bVal.localeCompare(aVal, 'zh-CN');
      }
      return 0;
    });
    return sorted;
  }, [searchResults, preview?.questions, sortField, sortDirection, bankKind]);

  const subjectCount = preview?.subjects?.length ?? 0;
  const kindLabel = bankKind === 'flash_card' ? '闪卡' : bankKind === 'choice' ? '选择题' : '输入题';

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ArrowUpAZ className="h-3 w-3" />
    ) : (
      <ArrowDownAZ className="h-3 w-3" />
    );
  };

  return (
    <>
      <AppModalFrame open={open} onClose={onClose} ariaLabel="题库详情">
        <div className="w-[960px] max-w-[95vw] max-h-[85vh] flex flex-col rounded-xl border border-ark-border bg-ark-surface shadow-xl">
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
                    共 {totalCount} {bankKind === 'flash_card' ? '词' : '题'}
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
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
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
                  placeholder="搜索题干、选项、答案..."
                  className="w-full rounded-md border border-ark-border bg-ark-input py-2 pl-9 pr-3 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-1 focus:ring-[var(--ark-focus-ring)]"
                />
              </div>
              <div className="flex items-center gap-2">
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setSearchResults(null);
                    }}
                    className="text-xs text-ark-text-muted hover:text-ark-text"
                  >
                    清除搜索
                  </button>
                )}
                {searchResults !== null && (
                  <span className="text-xs text-ark-text-faint">
                    找到 {searchResults.length} 条
                    {searchResults.length >= 50 && '（上限 50）'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 表格区域 */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {loading && !preview ? (
              <div className="flex-1 flex items-center justify-center text-sm text-ark-text-muted">
                加载中...
              </div>
            ) : displayQuestions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-ark-text-muted">
                {search ? '没有找到匹配的题目' : '暂无题目'}
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-12" />
                    <col className="w-16" />
                    <col className="w-24" />
                    <col />
                    <col className="w-48" />
                    <col className="w-16" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-ark-surface-strong">
                    <tr className="text-left text-xs text-ark-text-muted">
                      <th
                        className="cursor-pointer select-none px-3 py-2.5 font-medium w-14 whitespace-nowrap border-b border-ark-border"
                        onClick={() => handleSort('index')}
                      >
                        <div className="flex items-center gap-1">
                          序号
                          <SortIcon field="index" />
                        </div>
                      </th>
                      <th
                        className="cursor-pointer select-none px-3 py-2.5 font-medium w-20 whitespace-nowrap border-b border-ark-border"
                        onClick={() => handleSort('type')}
                      >
                        <div className="flex items-center gap-1">
                          题型
                          <SortIcon field="type" />
                        </div>
                      </th>
                      <th
                        className="cursor-pointer select-none px-3 py-2.5 font-medium w-28 whitespace-nowrap border-b border-ark-border"
                        onClick={() => handleSort('subject')}
                      >
                        <div className="flex items-center gap-1">
                          科目
                          <SortIcon field="subject" />
                        </div>
                      </th>
                      <th
                        className="cursor-pointer select-none px-3 py-2.5 font-medium border-b border-ark-border"
                        onClick={() => handleSort('stem')}
                      >
                        <div className="flex items-center gap-1">
                          {bankKind === 'flash_card' ? '单词' : '题干'}
                          <SortIcon field="stem" />
                        </div>
                      </th>
                      <th
                        className="cursor-pointer select-none px-3 py-2.5 font-medium w-48 border-b border-ark-border"
                        onClick={() => handleSort('answer')}
                      >
                        <div className="flex items-center gap-1">
                          答案
                          <SortIcon field="answer" />
                        </div>
                      </th>
                      <th className="px-3 py-2.5 font-medium w-16 text-right whitespace-nowrap border-b border-ark-border">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayQuestions.map((q, idx) => (
                      <tr
                        key={q.id}
                        className="border-b border-ark-border/50 hover:bg-ark-surface-subtle transition-colors cursor-pointer"
                        onClick={() => setSelectedQuestion(q)}
                      >
                        <td className="px-3 py-2 text-ark-text-faint w-14 text-xs">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 w-20">
                          <span className="inline-block rounded bg-ark-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-ark-accent">
                            {getTypeLabel(bankKind, q.type)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-ark-text-muted w-28 text-xs truncate max-w-[7rem]">
                          {q.subject || '—'}
                        </td>
                        <td className="px-3 py-2 text-ark-text align-top break-words">
                          <div className="line-clamp-2 mb-1.5 text-sm">
                            {q.stem}
                          </div>
                          {(() => {
                            const opts = normalizeOptions(q.options);
                            if (!opts || bankKind !== 'choice') return null;
                            return (
                              <div className="space-y-0.5 break-words">
                                {Object.entries(opts).map(([key, val]) => {
                                  const isCorrect = key === q.answer;
                                  return (
                                    <div
                                      key={key}
                                      className={`flex items-start gap-1.5 text-xs leading-relaxed ${
                                        isCorrect
                                          ? 'text-green-600'
                                          : 'text-ark-text-muted'
                                      }`}
                                    >
                                      <span
                                        className={`inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[10px] font-medium ${
                                          isCorrect
                                            ? 'bg-green-500/15 text-green-600'
                                            : 'bg-ark-surface-strong text-ark-text-faint'
                                        }`}
                                      >
                                        {key}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        {String(val)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2 text-green-600 w-48 text-xs">
                          <div className="line-clamp-2">
                            {getAnswerPreview(q, bankKind)}
                          </div>
                        </td>
                        <td className="px-3 py-2 w-16 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedQuestion(q);
                            }}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-ark-text-muted hover:bg-ark-surface-strong hover:text-ark-text transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            查看
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {searching && (
              <div className="py-2 text-center text-xs text-ark-text-muted border-t border-ark-border/50">
                搜索中...
              </div>
            )}
          </div>

          {/* 底部操作 */}
          <div className="flex items-center justify-between border-t border-ark-border px-5 py-3">
            <div className="text-xs text-ark-text-faint">
              显示 {displayQuestions.length} / {totalCount} 条
              {searchResults && searchResults.length >= 50 && '（搜索结果最多 50 条）'}
            </div>
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
