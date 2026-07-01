import { useEffect, useState } from 'react';
import { Info, Link, Plus, Trash2, X } from 'lucide-react';

import AppModalFrame from '../AppModalFrame';
import Button from '../Button';
import { listDeliberateBanks, type DeliberateWorkflowConfig, type DeliberateBankOption, type DeliberateWorkflowChild, type PrimaryFilter, type SortOrder, type BackflowRule } from '../../lib/deliberate/api';
import type { Task } from '../taskTypes';

type EditFocusWorkModalProps = {
  config: DeliberateWorkflowConfig;
  allConfigs: DeliberateWorkflowConfig[];
  tasks: Task[];
  saving: boolean;
  onSave: (patch: {
    name?: string;
    bank_id?: string;
    target_count?: number;
    pass_criteria?: Record<string, unknown>;
    children?: DeliberateWorkflowChild[];
    task_id?: string | null;
    primary_filter?: PrimaryFilter;
    sort_order?: SortOrder;
    use_fsrs?: boolean;
    backflow_rule?: BackflowRule;
  }) => Promise<void>;
  onClose: () => void;
};

const inputClass =
  'w-full rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]';

const primaryFilterLabels: Record<PrimaryFilter, string> = {
  all: '全部题目',
  unstarted: '没做过',
  mistake: '做错过',
  last_wrong: '上次做错',
  due_review: '到期复习',
};

const sortOrderLabels: Record<SortOrder, string> = {
  sequential: '按序号',
  due: '按到期时间',
  mistake_first: '按错误优先',
  random: '随机',
};

const backflowRuleLabels: Record<BackflowRule, string> = {
  none: '不回流',
  wrong_to_end: '答错放队尾',
  wrong_retry: '答错立即再来一次',
};

