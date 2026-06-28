import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

import AppModalFrame from '../AppModalFrame';
import Button from '../Button';
import type { DeliberateWorkflowConfig, DeliberateKind, DeliberateFocusWorkType, DeliberateBankOption } from '../../lib/deliberate/api';
import type { ChoiceFilters } from '../../lib/choice/types';

type EditFocusWorkModalProps = {
  config: DeliberateWorkflowConfig;
  banks: DeliberateBankOption[];
  filters: ChoiceFilters | null;
  saving: boolean;
  onSave: (patch: {
    name?: string;
    bank_id?: string;
    target_count?: number;
    pass_criteria?: Record<string, unknown>;
  }) => Promise<void>;
  onClose: () => void;
};

const inputClass =
  'w-full rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]';

export default function EditFocusWorkModal({
  config,
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

  const kindLabel = config.kind === 'flashcard' ? '闪卡' : config.kind === 'input' ? '输入题' : '选择题';
  const bankCountLabel = config.kind === 'flashcard' ? '词' : '题';

  async function handleSave() {
    const passCriteria = passCriteriaEnabled
      ? { mode: 'accuracy', threshold: passCriteriaThreshold / 100 }
      : {};

    await onSave({
      name: name.trim(),
      bank_id: bankId || null,
      target_count: targetCount,
      pass_criteria: passCriteria,
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
