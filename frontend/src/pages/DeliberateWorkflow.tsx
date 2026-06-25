import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Archive, BarChart3, CheckCircle2, Database, FileUp, Play, Plus, Save, Settings2, Trash2, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Button from '../components/Button';
import SubAppPageHeader from '../components/SubAppPageHeader';
import SubAppPageShell from '../components/SubAppPageShell';
import { fetchChoiceFilters, fetchSetSnapshots } from '../lib/choice/api';
import type { ChoiceFilters, SetSnapshot } from '../lib/choice/types';
import {
  createDeliberateWorkflow,
  deleteDeliberateWorkflow,
  listDeliberateBanks,
  listDeliberateRuns,
  listDeliberateWorkflows,
  startDeliberateWorkflow,
  uploadDeliberateBank,
  type DeliberateBankOption,
  type DeliberateFocusWorkType,
  type DeliberateKind,
  type DeliberateUploadError,
  type DeliberateWorkflowConfig,
  type DeliberateWorkflowRun,
} from '../lib/deliberate/api';

type CompletionMode = 'question_count' | 'exhaust_scope';
type StepId = 1 | 2 | 3 | 4;
type AssetMode = 'existing' | 'upload';

const SELECTED_WORKFLOW_STORAGE_KEY = 'ark:deliberate-workflow:selected-id';

const inputClass =
  'w-full rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]';

const statusLabel: Record<string, string> = {
  started: '已启动',
  content_completed: '内容完成',
  completed: '已完成',
  abandoned: '已放弃',
};

