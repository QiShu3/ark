import { useState, useEffect } from 'react';
import { Info, X } from 'lucide-react';

import AppModalFrame from '../AppModalFrame';
import Button from '../Button';
import { listDeliberateBanks, type DeliberateKind, type DeliberateFocusWorkType, type DeliberateBankOption, type PrimaryFilter, type SortOrder, type BackflowRule } from '../../lib/deliberate/api';
import { fetchChoiceFilters } from '../../lib/choice/api';
import type { ChoiceFilters } from '../../lib/choice/types';

type CreateFocusWorkModalProps = {
  saving: boolean;
  onSave: (data: {
    name: string;
    kind: DeliberateKind;
    focus_work_type: DeliberateFocusWorkType;
    bank_id: string;
    target_count: number;
    scope: Record<string, unknown>;
    completion: Record<string, unknown>;
    pass_criteria: Record<string, unknown>;
    primary_filter: PrimaryFilter;
    sort_order: SortOrder;
    use_fsrs: boolean;
    backflow_rule: BackflowRule;
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

export default function CreateFocusWorkModal({
  saving,
  onSave,
  onClose,
}: CreateFocusWorkModalProps) {
  const [kind, setKind] = useState<DeliberateKind>('choice');
  const [banks, setBanks] = useState<DeliberateBankOption[]>([]);
  const [filters, setFilters] = useState<ChoiceFilters | null>(null);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [name, setName] = useState('');
  const [bankId, setBankId] = useState('');
  const [targetCount, setTargetCount] = useState(10);
  const [year, setYear] = useState<number | ''>('');
  const [subject, setSubject] = useState('');
  const [tag, setTag] = useState('');
  const [primaryFilter, setPrimaryFilter] = useState<PrimaryFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('sequential');
  const [useFsrs, setUseFsrs] = useState(false);
  const [backflowRule, setBackflowRule] = useState<BackflowRule>('none');
  const [passCriteriaEnabled, setPassCriteriaEnabled] = useState(false);
  const [passCriteriaThreshold, setPassCriteriaThreshold] = useState(80);

  const focusWorkType: DeliberateFocusWorkType = kind;
  const bankCountLabel = kind === 'flash_card' ? '词' : '题';
  const kindLabel = kind === 'flash_card' ? '闪卡' : kind === 'input' ? '输入题' : '选择题';
  const showScopeFilters = kind === 'choice';
  const effectivePrimaryFilter = useFsrs ? primaryFilter : (primaryFilter === 'due_review' ? 'all' : primaryFilter);

  useEffect(() => {
    let ignore = false;
    setLoadingBanks(true);
    setBankId('');
    setYear('');
    setSubject('');
    setTag('');

    listDeliberateBanks(kind)
      .then((data) => {
        if (!ignore) setBanks(data);
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
  }, [kind]);

  useEffect(() => {
    let ignore = false;

    if (kind !== 'choice' || !bankId) {
      setFilters(null);
      return () => {
        ignore = true;
      };
    }

    fetchChoiceFilters(bankId)
      .then((data) => {
        if (!ignore) setFilters(data);
      })
      .catch(() => {
        if (!ignore) setFilters(null);
      });

    return () => {
      ignore = true;
    };
  }, [kind, bankId]);

  const scope = kind === 'flash_card' ? {} : {
    bank_id: bankId,
    years: year !== '' ? [year] : undefined,
    subjects: subject ? [subject] : undefined,
    tags: tag ? [tag] : undefined,
  };

  const completion = kind === 'flash_card'
    ? { mode: 'word_count', word_count: targetCount }
    : { mode: 'question_count', question_count: targetCount };

  const passCriteria = passCriteriaEnabled
    ? { mode: 'accuracy', threshold: passCriteriaThreshold / 100 }
    : {};

  async function handleSave() {
    await onSave({
      name: name.trim(),
      kind,
      focus_work_type: focusWorkType,
      bank_id: bankId,
      target_count: targetCount,
      scope,
      completion,
      pass_criteria: passCriteria,
      primary_filter: effectivePrimaryFilter,
      sort_order: sortOrder,
      use_fsrs: useFsrs,
      backflow_rule: backflowRule,
    });
  }

  return (
    <AppModalFrame open={true} onClose={onClose} ariaLabel="新建专注工作">
      <div className="w-[600px] max-w-[92vw] space-y-4 rounded-xl border border-ark-border bg-ark-surface p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-ark-border pb-3">
          <h3 className="text-lg font-semibold text-ark-text">新建专注工作</h3>
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
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">类型</label>
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-ark-border bg-ark-surface-subtle p-1">
              {(['choice', 'flash_card', 'input'] as DeliberateKind[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setKind(item)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    kind === item ? 'bg-ark-surface-strong text-ark-text' : 'text-ark-text-muted hover:text-ark-text'
                  }`}
                >
                  {item === 'choice' ? '选择题' : item === 'flash_card' ? '闪卡' : '输入题'}
                </button>
              ))}
            </div>
          </div>

          {showScopeFilters && (
            <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-3 text-sm text-ark-text-muted">
              选择题专注工作会按题库配置自动生成题目。
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">名称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder={`例如：408 每日 20 题`}
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">
                {kind === 'flash_card' ? '目标词数' : '目标题数'}
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

          {showScopeFilters && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">年份</label>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
                  className={inputClass}
                >
                  <option value="">全部年份</option>
                  {filters?.years.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">科目</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={inputClass}
                >
                  <option value="">全部科目</option>
                  {filters?.subjects.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">标签</label>
                <select
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className={inputClass}
                >
                  <option value="">全部标签</option>
                  {filters?.tags.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-start gap-4 rounded-lg border border-ark-border bg-ark-surface-subtle p-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="use-fsrs"
                checked={useFsrs}
                onChange={(e) => {
                  setUseFsrs(e.target.checked);
                  if (!e.target.checked && primaryFilter === 'due_review') {
                    setPrimaryFilter('all');
                  }
                }}
                className="rounded border-ark-border"
              />
              <label htmlFor="use-fsrs" className="text-sm font-medium text-ark-text-muted cursor-pointer">
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

          {kind !== 'flash_card' && (
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
        </div>

        <div className="flex justify-end gap-3 border-t border-ark-border pt-4">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            loading={saving}
            loadingText="创建中"
            onClick={() => void handleSave()}
            disabled={!name.trim() || !bankId}
          >
            创建
          </Button>
        </div>
      </div>
    </AppModalFrame>
  );
}
