import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, ArrowDown, History, ChevronLeft, ChevronRight } from 'lucide-react';
import Navigation from '../components/Navigation';
import ChatBox from '../components/ChatBox';
import AIAssistantShell from '../components/AIAssistantShell';
import { apiJson } from '../lib/api';

type SortBy = 'relevance' | 'submitted_date' | 'last_updated_date';
type SortOrder = 'ascending' | 'descending';
type SearchField = 'title' | 'summary';
type ViewMode = 'search' | 'favorites' | 'read' | 'skipped' | 'daily';

type ArxivPaper = {
  arxiv_id: string;
  title: string;
  authors: string[];
  published: string;
  summary: string;
};

type PaperState = {
  user_id: number;
  arxiv_id: string;
  is_favorite: boolean;
  is_read: boolean;
  is_skipped: boolean;
};

type PaperStateMap = Record<string, Pick<PaperState, 'is_favorite' | 'is_read' | 'is_skipped'>>;

type DailyConfig = {
  user_id: number;
  keywords: string;
  category: string | null;
  author: string | null;
  limit: number;
  sort_by: SortBy;
  sort_order: SortOrder;
  search_field: SearchField;
  update_time: string;
  updated_at: string;
  last_run_on: string | null;
};

type DailyCandidate = {
  arxiv_id: string;
  title: string;
  authors: string[];
  published: string;
  summary: string;
  is_read: boolean;
  linked_task_id: string | null;
  linked_task_status: string | null;
};

type ConfirmAction = {
  title?: string;
  message?: string;
  request?: {
    method?: string;
    url?: string;
    body?: unknown;
  };
};

type SavedViewMode = Extract<ViewMode, 'favorites' | 'read' | 'skipped'>;

type SavedViewCache = {
  papers: ArxivPaper[];
  stateMap: PaperStateMap;
};

type DailyViewCache = {
  config: DailyConfig | null;
  candidates: DailyCandidate[];
  summary: string;
  isReady: boolean;
};

const CATEGORIES = [
  { value: '', label: '所有领域' },
  { value: 'cs.AI', label: '人工智能 (cs.AI)' },
  { value: 'cs.CL', label: '计算语言学 (cs.CL)' },
  { value: 'cs.CV', label: '计算机视觉 (cs.CV)' },
  { value: 'cs.LG', label: '机器学习 (cs.LG)' },
  { value: 'cs.SE', label: '软件工程 (cs.SE)' },
  { value: 'cs.RO', label: '机器人 (cs.RO)' },
  { value: 'cs.CR', label: '密码与安全 (cs.CR)' },
  { value: 'stat.ML', label: '统计机器学习 (stat.ML)' },
  { value: 'math', label: '数学 (math)' },
  { value: 'physics', label: '物理 (physics)' },
  { value: 'q-bio', label: '定量生物学 (q-bio)' },
];

const PaperSummary: React.FC<{ summary: string }> = ({ summary }) => {
  const [expanded, setExpanded] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const translateSummary = useCallback(async () => {
    if (translating) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      const data = await apiJson<{ reply: string }>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `请将下面这段 arXiv 英文摘要翻译为简体中文，保持术语准确、表达自然，只输出翻译结果。\n\n${summary}`,
          history: [],
        }),
      });
      setTranslatedSummary(data.reply.trim());
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : '翻译失败');
    } finally {
      setTranslating(false);
    }
  }, [summary, translating]);

  return (
    <div className="mt-3 relative">
      <div className={`text-sm text-white/85 ${expanded ? '' : 'line-clamp-4'}`}>
        <ReactMarkdown>{summary}</ReactMarkdown>
      </div>
      <div className="flex justify-end mt-1 gap-2">
        <button
          onClick={translateSummary}
          disabled={translating}
          className="px-3 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-60 text-xs text-blue-100 transition-colors border border-blue-300/20"
        >
          {translating ? '翻译中...' : translatedSummary ? '重新翻译' : 'AI翻译摘要'}
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white/70 hover:text-white transition-colors border border-white/10"
        >
          {expanded ? '收起' : '展开'}
        </button>
      </div>
      {translateError ? <div className="mt-2 text-xs text-red-300">{translateError}</div> : null}
      {translatedSummary ? (
        <div className="mt-3 rounded-lg border border-blue-300/20 bg-blue-500/10 p-3">
          <div className="text-xs text-blue-100/90 mb-1">AI 翻译</div>
          <div className="text-sm text-white/90 whitespace-pre-wrap">{translatedSummary}</div>
        </div>
      ) : null}
    </div>
  );
};