export default function EditFocusWorkModal({
  config,
  allConfigs,
  tasks,
  saving,
  onSave,
  onClose,
}: EditFocusWorkModalProps) {
  const [banks, setBanks] = useState<DeliberateBankOption[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [name, setName] = useState(config.name);
  const [bankId, setBankId] = useState(config.bank_id ?? '');
  const [targetCount, setTargetCount] = useState(config.target_count);
  const [primaryFilter, setPrimaryFilter] = useState<PrimaryFilter>(config.primary_filter || 'all');
  const [sortOrder, setSortOrder] = useState<SortOrder>(config.sort_order || 'sequential');
  const [useFsrs, setUseFsrs] = useState(config.use_fsrs || false);
  const [backflowRule, setBackflowRule] = useState<BackflowRule>(config.backflow_rule || 'none');
  const [passCriteriaEnabled, setPassCriteriaEnabled] = useState(
    Boolean(config.pass_criteria?.mode)
  );
  const [passCriteriaThreshold, setPassCriteriaThreshold] = useState(
    Math.round(((config.pass_criteria?.threshold as number) ?? 0.8) * 100)
  );
  const [children, setChildren] = useState<DeliberateWorkflowChild[]>(
    config.children || []
  );
  const [taskId, setTaskId] = useState<string>(config.task_id ?? '');

  const kindLabel = config.kind === 'flash_card' ? '闪卡' : config.kind === 'input' ? '输入题' : '选择题';
  const bankCountLabel = config.kind === 'flash_card' ? '词' : '题';

  useEffect(() => {
    let ignore = false;
    setLoadingBanks(true);

    listDeliberateBanks(config.kind)
      .then((data) => {
        if (ignore) return;

        if (config.bank_id && config.bank_summary && !data.some((bank) => bank.id === config.bank_id)) {
          const count = config.kind === 'flash_card'
            ? config.bank_summary.item_count
            : config.bank_summary.question_count;
          setBanks([
            ...data,
            {
              id: config.bank_id,
              name: config.bank_summary.name,
              kind: config.kind,
              count,
              item_count: config.bank_summary.item_count,
              question_count: config.bank_summary.question_count,
            },
          ]);
          return;
        }

        setBanks(data);
      })
      .catch(() => {
        if (!ignore) setBanks([]);
      })
      .finally(() => {
        if (!ignore) setLoadingBanks(false);
      });

    return () => {
      ignore = true;
    };
  }, [config.bank_id, config.bank_summary, config.kind]);

  const availableConfigs = allConfigs.filter(c => c.id !== config.id);

  function addChild() {
    setChildren(prev => [...prev, {
      config_id: availableConfigs[0]?.id || '',
      label: '',
      is_recommended: prev.length === 0,
    }]);
  }

  function removeChild(index: number) {
    setChildren(prev => prev.filter((_, i) => i !== index));
  }

  function updateChild(index: number, updates: Partial<DeliberateWorkflowChild>) {
    setChildren(prev => prev.map((child, i) => i === index ? { ...child, ...updates } : child));
  }

  function setRecommended(index: number) {
    setChildren(prev => prev.map((child, i) => ({
      ...child,
      is_recommended: i === index,
    })));
  }

  const selectedTask = tasks.find((t) => t.id === taskId) ?? null;

  async function handleSave() {
    const passCriteria = passCriteriaEnabled
      ? { mode: 'accuracy', threshold: passCriteriaThreshold / 100 }
      : {};

    await onSave({
      name: name.trim(),
      bank_id: bankId || null,
      target_count: targetCount,
      pass_criteria: passCriteria,
      children: children.filter(c => c.config_id),
      task_id: taskId || null,
      primary_filter: primaryFilter,
      sort_order: sortOrder,
      use_fsrs: useFsrs,
      backflow_rule: backflowRule,
    });
  }

  return (
    <AppModalFrame open={true} onClose={onClose} ariaLabel="编辑专注工作">
      <div className="w-[520px] max-w-[92vw] space-y-4 rounded-xl border border-ark-border bg-ark-surface p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-ark-border pb-3">
          <h3 className="text-lg font-semibold text-ark-text">编辑专注工作</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="输入专注工作名称"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">题库</label>
            <select
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
              className={inputClass}
            >
              <option value="">请选择题库</option>
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name} ({bank.count} {bankCountLabel})
                </option>
              ))}
            </select>
            {loadingBanks ? (
              <p className="mt-1.5 text-xs text-ark-text-faint">正在加载{kindLabel}题库…</p>
            ) : banks.length === 0 ? (
              <p className="mt-1.5 text-xs text-ark-text-faint">暂无可用{kindLabel}题库</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">
                {config.kind === 'flash_card' ? '目标词数' : '目标题数'}
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={targetCount}
                onChange={(e) => setTargetCount(Math.max(1, Math.min(500, Number(e.target.value) || 10)))}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">排序方式</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className={inputClass}
              >
                {(Object.entries(sortOrderLabels) as [SortOrder, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">主筛选条件</label>
            <select
              value={primaryFilter}
              onChange={(e) => setPrimaryFilter(e.target.value as PrimaryFilter)}
              className={inputClass}
            >
              {(Object.entries(primaryFilterLabels) as [PrimaryFilter, string][]).map(([value, label]) => {
                const disabled = value === 'due_review' && !useFsrs;
                return (
                  <option key={value} value={value} disabled={disabled}>
                    {label}{disabled ? '（需启用 FSRS）' : ''}
                  </option>
                );
              })}
            </select>
            {primaryFilter === 'due_review' && !useFsrs && (
              <p className="mt-1 text-xs text-amber-400">"到期复习"需要启用 FSRS</p>
            )}
          </div>

          <div className="flex items-start gap-4 rounded-lg border border-ark-border bg-ark-surface-subtle p-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-use-fsrs"
                checked={useFsrs}
                onChange={(e) => {
                  setUseFsrs(e.target.checked);
                  if (!e.target.checked && primaryFilter === 'due_review') {
                    setPrimaryFilter('all');
                  }
                }}
                className="rounded border-ark-border"
              />
              <label htmlFor="edit-use-fsrs" className="text-sm font-medium text-ark-text-muted cursor-pointer">
                启用 FSRS 调度
              </label>
            </div>
            <span className="group relative">
              <Info className="h-4 w-4 shrink-0 text-ark-text-faint mt-0.5" aria-hidden="true" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block whitespace-nowrap rounded bg-ark-surface-strong px-2 py-1 text-xs text-ark-text shadow-lg">
                FSRS 可自动计算复习时间，开启后方可选「到期复习」筛选条件
              </span>
            </span>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">本场回流规则</label>
            <select
              value={backflowRule}
              onChange={(e) => setBackflowRule(e.target.value as BackflowRule)}
              className={inputClass}
            >
              {(Object.entries(backflowRuleLabels) as [BackflowRule, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ark-text-faint">
              {backflowRule === 'none' && '答错不会重新出现'}
              {backflowRule === 'wrong_to_end' && '答错的题会放到当前题单末尾'}
              {backflowRule === 'wrong_retry' && '答错后会立即重新出现'}
            </p>
          </div>

          {config.kind !== 'flash_card' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={passCriteriaEnabled}
                  onChange={(e) => setPassCriteriaEnabled(e.target.checked)}
                  className="rounded border-ark-border"
                />
                <span className="text-sm font-medium text-ark-text-muted">启用通过标准</span>
              </label>
              {passCriteriaEnabled && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">正确率阈值 (%)</label>
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
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-ark-text-muted">子节点（fork 目标）</label>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Plus className="h-3 w-3" />}
                onClick={addChild}
                disabled={availableConfigs.length === 0}
              >
                添加
              </Button>
            </div>
            {children.length === 0 ? (
              <p className="text-xs text-ark-text-faint">检验未通过时，可 fork 到其他专注工作进行针对性练习</p>
            ) : (
              <div className="space-y-2">
                {children.map((child, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-lg border border-ark-border bg-ark-surface-subtle p-2">
                    <select
                      value={child.config_id}
                      onChange={(e) => updateChild(index, { config_id: e.target.value })}
                      className="flex-1 rounded border border-ark-border bg-ark-input px-2 py-1 text-xs text-ark-text"
                    >
                      {availableConfigs.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <input
                      value={child.label}
                      onChange={(e) => updateChild(index, { label: e.target.value })}
                      placeholder="标签"
                      className="w-20 rounded border border-ark-border bg-ark-input px-2 py-1 text-xs text-ark-text"
                    />
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="recommended"
                        checked={child.is_recommended}
                        onChange={() => setRecommended(index)}
                        className="rounded border-ark-border"
                      />
                      <span className="text-xs text-ark-text-muted">推荐</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeChild(index)}
                      className="rounded p-1 text-ark-text-muted hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Link className="h-4 w-4 text-ark-accent" aria-hidden="true" />
              <label className="text-sm font-medium text-ark-text-muted">关联任务</label>
            </div>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className={inputClass}
            >
              <option value="">未绑定任务</option>
              {tasks
                .filter((t) => t.status !== 'done' && !t.is_deleted)
                .map((task) => (
                  <option key={task.id} value={task.id}>{task.title}</option>
                ))}
            </select>
            {selectedTask ? (
              <div className="rounded-lg border border-ark-border bg-ark-surface px-3 py-2 text-sm text-ark-text">
                <div className="text-xs text-ark-text-muted">已绑定</div>
                <div className="mt-0.5 truncate font-medium">{selectedTask.title}</div>
              </div>
            ) : config.task_id && !taskId ? (
              <div className="text-xs text-ark-text-faint">解绑后将不再关联任务</div>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-ark-border pt-4">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            loading={saving}
            loadingText="保存中"
            onClick={() => void handleSave()}
            disabled={!name.trim() || !bankId}
          >
            保存
          </Button>
        </div>
      </div>
    </AppModalFrame>
  );
}
