import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Beaker, Plus, Trash2, Play, Loader2 } from 'lucide-react';
import { apiJson, apiFetch } from '../lib/api';

type FocusWorkType = 'vocab_today' | 'erc_review' | 'erc_practice';

type ContentBank = {
  id: string;
  name: string;
  count: number;
};

type ChoiceFilters = {
  years: number[];
  subjects: string[];
  tags: string[];
  total_items: number;
  total_questions: number;
};

type ChoiceScope = {
  bank_id: string;
  years?: number[];
  subjects?: string[];
  tags?: string[];
  status?: string;
  mode?: string;
};

type ChoiceCompletion = {
  mode: string;
  question_count?: number;
  duration_seconds?: number;
};

type TestFocusConfig = {
  id: string;
  name: string;
  focus_work_type: FocusWorkType;
  bank_id: string | null;
  target_count: number;
  scope?: ChoiceScope | null;
  completion?: ChoiceCompletion | null;
  created_at: string;
  updated_at: string;
};

const FOCUS_WORK_TYPES: { value: FocusWorkType; label: string; countLabel: string }[] = [
  { value: 'vocab_today', label: '今日单词', countLabel: '个单词' },
  { value: 'erc_review', label: '错题复习', countLabel: '道题目' },
  { value: 'erc_practice', label: '真题练习', countLabel: '篇文章' },
];

function getFocusWorkTypeLabel(type: FocusWorkType): string {
  return FOCUS_WORK_TYPES.find((t) => t.value === type)?.label ?? type;
}

function getCountLabel(type: FocusWorkType): string {
  return FOCUS_WORK_TYPES.find((t) => t.value === type)?.countLabel ?? '项';
}

function configDisplaySummary(config: TestFocusConfig): string {
  const parts: string[] = [];
  if (config.scope?.years?.length) parts.push(`${config.scope.years[0]} 年`);
  if (config.scope?.subjects?.length) parts.push(config.scope.subjects[0]);
  if (config.completion?.mode === 'exhaust_scope') {
    parts.push('做完整个范围');
  } else {
    parts.push(`目标: ${config.target_count}`);
  }
  return parts.join(' · ');
}

