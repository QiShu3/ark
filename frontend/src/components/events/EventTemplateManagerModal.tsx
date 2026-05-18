import { useState } from 'react';

import {
  copyEventPlanTemplate,
  createEventPlanTemplate,
  deleteEventPlanTemplate,
  type EventPlanTemplateInput,
  type EventPlanTemplateItemInput,
} from '../../lib/events/api';
import type { EventPlanTemplate } from '../../lib/events/types';

type EventTemplateManagerModalProps = {
  templates: EventPlanTemplate[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
};

const DEFAULT_ITEM: EventPlanTemplateItemInput = {
  kind: 'task',
  title: '',
  content: '',
  offset_days: 0,
  sort_order: 0,
};

export default function EventTemplateManagerModal({ templates, onClose, onChanged }: EventTemplateManagerModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'from_start' | 'before_due'>('before_due');
  const [items, setItems] = useState<EventPlanTemplateItemInput[]>([{ ...DEFAULT_ITEM }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, patch: Partial<EventPlanTemplateItemInput>): void {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  async function handleCreate(): Promise<void> {
    const cleanedItems = items
      .map((item, index) => ({
        ...item,
        title: item.title.trim(),
        content: item.content?.trim() || null,
        offset_days: Math.max(0, Math.floor(item.offset_days || 0)),
        sort_order: index,
      }))
      .filter((item) => item.title);
    const payload: EventPlanTemplateInput = {
      name: name.trim(),
      description: description.trim() || null,
      schedule_mode: scheduleMode,
      items: cleanedItems,
    };
    if (!payload.name) {
      setError('请输入模板名称');
      return;
    }
    if (payload.items.length === 0) {
      setError('至少添加一个模板项');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createEventPlanTemplate(payload);
      setName('');
      setDescription('');
      setItems([{ ...DEFAULT_ITEM }]);
      await Promise.resolve(onChanged());
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建模板失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy(templateId: string): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await copyEventPlanTemplate(templateId);
      await Promise.resolve(onChanged());
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制模板失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(templateId: string): Promise<void> {
    if (!window.confirm('确定删除这个模板吗？')) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteEventPlanTemplate(templateId);
      await Promise.resolve(onChanged());
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除模板失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="模板管理"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100vh-5rem)] w-[900px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#10131c] text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
          <h3 className="font-semibold">模板管理</h3>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-white/60 hover:bg-white/10">
            关闭
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h4 className="font-semibold">新建模板</h4>
            {error ? <div className="mt-3 rounded-lg bg-red-500/10 p-2 text-sm text-red-200">{error}</div> : null}
            <div className="mt-3 grid gap-3">
              <label className="grid gap-2 text-sm text-white/70">
                模板名称
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                />
              </label>
              <label className="grid gap-2 text-sm text-white/70">
                模板说明
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-16 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                />
              </label>
              <label className="grid gap-2 text-sm text-white/70">
                时间模式
                <select
                  value={scheduleMode}
                  onChange={(event) => setScheduleMode(event.target.value as 'from_start' | 'before_due')}
                  className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-white"
                >
                  <option value="before_due">从截止时间倒推</option>
                  <option value="from_start">从开始日期顺推</option>
                </select>
              </label>

              <div className="grid gap-2">
                {items.map((item, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <div className="grid grid-cols-[120px_1fr_96px] gap-2">
                      <select
                        value={item.kind}
                        onChange={(event) => updateItem(index, { kind: event.target.value as 'task' | 'appointment' })}
                        className="rounded-lg border border-white/10 bg-[#121826] px-2 py-2 text-sm text-white"
                      >
                        <option value="task">任务</option>
                        <option value="appointment">日程</option>
                      </select>
                      <input
                        value={item.title}
                        onChange={(event) => updateItem(index, { title: event.target.value })}
                        placeholder="标题"
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                      />
                      <input
                        type="number"
                        min={0}
                        value={item.offset_days}
                        onChange={(event) => updateItem(index, { offset_days: Number(event.target.value) })}
                        aria-label="相对天数"
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <input
                      value={item.content ?? ''}
                      onChange={(event) => updateItem(index, { content: event.target.value })}
                      placeholder="备注"
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setItems((current) => [...current, { ...DEFAULT_ITEM, sort_order: current.length }])}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
                >
                  添加模板项
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                创建模板
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h4 className="font-semibold">已有模板</h4>
            <div className="mt-3 grid gap-2">
              {templates.length ? templates.map((template) => (
                <div key={template.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <div className="font-medium">{template.name}</div>
                  <div className="mt-1 text-xs text-white/50">
                    {template.schedule_mode === 'before_due' ? '截止前倒推' : '开始后顺推'} · {template.items.length} 项
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(template.id)}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10"
                    >
                      复制
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(template.id)}
                      className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-sm text-red-200 hover:bg-red-500/20"
                    >
                      删除
                    </button>
                  </div>
                </div>
              )) : <div className="text-sm text-white/45">暂无模板</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
