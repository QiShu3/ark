import { useState } from 'react';
import { Pencil } from 'lucide-react';

import {
  copyEventPlanTemplate,
  createEventPlanTemplate,
  deleteEventPlanTemplate,
  updateEventPlanTemplate,
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

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export default function EventTemplateManagerModal({ templates, onClose, onChanged }: EventTemplateManagerModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultEventName, setDefaultEventName] = useState('');
  const [defaultStartDate, setDefaultStartDate] = useState('');
  const [defaultDueAt, setDefaultDueAt] = useState('');
  const [defaultIsPrimary, setDefaultIsPrimary] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'from_start' | 'before_due'>('before_due');
  const [items, setItems] = useState<EventPlanTemplateItemInput[]>([{ ...DEFAULT_ITEM }]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDefaultEventName, setEditDefaultEventName] = useState('');
  const [editDefaultStartDate, setEditDefaultStartDate] = useState('');
  const [editDefaultDueAt, setEditDefaultDueAt] = useState('');
  const [editDefaultIsPrimary, setEditDefaultIsPrimary] = useState(false);
  const [editScheduleMode, setEditScheduleMode] = useState<'from_start' | 'before_due'>('before_due');
  const [editItems, setEditItems] = useState<EventPlanTemplateItemInput[]>([{ ...DEFAULT_ITEM }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, patch: Partial<EventPlanTemplateItemInput>): void {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateEditItem(index: number, patch: Partial<EventPlanTemplateItemInput>): void {
    setEditItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function cleanItems(inputItems: EventPlanTemplateItemInput[]): EventPlanTemplateItemInput[] {
    return inputItems
      .map((item, index) => ({
        ...item,
        title: item.title.trim(),
        content: item.content?.trim() || null,
        offset_days: Math.max(0, Math.floor(item.offset_days || 0)),
        sort_order: index,
      }))
      .filter((item) => item.title);
  }

  async function handleCreate(): Promise<void> {
    const cleanedItems = cleanItems(items);
    const payload: EventPlanTemplateInput = {
      name: name.trim(),
      description: description.trim() || null,
      schedule_mode: scheduleMode,
      default_event_name: defaultEventName.trim() || null,
      default_start_date: defaultStartDate || null,
      default_due_at: fromDateTimeLocal(defaultDueAt),
      default_is_primary: defaultIsPrimary,
      items: cleanedItems,
    };
    if (!payload.name) {
      setError('请输入模板名称');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createEventPlanTemplate(payload);
      setName('');
      setDescription('');
      setDefaultEventName('');
      setDefaultStartDate('');
      setDefaultDueAt('');
      setDefaultIsPrimary(false);
      setItems([{ ...DEFAULT_ITEM }]);
      await Promise.resolve(onChanged());
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建模板失败');
    } finally {
      setSubmitting(false);
    }
  }

  function beginEdit(template: EventPlanTemplate): void {
    setEditingTemplateId(template.id);
    setEditName(template.name);
    setEditDescription(template.description ?? '');
    setEditDefaultEventName(template.default_event_name ?? '');
    setEditDefaultStartDate(template.default_start_date ?? '');
    setEditDefaultDueAt(toDateTimeLocal(template.default_due_at));
    setEditDefaultIsPrimary(template.default_is_primary ?? false);
    setEditScheduleMode(template.schedule_mode);
    setEditItems(template.items.length ? template.items.map((item, index) => ({
      kind: item.kind,
      title: item.title,
      content: item.content ?? '',
      offset_days: item.offset_days,
      sort_order: index,
    })) : [{ ...DEFAULT_ITEM }]);
    setError(null);
  }

  async function handleUpdate(): Promise<void> {
    if (!editingTemplateId) return;
    const cleanedItems = cleanItems(editItems);
    const payload: EventPlanTemplateInput = {
      name: editName.trim(),
      description: editDescription.trim() || null,
      schedule_mode: editScheduleMode,
      default_event_name: editDefaultEventName.trim() || null,
      default_start_date: editDefaultStartDate || null,
      default_due_at: fromDateTimeLocal(editDefaultDueAt),
      default_is_primary: editDefaultIsPrimary,
      items: cleanedItems,
    };
    if (!payload.name) {
      setError('请输入模板名称');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateEventPlanTemplate(editingTemplateId, payload);
      setEditingTemplateId(null);
      await Promise.resolve(onChanged());
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存模板失败');
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
      aria-label="模板工作台"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100vh-5rem)] w-[900px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#10131c] text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
          <h3 className="font-semibold">模板工作台</h3>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-white/60 hover:bg-white/10">
            关闭
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h4 className="font-semibold">新建事件模板</h4>
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
              <div className="grid gap-3 border-t border-white/10 pt-3">
                <div className="text-sm font-medium text-white/80">事件信息</div>
                <label className="grid gap-2 text-sm text-white/70">
                  默认事件名称
                  <input
                    value={defaultEventName}
                    onChange={(event) => setDefaultEventName(event.target.value)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-white/70">
                    默认开始日期
                    <input
                      type="date"
                      value={defaultStartDate}
                      onChange={(event) => setDefaultStartDate(event.target.value)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-white/70">
                    默认到期时间
                    <input
                      type="datetime-local"
                      value={defaultDueAt}
                      onChange={(event) => setDefaultDueAt(event.target.value)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={defaultIsPrimary}
                    onChange={(event) => setDefaultIsPrimary(event.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-white/5"
                  />
                  默认设为主事件
                </label>
              </div>
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
                <div className="text-sm font-medium text-white/80">工作台内容</div>
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
                  添加工作台内容
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                创建事件模板
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h4 className="font-semibold">已有事件模板</h4>
            {editingTemplateId ? (
              <div className="mt-3 grid gap-3 rounded-lg border border-blue-300/20 bg-blue-400/10 p-3">
                <div className="text-sm font-medium text-blue-100">编辑事件模板</div>
                <label className="grid gap-2 text-sm text-white/70">
                  编辑模板名称
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-white"
                  />
                </label>
                <label className="grid gap-2 text-sm text-white/70">
                  编辑模板说明
                  <textarea
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    className="min-h-14 rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-white"
                  />
                </label>
                <div className="grid gap-3 border-t border-white/10 pt-3">
                  <div className="text-sm font-medium text-white/80">事件信息</div>
                  <label className="grid gap-2 text-sm text-white/70">
                    编辑默认事件名称
                    <input
                      value={editDefaultEventName}
                      onChange={(event) => setEditDefaultEventName(event.target.value)}
                      className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-white"
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-sm text-white/70">
                      编辑默认开始日期
                      <input
                        type="date"
                        value={editDefaultStartDate}
                        onChange={(event) => setEditDefaultStartDate(event.target.value)}
                        className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-white"
                      />
                    </label>
                    <label className="grid gap-2 text-sm text-white/70">
                      编辑默认到期时间
                      <input
                        type="datetime-local"
                        value={editDefaultDueAt}
                        onChange={(event) => setEditDefaultDueAt(event.target.value)}
                        className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-white"
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={editDefaultIsPrimary}
                      onChange={(event) => setEditDefaultIsPrimary(event.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-white/5"
                    />
                    编辑默认设为主事件
                  </label>
                </div>
                <label className="grid gap-2 text-sm text-white/70">
                  编辑时间模式
                  <select
                    value={editScheduleMode}
                    onChange={(event) => setEditScheduleMode(event.target.value as 'from_start' | 'before_due')}
                    className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-white"
                  >
                    <option value="before_due">从截止时间倒推</option>
                    <option value="from_start">从开始日期顺推</option>
                  </select>
                </label>
                <div className="grid gap-2">
                  <div className="text-sm font-medium text-white/80">工作台内容</div>
                  {editItems.map((item, index) => (
                    <div key={index} className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <div className="grid grid-cols-[96px_1fr_92px] gap-2">
                        <select
                          value={item.kind}
                          onChange={(event) => updateEditItem(index, { kind: event.target.value as 'task' | 'appointment' })}
                          className="rounded-lg border border-white/10 bg-[#121826] px-2 py-2 text-sm text-white"
                        >
                          <option value="task">任务</option>
                          <option value="appointment">日程</option>
                        </select>
                        <input
                          value={item.title}
                          onChange={(event) => updateEditItem(index, { title: event.target.value })}
                          aria-label={index === 0 ? '编辑工作台内容标题' : `编辑工作台内容标题 ${index + 1}`}
                          className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                        />
                        <input
                          type="number"
                          min={0}
                          value={item.offset_days}
                          onChange={(event) => updateEditItem(index, { offset_days: Number(event.target.value) })}
                          aria-label={index === 0 ? '编辑相对天数' : `编辑相对天数 ${index + 1}`}
                          className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <input
                        value={item.content ?? ''}
                        onChange={(event) => updateEditItem(index, { content: event.target.value })}
                        aria-label={index === 0 ? '编辑工作台内容备注' : `编辑工作台内容备注 ${index + 1}`}
                        className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditItems((current) => [...current, { ...DEFAULT_ITEM, sort_order: current.length }])}
                    className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
                  >
                    添加工作台内容
                  </button>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTemplateId(null)}
                    className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUpdate()}
                    disabled={submitting}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
                  >
                    保存事件模板
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-3 grid gap-2">
              {templates.length ? templates.map((template) => (
                <div key={template.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <div className="font-medium">{template.name}</div>
                  <div className="mt-1 text-xs text-white/50">
                    {template.schedule_mode === 'before_due' ? '截止前倒推' : '开始后顺推'} · 工作台内容 {template.items.length} 条
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => beginEdit(template)}
                      aria-label={`编辑“${template.name}”`}
                      title="编辑模板"
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10"
                    >
                      <Pencil size={14} />
                    </button>
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
