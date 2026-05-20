import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import type { AchievementSummary } from '../achievementTypes';
import { apiJson } from '../../lib/api';
import {
  applyEventPlanTemplate,
  deleteEventPlanDraftItem,
  generateEventPlanDraft,
  getEventWorkbench,
  listEventPlanTemplates,
  saveEventPlanDraftAsTemplate,
  updateEventPlanDraftItem,
  updateEventPlanDraftSourceTemplate,
} from '../../lib/events/api';
import type { EventItem, EventPlanDraftItem, EventPlanTemplate, EventWorkbench } from '../../lib/events/types';
import EventTemplateManagerModal from './EventTemplateManagerModal';

type EventWorkbenchModalProps = {
  event: EventItem;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

type EventEditFormState = {
  name: string;
  startDate: string;
  dueAt: string;
  isPrimary: boolean;
};

const EMPTY_EVENT_EDIT_FORM: EventEditFormState = {
  name: '',
  startDate: '',
  dueAt: '',
  isPrimary: false,
};

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateTimeLocal(value: string | null): string {
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

export default function EventWorkbenchModal({ event, onClose, onChanged }: EventWorkbenchModalProps) {
  const [workbench, setWorkbench] = useState<EventWorkbench | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [templates, setTemplates] = useState<EventPlanTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [editingItem, setEditingItem] = useState<EventPlanDraftItem | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveTemplateDescription, setSaveTemplateDescription] = useState('');
  const [saveTemplateMode, setSaveTemplateMode] = useState<'from_start' | 'before_due'>('before_due');
  const [achievementSummary, setAchievementSummary] = useState<AchievementSummary | null>(null);
  const [loadingAchievement, setLoadingAchievement] = useState(false);
  const [editingEventDetails, setEditingEventDetails] = useState(false);
  const [eventEditForm, setEventEditForm] = useState<EventEditFormState>(EMPTY_EVENT_EDIT_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getEventWorkbench(event.id)
      .then((data) => {
        if (cancelled) return;
        setWorkbench(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '事件工作台加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  async function loadTemplates(): Promise<void> {
    try {
      const data = await listEventPlanTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '模板加载失败');
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingAchievement(true);
    void apiJson<AchievementSummary>(`/todo/achievements/summary?event_id=${event.id}`)
      .then((data) => {
        if (cancelled) return;
        setAchievementSummary(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load event achievement summary', err);
        setAchievementSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingAchievement(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  async function handleGenerate(): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const nextWorkbench = await generateEventPlanDraft(event.id);
      setWorkbench(nextWorkbench);
      await Promise.resolve(onChanged?.());
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成正式安排失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApplyTemplate(): Promise<void> {
    if (submitting || !selectedTemplateId) return;
    if (workbench?.plan_draft && !window.confirm('套用新模板会覆盖当前计划草稿，确定继续吗？')) return;
    setSubmitting(true);
    setError(null);
    try {
      const nextWorkbench = await applyEventPlanTemplate(event.id, selectedTemplateId);
      setWorkbench(nextWorkbench);
    } catch (err) {
      setError(err instanceof Error ? err.message : '套用模板失败');
    } finally {
      setSubmitting(false);
    }
  }

  function beginEditDraftItem(item: EventPlanDraftItem): void {
    setEditingItem(item);
    setDraftTitle(item.title);
    setDraftContent(item.content ?? '');
    setDraftTime(toDateTimeLocal(item.kind === 'appointment' ? (item.ends_at ?? item.starts_at) : item.scheduled_for));
  }

  async function handleSaveDraftItem(): Promise<void> {
    if (submitting || !editingItem) return;
    const title = draftTitle.trim();
    if (!title) {
      setError('请输入草稿标题');
      return;
    }
    const isoTime = fromDateTimeLocal(draftTime);
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title,
        content: draftContent.trim() || null,
        ...(editingItem.kind === 'appointment'
          ? { ends_at: isoTime, starts_at: null }
          : { scheduled_for: isoTime }),
      };
      const nextWorkbench = await updateEventPlanDraftItem(event.id, editingItem.id, payload);
      setWorkbench(nextWorkbench);
      setEditingItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存草稿项失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteDraftItem(item: EventPlanDraftItem): Promise<void> {
    if (submitting) return;
    if (!window.confirm(`确定删除“${item.title}”吗？`)) return;
    setSubmitting(true);
    setError(null);
    try {
      const nextWorkbench = await deleteEventPlanDraftItem(event.id, item.id);
      setWorkbench(nextWorkbench);
      if (editingItem?.id === item.id) setEditingItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除草稿项失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveAsTemplate(): Promise<void> {
    if (submitting) return;
    const name = saveTemplateName.trim();
    if (!name) {
      setError('请输入新模板名称');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await saveEventPlanDraftAsTemplate(event.id, {
        name,
        description: saveTemplateDescription.trim() || null,
        schedule_mode: saveTemplateMode,
      });
      setShowSaveTemplate(false);
      setSaveTemplateName('');
      setSaveTemplateDescription('');
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : '另存模板失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateSourceTemplate(): Promise<void> {
    if (submitting || !workbench?.plan_draft?.source_template_id) return;
    if (!window.confirm('确定用当前计划草稿覆盖源模板吗？')) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateEventPlanDraftSourceTemplate(event.id);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : '回写源模板失败');
    } finally {
      setSubmitting(false);
    }
  }

  const currentEvent = workbench?.event ?? event;
  const eventAchievements = achievementSummary?.event_achievements ?? null;
  const draftItems = workbench?.plan_draft?.items ?? [];
  const taskDrafts = draftItems.filter((item) => item.kind === 'task');
  const appointmentDrafts = draftItems.filter((item) => item.kind === 'appointment');
  const sourceTemplateName = templates.find((template) => template.id === workbench?.plan_draft?.source_template_id)?.name;

  function beginEditEventDetails(): void {
    setEditingEventDetails(true);
    setEventEditForm({
      name: currentEvent.name,
      startDate: currentEvent.start_date,
      dueAt: toDateTimeLocal(currentEvent.due_at),
      isPrimary: currentEvent.is_primary,
    });
    setError(null);
  }

  function cancelEditEventDetails(): void {
    setEditingEventDetails(false);
    setEventEditForm(EMPTY_EVENT_EDIT_FORM);
    setError(null);
  }

  function updateCurrentEvent(updatedEvent: EventItem): void {
    setWorkbench((current) => (
      current
        ? { ...current, event: updatedEvent }
        : { event: updatedEvent, plan_draft: null, created_tasks: [], created_appointments: [] }
    ));
  }

  async function handleSetPrimaryEvent(): Promise<void> {
    if (submitting || currentEvent.is_primary) return;
    setSubmitting(true);
    setError(null);
    try {
      const updatedEvent = await apiJson<EventItem>(`/todo/events/${currentEvent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      });
      updateCurrentEvent(updatedEvent);
      await Promise.resolve(onChanged?.());
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置主事件失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEventDetails(): Promise<void> {
    if (submitting) return;
    const name = eventEditForm.name.trim();
    const dueAt = fromDateTimeLocal(eventEditForm.dueAt);
    if (!name) {
      setError('请输入事件名称');
      return;
    }
    if (!eventEditForm.startDate) {
      setError('请选择开始日期');
      return;
    }
    if (!dueAt) {
      setError('请选择截止时间');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const updatedEvent = await apiJson<EventItem>(`/todo/events/${currentEvent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          start_date: eventEditForm.startDate,
          due_at: dueAt,
          is_primary: eventEditForm.isPrimary,
        }),
      });
      updateCurrentEvent(updatedEvent);
      setEditingEventDetails(false);
      await Promise.resolve(onChanged?.());
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存事件失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEvent(): Promise<void> {
    if (submitting) return;
    if (!window.confirm(`确定删除“${currentEvent.name}”吗？`)) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiJson(`/todo/events/${currentEvent.id}`, { method: 'DELETE' });
      await Promise.resolve(onChanged?.());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除事件失败');
    } finally {
      setSubmitting(false);
    }
  }

  function renderDraftItem(item: EventPlanDraftItem) {
    const timeValue = item.kind === 'appointment' ? (item.ends_at ?? item.starts_at) : item.scheduled_for;
    return (
      <div key={item.id} className="rounded-lg bg-white/[0.05] px-3 py-2 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium text-white">{item.title}</div>
            {item.content ? <div className="mt-1 line-clamp-2 text-xs text-white/50">{item.content}</div> : null}
            {timeValue ? <div className="mt-1 text-xs text-white/40">{formatDateTime(timeValue)}</div> : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => beginEditDraftItem(item)}
              aria-label={`编辑草稿“${item.title}”`}
              title="编辑草稿"
              className="rounded-md p-1.5 text-white/55 hover:bg-white/10 hover:text-white"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteDraftItem(item)}
              aria-label={`删除草稿“${item.title}”`}
              title="删除草稿"
              className="rounded-md p-1.5 text-red-200/75 hover:bg-red-500/15 hover:text-red-100"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 px-5 py-20 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="事件工作台"
      onClick={onClose}
    >
      <div
        className="flex h-[calc(100vh-7rem)] w-[1120px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f16] text-white shadow-2xl"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-white/[0.04] px-5">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-white/45">事件工作台</div>
            <h2 className="mt-1 text-xl font-semibold">{currentEvent.name}</h2>
          </div>
          <button
            type="button"
            className="rounded-full px-3 py-2 text-white/60 hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="关闭事件工作台"
          >
            关闭
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <div className="text-white/50">加载中...</div> : null}
          {error ? <div className="mb-4 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">事件总览</h3>
                <div className="mt-3 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
                  <div>开始日期 {currentEvent.start_date}</div>
                  <div>截止时间 {formatDateTime(currentEvent.due_at)}</div>
                  <div>{currentEvent.is_primary ? '主事件' : '非主事件'}</div>
                  <div>创建于 {formatDateTime(currentEvent.created_at)}</div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {!currentEvent.is_primary ? (
                  <button
                    type="button"
                    onClick={() => void handleSetPrimaryEvent()}
                    disabled={submitting}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    设为主事件
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={beginEditEventDetails}
                  disabled={submitting}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  编辑事件
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteEvent()}
                  disabled={submitting}
                  className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  删除事件
                </button>
              </div>
            </div>
            {editingEventDetails ? (
              <div className="mt-4 grid gap-3 rounded-lg border border-blue-300/20 bg-blue-400/10 p-3">
                <div className="text-sm font-medium text-blue-100">编辑事件信息</div>
                <div className="grid gap-3 md:grid-cols-[1.4fr_0.9fr_1.1fr]">
                  <label className="grid gap-1 text-xs text-white/60">
                    事件名称
                    <input
                      value={eventEditForm.name}
                      onChange={(changeEvent) => setEventEditForm((state) => ({ ...state, name: changeEvent.target.value }))}
                      className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-white/60">
                    开始日期
                    <input
                      type="date"
                      value={eventEditForm.startDate}
                      onChange={(changeEvent) => setEventEditForm((state) => ({ ...state, startDate: changeEvent.target.value }))}
                      className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-white/60">
                    截止时间
                    <input
                      type="datetime-local"
                      value={eventEditForm.dueAt}
                      onChange={(changeEvent) => setEventEditForm((state) => ({ ...state, dueAt: changeEvent.target.value }))}
                      className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={eventEditForm.isPrimary}
                      onChange={(changeEvent) => setEventEditForm((state) => ({ ...state, isPrimary: changeEvent.target.checked }))}
                      className="h-4 w-4 rounded border-white/20 bg-white/5"
                    />
                    主事件
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEditEventDetails}
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveEventDetails()}
                      disabled={submitting}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      保存事件
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label className="text-sm font-medium text-white/80">选择计划模板</label>
                <select
                  aria-label="选择计划模板"
                  value={selectedTemplateId}
                  onChange={(changeEvent) => setSelectedTemplateId(changeEvent.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">请选择模板</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void handleApplyTemplate()}
                disabled={submitting || !selectedTemplateId}
                className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                套用模板
              </button>
              <button
                type="button"
                onClick={() => setShowTemplateManager(true)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/10"
              >
                管理模板
              </button>
            </div>
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">计划草稿</h3>
                  <p className="mt-1 text-sm text-white/50">
                    {sourceTemplateName ? `来自模板：${sourceTemplateName}` : '模板套用后会先进入这里，生成前不会出现在任务或日程里。'}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSaveTemplate(true)}
                    disabled={submitting || draftItems.length === 0}
                    className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    另存为模板
                  </button>
                  {workbench?.plan_draft?.source_template_id ? (
                    <button
                      type="button"
                      onClick={() => void handleUpdateSourceTemplate()}
                      disabled={submitting || draftItems.length === 0}
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      回写源模板
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleGenerate()}
                    disabled={submitting || draftItems.length === 0}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? '处理中...' : '生成正式安排'}
                  </button>
                </div>
              </div>

              {editingItem ? (
                <div className="mt-4 grid gap-3 rounded-lg border border-blue-300/20 bg-blue-400/10 p-3">
                  <div className="text-sm font-medium text-blue-100">编辑{editingItem.kind === 'appointment' ? '日程草稿' : '任务草稿'}</div>
                  <label className="grid gap-1 text-xs text-white/60">
                    草稿标题
                    <input
                      value={draftTitle}
                      onChange={(changeEvent) => setDraftTitle(changeEvent.target.value)}
                      className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-white/60">
                    草稿备注
                    <textarea
                      value={draftContent}
                      onChange={(changeEvent) => setDraftContent(changeEvent.target.value)}
                      className="min-h-16 rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-white/60">
                    草稿时间
                    <input
                      type="datetime-local"
                      value={draftTime}
                      onChange={(changeEvent) => setDraftTime(changeEvent.target.value)}
                      className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingItem(null)}
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveDraftItem()}
                      disabled={submitting}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      保存草稿项
                    </button>
                  </div>
                </div>
              ) : null}

              {showSaveTemplate ? (
                <div className="mt-4 grid gap-3 rounded-lg border border-amber-200/20 bg-amber-300/10 p-3">
                  <div className="text-sm font-medium text-amber-100">另存当前计划草稿</div>
                  <label className="grid gap-1 text-xs text-white/60">
                    新模板名称
                    <input
                      value={saveTemplateName}
                      onChange={(changeEvent) => setSaveTemplateName(changeEvent.target.value)}
                      className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-white/60">
                    新模板说明
                    <textarea
                      value={saveTemplateDescription}
                      onChange={(changeEvent) => setSaveTemplateDescription(changeEvent.target.value)}
                      className="min-h-14 rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-white/60">
                    相对时间模式
                    <select
                      value={saveTemplateMode}
                      onChange={(changeEvent) => setSaveTemplateMode(changeEvent.target.value as 'from_start' | 'before_due')}
                      className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white"
                    >
                      <option value="before_due">从截止时间倒推</option>
                      <option value="from_start">从开始日期顺推</option>
                    </select>
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSaveTemplate(false)}
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveAsTemplate()}
                      disabled={submitting}
                      className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-200 disabled:opacity-50"
                    >
                      确认另存
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3">
                <div>
                  <h4 className="text-sm font-medium text-blue-200">任务草稿</h4>
                  <div className="mt-2 grid gap-2">
                    {taskDrafts.length ? taskDrafts.map(renderDraftItem) : <div className="text-sm text-white/40">暂无任务草稿</div>}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-teal-200">日程草稿</h4>
                  <div className="mt-2 grid gap-2">
                    {appointmentDrafts.length ? appointmentDrafts.map(renderDraftItem) : <div className="text-sm text-white/40">暂无日程草稿</div>}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="text-base font-semibold">已创建安排</h3>
              <div className="mt-4 grid gap-3">
                <div>
                  <h4 className="text-sm font-medium text-blue-200">已创建任务</h4>
                  <div className="mt-2 grid gap-2">
                    {workbench?.created_tasks.length ? workbench.created_tasks.map((task) => (
                      <div key={task.id} className="rounded-lg bg-white/[0.05] px-3 py-2 text-sm">
                        {task.title}
                      </div>
                    )) : <div className="text-sm text-white/40">暂无已创建任务</div>}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-teal-200">已创建日程</h4>
                  <div className="mt-2 grid gap-2">
                    {workbench?.created_appointments.length ? workbench.created_appointments.map((appointment) => (
                      <div key={appointment.id} className="rounded-lg bg-white/[0.05] px-3 py-2 text-sm">
                        {appointment.title}
                      </div>
                    )) : <div className="text-sm text-white/40">暂无已创建日程</div>}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h3 className="text-base font-semibold">成就摘要</h3>
            {loadingAchievement ? (
              <p className="mt-2 text-sm text-white/50">成就加载中...</p>
            ) : eventAchievements ? (
              <div className="mt-3 grid gap-3 text-sm">
                <div className="rounded-lg bg-white/[0.05] px-3 py-2">
                  <div className="font-medium text-white">
                    {eventAchievements.summary_text ?? `${currentEvent.name} 的当前进展`}
                  </div>
                  <div className="mt-1 text-white/50">
                    已解锁 {eventAchievements.stats.unlocked_count} 个 · 进行中 {eventAchievements.stats.in_progress_count} 个
                  </div>
                </div>
                {eventAchievements.latest_unlocked[0] ? (
                  <div className="rounded-lg border border-emerald-300/15 bg-emerald-400/10 px-3 py-2 text-emerald-100">
                    最近解锁：{eventAchievements.latest_unlocked[0].title}
                  </div>
                ) : null}
                {eventAchievements.upcoming[0] ? (
                  <div className="rounded-lg border border-blue-300/15 bg-blue-400/10 px-3 py-2 text-blue-100">
                    下一步：{eventAchievements.upcoming[0].title}
                    {eventAchievements.upcoming[0].progress_text ? ` · ${eventAchievements.upcoming[0].progress_text}` : ''}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/50">暂无事件成就进度，完成相关任务或专注后会自动更新。</p>
            )}
          </section>
        </div>
      </div>
      {showTemplateManager ? (
        <EventTemplateManagerModal
          templates={templates}
          onClose={() => setShowTemplateManager(false)}
          onChanged={loadTemplates}
        />
      ) : null}
    </div>
  );
}