function formatDate(value?: string | null) {
  if (!value) return '暂无';
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function focusTypeLabel(type: DeliberateFocusWorkType) {
  if (type === 'vocab_today') return '闪卡';
  if (type === 'review') return '错题复习';
  if (type === 'input') return '输入练习';
  return '选择练习';
}

function safeRecord(value: unknown): Record<string, number> {
  return value && typeof value === 'object' ? value as Record<string, number> : {};
}

function latestAccuracy(snapshot: SetSnapshot | null) {
  if (!snapshot) return 0;
  return Math.round((safeRecord(snapshot.focus_stats).accuracy ?? 0) * 100);
}

function SnapshotPanel({ snapshots }: { snapshots: SetSnapshot[] }) {
  const latest = snapshots[0] ?? null;
  const trend = [...snapshots].reverse().slice(-8);
  const maxAccuracy = Math.max(100, ...trend.map((item) => latestAccuracy(item)));
  const rawMastery = latest ? safeRecord(latest.mastery) : {};
  const mastery = Object.keys(rawMastery).length ? rawMastery : (latest ? safeRecord(latest.by_state) : {});
  const due = latest ? safeRecord(latest.due_status) : {};
  const focus = latest ? safeRecord(latest.focus_stats) : {};

  if (!latest) {
    return (
      <section className="rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle p-6 text-center">
        <Archive className="mx-auto h-8 w-8 text-ark-text-faint" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-ark-text-muted">暂无存档</p>
        <p className="mt-1 text-xs text-ark-text-faint">完成一次刻意工作流后会自动出现快照。</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="正确率" value={`${latestAccuracy(latest)}%`} detail={`${focus.total_answers ?? 0} 次答题`} />
        <Metric label="掌握" value={String(mastery.mastered ?? 0)} detail={`总量 ${latest.total_questions}`} />
        <Metric label="待复习" value={String(due.due_now ?? due.overdue ?? 0)} detail="当前快照" />
        <Metric label="专注" value={String(focus.total_sessions ?? 0)} detail={`${focus.total_minutes ?? 0} 分钟`} />
      </div>
      <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ark-text">正确率趋势</h3>
          <span className="text-xs text-ark-text-faint">{snapshots.length} 条快照</span>
        </div>
        <div className="flex h-28 items-end gap-2">
          {trend.map((item) => {
            const value = latestAccuracy(item);
            const height = Math.max(6, (value / maxAccuracy) * 100);
            return (
              <div key={item.id} className="flex flex-1 flex-col items-center gap-1">
                <div className="text-[10px] text-ark-text-faint">{value}%</div>
                <div
                  className="w-full rounded-t bg-ark-accent/80"
                  style={{ height: `${height}%` }}
                  aria-label={`正确率 ${value}%`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
      <div className="text-xs font-medium text-ark-text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-ark-text">{value}</div>
      <div className="mt-1 text-xs text-ark-text-faint">{detail}</div>
    </div>
  );
}

export default function DeliberateWorkflow() {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<DeliberateWorkflowConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [runs, setRuns] = useState<DeliberateWorkflowRun[]>([]);
  const [snapshots, setSnapshots] = useState<SetSnapshot[]>([]);
  const [banks, setBanks] = useState<DeliberateBankOption[]>([]);
  const [filters, setFilters] = useState<ChoiceFilters | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [activeStep, setActiveStep] = useState<StepId>(1);
  const [assetMode, setAssetMode] = useState<AssetMode>('upload');
  const [draftMode, setDraftMode] = useState(false);

  const [kind, setKind] = useState<DeliberateKind>('choice');
  const [choiceMode, setChoiceMode] = useState<'practice' | 'review'>('practice');
  const [name, setName] = useState('');
  const [bankId, setBankId] = useState('');
  const [targetCount, setTargetCount] = useState(10);
  const [year, setYear] = useState<number | ''>('');
  const [subject, setSubject] = useState('');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState<'all' | 'unstarted' | 'mistake' | 'due_review'>('all');
  const [mode, setMode] = useState<'sequential' | 'random' | 'review'>('sequential');
  const [completionMode, setCompletionMode] = useState<CompletionMode>('question_count');
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const focusWorkType: DeliberateFocusWorkType = kind === 'flashcard' ? 'vocab_today' : kind === 'input' ? 'input' : choiceMode;
  const selectedConfig = configs.find((item) => item.id === selectedId) ?? configs[0] ?? null;
  const selectedBank = banks.find((item) => item.id === bankId) ?? null;
  const bankCountLabel = kind === 'flashcard' ? '词' : '题';
  const kindLabel = kind === 'flashcard' ? '闪卡' : kind === 'input' ? '输入题' : '选择题';
  const canSave = Boolean(name.trim() && bankId);
  const canUseBank = Boolean(bankId);
  const hasSavedConfig = configs.length > 0;

  const resetDraft = useCallback(() => {
    setDraftMode(true);
    setActiveStep(1);
    setAssetMode('upload');
    setKind('choice');
    setChoiceMode('practice');
    setName('');
    setBankId('');
    setTargetCount(10);
    setYear('');
    setSubject('');
    setTag('');
    setStatus('all');
    setMode('sequential');
    setCompletionMode('question_count');
    setUploadName('');
    setUploadDescription('');
    setUploadFile(null);
    setUploadErrors([]);
    setError(null);
  }, []);

  const persistSelectedId = useCallback((id: string) => {
    try {
      if (id) {
        window.localStorage.setItem(SELECTED_WORKFLOW_STORAGE_KEY, id);
      } else {
        window.localStorage.removeItem(SELECTED_WORKFLOW_STORAGE_KEY);
      }
    } catch {
      // localStorage may be unavailable in constrained browser contexts.
    }
  }, []);

  const loadConfigs = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDeliberateWorkflows();
      setConfigs(data);
      setSelectedId((current) => {
        let stored = '';
        try {
          stored = window.localStorage.getItem(SELECTED_WORKFLOW_STORAGE_KEY) || '';
        } catch {
          stored = '';
        }
        const candidate = preferredId || current || stored;
        const nextId = data.some((item) => item.id === candidate) ? candidate : data[0]?.id || '';
        persistSelectedId(nextId);
        return nextId;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载刻意工作流失败');
    } finally {
      setLoading(false);
    }
  }, [persistSelectedId]);

  const loadBanks = useCallback(async (bankKind: DeliberateKind) => {
    try {
      const data = await listDeliberateBanks(bankKind);
      setBanks(data);
      setBankId((current) => current && data.some((item) => item.id === current) ? current : '');
    } catch (err) {
      setBanks([]);
      setError(err instanceof Error ? err.message : '加载题库失败');
    }
  }, []);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    if (loading) return;
    if (configs.length === 0) {
      setDraftMode(true);
      setActiveStep((current) => current === 4 ? 1 : current);
      return;
    }
    if (!draftMode) {
      setActiveStep(4);
    }
  }, [configs.length, draftMode, loading]);

  useEffect(() => {
    void loadBanks(kind);
  }, [kind, loadBanks]);

  useEffect(() => {
    if (kind !== 'choice' || !bankId) {
      setFilters(null);
      return;
    }
    fetchChoiceFilters(bankId)
      .then((data) => setFilters(data))
      .catch(() => setFilters(null));
  }, [kind, bankId]);

  useEffect(() => {
    if (!selectedConfig) {
      setRuns([]);
      setSnapshots([]);
      return;
    }
    listDeliberateRuns(selectedConfig.id)
      .then(setRuns)
      .catch(() => setRuns([]));
    if (selectedConfig.bank_id) {
      fetchSetSnapshots(selectedConfig.bank_id, { limit: 30 })
        .then(setSnapshots)
        .catch(() => setSnapshots([]));
    } else {
      setSnapshots([]);
    }
  }, [selectedConfig]);

  const scope = useMemo(() => {
    if (kind === 'flashcard') return {};
    return {
      bank_id: bankId,
      years: year !== '' ? [year] : undefined,
      subjects: subject ? [subject] : undefined,
      tags: tag ? [tag] : undefined,
      status,
      mode,
    };
  }, [bankId, kind, mode, status, subject, tag, year]);

  const completion = useMemo(() => {
    if (kind === 'flashcard') {
      return { mode: 'word_count', word_count: targetCount };
    }
    if (completionMode === 'exhaust_scope') {
      return { mode: 'exhaust_scope' };
    }
    return { mode: 'question_count', question_count: targetCount };
  }, [completionMode, kind, targetCount]);

  async function handleUpload() {
    if (!uploadName.trim() || !uploadFile) {
      setError('请填写题库名称并选择 JSON 文件');
      return;
    }
    setUploading(true);
    setError(null);
    setUploadErrors([]);
    try {
      const result = await uploadDeliberateBank({
        kind,
        name: uploadName.trim(),
        description: uploadDescription,
        file: uploadFile,
      });
      setBankId(result.bank_id);
      setName((current) => current || result.name);
      setUploadFile(null);
      setUploadName('');
      setUploadDescription('');
      await loadBanks(kind);
      setBankId(result.bank_id);
      setAssetMode('existing');
      setActiveStep(3);
    } catch (err) {
      const rich = err as DeliberateUploadError;
      setError(rich.message || '上传题库失败');
      setUploadErrors(rich.errors || []);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('请输入配置名称');
      return;
    }
    if (!bankId) {
      setError('请选择或上传题库');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createDeliberateWorkflow({
        name: name.trim(),
        kind,
        focus_work_type: focusWorkType,
        bank_id: bankId,
        target_count: targetCount,
        scope,
        completion,
      });
      setName('');
      await loadConfigs(created.id);
      setSelectedId(created.id);
      persistSelectedId(created.id);
      setDraftMode(false);
      setActiveStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存配置失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleStart(config: DeliberateWorkflowConfig) {
    setStartingId(config.id);
    setError(null);
    try {
      await startDeliberateWorkflow(config.id);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动刻意工作流失败');
    } finally {
      setStartingId(null);
    }
  }

  async function handleDelete(config: DeliberateWorkflowConfig) {
    if (!window.confirm(`删除配置「${config.name}」？`)) return;
    try {
      await deleteDeliberateWorkflow(config.id);
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除配置失败');
    }
  }

  function handleWorkflowSelect(id: string) {
    if (id === '__draft__') {
      resetDraft();
      return;
    }
    setSelectedId(id);
    persistSelectedId(id);
    setDraftMode(false);
    setActiveStep(4);
    setError(null);
  }

  const steps: { id: StepId; title: string; summary: string; locked: boolean; icon: ReactNode }[] = [
    {
      id: 1,
      title: '选择类型',
      summary: kindLabel,
      locked: false,
      icon: <Workflow className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 2,
      title: '题库资产',
      summary: selectedBank ? selectedBank.name : '未选择',
      locked: false,
      icon: <Database className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 3,
      title: '工作参数',
      summary: canUseBank ? `${focusTypeLabel(focusWorkType)} · 目标 ${targetCount}` : '等待题库',
      locked: !canUseBank,
      icon: <Settings2 className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 4,
      title: '运行复盘',
      summary: draftMode ? '保存后进入' : hasSavedConfig ? `${configs.length} 个配置` : '等待保存',
      locked: draftMode || !hasSavedConfig,
      icon: <Archive className="h-4 w-4" aria-hidden="true" />,
    },
  ];
  const activeStepMeta = steps.find((step) => step.id === activeStep) ?? steps[0];
  const savedWorkflowContent = loading ? (
    <div className="rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle p-8 text-center text-sm text-ark-text-muted">
      正在加载刻意工作流
    </div>
  ) : configs.length === 0 ? (
    <div className="rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle p-8 text-center text-sm text-ark-text-muted">
      暂无已保存工作流
    </div>
  ) : (
    <div className="space-y-5">
      {selectedConfig ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <SelectionSummary
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            title={selectedConfig.name}
            detail={`${focusTypeLabel(selectedConfig.focus_work_type)} · ${selectedConfig.bank_summary?.name ?? '未绑定题库'} · 目标 ${selectedConfig.target_count}`}
          />
          <div className="flex items-end gap-2">
            <Button
              variant="primary"
              loading={startingId === selectedConfig.id}
              loadingText="启动中"
              leftIcon={<Play className="h-4 w-4" />}
              onClick={() => void handleStart(selectedConfig)}
            >
              开始专注
            </Button>
            <Button
              variant="ghost"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => void handleDelete(selectedConfig)}
            >
              删除
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-ark-accent" aria-hidden="true" />
            <h3 className="text-base font-semibold text-ark-text">运行档案</h3>
          </div>
          {runs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ark-border p-6 text-center text-sm text-ark-text-muted">
              当前配置暂无运行档案
            </div>
          ) : (
            <div className="space-y-2">
              {runs.slice(0, 6).map((run) => (
                <div key={run.id} className="flex items-center justify-between rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-ark-text">{statusLabel[run.status]}</div>
                    <div className="text-xs text-ark-text-faint">{formatDate(run.created_at)}</div>
                  </div>
                  <div className="text-right text-xs text-ark-text-muted">
                    <div>{run.snapshot_id ? '已关联存档' : '暂无存档'}</div>
                    <div>{run.focus_run_id ? 'focus run 已记录' : '等待轮次'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-ark-accent" aria-hidden="true" />
            <h3 className="text-base font-semibold text-ark-text">存档可视化</h3>
          </div>
          <SnapshotPanel snapshots={snapshots} />
        </section>
      </div>
    </div>
  );

  return (
    <SubAppPageShell maxWidth="6xl">
      <div className="space-y-6">
        <SubAppPageHeader
          title="刻意工作流"
          description="按顺序完成题库资产、工作参数、专注运行和存档复盘。"
          breadcrumb="Admin"
          backTo="/apps"
          backLabel="返回应用中心"
        />

        {error ? (
          <div className="rounded-lg border border-ark-border bg-ark-surface-subtle px-4 py-3 text-sm text-ark-text">
            {error}
          </div>
        ) : null}

        {configs.length > 0 ? (
          <section className="grid gap-3 rounded-lg border border-ark-border bg-ark-surface-subtle p-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <Field label={draftMode ? '当前状态' : '当前工作流'}>
              <select
                value={draftMode ? '__draft__' : selectedConfig?.id ?? ''}
                onChange={(event) => handleWorkflowSelect(event.target.value)}
                className={inputClass}
              >
                {draftMode ? <option value="__draft__">正在新建工作流</option> : null}
                {configs.map((config) => (
                  <option key={config.id} value={config.id}>{config.name}</option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Button
                variant={draftMode ? 'secondary' : 'primary'}
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={resetDraft}
              >
                {draftMode ? '重新开始' : '新建工作流'}
              </Button>
            </div>
          </section>
        ) : null}

        {draftMode ? (
          <nav aria-label="刻意工作流步骤" className="grid gap-2 md:grid-cols-4">
            {steps.map((step) => (
              <button
                key={step.id}
                type="button"
                disabled={step.locked}
                onClick={() => setActiveStep(step.id)}
                className={`flex min-h-20 items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                  activeStep === step.id
                    ? 'border-ark-accent bg-ark-surface text-ark-text'
                    : 'border-ark-border bg-ark-surface-subtle text-ark-text-muted hover:text-ark-text'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ark-border bg-ark-surface">
                  {step.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{step.id}. {step.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-ark-text-faint">{step.summary}</span>
                </span>
              </button>
            ))}
          </nav>
        ) : null}

        <section className="rounded-lg border border-ark-border bg-ark-surface p-5">
          <div className="mb-5 flex flex-col gap-3 border-b border-ark-border pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-medium text-ark-text-faint">
                {draftMode ? `步骤 ${activeStepMeta.id} / 4` : '已保存工作流'}
              </div>
              <h2 className="mt-1 text-xl font-semibold text-ark-text">
                {draftMode ? activeStepMeta.title : selectedConfig?.name ?? '刻意工作流'}
              </h2>
              <p className="mt-1 text-sm text-ark-text-muted">
                {draftMode ? activeStepMeta.summary : selectedConfig ? `${focusTypeLabel(selectedConfig.focus_work_type)} · ${selectedConfig.bank_summary?.name ?? '未绑定题库'}` : '选择或新建一个工作流'}
              </p>
            </div>
            {draftMode && selectedBank ? (
              <SelectionSummary
                icon={<Database className="h-4 w-4" aria-hidden="true" />}
                title={selectedBank.name}
                detail={`${kindLabel}题库 · ${selectedBank.count} ${bankCountLabel}`}
              />
            ) : null}
          </div>

          {!draftMode ? savedWorkflowContent : null}

          {draftMode && activeStep === 1 ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-ark-border bg-ark-surface-subtle p-1">
                {(['choice', 'flashcard', 'input'] as DeliberateKind[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setKind(item)}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                      kind === item ? 'bg-ark-surface-strong text-ark-text' : 'text-ark-text-muted hover:text-ark-text'
                    }`}
                  >
                    {item === 'choice' ? '选择题' : item === 'flashcard' ? '闪卡' : '输入题'}
                  </button>
                ))}
              </div>

              <div className="flex justify-end">
                <Button variant="primary" onClick={() => setActiveStep(2)}>下一步</Button>
              </div>
            </div>
          ) : null}

          {draftMode && activeStep === 2 ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-ark-border bg-ark-surface-subtle p-1">
                {(['upload', 'existing'] as AssetMode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setAssetMode(item)}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                      assetMode === item ? 'bg-ark-surface-strong text-ark-text' : 'text-ark-text-muted hover:text-ark-text'
                    }`}
                  >
                    {item === 'existing' ? '选择已有题库' : '上传新题库'}
                  </button>
                ))}
              </div>

              {assetMode === 'existing' ? (
                <div className="space-y-4">
                  <Field label="题库">
                    <select value={bankId} onChange={(event) => setBankId(event.target.value)} className={inputClass}>
                      <option value="">{banks.length === 0 ? '暂无题库' : '请选择题库'}</option>
                      {banks.map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          {bank.name} ({bank.count} {bankCountLabel})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <SelectionSummary
                    icon={<Database className="h-4 w-4" aria-hidden="true" />}
                    title={selectedBank?.name ?? '未选择题库'}
                    detail={selectedBank ? `${selectedBank.count} ${bankCountLabel}` : '可以上传新题库，或选择一份已有题库资产'}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="题库名称">
                      <input value={uploadName} onChange={(event) => setUploadName(event.target.value)} className={inputClass} />
                    </Field>
                    <Field label="JSON 文件">
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-ark-text-muted file:mr-3 file:rounded-md file:border file:border-ark-border file:bg-ark-surface-subtle file:px-3 file:py-2 file:text-sm file:text-ark-text"
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="描述">
                        <textarea
                          value={uploadDescription}
                          onChange={(event) => setUploadDescription(event.target.value)}
                          className={`${inputClass} min-h-20`}
                        />
                      </Field>
                    </div>
                  </div>
                  {uploadErrors.length ? (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-ark-border bg-ark-surface-subtle p-3 text-xs text-ark-text-muted">
                      {uploadErrors.map((item) => <div key={item}>{item}</div>)}
                    </div>
                  ) : null}
                  <Button
                    variant="secondary"
                    loading={uploading}
                    loadingText="校验中"
                    leftIcon={<FileUp className="h-4 w-4" />}
                    onClick={() => void handleUpload()}
                  >
                    校验并上传
                  </Button>
                </div>
              )}

              <div className="flex justify-between gap-3">
                <Button variant="ghost" onClick={() => setActiveStep(1)}>上一步</Button>
                <Button variant="primary" disabled={!canUseBank} onClick={() => setActiveStep(3)}>下一步</Button>
              </div>
            </div>
          ) : null}

          {draftMode && activeStep === 3 ? (
            <div className="space-y-5">
              {kind === 'choice' ? (
                <div>
                  <div className="mb-1.5 text-sm font-medium text-ark-text-muted">工作模式</div>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-ark-border bg-ark-surface-subtle p-1">
                    {(['practice', 'review'] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setChoiceMode(item)}
                        className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                          choiceMode === item ? 'bg-ark-surface-strong text-ark-text' : 'text-ark-text-muted hover:text-ark-text'
                        }`}
                      >
                        {item === 'practice' ? '练习模式' : '复习模式'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="配置名称">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={inputClass}
                    placeholder="例如：408 每日 20 题"
                  />
                </Field>
                <Field label={kind === 'flashcard' ? '目标词数' : '目标题数'}>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={targetCount}
                    onChange={(event) => setTargetCount(Math.max(1, Math.min(500, Number(event.target.value) || 10)))}
                    className={inputClass}
                  />
                </Field>
                {kind === 'choice' ? (
                  <Field label="完成条件">
                    <select
                      value={completionMode}
                      onChange={(event) => setCompletionMode(event.target.value as CompletionMode)}
                      className={inputClass}
                    >
                      <option value="question_count">做 N 道题</option>
                      <option value="exhaust_scope">做完整个范围</option>
                    </select>
                  </Field>
                ) : null}
              </div>

              {kind === 'choice' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="年份">
                    <select value={year} onChange={(event) => setYear(event.target.value ? Number(event.target.value) : '')} className={inputClass}>
                      <option value="">全部年份</option>
                      {filters?.years.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="科目">
                    <select value={subject} onChange={(event) => setSubject(event.target.value)} className={inputClass}>
                      <option value="">全部科目</option>
                      {filters?.subjects.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="标签">
                    <select value={tag} onChange={(event) => setTag(event.target.value)} className={inputClass}>
                      <option value="">全部标签</option>
                      {filters?.tags.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="筛选">
                    <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={inputClass}>
                      <option value="all">全部</option>
                      <option value="unstarted">未开始</option>
                      <option value="mistake">错题</option>
                      <option value="due_review">待复习</option>
                    </select>
                  </Field>
                  <Field label="顺序">
                    <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className={inputClass}>
                      <option value="sequential">顺序</option>
                      <option value="random">随机</option>
                      <option value="review">复习优先</option>
                    </select>
                  </Field>
                  <div className="rounded-lg border border-ark-border bg-ark-surface-subtle px-4 py-3 text-sm text-ark-text-muted">
                    范围内约 {filters?.total_questions ?? 0} 题
                  </div>
                </div>
              ) : null}

              <div className="flex justify-between gap-3">
                <Button variant="ghost" onClick={() => setActiveStep(2)}>上一步</Button>
                <Button
                  variant="primary"
                  loading={saving}
                  loadingText="保存中"
                  disabled={!canSave}
                  leftIcon={<Save className="h-4 w-4" />}
                  onClick={() => void handleSave()}
                >
                  保存配置
                </Button>
              </div>
            </div>
          ) : null}

          {draftMode && activeStep === 4 ? savedWorkflowContent : null}
        </section>
      </div>
    </SubAppPageShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ark-text-muted">{label}</span>
      {children}
    </label>
  );
}

function SelectionSummary({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-ark-border bg-ark-surface-subtle px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ark-border bg-ark-surface text-ark-accent">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ark-text">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-ark-text-muted">{detail}</span>
      </span>
    </div>
  );
}
