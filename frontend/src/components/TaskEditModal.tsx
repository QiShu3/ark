import React, { useEffect, useState } from 'react';
import { apiJson } from '../lib/api';
import type { Task } from './taskTypes';

type TaskEditFormState = {
  title: string;
  content: string;
  priority: 0 | 1 | 2 | 3;
  targetMinutes: number;
  currentCycleCount: number;
  targetCycleCount: number;
  cyclePeriod: 'daily' | 'weekly' | 'monthly' | 'custom';
  customCycleDays: number;
  event: string;
  eventIds: string[];
  taskType: 'focus' | 'checkin';
  tagsText: string;
  startDate: string;
  dueDate: string;
};

const EMPTY_FORM: TaskEditFormState = {
  title: '',
  content: '',
  priority: 0,
  targetMinutes: 0,
  currentCycleCount: 0,
  targetCycleCount: 1,
  cyclePeriod: 'daily',
  customCycleDays: 1,
  event: '',
  eventIds: [],
  taskType: 'focus',
  tagsText: '',
  startDate: '',
  dueDate: '',
};

type TaskEditModalProps = {
  open: boolean;
  task: Task | null;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

function toLocalDateTimeValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function buildEditForm(task: Task): TaskEditFormState {
  return {
    title: task.title,
    content: task.content || '',
    priority: task.priority as 0 | 1 | 2 | 3,
    targetMinutes: Math.round(task.target_duration / 60),
    currentCycleCount: task.current_cycle_count,
    targetCycleCount: task.target_cycle_count,
    cyclePeriod: task.cycle_period,
    customCycleDays: task.cycle_every_days ?? 1,
    event: task.event || '',
    eventIds: task.event_ids || [],
    taskType: task.task_type || 'focus',
    tagsText: task.tags.join(', '),
    startDate: toLocalDateTimeValue(task.start_date),
    dueDate: toLocalDateTimeValue(task.due_date),
  };
}

const TaskEditModal: React.FC<TaskEditModalProps> = ({ open, task, onClose, onChanged }) => {
  const [form, setForm] = useState<TaskEditFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !task) {
      setForm(EMPTY_FORM);
      setSubmitting(false);
      setError(null);
      return;
    }
    setForm(buildEditForm(task));
    setSubmitting(false);
    setError(null);
  }, [open, task]);

  if (!open || !task) return null;

  async function handleChanged(): Promise<void> {
    window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    await Promise.resolve(onChanged?.());
    onClose();
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const startDate = form.startDate ? new Date(form.startDate).toISOString() : null;
      const dueDate = form.dueDate ? new Date(form.dueDate).toISOString() : null;
      const cycleEveryDays = form.cyclePeriod === 'custom' ? Math.max(1, Math.floor(form.customCycleDays || 1)) : null;
      const tags = form.tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      await apiJson(`/todo/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          content: form.content.trim() || null,
          priority: form.priority,
          target_duration: Math.round(form.targetMinutes * 60),
          current_cycle_count: Math.max(0, Math.floor(form.currentCycleCount || 0)),
          target_cycle_count: Math.max(0, Math.floor(form.targetCycleCount || 0)),
          cycle_period: form.cyclePeriod,
          cycle_every_days: cycleEveryDays,
          event: form.event.trim(),
          event_ids: form.eventIds,
          task_type: form.taskType,
          tags,
          start_date: startDate,
          due_date: dueDate,
        }),
      });

      await handleChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '编辑任务失败');
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (submitting) return;
    if (!window.confirm(`确定要删除任务「${task.title}」吗？`)) return;

    setSubmitting(true);
    setError(null);
    try {
      await apiJson(`/todo/tasks/${task.id}`, { method: 'DELETE' });
      await handleChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除任务失败');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 pt-16 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-label="编辑任务"
    >
      <div
        className="relative flex max-h-[calc(100vh-6rem)] w-[520px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-white/5 px-5">
          <h3 className="text-lg font-bold text-white">编辑任务</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="关闭编辑任务弹窗"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/70">标题</label>
            <input
              value={form.title}
              onChange={(e) => setForm((state) => ({ ...state, title: e.target.value }))}
              placeholder="例如：完成周报"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">任务类型</label>
              <select
                value={form.taskType}
                onChange={(e) => setForm((state) => ({ ...state, taskType: e.target.value as 'focus' | 'checkin' }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="focus">专注任务</option>
                <option value="checkin">快速打卡</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">优先级</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((state) => ({ ...state, priority: Number(e.target.value) as 0 | 1 | 2 | 3 }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value={0}>0 低</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3 高</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/70">备注</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((state) => ({ ...state, content: e.target.value }))}
              placeholder="可选：补充描述/拆解步骤"
              className="min-h-[88px] w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">目标时长（分钟）</label>
              <input
                type="number"
                min={0}
                value={form.targetMinutes}
                onChange={(e) => setForm((state) => ({ ...state, targetMinutes: Number(e.target.value) }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">循环周期</label>
              <select
                value={form.cyclePeriod}
                onChange={(e) => setForm((state) => ({ ...state, cyclePeriod: e.target.value as 'daily' | 'weekly' | 'monthly' | 'custom' }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="daily">每日</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
                <option value="custom">自定义</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">当前循环次数</label>
              <input
                type="number"
                min={0}
                value={form.currentCycleCount}
                onChange={(e) => setForm((state) => ({ ...state, currentCycleCount: Number(e.target.value) }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">目的循环次数</label>
              <input
                type="number"
                min={0}
                value={form.targetCycleCount}
                onChange={(e) => setForm((state) => ({ ...state, targetCycleCount: Number(e.target.value) }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>

          {form.cyclePeriod === 'custom' ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">自定义间隔（天）</label>
              <input
                type="number"
                min={1}
                value={form.customCycleDays}
                onChange={(e) => setForm((state) => ({ ...state, customCycleDays: Number(e.target.value) }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">开始日期</label>
              <input
                type="datetime-local"
                value={form.startDate}
                onChange={(e) => setForm((state) => ({ ...state, startDate: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">截止日期</label>
              <input
                type="datetime-local"
                value={form.dueDate}
                onChange={(e) => setForm((state) => ({ ...state, dueDate: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">事件</label>
              <input
                value={form.event}
                onChange={(e) => setForm((state) => ({ ...state, event: e.target.value }))}
                placeholder="例如：晨间阅读"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/70">标签</label>
              <input
                value={form.tagsText}
                onChange={(e) => setForm((state) => ({ ...state, tagsText: e.target.value }))}
                placeholder="逗号分隔，例如：学习,arxiv"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>

          {error ? <div className="text-sm text-red-400">{error}</div> : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 bg-[#1a1a1a] p-5 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg border border-red-500/10 bg-red-500/10 px-4 py-2 text-red-500 transition-colors hover:bg-red-500/20 hover:text-red-400"
            disabled={submitting}
          >
            删除
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskEditModal;
