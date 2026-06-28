import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Archive, BarChart3, CheckCircle2, ChevronDown, ChevronRight, Database, FileUp, Link, Play, Plus, Save, Settings2, Trash2, Workflow, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AppModalFrame from '../components/AppModalFrame';
import BankPreview from '../components/deliberate/BankPreview';
import Button from '../components/Button';
import CreateFocusWorkModal from '../components/deliberate/CreateFocusWorkModal';
import EditFocusWorkModal from '../components/deliberate/EditFocusWorkModal';
import SubAppPageHeader from '../components/SubAppPageHeader';
import SubAppPageShell from '../components/SubAppPageShell';
import type { Task } from '../components/taskTypes';
import { fetchChoiceFilters, fetchSetSnapshots } from '../lib/choice/api';
import type { ChoiceFilters, InputSetSnapshot, SetSnapshot } from '../lib/choice/types';
import { apiJson } from '../lib/api';
import {
  createDeliberateWorkflow,
  deleteDeliberateBank,
  deleteDeliberateWorkflow,
  getDeliberateRun,
  listDeliberateBanks,
  listDeliberateRuns,
  listDeliberateWorkflows,
  patchDeliberateWorkflow,
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

function isInputSnapshot(snapshot: SetSnapshot): snapshot is InputSetSnapshot {
  return 'answered_count' in snapshot && 'correct_count' in snapshot;
}

function SnapshotPanel({ snapshots, kind }: { snapshots: SetSnapshot[]; kind?: string }) {
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

  const isInput = isInputSnapshot(latest);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {isInput ? (
          <>
            <Metric label="已作答" value={String(latest.answered_count ?? 0)} detail={`总量 ${latest.total_questions}`} />
            <Metric label="正确数" value={String(latest.correct_count ?? 0)} detail={`${latest.answered_count > 0 ? Math.round((latest.correct_count / latest.answered_count) * 100) : 0}% 正确率`} />
            <Metric label="专注" value={String(focus.total_sessions ?? 0)} detail={`${focus.total_minutes ?? 0} 分钟`} />
            <Metric label="总题数" value={String(latest.total_questions)} detail={Object.entries(latest.mode_breakdown || {}).map(([k, v]) => `${k}: ${v}`).join(', ')} />
          </>
        ) : (
          <>
            <Metric label="正确率" value={`${latestAccuracy(latest)}%`} detail={`${focus.total_answers ?? 0} 次答题`} />
            <Metric label="掌握" value={String(mastery.mastered ?? 0)} detail={`总量 ${latest.total_questions}`} />
            <Metric label="待复习" value={String(due.due_now ?? due.overdue ?? 0)} detail="当前快照" />
            <Metric label="专注" value={String(focus.total_sessions ?? 0)} detail={`${focus.total_minutes ?? 0} 分钟`} />
          </>
        )}
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState(false);
  const [modalRunId, setModalRunId] = useState<string | null>(null);
  const [modalRun, setModalRun] = useState<DeliberateWorkflowRun | null>(null);
  const [loadingModalRun, setLoadingModalRun] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<DeliberateWorkflowConfig | null>(null);

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
  const [passCriteriaEnabled, setPassCriteriaEnabled] = useState(false);
  const [passCriteriaThreshold, setPassCriteriaThreshold] = useState(80);
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const focusWorkType: DeliberateFocusWorkType = kind === 'flashcard' ? 'vocab_today' : kind === 'input' ? 'input' : choiceMode;
  const selectedConfig = configs.find((item) => item.id === selectedId) ?? configs[0] ?? null;
  const selectedBank = banks.find((item) => item.id === bankId) ?? null;
  const selectedTask = tasks.find((t) => t.id === selectedConfig?.task_id) ?? null;
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
    setPassCriteriaEnabled(false);
    setPassCriteriaThreshold(80);
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
      if (selectedConfig.kind === 'input') {
        apiJson<SetSnapshot[]>(`/api/input/snapshots?bank_id=${selectedConfig.bank_id}&limit=30`)
          .then(setSnapshots)
          .catch(() => setSnapshots([]));
      } else {
        fetchSetSnapshots(selectedConfig.bank_id, { limit: 30 })
          .then(setSnapshots)
          .catch(() => setSnapshots([]));
      }
    } else {
      setSnapshots([]);
    }
  }, [selectedConfig]);

  useEffect(() => {
    setTasksLoading(true);
    apiJson<Task[]>('/todo/tasks?limit=100')
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false));
  }, []);

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

  const passCriteria = useMemo(() => {
    if (!passCriteriaEnabled) return {};
    return {
      mode: 'accuracy',
      threshold: passCriteriaThreshold / 100,
    };
  }, [passCriteriaEnabled, passCriteriaThreshold]);

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
        pass_criteria: passCriteria,
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
    setError(null);
    try {
      await deleteDeliberateWorkflow(config.id);
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除配置失败');
    }
  }

  async function handleDeleteBank(bankId: string, bankName: string) {
    if (!window.confirm(`删除题库「${bankName}」？此操作不可撤销。`)) return;
    setError(null);
    try {
      await deleteDeliberateBank(bankId, kind);
      await loadBanks(kind);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除题库失败');
    }
  }

  async function handleCreateFocusWork(data: {
    name: string;
    kind: DeliberateKind;
    focus_work_type: DeliberateFocusWorkType;
    bank_id: string;
    target_count: number;
    scope: Record<string, unknown>;
    completion: Record<string, unknown>;
    pass_criteria: Record<string, unknown>;
  }) {
    setSaving(true);
    setError(null);
    try {
      await createDeliberateWorkflow(data);
      await loadConfigs();
      setShowCreateModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSave(patch: {
    name?: string;
    bank_id?: string;
    target_count?: number;
    pass_criteria?: Record<string, unknown>;
  }) {
    if (!editingConfig) return;
    setSaving(true);
    setError(null);
    try {
      await patchDeliberateWorkflow(editingConfig.id, patch);
      await loadConfigs(editingConfig.id);
      setEditingConfig(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleTaskSelect(configId: string, taskId: string | null) {
    setUpdatingTaskId(true);
    setError(null);
    try {
      await patchDeliberateWorkflow(configId, { task_id: taskId });
      await loadConfigs(configId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新任务绑定失败');
    } finally {
      setUpdatingTaskId(false);
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

  const handleRunClick = useCallback(async (runId: string) => {
    setModalRunId(runId);
    setModalRun(null);
    setLoadingModalRun(true);
    setExpandedSections(new Set(['overview']));
    try {
      const run = await getDeliberateRun(runId);
      setModalRun(run);
    } catch {
      setModalRun(null);
    } finally {
      setLoadingModalRun(false);
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalRunId(null);
    setModalRun(null);
  }, []);

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

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
    <div className="space-y-8">
      {/* 区域1：题库管理 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-ark-accent" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-ark-text">题库管理</h3>
        </div>

        {/* 题库类型切换 */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-ark-border bg-ark-surface-subtle p-1">
          {(['choice', 'flashcard', 'input'] as DeliberateKind[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setKind(item);
                void loadBanks(item);
              }}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                kind === item ? 'bg-ark-surface-strong text-ark-text' : 'text-ark-text-muted hover:text-ark-text'
              }`}
            >
              {item === 'choice' ? '选择题' : item === 'flashcard' ? '闪卡' : '输入题'}
            </button>
          ))}
        </div>

        {/* 题库列表 */}
        <div className="space-y-2">
          {banks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ark-border p-6 text-center text-sm text-ark-text-muted">
              暂无题库，请上传新题库
            </div>
          ) : (
            banks.map((bank) => (
              <div
                key={bank.id}
                className="flex items-center justify-between rounded-lg border border-ark-border bg-ark-surface-subtle px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ark-text">{bank.name}</div>
                  <div className="text-xs text-ark-text-muted">
                    {bank.count} {kind === 'flashcard' ? '词' : '题'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 className="h-4 w-4" />}
                    onClick={() => void handleDeleteBank(bank.id, bank.name)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 上传新题库 */}
        <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
          <h4 className="mb-3 text-sm font-medium text-ark-text">上传新题库</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="题库名称">
              <input
                value={uploadName}
                onChange={(event) => setUploadName(event.target.value)}
                className={inputClass}
                placeholder="输入题库名称"
              />
            </Field>
            <Field label="JSON 或 ZIP 文件">
              <input
                type="file"
                accept=".json,application/json,.zip,application/zip"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-ark-text-muted file:mr-3 file:rounded-md file:border file:border-ark-border file:bg-ark-surface-subtle file:px-3 file:py-2 file:text-sm file:text-ark-text"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="描述">
                <textarea
                  value={uploadDescription}
                  onChange={(event) => setUploadDescription(event.target.value)}
                  className={`${inputClass} min-h-16`}
                  placeholder="题库描述（可选）"
                />
              </Field>
            </div>
          </div>
          {uploadErrors.length > 0 && (
            <div className="mt-2 rounded-md bg-red-500/10 p-2 text-xs text-red-400">
              {uploadErrors.map((err, i) => <div key={i}>{err}</div>)}
            </div>
          )}
          <div className="mt-3">
            <Button
              variant="secondary"
              loading={uploading}
              loadingText="上传中"
              leftIcon={<FileUp className="h-4 w-4" />}
              onClick={() => void handleUpload()}
            >
              上传题库
            </Button>
          </div>
        </div>

        {/* 存档可视化 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-ark-accent" aria-hidden="true" />
            <h4 className="text-base font-semibold text-ark-text">存档可视化</h4>
          </div>
          <SnapshotPanel snapshots={snapshots} kind={kind} />
        </div>
      </section>

      {/* 区域2：专注工作管理 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-ark-accent" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-ark-text">专注工作管理</h3>
          </div>
          <Button
            variant="primary"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            新建专注工作
          </Button>
        </div>

        {/* 专注工作列表 */}
        <div className="space-y-2">
          {configs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ark-border p-6 text-center text-sm text-ark-text-muted">
              暂无专注工作配置，请新建
            </div>
          ) : (
            configs.map((config) => (
              <div
                key={config.id}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 transition ${
                  selectedId === config.id
                    ? 'border-ark-accent bg-ark-surface'
                    : 'border-ark-border bg-ark-surface-subtle hover:border-ark-accent/50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ark-text">{config.name}</div>
                  <div className="text-xs text-ark-text-muted">
                    {focusTypeLabel(config.focus_work_type)} · {config.bank_summary?.name ?? '未绑定题库'} · 目标 {config.target_count}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={startingId === config.id}
                    loadingText="启动中"
                    leftIcon={<Play className="h-3 w-3" />}
                    onClick={() => void handleStart(config)}
                  >
                    开始
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingConfig(config)}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 className="h-3 w-3" />}
                    onClick={() => void handleDelete(config)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 区域3：工作流编排 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-ark-accent" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-ark-text">工作流编排</h3>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Link className="h-5 w-5 text-ark-accent" aria-hidden="true" />
              <h4 className="text-base font-semibold text-ark-text">绑定任务</h4>
            </div>
            {tasksLoading ? (
              <div className="rounded-lg border border-dashed border-ark-border p-6 text-center text-sm text-ark-text-muted">
                加载任务列表…
              </div>
            ) : (
              <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
                <label className="mb-1.5 block text-xs font-medium text-ark-text-muted">关联任务</label>
                <select
                  aria-label="绑定任务"
                  value={selectedConfig?.task_id ?? ''}
                  onChange={(e) => void handleTaskSelect(selectedConfig!.id, e.target.value || null)}
                  disabled={!selectedConfig || updatingTaskId}
                  className="w-full rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">未绑定任务</option>
                  {tasks
                    .filter((t) => t.status !== 'done' && !t.is_deleted)
                    .map((task) => (
                      <option key={task.id} value={task.id}>{task.title}</option>
                    ))}
                </select>
                {selectedTask ? (
                  <div className="mt-3 rounded-lg border border-ark-border bg-ark-surface px-3 py-2 text-sm text-ark-text">
                    <div className="text-xs text-ark-text-muted">已绑定</div>
                    <div className="mt-0.5 truncate font-medium">{selectedTask.title}</div>
                  </div>
                ) : selectedConfig?.task_id ? (
                  <div className="mt-3 text-xs text-ark-text-faint">任务已不存在或已完成</div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </section>

      {/* 区域4：运行档案 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-ark-accent" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-ark-text">运行档案</h3>
        </div>
        {runs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ark-border p-6 text-center text-sm text-ark-text-muted">
            当前配置暂无运行档案
          </div>
        ) : (
          <div className="space-y-2">
            {runs.slice(0, 6).map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => void handleRunClick(run.id)}
                className="flex w-full items-center justify-between rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2 text-left transition hover:border-ark-accent/50 hover:bg-ark-surface"
              >
                <div>
                  <div className="text-sm font-medium text-ark-text">{statusLabel[run.status]}</div>
                  <div className="text-xs text-ark-text-faint">{formatDate(run.created_at)}</div>
                </div>
                <div className="text-right text-xs text-ark-text-muted">
                  <div>{run.snapshot_id ? '已关联存档' : '暂无存档'}</div>
                  <div>{run.focus_run_id ? 'focus run 已记录' : '等待轮次'}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  return (
    <SubAppPageShell maxWidth="6xl">
      <div className="space-y-6">
        <SubAppPageHeader
          title="刻意学习流"
          description="管理题库、专注工作和工作流，通过刻意练习提升学习效果。"
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
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-ark-border bg-ark-surface-subtle p-1">
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
                  {selectedBank && (
                    <BankPreview
                      bankId={selectedBank.id}
                      bankKind={kind}
                      bankName={selectedBank.name}
                      totalCount={selectedBank.count}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="题库名称">
                      <input value={uploadName} onChange={(event) => setUploadName(event.target.value)} className={inputClass} />
                    </Field>
                    <Field label="JSON 或 ZIP 文件">
                      <input
                        type="file"
                        accept=".json,application/json,.zip,application/zip"
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
                  {bankId && selectedBank && (
                    <BankPreview
                      bankId={bankId}
                      bankKind={kind}
                      bankName={selectedBank.name}
                      totalCount={selectedBank.count}
                    />
                  )}
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

                {kind !== 'flashcard' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={passCriteriaEnabled}
                          onChange={(e) => setPassCriteriaEnabled(e.target.checked)}
                          className="rounded border-ark-border"
                        />
                        <span className="text-sm font-medium text-ark-text-muted">启用通过标准</span>
                      </label>
                    </div>
                    {passCriteriaEnabled ? (
                      <Field label="正确率阈值 (%)">
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={50}
                            max={100}
                            step={5}
                            value={passCriteriaThreshold}
                            onChange={(e) => setPassCriteriaThreshold(Number(e.target.value))}
                            className="flex-1"
                          />
                          <span className="text-sm font-medium text-ark-text w-12 text-right">{passCriteriaThreshold}%</span>
                        </div>
                      </Field>
                    ) : null}
                  </div>
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

      {/* 运行档案详情弹窗 */}
      <RunDetailModal
        run={modalRun}
        loading={loadingModalRun}
        expandedSections={expandedSections}
        onToggleSection={toggleSection}
        onClose={handleCloseModal}
      />

      {/* 新建专注工作弹窗 */}
      {showCreateModal && (
        <CreateFocusWorkModal
          banks={banks}
          filters={filters}
          saving={saving}
          onSave={handleCreateFocusWork}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* 编辑专注工作弹窗 */}
      {editingConfig && (
        <EditFocusWorkModal
          config={editingConfig}
          banks={banks}
          filters={filters}
          saving={saving}
          onSave={handleEditSave}
          onClose={() => setEditingConfig(null)}
        />
      )}
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

function formatDuration(seconds?: number): string {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

function VocabRunSummary({ summary }: { summary: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="已复习" value={String((summary.reviewed_count as number) ?? 0)} detail={`共 ${(summary.total_words as number) ?? 0} 词`} />
        <Metric label="已掌握" value={String((summary.memorized_count as number) ?? 0)} detail={`${summary.correct_rate ? Math.round((summary.correct_rate as number) * 100) : 0}% 正确率`} />
        <Metric label="新学" value={String((summary.new_count as number) ?? 0)} detail="本轮新增" />
        <Metric label="用时" value={formatDuration(summary.duration_seconds as number)} detail="本轮总用时" />
      </div>
    </div>
  );
}

function ChoiceRunSummary({ summary }: { summary: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="已答题" value={String((summary.answered_count as number) ?? 0)} detail={`共 ${(summary.total_questions as number) ?? 0} 题`} />
        <Metric label="正确" value={String((summary.correct_count as number) ?? 0)} detail={`${summary.accuracy ? Math.round((summary.accuracy as number) * 100) : 0}% 正确率`} />
        <Metric label="用时" value={formatDuration(summary.duration_seconds as number)} detail="本轮总用时" />
        <Metric label="正确率" value={`${summary.accuracy ? Math.round((summary.accuracy as number) * 100) : 0}%`} detail="答题正确率" />
      </div>
      {summary.question_details && Array.isArray(summary.question_details) && summary.question_details.length > 0 && (
        <div className="rounded-md bg-ark-surface-subtle p-3">
          <div className="mb-2 text-xs font-medium text-ark-text-muted">答题详情</div>
          <div className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {(summary.question_details as Array<Record<string, unknown>>).slice(0, 20).map((q, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-ark-text">{String(q.question_id ?? `Q${i + 1}`)}</span>
                <span className={q.correct ? 'text-green-500' : 'text-red-400'}>
                  {q.correct ? '正确' : '错误'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InputRunSummary({ summary }: { summary: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="已答题" value={String((summary.answered_count as number) ?? 0)} detail={`共 ${(summary.total_questions as number) ?? 0} 题`} />
        <Metric label="正确" value={String((summary.correct_count as number) ?? 0)} detail={`${summary.accuracy ? Math.round((summary.accuracy as number) * 100) : 0}% 正确率`} />
        <Metric label="用时" value={formatDuration(summary.duration_seconds as number)} detail="本轮总用时" />
        <Metric label="正确率" value={`${summary.accuracy ? Math.round((summary.accuracy as number) * 100) : 0}%`} detail="答题正确率" />
      </div>
      {summary.question_details && Array.isArray(summary.question_details) && summary.question_details.length > 0 && (
        <div className="rounded-md bg-ark-surface-subtle p-3">
          <div className="mb-2 text-xs font-medium text-ark-text-muted">答题详情</div>
          <div className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {(summary.question_details as Array<Record<string, unknown>>).slice(0, 20).map((q, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-ark-text">{String(q.question_id ?? `Q${i + 1}`)}</span>
                <span className={q.correct ? 'text-green-500' : 'text-red-400'}>
                  {q.correct ? '正确' : '错误'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RunDetailModal({
  run,
  loading,
  expandedSections,
  onToggleSection,
  onClose,
}: {
  run: DeliberateWorkflowRun | null;
  loading: boolean;
  expandedSections: Set<string>;
  onToggleSection: (section: string) => void;
  onClose: () => void;
}) {
  const configSnapshot = run?.config_snapshot || {};
  const progressSnapshot = run?.progress_snapshot || {};
  const runSummary = (progressSnapshot as Record<string, unknown>)?.run_summary as Record<string, unknown> | undefined;
  const focusWorkType = configSnapshot.focus_work_type as string | undefined;

  const startTime = run?.created_at ? new Date(run.created_at) : null;
  const endTime = run?.completed_at ? new Date(run.completed_at) : null;
  const duration = startTime && endTime
    ? Math.round((endTime.getTime() - startTime.getTime()) / 60000)
    : null;

  return (
    <AppModalFrame open={Boolean(run || loading)} onClose={onClose} ariaLabel="运行档案详情">
      <div className="w-[640px] max-w-[92vw] space-y-4 rounded-xl border border-ark-border bg-ark-surface p-5 shadow-xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-ark-border pb-3">
          <h3 className="text-lg font-semibold text-ark-text">运行档案详情</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-ark-text-muted">加载中...</div>
        ) : !run ? (
          <div className="py-8 text-center text-sm text-ark-text-muted">加载失败</div>
        ) : (
          <div className="space-y-4">
            {/* 执行概览 - 默认展开 */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => onToggleSection('overview')}
                className="flex w-full items-center gap-2 text-left"
              >
                {expandedSections.has('overview') ? (
                  <ChevronDown className="h-4 w-4 text-ark-text-muted" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-ark-text-muted" />
                )}
                <span className="text-sm font-medium text-ark-text">执行概览</span>
              </button>

              {expandedSections.has('overview') && (
                <div className="grid gap-3 pl-6 md:grid-cols-4">
                  <div className="rounded-md bg-ark-surface-subtle p-3">
                    <div className="text-xs text-ark-text-muted">状态</div>
                    <div className="mt-1 text-sm font-medium text-ark-text">{statusLabel[run.status]}</div>
                  </div>
                  <div className="rounded-md bg-ark-surface-subtle p-3">
                    <div className="text-xs text-ark-text-muted">启动时间</div>
                    <div className="mt-1 text-sm font-medium text-ark-text">{formatDate(run.created_at)}</div>
                  </div>
                  <div className="rounded-md bg-ark-surface-subtle p-3">
                    <div className="text-xs text-ark-text-muted">完成时间</div>
                    <div className="mt-1 text-sm font-medium text-ark-text">
                      {run.completed_at ? formatDate(run.completed_at) : '未完成'}
                    </div>
                  </div>
                  <div className="rounded-md bg-ark-surface-subtle p-3">
                    <div className="text-xs text-ark-text-muted">耗时</div>
                    <div className="mt-1 text-sm font-medium text-ark-text">
                      {duration !== null ? `${duration} 分钟` : '计算中'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 配置快照 - 默认折叠 */}
            {run.config_snapshot && Object.keys(run.config_snapshot).length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => onToggleSection('config')}
                  className="flex w-full items-center gap-2 text-left"
                >
                  {expandedSections.has('config') ? (
                    <ChevronDown className="h-4 w-4 text-ark-text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-ark-text-muted" />
                  )}
                  <span className="text-sm font-medium text-ark-text">配置快照</span>
                </button>

                {expandedSections.has('config') && (
                  <div className="space-y-2 pl-6 text-sm">
                    {configSnapshot.name && (
                      <div className="flex gap-2">
                        <span className="text-ark-text-muted">配置名称:</span>
                        <span className="text-ark-text">{String(configSnapshot.name)}</span>
                      </div>
                    )}
                    {configSnapshot.bank_id && (
                      <div className="flex gap-2">
                        <span className="text-ark-text-muted">题库ID:</span>
                        <span className="font-mono text-xs text-ark-text">{String(configSnapshot.bank_id)}</span>
                      </div>
                    )}
                    {configSnapshot.target_count && (
                      <div className="flex gap-2">
                        <span className="text-ark-text-muted">目标题数:</span>
                        <span className="text-ark-text">{String(configSnapshot.target_count)}</span>
                      </div>
                    )}
                    {configSnapshot.scope && typeof configSnapshot.scope === 'object' && Object.keys(configSnapshot.scope as Record<string, unknown>).length > 0 && (
                      <div className="mt-2">
                        <div className="mb-1 text-ark-text-muted">筛选条件:</div>
                        <div className="rounded-md bg-ark-surface-subtle p-2 font-mono text-xs text-ark-text">
                          {JSON.stringify(configSnapshot.scope, null, 2)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 本次专注详情 */}
            {runSummary && Object.keys(runSummary).length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => onToggleSection('summary')}
                  className="flex w-full items-center gap-2 text-left"
                >
                  {expandedSections.has('summary') ? (
                    <ChevronDown className="h-4 w-4 text-ark-text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-ark-text-muted" />
                  )}
                  <span className="text-sm font-medium text-ark-text">本次专注详情</span>
                </button>

                {expandedSections.has('summary') && (
                  <div className="pl-6 space-y-3">
                    {focusWorkType === 'vocab_today' && (
                      <VocabRunSummary summary={runSummary} />
                    )}
                    {(focusWorkType === 'practice' || focusWorkType === 'review') && (
                      <ChoiceRunSummary summary={runSummary} />
                    )}
                    {focusWorkType === 'input' && (
                      <InputRunSummary summary={runSummary} />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 执行进度 - 默认折叠 */}
            {run.progress_snapshot && Object.keys(run.progress_snapshot).length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => onToggleSection('progress')}
                  className="flex w-full items-center gap-2 text-left"
                >
                  {expandedSections.has('progress') ? (
                    <ChevronDown className="h-4 w-4 text-ark-text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-ark-text-muted" />
                  )}
                  <span className="text-sm font-medium text-ark-text">执行进度</span>
                </button>

                {expandedSections.has('progress') && (
                  <div className="pl-6">
                    <div className="rounded-md bg-ark-surface-subtle p-3 font-mono text-xs text-ark-text">
                      {JSON.stringify(progressSnapshot, null, 2)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 关联信息 */}
            {(run.snapshot_id || run.focus_run_id) && (
              <div className="flex gap-4 border-t border-ark-border pt-3 text-xs text-ark-text-muted">
                {run.snapshot_id && (
                  <div>存档ID: <span className="font-mono">{run.snapshot_id}</span></div>
                )}
                {run.focus_run_id && (
                  <div>专注运行ID: <span className="font-mono">{run.focus_run_id}</span></div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppModalFrame>
  );
}
