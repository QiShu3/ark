import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import AppModalFrame from '../AppModalFrame';
import Button from '../Button';
import {
  type DeliberateFocusWorkType,
  type DeliberateWorkflowConfig,
} from '../../lib/deliberate/api';
import type { WorkflowPreset } from '../workflowPresetForm';
import { apiJson } from '../../lib/api';

type Props = {
  open: boolean;
  configs: DeliberateWorkflowConfig[];
  editingPreset: WorkflowPreset | null;
  onClose: () => void;
  onSaved: () => void;
};

type QueueItem = {
  uid: string;
  config: DeliberateWorkflowConfig;
};

function focusTypeLabel(type: DeliberateFocusWorkType) {
  if (type === 'flash_card') return '闪卡';
  if (type === 'input') return '输入练习';
  return '选择练习';
}

export default function DeliberateWorkflowEditorModal({
  open,
  configs,
  editingPreset,
  onClose,
  onSaved,
}: Props) {
  const [presetName, setPresetName] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初始化：编辑模式下加载已有编排
  useEffect(() => {
    if (!open) return;
    if (editingPreset) {
      setPresetName(editingPreset.name);
      const groupPhase = editingPreset.phases.find(
        (p) => p.phase_type === 'deliberate_group',
      );
      if (groupPhase?.config_ids) {
        const items: QueueItem[] = [];
        groupPhase.config_ids.forEach((id) => {
          const cfg = configs.find((c) => c.id === id);
          if (cfg) {
            items.push({ uid: `${id}-${Date.now()}-${Math.random()}`, config: cfg });
          }
        });
        setQueue(items);
      } else {
        setQueue([]);
      }
    } else {
      setPresetName('');
      setQueue([]);
    }
    setSearchKeyword('');
    setError(null);
  }, [open, editingPreset, configs]);

  // 过滤左侧可选列表
  const filteredConfigs = useMemo(() => {
    if (!searchKeyword.trim()) return configs;
    const kw = searchKeyword.toLowerCase();
    return configs.filter(
      (c) =>
        c.name.toLowerCase().includes(kw) ||
        c.bank_summary?.name?.toLowerCase().includes(kw),
    );
  }, [configs, searchKeyword]);

  // 添加到队列
  const handleAddToQueue = useCallback((config: DeliberateWorkflowConfig) => {
    setQueue((prev) => [
      ...prev,
      { uid: `${config.id}-${Date.now()}-${Math.random()}`, config },
    ]);
  }, []);

  // 从队列移除
  const handleRemoveFromQueue = useCallback((uid: string) => {
    setQueue((prev) => prev.filter((item) => item.uid !== uid));
  }, []);

  // 上移
  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setQueue((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  // 下移
  const handleMoveDown = useCallback((index: number) => {
    setQueue((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index + 1], next[index]] = [next[index], next[index + 1]];
      return next;
    });
  }, []);

  // 清空队列
  const handleClearQueue = useCallback(() => {
    if (!window.confirm('确认清空队列？')) return;
    setQueue([]);
  }, []);

  // 保存编排
  const handleSave = useCallback(async () => {
    if (!presetName.trim()) {
      setError('请输入编排名称');
      return;
    }
    if (queue.length === 0) {
      setError('请至少添加一个专注工作');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const configIds = queue.map((item) => item.config.id);
      const configNames = queue.map((item) => item.config.name);

      if (editingPreset) {
        // 更新模式
        await apiJson(`/todo/focus/workflows/${editingPreset.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: presetName.trim(),
            phases: [
              {
                phase_type: 'deliberate_group',
                duration: 3600,
                timer_mode: 'countup',
                config_ids: configIds,
                config_names: configNames,
              },
            ],
            focus_duration: editingPreset.focus_duration,
            break_duration: editingPreset.break_duration,
            default_focus_timer_mode: editingPreset.default_focus_timer_mode,
            is_default: editingPreset.is_default,
          }),
        });
      } else {
        // 新建模式
        await apiJson('/todo/focus/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: presetName.trim(),
            phases: [
              {
                phase_type: 'deliberate_group',
                duration: 3600,
                timer_mode: 'countup',
                config_ids: configIds,
                config_names: configNames,
              },
            ],
            focus_duration: 3600,
            break_duration: 300,
            default_focus_timer_mode: 'countup',
            is_default: false,
          }),
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [presetName, queue, editingPreset, onSaved, onClose]);

  return (
    <AppModalFrame open={open} onClose={onClose} ariaLabel="编排工作流">
      <div className="w-[900px] max-w-[96vw] max-h-[85vh] flex flex-col rounded-xl border border-ark-border bg-ark-surface shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-ark-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ark-accent/10">
              <Settings2 className="h-5 w-5 text-ark-accent" aria-hidden="true" />
            </div>
            <div>
              <div className="text-base font-semibold text-ark-text">
                {editingPreset ? '编辑编排' : '新建编排'}
              </div>
              <div className="mt-0.5 text-xs text-ark-text-muted">
                选择专注工作并调整执行顺序
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ark-text-muted transition hover:bg-ark-surface-strong hover:text-ark-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 主体：左右两栏 */}
        <div className="flex min-h-0 flex-1">
          {/* 左栏：可选工作 */}
          <div className="flex w-1/2 flex-col border-r border-ark-border">
            <div className="border-b border-ark-border px-4 py-3">
              <div className="mb-2 text-sm font-medium text-ark-text">
                可选专注工作
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ark-text-muted" />
                <input
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="搜索工作名称或题库…"
                  className="w-full rounded-lg border border-ark-border bg-ark-input py-2 pl-9 pr-3 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]"
                />
              </div>
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
              {filteredConfigs.length === 0 ? (
                <div className="py-8 text-center text-sm text-ark-text-muted">
                  {searchKeyword ? '没有匹配的结果' : '暂无专注工作配置'}
                </div>
              ) : (
                filteredConfigs.map((config) => (
                  <div
                    key={config.id}
                    className="flex items-center justify-between rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2.5 transition hover:border-ark-accent/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ark-text">
                        {config.name}
                      </div>
                      <div className="truncate text-xs text-ark-text-muted">
                        {focusTypeLabel(config.focus_work_type)} ·{' '}
                        {config.bank_summary?.name ?? '未绑定题库'} · 目标{' '}
                        {config.target_count}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => handleAddToQueue(config)}
                    >
                      添加
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 右栏：已选队列 */}
          <div className="flex w-1/2 flex-col">
            <div className="flex items-center justify-between border-b border-ark-border px-4 py-3">
              <div className="text-sm font-medium text-ark-text">
                执行顺序（{queue.length}）
              </div>
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearQueue}
                  className="text-xs text-ark-text-muted transition hover:text-red-400"
                >
                  清空
                </button>
              )}
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
              {queue.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                  <div className="mb-2 text-sm text-ark-text-muted">
                    还没有添加任何工作
                  </div>
                  <div className="text-xs text-ark-text-faint">
                    从左侧添加专注工作开始编排
                  </div>
                </div>
              ) : (
                queue.map((item, index) => (
                  <div
                    key={item.uid}
                    className="flex items-center gap-2 rounded-lg border border-ark-accent/50 bg-ark-surface px-3 py-2.5"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ark-accent text-xs font-semibold text-white">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ark-text">
                        {item.config.name}
                      </div>
                      <div className="truncate text-xs text-ark-text-muted">
                        {item.config.bank_summary?.name ?? '未绑定题库'} · 目标{' '}
                        {item.config.target_count}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className="flex h-7 w-7 items-center justify-center rounded text-ark-text-muted transition hover:bg-ark-surface-strong hover:text-ark-text disabled:opacity-30 disabled:hover:bg-transparent"
                        title="上移"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === queue.length - 1}
                        className="flex h-7 w-7 items-center justify-center rounded text-ark-text-muted transition hover:bg-ark-surface-strong hover:text-ark-text disabled:opacity-30 disabled:hover:bg-transparent"
                        title="下移"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveFromQueue(item.uid)}
                        className="flex h-7 w-7 items-center justify-center rounded text-ark-text-muted transition hover:bg-red-500/10 hover:text-red-400"
                        title="移除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 底部：名称输入 + 保存按钮 */}
        <div className="border-t border-ark-border px-5 py-4">
          {error && (
            <div className="mb-3 rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ark-text-muted">
                编排名称
              </label>
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="给这个编排起个名字…"
                className="w-full rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Button variant="secondary" onClick={onClose}>
                取消
              </Button>
              <Button
                variant="primary"
                loading={saving}
                loadingText="保存中"
                onClick={() => void handleSave()}
                disabled={!presetName.trim() || queue.length === 0}
              >
                {editingPreset ? '保存修改' : '保存编排'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppModalFrame>
  );
}