const Arxiv: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [keywords, setKeywords] = useState(() => {
    try {
      const saved = localStorage.getItem('arxiv_search_history');
      if (saved) {
        const history = JSON.parse(saved);
        if (Array.isArray(history) && history.length > 0) {
          return history[0];
        }
      }
    } catch (e) {
      console.error('Failed to load search history for initial keyword', e);
    }
    return 'llm';
  });
  const [category, setCategory] = useState('');
  const [author, setAuthor] = useState('');
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>('submitted_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('descending');
  const [searchField, setSearchField] = useState<SearchField>('title');
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [searchResults, setSearchResults] = useState<ArxivPaper[]>([]);
  const [stateMap, setStateMap] = useState<PaperStateMap>({});
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [dailyKeywords, setDailyKeywords] = useState('llm');
  const [dailyCategory, setDailyCategory] = useState('');
  const [dailyAuthor, setDailyAuthor] = useState('');
  const [dailyLimit, setDailyLimit] = useState(10);
  const [dailySortBy, setDailySortBy] = useState<SortBy>('submitted_date');
  const [dailySortOrder, setDailySortOrder] = useState<SortOrder>('descending');
  const [dailySearchField, setDailySearchField] = useState<SearchField>('title');
  const [dailyUpdateTime, setDailyUpdateTime] = useState('09:00');
  const [dailyConfig, setDailyConfig] = useState<DailyConfig | null>(null);
  const [dailyCandidates, setDailyCandidates] = useState<DailyCandidate[]>([]);
  const [dailySummary, setDailySummary] = useState('');
  const [dailyBusy, setDailyBusy] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [currentDailyIndex, setCurrentDailyIndex] = useState(0);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const savedViewCacheRef = useRef<Partial<Record<SavedViewMode, SavedViewCache>>>({});
  const dailyViewCacheRef = useRef<DailyViewCache>({
    config: null,
    candidates: [],
    summary: '',
    isReady: false,
  });

  useEffect(() => {
    setCurrentDailyIndex(0);
  }, [dailyCandidates]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('arxiv_search_history');
      if (saved) {
        setSearchHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load search history', e);
    }
  }, []);

  const saveToHistory = useCallback((keyword: string) => {
    if (!keyword.trim()) return;
    setSearchHistory((prev) => {
      const newHistory = [keyword.trim(), ...prev.filter((k) => k !== keyword.trim())].slice(0, 10);
      localStorage.setItem('arxiv_search_history', JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  const canSearch = keywords.trim().length > 0;
  const resultCountText = useMemo(() => `结果 ${papers.length} 条`, [papers.length]);
  const dailyAssistantInitialMessage = useMemo(() => {
    const text = dailySummary.trim();
    if (text) {
      return `我是每日秘书，已为你生成今日总结：\n\n${text}`;
    }
    return '我是每日秘书。可总结今日论文，并在你确认后批量创建任务。';
  }, [dailySummary]);

  const loadPaperStates = useCallback(async () => {
    const rows = await apiJson<PaperState[]>('/api/arxiv/papers?limit=200');
    const mapped: PaperStateMap = {};
    rows.forEach((row) => {
      mapped[row.arxiv_id] = { is_favorite: row.is_favorite, is_read: row.is_read, is_skipped: row.is_skipped };
    });
    setStateMap(mapped);
  }, []);

  const invalidateSavedViewCache = useCallback((modes?: SavedViewMode[]) => {
    if (!modes || modes.length === 0) {
      savedViewCacheRef.current = {};
      return;
    }
    modes.forEach((mode) => {
      delete savedViewCacheRef.current[mode];
    });
  }, []);

  const invalidateDailyCache = useCallback(() => {
    dailyViewCacheRef.current = {
      config: null,
      candidates: [],
      summary: '',
      isReady: false,
    };
  }, []);

  const searchPapers = useCallback(async (newOffset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const body = {
        keywords: keywords.trim(),
        category: category.trim() || null,
        author: author.trim() || null,
        limit,
        offset: newOffset,
        sort_by: sortBy,
        sort_order: sortOrder,
        search_field: searchField,
      };
      const rows = await apiJson<ArxivPaper[]>('/api/arxiv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setPapers(rows);
      setSearchResults(rows);
      setOffset(newOffset);
      saveToHistory(keywords);
    } catch (e) {
      setError(e instanceof Error ? e.message : '检索失败');
    } finally {
      setLoading(false);
    }
  }, [author, category, keywords, limit, sortBy, sortOrder, searchField, saveToHistory]);

  const fetchSavedPapers = useCallback(
    async (mode: SavedViewMode, forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = savedViewCacheRef.current[mode];
        if (cached) {
          setPapers(cached.papers);
          setStateMap((prev) => ({ ...prev, ...cached.stateMap }));
          return;
        }
      }
      setLoading(true);
      setError(null);
      try {
        const stateRows = await apiJson<PaperState[]>('/api/arxiv/papers?limit=500');
        const mapped: PaperStateMap = {};
        const targetIds: string[] = [];
        stateRows.forEach((row) => {
          mapped[row.arxiv_id] = { is_favorite: row.is_favorite, is_read: row.is_read, is_skipped: row.is_skipped };
          if (mode === 'favorites' && row.is_favorite) {
            targetIds.push(row.arxiv_id);
          } else if (mode === 'read' && row.is_read) {
            targetIds.push(row.arxiv_id);
          } else if (mode === 'skipped' && row.is_skipped) {
            targetIds.push(row.arxiv_id);
          }
        });
        setStateMap(mapped);

        if (targetIds.length === 0) {
          setPapers([]);
          savedViewCacheRef.current[mode] = { papers: [], stateMap: mapped };
          return;
        }

        const details = await apiJson<ArxivPaper[]>('/api/arxiv/papers/details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ arxiv_ids: targetIds }),
        });
        setPapers(details);
        savedViewCacheRef.current[mode] = { papers: details, stateMap: mapped };
      } catch (e) {
        setError(e instanceof Error ? e.message : '获取已保存论文失败');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const applyDailyConfig = useCallback((config: DailyConfig | null) => {
    setDailyConfig(config);
    if (!config) return;
    setDailyKeywords(config.keywords);
    setDailyCategory(config.category || '');
    setDailyAuthor(config.author || '');
    setDailyLimit(config.limit);
    setDailySortBy(config.sort_by);
    setDailySortOrder(config.sort_order);
    setDailySearchField(config.search_field);
    setDailyUpdateTime(config.update_time);
  }, []);

  const loadDailyViewData = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh && dailyViewCacheRef.current.isReady) {
        const cached = dailyViewCacheRef.current;
        applyDailyConfig(cached.config);
        setDailyCandidates(cached.candidates);
        setDailySummary(cached.summary);
        return;
      }
      setDailyBusy(true);
      setDailyError(null);
      try {
        const [config, candidates, summaryData] = await Promise.all([
          apiJson<DailyConfig | null>('/api/arxiv/daily/config'),
          apiJson<DailyCandidate[]>('/api/arxiv/daily/candidates'),
          apiJson<{ summary: string }>('/api/arxiv/daily/summary'),
        ]);
        applyDailyConfig(config);
        setDailyCandidates(candidates);
        setDailySummary(summaryData.summary);
        dailyViewCacheRef.current = {
          config,
          candidates,
          summary: summaryData.summary,
          isReady: true,
        };
      } catch (e) {
        setDailyError(e instanceof Error ? e.message : '读取每日数据失败');
      } finally {
        setDailyBusy(false);
      }
    },
    [applyDailyConfig],
  );

  useEffect(() => {
    if (viewMode === 'favorites') {
      fetchSavedPapers('favorites');
    } else if (viewMode === 'read') {
      fetchSavedPapers('read');
    } else if (viewMode === 'skipped') {
      fetchSavedPapers('skipped');
    } else if (viewMode === 'daily') {
      loadDailyViewData();
    } else {
      setPapers(searchResults);
    }
  }, [viewMode, fetchSavedPapers, loadDailyViewData, searchResults]);

  const upsertState = useCallback(
    async (paper: ArxivPaper, patch: Partial<Pick<PaperState, 'is_favorite' | 'is_read' | 'is_skipped'>>) => {
      const current = stateMap[paper.arxiv_id] || { is_favorite: false, is_read: false, is_skipped: false };
      
      const next = {
        is_favorite: patch.is_favorite ?? current.is_favorite,
        is_read: patch.is_read ?? current.is_read,
        is_skipped: patch.is_skipped ?? current.is_skipped,
      };
      setSavingId(paper.arxiv_id);
      setError(null);
      try {
        const saved = await apiJson<PaperState>('/api/arxiv/papers/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            arxiv_id: paper.arxiv_id,
            title: paper.title,
            is_favorite: next.is_favorite,
            is_read: next.is_read,
            is_skipped: next.is_skipped,
          }),
        });
        setStateMap((prev) => ({
          ...prev,
          [saved.arxiv_id]: { is_favorite: saved.is_favorite, is_read: saved.is_read, is_skipped: saved.is_skipped },
        }));
        invalidateSavedViewCache();
        if (viewMode === 'favorites' || viewMode === 'read' || viewMode === 'skipped') {
          await fetchSavedPapers(viewMode, true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '状态更新失败');
      } finally {
        setSavingId(null);
      }
    },
    [fetchSavedPapers, invalidateSavedViewCache, stateMap, viewMode],
  );

  useEffect(() => {
    loadPaperStates().catch(() => undefined);
  }, [loadPaperStates]);

  const generateDailySummary = useCallback(async () => {
    setDailyBusy(true);
    setDailyError(null);
    try {
      const data = await apiJson<{ summary: string }>('/api/arxiv/daily/summary');
      setDailySummary(data.summary);
      dailyViewCacheRef.current = {
        ...dailyViewCacheRef.current,
        summary: data.summary,
      };
    } catch (e) {
      setDailyError(e instanceof Error ? e.message : '生成总结失败');
    } finally {
      setDailyBusy(false);
    }
  }, []);

  const saveDailyConfig = useCallback(async () => {
    setDailyBusy(true);
    setDailyError(null);
    try {
      invalidateDailyCache();
      const config = await apiJson<DailyConfig>('/api/arxiv/daily/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: dailyKeywords.trim(),
          category: dailyCategory.trim() || null,
          author: dailyAuthor.trim() || null,
          limit: dailyLimit,
          sort_by: dailySortBy,
          sort_order: dailySortOrder,
          search_field: dailySearchField,
          update_time: dailyUpdateTime,
        }),
      });
      const [candidates, summaryData] = await Promise.all([
        apiJson<DailyCandidate[]>('/api/arxiv/daily/candidates'),
        apiJson<{ summary: string }>('/api/arxiv/daily/summary'),
      ]);
      applyDailyConfig(config);
      setDailyCandidates(candidates);
      setDailySummary(summaryData.summary);
      dailyViewCacheRef.current = {
        config,
        candidates,
        summary: summaryData.summary,
        isReady: true,
      };
      setIsConfigExpanded(false);
    } catch (e) {
      setDailyError(e instanceof Error ? e.message : '保存每日配置失败');
    } finally {
      setDailyBusy(false);
    }
  }, [
    dailyAuthor,
    dailyCategory,
    dailyKeywords,
    dailyLimit,
    dailySearchField,
    dailySortBy,
    dailySortOrder,
    dailyUpdateTime,
    applyDailyConfig,
    invalidateDailyCache,
  ]);

  const refreshDailyCandidates = useCallback(async () => {
    setDailyBusy(true);
    setDailyError(null);
    try {
      invalidateDailyCache();
      const rows = await apiJson<DailyCandidate[]>('/api/arxiv/daily/refresh', { method: 'POST' });
      const summaryData = await apiJson<{ summary: string }>('/api/arxiv/daily/summary');
      setDailyCandidates(rows);
      setDailySummary(summaryData.summary);
      dailyViewCacheRef.current = {
        config: dailyConfig,
        candidates: rows,
        summary: summaryData.summary,
        isReady: true,
      };
      await loadPaperStates();
      invalidateSavedViewCache();
    } catch (e) {
      setDailyError(e instanceof Error ? e.message : '刷新每日候选失败');
    } finally {
      setDailyBusy(false);
    }
  }, [dailyConfig, invalidateDailyCache, invalidateSavedViewCache, loadPaperStates]);

  useEffect(() => {
    if (viewMode !== 'daily') return;
    loadDailyViewData().catch(() => undefined);
  }, [viewMode, loadDailyViewData]);

  const askCreateDailyTasks = useCallback(async () => {
    setDailyError(null);
    try {
      const ids = dailyCandidates.map((x) => x.arxiv_id);
      const action = await apiJson<ConfirmAction>('/api/arxiv/daily/tasks/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arxiv_ids: ids }),
      });
      setConfirmAction(action);
    } catch (e) {
      setDailyError(e instanceof Error ? e.message : '生成确认请求失败');
    }
  }, [dailyCandidates]);

  const cancelConfirmAction = () => {
    setConfirmAction(null);
    setIsExecutingAction(false);
  };

  const commitConfirmAction = useCallback(async () => {
    if (!confirmAction?.request?.url) return;
    setIsExecutingAction(true);
    try {
      const method = (confirmAction.request.method || 'POST').toUpperCase();
      const body = confirmAction.request.body;
      await apiJson(confirmAction.request.url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      setConfirmAction(null);
      await loadDailyViewData(true);
    } catch (e) {
      setDailyError(e instanceof Error ? e.message : '执行失败');
      setConfirmAction(null);
    } finally {
      setIsExecutingAction(false);
    }
  }, [confirmAction, loadDailyViewData]);

  const handleRefreshStates = useCallback(async () => {
    await loadPaperStates();
    invalidateSavedViewCache();
  }, [invalidateSavedViewCache, loadPaperStates]);



  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans">
      <div className="fixed inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/background.jpg`}
          alt="Background"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60"></div>
      </div>
      <Navigation />
      <div className="relative z-10 w-full h-full pt-20 px-8 pb-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center mb-6">
            <h1 className="text-3xl font-bold mb-4 text-center">Arxiv Reader</h1>
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/10 shadow-inner">
              <button
                onClick={() => setViewMode('daily')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  viewMode === 'daily'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                每日
              </button>
              <button
                onClick={() => setViewMode('search')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  viewMode === 'search'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                搜索
              </button>
              <button
                onClick={() => setViewMode('favorites')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  viewMode === 'favorites'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                收藏
              </button>
              <button
                onClick={() => setViewMode('read')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  viewMode === 'read'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                已读
              </button>
              <button
                onClick={() => setViewMode('skipped')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  viewMode === 'skipped'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                跳过
              </button>
            </div>
          </div>
          {viewMode === 'search' && (
            <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-5 shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative md:col-span-2 lg:col-span-5">
                <input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="关键词"
                  className="w-full h-10 rounded-lg bg-black/30 border border-white/15 pl-3 pr-28 outline-none focus:border-blue-400"
                />
                <button
                  className="absolute right-10 top-1 bottom-1 w-16 rounded-md bg-white/10 hover:bg-white/20 text-xs text-white/90 border border-white/10 transition-colors"
                  onClick={() => setSearchField((f) => (f === 'title' ? 'summary' : 'title'))}
                >
                  {searchField === 'title' ? '标题' : '摘要'}
                </button>
                <button
                  className="absolute right-1 top-1 bottom-1 w-8 rounded-md bg-white/10 hover:bg-white/20 text-white/90 border border-white/10 transition-colors flex items-center justify-center"
                  onClick={() => setShowHistory(!showHistory)}
                  title="历史搜索"
                >
                  <History size={14} />
                </button>
                {showHistory && (
                  <div className="absolute right-0 top-12 w-64 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
                      <span className="text-xs text-white/50">历史记录</span>
                      <button 
                        onClick={() => {
                          setSearchHistory([]);
                          localStorage.removeItem('arxiv_search_history');
                        }}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        清空
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {searchHistory.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-white/30">暂无记录</div>
                      ) : (
                        searchHistory.map((item, i) => (
                          <button
                            key={i}
                            className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors truncate"
                            onClick={() => {
                              setKeywords(item);
                              setShowHistory(false);
                            }}
                          >
                            {item}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 rounded-lg bg-black/30 border border-white/15 px-3 outline-none focus:border-blue-400"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="作者（可选）"
                className="h-10 rounded-lg bg-black/30 border border-white/15 px-3 outline-none focus:border-blue-400"
              />
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="w-full h-10 rounded-lg bg-black/30 border border-white/15 pl-3 pr-10 outline-none focus:border-blue-400 appearance-none"
                >
                  <option value="submitted_date">提交时间</option>
                  <option value="last_updated_date">更新时间</option>
                  <option value="relevance">相关性</option>
                </select>
                <button
                  className="absolute right-0 top-0 h-full px-3 flex items-center justify-center text-white/70 hover:text-white"
                  onClick={() => setSortOrder(sortOrder === 'ascending' ? 'descending' : 'ascending')}
                  title={sortOrder === 'ascending' ? '切换为降序' : '切换为升序'}
                >
                  {sortOrder === 'ascending' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                </button>
              </div>
              <select
                value={String(limit)}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-10 rounded-lg bg-black/30 border border-white/15 px-3 outline-none focus:border-blue-400"
              >
                <option value="10">10 条</option>
                <option value="20">20 条</option>
                <option value="50">50 条</option>
              </select>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                disabled={!canSearch || loading}
                onClick={() => searchPapers(0)}
                className="h-10 px-5 rounded-lg bg-blue-500/80 hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {loading ? '检索中...' : '搜索'}
              </button>
              <button
                onClick={() => handleRefreshStates()}
                className="h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
              >
                刷新状态
              </button>
              <span className="text-sm text-white/70">{resultCountText}</span>
              {error ? <span className="text-sm text-red-300 ml-auto">{error}</span> : null}
            </div>
          </div>
          )}

          {viewMode === 'daily' && (
            <div className="space-y-4">
              {!isConfigExpanded ? (
                <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-5 shadow-lg flex items-center gap-4">
                  <button
                    onClick={() => setIsConfigExpanded(true)}
                    className="h-10 px-5 rounded-lg bg-blue-500/80 hover:bg-blue-500 transition-colors"
                  >
                    每日配置更改
                  </button>
                  <span className="text-sm text-white/70 ml-auto">
                    {dailyConfig?.last_run_on ? `最近刷新：${dailyConfig.last_run_on}` : '尚未生成候选集'}
                  </span>
                </div>
              ) : (
                <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-5 shadow-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                    <input
                      value={dailyKeywords}
                      onChange={(e) => setDailyKeywords(e.target.value)}
                      placeholder="关键词"
                      className="h-10 rounded-lg bg-black/30 border border-white/15 px-3 outline-none focus:border-blue-400 lg:col-span-2"
                    />
                    <select
                      value={dailyCategory}
                      onChange={(e) => setDailyCategory(e.target.value)}
                      className="h-10 rounded-lg bg-black/30 border border-white/15 px-3 outline-none focus:border-blue-400"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={dailyAuthor}
                      onChange={(e) => setDailyAuthor(e.target.value)}
                      placeholder="作者（可选）"
                      className="h-10 rounded-lg bg-black/30 border border-white/15 px-3 outline-none focus:border-blue-400"
                    />
                    <select
                      value={String(dailyLimit)}
                      onChange={(e) => setDailyLimit(Number(e.target.value))}
                      className="h-10 rounded-lg bg-black/30 border border-white/15 px-3 outline-none focus:border-blue-400"
                    >
                      <option value="10">10 条</option>
                      <option value="20">20 条</option>
                      <option value="50">50 条</option>
                    </select>
                    <input
                      type="time"
                      value={dailyUpdateTime}
                      onChange={(e) => setDailyUpdateTime(e.target.value)}
                      className="h-10 rounded-lg bg-black/30 border border-white/15 px-3 outline-none focus:border-blue-400"
                    />
                    <select
                      value={dailySortBy}
                      onChange={(e) => setDailySortBy(e.target.value as SortBy)}
                      className="h-10 rounded-lg bg-black/30 border border-white/15 px-3 outline-none focus:border-blue-400"
                    >
                      <option value="submitted_date">提交时间</option>
                      <option value="last_updated_date">更新时间</option>
                      <option value="relevance">相关性</option>
                    </select>
                    <select
                      value={dailySortOrder}
                      onChange={(e) => setDailySortOrder(e.target.value as SortOrder)}
                      className="h-10 rounded-lg bg-black/30 border border-white/15 px-3 outline-none focus:border-blue-400"
                    >
                      <option value="descending">降序</option>
                      <option value="ascending">升序</option>
                    </select>
                    <select
                      value={dailySearchField}
                      onChange={(e) => setDailySearchField(e.target.value as SearchField)}
                      className="h-10 rounded-lg bg-black/30 border border-white/15 px-3 outline-none focus:border-blue-400"
                    >
                      <option value="title">标题</option>
                      <option value="summary">摘要</option>
                    </select>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                    onClick={saveDailyConfig}
                    disabled={dailyBusy || !dailyKeywords.trim()}
                    className="h-10 px-5 rounded-lg bg-blue-500/80 hover:bg-blue-500 disabled:opacity-50 transition-colors"
                  >
                    保存每日配置
                  </button>
                    <button
                      onClick={refreshDailyCandidates}
                      disabled={dailyBusy}
                      className="h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
                    >
                      立即刷新
                    </button>
                    <button
                      onClick={generateDailySummary}
                      disabled={dailyBusy}
                      className="h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
                    >
                      生成今日总结
                    </button>
                    <button
                      onClick={askCreateDailyTasks}
                      disabled={dailyCandidates.length === 0}
                      className="h-10 px-4 rounded-lg bg-emerald-500/70 hover:bg-emerald-500 border border-emerald-300/30 transition-colors disabled:opacity-50"
                    >
                      将今日论文加入任务
                    </button>
                    <span className="text-sm text-white/70 ml-auto">
                      {dailyConfig?.last_run_on ? `最近刷新：${dailyConfig.last_run_on}` : '尚未生成候选集'}
                    </span>
                  </div>
                  {dailyError ? <div className="mt-2 text-sm text-red-300">{dailyError}</div> : null}
                </div>
              )}

              <AIAssistantShell className="h-[360px]">
                <ChatBox
                  apiPath="/api/chat"
                  scope="daily"
                  placeholder="例如：总结今日论文并建议阅读顺序"
                  sendLabel="发送"
                  quickReplies={[
                    '请总结今日候选论文',
                    '按优先级给我阅读顺序',
                    '把今日论文加入任务（需确认）',
                  ]}
                  initialAssistantMessage={dailyAssistantInitialMessage}
                />
              </AIAssistantShell>

              <div className="space-y-4">
                {dailyCandidates.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 mt-4 select-none">
                      <button
                        onClick={() => setCurrentDailyIndex(Math.max(0, currentDailyIndex - 1))}
                        disabled={currentDailyIndex === 0}
                        className="px-4 py-2 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent text-white/80 transition-colors flex items-center gap-2 active:scale-95 duration-200"
                      >
                        <ChevronLeft size={20} />
                        <span className="text-sm font-medium">上一篇</span>
                      </button>
                      
                      <div className="text-sm font-bold text-white/90 bg-black/40 px-6 py-2 rounded-full border border-white/10 shadow-inner min-w-[100px] text-center">
                        {currentDailyIndex + 1} / {dailyCandidates.length}
                      </div>
                      
                      <button
                        onClick={() => setCurrentDailyIndex(Math.min(dailyCandidates.length - 1, currentDailyIndex + 1))}
                        disabled={currentDailyIndex === dailyCandidates.length - 1}
                        className="px-4 py-2 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent text-white/80 transition-colors flex items-center gap-2 active:scale-95 duration-200"
                      >
                        <span className="text-sm font-medium">下一篇</span>
                        <ChevronRight size={20} />
                      </button>
                    </div>

                    <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-5 shadow-lg min-h-[300px] flex flex-col transition-all duration-300">
                      <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-6 flex-1">
                        <div className="flex-1">
                          <a
                            href={`https://arxiv.org/abs/${dailyCandidates[currentDailyIndex].arxiv_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-lg font-semibold leading-snug hover:underline hover:text-blue-300 transition-colors block"
                          >
                            {dailyCandidates[currentDailyIndex].title}
                          </a>
                          <div className="mt-1 text-xs text-white/60">
                            {dailyCandidates[currentDailyIndex].arxiv_id} · {new Date(dailyCandidates[currentDailyIndex].published).toLocaleDateString()} · {dailyCandidates[currentDailyIndex].authors.join(', ') || 'Unknown'}
                          </div>
                          <PaperSummary key={dailyCandidates[currentDailyIndex].arxiv_id} summary={dailyCandidates[currentDailyIndex].summary} />
                        </div>
                        <div className="flex flex-col gap-2 md:min-w-[150px]">
                          <button
                            disabled={savingId === dailyCandidates[currentDailyIndex].arxiv_id}
                            onClick={() => upsertState(dailyCandidates[currentDailyIndex], { is_favorite: !stateMap[dailyCandidates[currentDailyIndex].arxiv_id]?.is_favorite })}
                            className={`h-8 px-3 rounded-lg border text-sm transition-colors ${
                              stateMap[dailyCandidates[currentDailyIndex].arxiv_id]?.is_favorite
                                ? 'bg-yellow-500/30 border-yellow-300/60 text-yellow-100'
                                : 'bg-black/30 border-white/20 text-white/80 hover:bg-white/15'
                            }`}
                          >
                            {stateMap[dailyCandidates[currentDailyIndex].arxiv_id]?.is_favorite ? '已收藏' : '收藏'}
                          </button>
                          <button
                            disabled={savingId === dailyCandidates[currentDailyIndex].arxiv_id}
                            onClick={() =>
                              upsertState(dailyCandidates[currentDailyIndex], { is_read: !stateMap[dailyCandidates[currentDailyIndex].arxiv_id]?.is_read })
                            }
                            className={`h-8 px-3 rounded-lg border text-sm transition-colors ${
                              stateMap[dailyCandidates[currentDailyIndex].arxiv_id]?.is_read
                                ? 'bg-emerald-500/30 border-emerald-300/60 text-emerald-100'
                                : 'bg-black/30 border-white/20 text-white/80 hover:bg-white/15'
                            }`}
                          >
                            {stateMap[dailyCandidates[currentDailyIndex].arxiv_id]?.is_read ? '已读' : '标记已读'}
                          </button>
                          <button
                            disabled={savingId === dailyCandidates[currentDailyIndex].arxiv_id}
                            onClick={() =>
                              upsertState(dailyCandidates[currentDailyIndex], { is_skipped: !stateMap[dailyCandidates[currentDailyIndex].arxiv_id]?.is_skipped })
                            }
                            className={`h-8 px-3 rounded-lg border text-sm transition-colors ${
                              stateMap[dailyCandidates[currentDailyIndex].arxiv_id]?.is_skipped
                                ? 'bg-violet-500/30 border-violet-300/60 text-violet-100'
                                : 'bg-black/30 border-white/20 text-white/80 hover:bg-white/15'
                            }`}
                          >
                            {stateMap[dailyCandidates[currentDailyIndex].arxiv_id]?.is_skipped ? '已跳过' : '跳过'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-white/50 py-10">暂无当日候选论文</div>
                )}
              </div>

            </div>
          )}

          <div className="mt-6 space-y-4 pb-8">
            {viewMode !== 'daily' && papers.map((paper) => {
              const state = stateMap[paper.arxiv_id] || { is_favorite: false, is_read: false, is_skipped: false };
              const saving = savingId === paper.arxiv_id;
              return (
                <div
                  key={paper.arxiv_id}
                  className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-5 shadow-lg"
                >
                  <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-6">
                    <div className="flex-1">
                      <a
                        href={`https://arxiv.org/abs/${paper.arxiv_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-semibold leading-snug hover:underline hover:text-blue-300 transition-colors block"
                      >
                        {paper.title}
                      </a>
                      <div className="mt-1 text-xs text-white/60">
                        {paper.arxiv_id} · {new Date(paper.published).toLocaleDateString()} ·{' '}
                        {paper.authors.join(', ') || 'Unknown'}
                      </div>
                      <PaperSummary summary={paper.summary} />
                    </div>
                    <div className="flex flex-col gap-2 md:min-w-[150px]">
                      <button
                        disabled={saving}
                        onClick={() => upsertState(paper, { is_favorite: !state.is_favorite })}
                        className={`h-8 px-3 rounded-lg border text-sm transition-colors ${
                          state.is_favorite
                            ? 'bg-yellow-500/30 border-yellow-300/60 text-yellow-100'
                            : 'bg-black/30 border-white/20 text-white/80 hover:bg-white/15'
                        }`}
                      >
                        {state.is_favorite ? '已收藏' : '收藏'}
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => upsertState(paper, { is_read: !state.is_read })}
                        className={`h-8 px-3 rounded-lg border text-sm transition-colors ${
                          state.is_read
                            ? 'bg-emerald-500/30 border-emerald-300/60 text-emerald-100'
                            : 'bg-black/30 border-white/20 text-white/80 hover:bg-white/15'
                        }`}
                      >
                        {state.is_read ? '已读' : '标记已读'}
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => upsertState(paper, { is_skipped: !state.is_skipped })}
                        className={`h-8 px-3 rounded-lg border text-sm transition-colors ${
                          state.is_skipped
                            ? 'bg-violet-500/30 border-violet-300/60 text-violet-100'
                            : 'bg-black/30 border-white/20 text-white/80 hover:bg-white/15'
                        }`}
                      >
                        {state.is_skipped ? '已跳过' : '跳过'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* 分页组件 */}
            {viewMode === 'search' && papers.length > 0 && (
              <div className="flex items-center justify-center gap-4 py-4 mt-4">
                <button
                  onClick={() => searchPapers(Math.max(0, offset - limit))}
                  disabled={offset === 0 || loading}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 text-white/90 text-sm transition-colors border border-white/10"
                >
                  上一页
                </button>
                <span className="text-sm text-white/60">
                  第 {Math.floor(offset / limit) + 1} 页
                </span>
                <button
                  onClick={() => searchPapers(offset + limit)}
                  disabled={loading || papers.length < limit}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 text-white/90 text-sm transition-colors border border-white/10"
                >
                  下一页
                </button>
              </div>
            )}

            {!loading && papers.length === 0 && viewMode !== 'daily' ? (
              <div className="text-center text-white/50 py-12">
                {viewMode === 'search'
                  ? '输入条件后点击搜索，避免触发 ArXiv 限流'
                  : viewMode === 'favorites'
                  ? '暂无收藏的论文'
                  : viewMode === 'read'
                  ? '暂无已读的论文'
                  : viewMode === 'skipped'
                  ? '暂无跳过的论文'
                  : ''}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 rounded-2xl">
          <div className="w-[92%] max-w-md bg-zinc-900/90 border border-white/10 rounded-2xl p-4 shadow-xl">
            <div className="text-white text-base font-medium mb-2">{String(confirmAction.title || '需要确认')}</div>
            <div className="text-white/70 text-sm whitespace-pre-wrap mb-4">
              {String(confirmAction.message || '即将执行敏感操作，是否确认？')}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={cancelConfirmAction}
                disabled={isExecutingAction}
                className="px-3 py-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={commitConfirmAction}
                disabled={isExecutingAction}
                className="px-3 py-2 rounded-lg bg-blue-500/80 text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {isExecutingAction ? '执行中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Arxiv;