export default function TestFocusWork() {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<TestFocusConfig[]>([]);
  const [banks, setBanks] = useState<ContentBank[]>([]);
  const [filters, setFilters] = useState<ChoiceFilters | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<FocusWorkType>('vocab_today');
  const [formBankId, setFormBankId] = useState('');
  const [formTargetCount, setFormTargetCount] = useState(10);
  const [formYear, setFormYear] = useState<number | ''>('');
  const [formSubject, setFormSubject] = useState('');
  const [formCompletionMode, setFormCompletionMode] = useState<'question_count' | 'exhaust_scope'>('question_count');

  const loadConfigs = useCallback(async () => {
    try {
      const data = await apiJson<TestFocusConfig[]>('/api/admin/test-focus-configs');
      setConfigs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBanks = useCallback(async (type: FocusWorkType) => {
    try {
      const data = await apiJson<ContentBank[]>(`/api/admin/content-banks-for-type?focus_work_type=${type}`);
      setBanks(data);
      if (data.length > 0 && !data.some((b) => b.id === formBankId)) {
        setFormBankId(data[0].id);
      }
    } catch (err) {
      setBanks([]);
      setError(err instanceof Error ? err.message : '加载题库失败');
    }
  }, [formBankId]);

  const loadFilters = useCallback(async (bankId: string) => {
    if (!bankId) {
      setFilters(null);
      return;
    }
    try {
      const data = await apiJson<ChoiceFilters>(`/api/choice/filters?bank_id=${bankId}`);
      setFilters(data);
      setFormYear('');
      setFormSubject('');
    } catch {
      setFilters(null);
    }
  }, []);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    void loadBanks(formType);
  }, [formType, loadBanks]);

  useEffect(() => {
    if (formType === 'erc_practice' || formType === 'erc_review') {
      void loadFilters(formBankId);
    } else {
      setFilters(null);
    }
  }, [formType, formBankId, loadFilters]);

  function buildScope(): ChoiceScope | null {
    if (formType !== 'erc_practice' && formType !== 'erc_review') return null;
    if (!formBankId) return null;
    return {
      bank_id: formBankId,
      years: formYear !== '' ? [formYear] : undefined,
      subjects: formSubject ? [formSubject] : undefined,
      status: 'all',
      mode: 'sequential',
    };
  }

  function buildCompletion(): ChoiceCompletion {
    if (formCompletionMode === 'exhaust_scope') {
      return { mode: 'exhaust_scope' };
    }
    return { mode: 'question_count', question_count: formTargetCount };
  }

  async function handleCreate() {
    if (!formName.trim()) {
      setError('请输入配置名称');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const scope = buildScope();
      const completion = buildCompletion();
      const formData = new FormData();
      formData.append('name', formName.trim());
      formData.append('focus_work_type', formType);
      formData.append('bank_id', formBankId);
      formData.append('target_count', String(formTargetCount));
      if (scope) formData.append('scope_json', JSON.stringify(scope));
      formData.append('completion_json', JSON.stringify(completion));

      const res = await apiFetch('/api/admin/test-focus-configs', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `HTTP ${res.status}`);
      }
      setFormName('');
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建配置失败');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(configId: string) {
    if (!window.confirm('确定要删除这个配置吗？')) return;
    try {
      const res = await apiFetch(`/api/admin/test-focus-configs/${configId}`, { method: 'DELETE' });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `HTTP ${res.status}`);
      }
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除配置失败');
    }
  }

  async function handleStart(config: TestFocusConfig) {
    setStarting(config.id);
    setError(null);
    try {
      const scope = config.scope ?? null;
      const completion = config.completion ?? { mode: 'question_count', question_count: config.target_count };
      await apiJson('/todo/focus/workflow/start-test-focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focus_work_type: config.focus_work_type,
          bank_id: config.bank_id,
          target_count: config.target_count,
          scope,
          completion,
        }),
      });
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动专注工作失败');
    } finally {
      setStarting(null);
    }
  }

  const isChoiceType = formType === 'erc_practice' || formType === 'erc_review';
  const showFilters = isChoiceType && filters !== null;

  return (
    <div className="ark-page fixed inset-x-1 bottom-1 top-[7.5rem] z-10 overflow-y-auto rounded-[28px] px-6 pb-10 pt-6 md:px-8" style={{ clipPath: 'inset(10px round 28px)' }}>
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-ark-border bg-ark-surface-subtle">
            <Beaker className="h-6 w-6 text-ark-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--ark-text)]">测试专注工作</h1>
            <p className="mt-1 text-sm text-[var(--ark-text-muted)]">管理员专用测试工具 — 测试专注工作与题库的互动</p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* Create Form */}
        <section className="rounded-2xl border border-ark-border bg-ark-surface-subtle p-6">
          <h2 className="text-lg font-semibold text-[var(--ark-text)]">创建新配置</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--ark-text-muted)]">配置名称</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="例如：2025年408真题"
                className="mt-1.5 w-full rounded-xl border border-ark-border bg-ark-surface-strong px-4 py-2.5 text-sm text-[var(--ark-text)] placeholder:text-[var(--ark-text-faint)] focus:border-ark-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--ark-text-muted)]">专注工作类型</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as FocusWorkType)}
                className="mt-1.5 w-full rounded-xl border border-ark-border bg-ark-surface-strong px-4 py-2.5 text-sm text-[var(--ark-text)] focus:border-ark-accent focus:outline-none"
              >
                {FOCUS_WORK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--ark-text-muted)]">题库</label>
              <select
                value={formBankId}
                onChange={(e) => setFormBankId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-ark-border bg-ark-surface-strong px-4 py-2.5 text-sm text-[var(--ark-text)] focus:border-ark-accent focus:outline-none"
              >
                {banks.length === 0 && <option value="">暂无可用题库</option>}
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.count} {getCountLabel(formType).replace('个', '').replace('道', '').replace('篇', '')})</option>
                ))}
              </select>
            </div>

            {showFilters && (
              <>
                <div>
                  <label className="block text-sm font-medium text-[var(--ark-text-muted)]">年份</label>
                  <select
                    value={formYear}
                    onChange={(e) => setFormYear(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1.5 w-full rounded-xl border border-ark-border bg-ark-surface-strong px-4 py-2.5 text-sm text-[var(--ark-text)] focus:border-ark-accent focus:outline-none"
                  >
                    <option value="">全部年份</option>
                    {filters!.years.map((y) => (
                      <option key={y} value={y}>{y} 年</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--ark-text-muted)]">科目/考试</label>
                  <select
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-ark-border bg-ark-surface-strong px-4 py-2.5 text-sm text-[var(--ark-text)] focus:border-ark-accent focus:outline-none"
                  >
                    <option value="">全部科目</option>
                    {filters!.subjects.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--ark-text-muted)]">完成条件</label>
                  <select
                    value={formCompletionMode}
                    onChange={(e) => setFormCompletionMode(e.target.value as 'question_count' | 'exhaust_scope')}
                    className="mt-1.5 w-full rounded-xl border border-ark-border bg-ark-surface-strong px-4 py-2.5 text-sm text-[var(--ark-text)] focus:border-ark-accent focus:outline-none"
                  >
                    <option value="question_count">做 N 道题</option>
                    <option value="exhaust_scope">做完整个范围</option>
                  </select>
                  <p className="mt-1 text-xs text-[var(--ark-text-faint)]">
                    {formCompletionMode === 'exhaust_scope'
                      ? `范围内共 ${filters!.total_questions} 道题`
                      : '指定做题数量'}
                  </p>
                </div>
              </>
            )}

            {(!showFilters || formCompletionMode === 'question_count') && (
              <div>
                <label className="block text-sm font-medium text-[var(--ark-text-muted)]">目标数量</label>
                <input
                  type="number"
                  value={formTargetCount}
                  onChange={(e) => setFormTargetCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 10)))}
                  min={1}
                  max={500}
                  className="mt-1.5 w-full rounded-xl border border-ark-border bg-ark-surface-strong px-4 py-2.5 text-sm text-[var(--ark-text)] focus:border-ark-accent focus:outline-none"
                />
                <p className="mt-1 text-xs text-[var(--ark-text-faint)]">
                  {isChoiceType ? '道题' : getCountLabel(formType)}
                </p>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !formName.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              创建配置
            </button>
            <span className="text-sm text-[var(--ark-text-faint)]">
              将使用正计时模式，无时间限制
            </span>
          </div>
        </section>

        {/* Config List */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--ark-text)]">已保存的配置</h2>
          {loading ? (
            <div className="mt-4 flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--ark-text-muted)]" />
            </div>
          ) : configs.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-ark-border py-12 text-center">
              <p className="text-sm text-[var(--ark-text-muted)]">暂无配置，请在上方创建</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className="flex items-center justify-between rounded-2xl border border-ark-border bg-ark-surface-subtle px-6 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-[var(--ark-text)]">{config.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-[var(--ark-text-muted)]">
                      <span className="rounded-full border border-ark-border bg-ark-surface-strong px-2.5 py-0.5 text-xs">
                        {getFocusWorkTypeLabel(config.focus_work_type)}
                      </span>
                      <span>{configDisplaySummary(config)}</span>
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleStart(config)}
                      disabled={starting === config.id}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {starting === config.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      启动
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(config.id)}
                      disabled={starting === config.id}
                      className="inline-flex items-center gap-2 rounded-xl border border-ark-border bg-ark-surface-strong px-3 py-2 text-sm text-[var(--ark-text-muted)] transition hover:border-rose-500/50 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
