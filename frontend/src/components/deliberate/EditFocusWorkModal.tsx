import { useState, useEffect } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

import AppModalFrame from '../AppModalFrame';
import Button from '../Button';
import type { DeliberateWorkflowConfig, DeliberateKind, DeliberateFocusWorkType, DeliberateBankOption, DeliberateWorkflowChild } from '../../lib/deliberate/api';
import type { ChoiceFilters } from '../../lib/choice/types';

type EditFocusWorkModalProps = {
  config: DeliberateWorkflowConfig;
  allConfigs: DeliberateWorkflowConfig[];
  banks: DeliberateBankOption[];
  filters: ChoiceFilters | null;
  saving: boolean;
  onSave: (patch: {
    name?: string;
    bank_id?: string;
    target_count?: number;
    pass_criteria?: Record<string, unknown>;
    children?: DeliberateWorkflowChild[];
  }) => Promise<void>;
  onClose: () => void;
};

const inputClass =
  'w-full rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]';

export default function EditFocusWorkModal({
  config,
  allConfigs,
  banks,
  filters,
  saving,
  onSave,
  onClose,
}: EditFocusWorkModalProps) {
  const [name, setName] = useState(config.name);
  const [bankId, setBankId] = useState(config.bank_id ?? '');
  const [targetCount, setTargetCount] = useState(config.target_count);
  const [passCriteriaEnabled, setPassCriteriaEnabled] = useState(
    Boolean(config.pass_criteria?.mode)
  );
  const [passCriteriaThreshold, setPassCriteriaThreshold] = useState(
    Math.round(((config.pass_criteria?.threshold as number) ?? 0.8) * 100)
  );
  const [children, setChildren] = useState<DeliberateWorkflowChild[]>(
    config.children || []
  );

  const kindLabel = config.kind === 'flashcard' ? '闪卡' : config.kind === 'input' ? '输入题' : '选择题';
  const bankCountLabel = config.kind === 'flashcard' ? '词' : '题';

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
    });
  }

  return (
    <AppModalFrame open={true} onClose={onClose} ariaLabel="编辑专注工作">
      <div className="w-[480px] max-w-[92vw] space-y-4 rounded-xl border border-ark-border bg-ark-surface p-5 shadow-xl">
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

        <div className="space-y-4">
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
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">
              {config.kind === 'flashcard' ? '目标词数' : '目标题数'}
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

          {config.kind !== 'flashcard' && (
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
