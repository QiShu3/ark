import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUpAZ,
  ChevronsLeft,
  ChevronsRight,
  Database,
  Eye,
  Search,
  X,
} from 'lucide-react';
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

type SortField = 'index' | 'subject' | 'stem' | 'options' | 'answer';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 20;

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
  const [questions, setQuestions] = useState<BankPreviewQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(totalCount);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<BankPreviewQuestion | null>(null);
  const [sortField, setSortField] = useState<SortField>('index');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadQuestions = useCallback(
    async (page: number, keyword: string) => {
      if (!open) return;
      setLoading(true);
      try {
        const data = await fetchBankQuestions(bankId, {
          page,
          limit: PAGE_SIZE,
          search: keyword.trim() || undefined,
        });
        setQuestions(data.questions);
        setTotal(data.total_count);
      } catch {
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    },
    [bankId, open]
  );

  const loadSubjects = useCallback(async () => {
    if (!open) return;
    try {
      const data = await fetchBankPreview(bankId);
      setSubjects(data.subjects || []);
    } catch {
      setSubjects([]);
    }
  }, [bankId, open]);

  useEffect(() => {
    if (open) {
      setQuestions([]);
      setSearch('');
      setSearchInput('');
      setCurrentPage(1);
      setTotal(totalCount);
      setSelectedQuestion(null);
      setSortField('index');
      setSortDirection('asc');
      void loadSubjects();
      void loadQuestions(1, '');
    }
  }, [open, bankId, totalCount, loadQuestions, loadSubjects]);

  const handleSearch = useCallback(() => {
    setSearch(searchInput.trim());
    setCurrentPage(1);
    void loadQuestions(1, searchInput);
  }, [searchInput, loadQuestions]);

  const goToPage = useCallback(
    (page: number) => {
      const target = Math.max(1, Math.min(page, totalPages));
      setCurrentPage(target);
      void loadQuestions(target, search);
    },
    [totalPages, search, loadQuestions]
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const displayQuestions = useMemo(() => {
    if (sortField === 'index') return questions;
    const sorted = [...questions];
    sorted.sort((a, b) => {
      let aVal = '';
      let bVal = '';

      switch (sortField) {
        case 'subject':
          aVal = a.subject || '';
          bVal = b.subject || '';
          break;
        case 'stem':
          aVal = a.stem || '';
          bVal = b.stem || '';
          break;
        case 'options':
          {
            const aOpts = normalizeOptions(a.options);
            const bOpts = normalizeOptions(b.options);
            aVal = aOpts ? Object.values(aOpts).join(' ') : '';
            bVal = bOpts ? Object.values(bOpts).join(' ') : '';
          }
          break;
        case 'answer':
          aVal = a.answer || '';
          bVal = b.answer || '';
          break;
      }

      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal, 'zh-CN')
        : bVal.localeCompare(aVal, 'zh-CN');
    });
    return sorted;
  }, [questions, sortField, sortDirection]);

  const subjectCount = subjects.length;
  const kindLabel = bankKind === 'flash_card' ? '闪卡' : bankKind === 'choice' ? '选择题' : '输入题';
  const startIdx = (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, total);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ArrowUpAZ className="h-3 w-3" /> : <ArrowDownAZ className="h-3 w-3" />;
  };

  return (
    <>
      <AppModalFrame open={open} onClose={onClose} ariaLabel="题库详情">
        <div className="w-[1100px] max-w-[96vw] max-h-[85vh] flex flex-col rounded-xl border border-ark-border bg-ark-surface shadow-xl">
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
                  <span>共 {total} {bankKind === 'flash_card' ? '词' : '题'}</span>
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
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch();
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
                      setSearchInput('');
                      setSearch('');
                      setCurrentPage(1);
                      void loadQuestions(1, '');
                    }}
                    className="text-xs text-ark-text-muted hover:text-ark-text"
                  >
                    清除搜索
                  </button>
                )}
                <span className="text-xs text-ark-text-faint">
                  显示 {startIdx}-{endIdx} / 共 {total} 条
                </span>
              </div>
            </div>
          </div>

          {/* 表格区域 */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {loading && questions.length === 0 ? (
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
                    <col className="w-24" />
                    <col className="w-72" />
                    <col className="w-80" />
                    <col className="w-40" />
                    <col className="w-16" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-ark-surface-strong">
                    <tr className="text-left text-xs text-ark-text-muted">
                      <th
                        className="cursor-pointer select-none px-3 py-2.5 font-medium whitespace-nowrap border-b border-ark-border"
                        onClick={() => handleSort('index')}
                      >
                        <div className="flex items-center gap-1">
                          序号
                          <SortIcon field="index" />
                        </div>
                      </th>
                      <th
                        className="cursor-pointer select-none px-3 py-2.5 font-medium whitespace-nowrap border-b border-ark-border"
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
                        className="cursor-pointer select-none px-3 py-2.5 font-medium border-b border-ark-border"
                        onClick={() => handleSort('options')}
                      >
                        <div className="flex items-center gap-1">
                          选项
                          <SortIcon field="options" />
                        </div>
                      </th>
                      <th
                        className="cursor-pointer select-none px-3 py-2.5 font-medium border-b border-ark-border"
                        onClick={() => handleSort('answer')}
                      >
                        <div className="flex items-center gap-1">
                          答案
                          <SortIcon field="answer" />
                        </div>
                      </th>
                      <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap border-b border-ark-border">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayQuestions.map((q, idx) => {
                      const opts = normalizeOptions(q.options);
                      const globalIdx = (currentPage - 1) * PAGE_SIZE + idx + 1;
                      return (
                        <tr
                          key={q.id}
                          className="border-b border-ark-border/50 hover:bg-ark-surface-subtle transition-colors cursor-pointer"
                          onClick={() => setSelectedQuestion(q)}
                        >
                          <td className="px-3 py-2 text-ark-text-faint text-xs align-top">
                            {globalIdx}
                          </td>
                          <td className="px-3 py-2 text-ark-text-muted text-xs truncate align-top">
                            {q.subject || '—'}
                          </td>
                          <td className="px-3 py-2 text-ark-text align-top break-words">
                            <div className="line-clamp-3 text-sm leading-relaxed">
                              {q.stem}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            {opts && bankKind === 'choice' ? (
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
                                      <span className="min-w-0 flex-1 line-clamp-1">
                                        {String(val)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-ark-text-faint">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-green-600 text-xs align-top">
                            <div className="line-clamp-2">
                              {getAnswerPreview(q, bankKind)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right align-top">
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 分页栏 */}
          <div className="flex items-center justify-between border-t border-ark-border px-5 py-3">
            <div className="text-xs text-ark-text-faint">
              第 {currentPage} / {totalPages} 页
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToPage(1)}
                disabled={currentPage === 1 || loading}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title="首页"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title="上一页"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="mx-2 text-sm text-ark-text">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages || loading}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title="下一页"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages || loading}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title="末页"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
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
