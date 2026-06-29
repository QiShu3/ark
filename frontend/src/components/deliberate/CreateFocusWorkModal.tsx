import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

import AppModalFrame from '../AppModalFrame';
import Button from '../Button';
import { listDeliberateBanks, type DeliberateKind, type DeliberateFocusWorkType, type DeliberateBankOption } from '../../lib/deliberate/api';
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
  }) => Promise<void>;
  onClose: () => void;
};

const inputClass =
  'w-full rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]';

export default function CreateFocusWorkModal({
  saving,
  onSave,
  onClose,
}: CreateFocusWorkModalProps) {
  const [kind, setKind] = useState<DeliberateKind>('choice');
  const [banks, setBanks] = useState<DeliberateBankOption[]>([]);
  const [filters, setFilters] = useState<ChoiceFilters | null>(null);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [choiceMode, setChoiceMode] = useState<'practice' | 'review'>('practice');
  const [name, setName] = useState('');
  const [bankId, setBankId] = useState('');
  const [targetCount, setTargetCount] = useState(10);
  const [year, setYear] = useState<number | ''>('');
  const [subject, setSubject] = useState('');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState<'all' | 'unstarted' | 'mistake' | 'due_review'>('all');
  const [mode, setMode] = useState<'sequential' | 'random' | 'review'>('sequential');
  const [passCriteriaEnabled, setPassCriteriaEnabled] = useState(false);
  const [passCriteriaThreshold, setPassCriteriaThreshold] = useState(80);

  const focusWorkType: DeliberateFocusWorkType = kind === 'flashcard' ? 'vocab_today' : kind === 'input' ? 'input' : choiceMode;
  const bankCountLabel = kind === 'flashcard' ? '词' : '题';
  const kindLabel = kind === 'flashcard' ? '闪卡' : kind === 'input' ? '输入题' : '选择题';

  useEffect(() => {
    let ignore = false;
    setLoadingBanks(true);
    setBankId('');
    setYear('');
    setSubject('');
    setTag('');
    setStatus('all');

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

  const scope = kind === 'flashcard' ? {} : {
    bank_id: bankId,
    years: year !== '' ? [year] : undefined,
    subjects: subject ? [subject] : undefined,
    tags: tag ? [tag] : undefined,
    status,
    mode,
  };

  const completion = kind === 'flashcard'
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
    });
  }

  return (
    <AppModalFrame open={true} onClose={onClose} ariaLabel="新建专注工作">
      <div className="w-[560px] max-w-[92vw] space-y-4 rounded-xl border border-ark-border bg-ark-surface p-5 shadow-xl">
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

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">类型</label>
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
          </div>

          {kind === 'choice' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">工作模式</label>
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
          )}

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

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">
              {kind === 'flashcard' ? '目标词数' : '目标题数'}
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

          {kind === 'choice' && (
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">筛选</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className={inputClass}
                >
                  <option value="all">全部</option>
                  <option value="unstarted">未开始</option>
                  <option value="mistake">错题</option>
                  <option value="due_review">待复习</option>
                </select>
              </div>
            </div>
          )}

          {kind !== 'flashcard' && (
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
