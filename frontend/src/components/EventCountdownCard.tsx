import React, { useEffect, useMemo, useState } from 'react';

import {
  createEventPlanTemplate,
  createEvent,
  getPrimaryEvent,
  listEventPlanTemplates,
  listEvents,
  updateEventPlanTemplate,
  type EventCreateInput,
  type EventPlanTemplateInput,
  type EventPlanTemplateItemInput,
} from '../lib/events/api';
import {
  formatEventDateTime,
  fromDateTimeLocalValue,
  getCountdownDisplay,
  getCountdownTone,
  toDateTimeLocalValue,
} from '../lib/events/dateTime';
import {
  createEventArrangementTask,
  createEventArrangementAppointment,
  type EventArrangementTaskInput,
  type EventArrangementAppointmentInput,
} from '../lib/events/arrangementApi';
import EventWorkbenchModal from './events/EventWorkbenchModal';
import type { EventItem, EventPlanTemplate } from '../lib/events/types';

type EventFormState = {
  name: string;
  startDate: string;
  dueAt: string;
  isPrimary: boolean;
};

type CreateWorkbenchItemState = {
  kind: 'task' | 'appointment';
  title: string;
  content: string;
  offsetDays: number;
};

type CreateArrangementEditorState = CreateWorkbenchItemState & {
  index: number | null;
};

type TemplateConflictState = {
  template: EventPlanTemplate;
  payload: EventPlanTemplateInput;
};

const CREATE_EVENT_DEFAULTS: EventFormState = {
  name: '',
  startDate: '',
  dueAt: '',
  isPrimary: false,
};

const EventCountdownCard: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [primaryEvent, setPrimaryEvent] = useState<EventItem | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workbenchEvent, setWorkbenchEvent] = useState<EventItem | null>(null);
  const [showCreateEditor, setShowCreateEditor] = useState(false);
  const [createForm, setCreateForm] = useState<EventFormState>(CREATE_EVENT_DEFAULTS);
  const [createWorkbenchItems, setCreateWorkbenchItems] = useState<CreateWorkbenchItemState[]>([]);
  const [templates, setTemplates] = useState<EventPlanTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);
  const [templateConflict, setTemplateConflict] = useState<TemplateConflictState | null>(null);
  const [createArrangementEditor, setCreateArrangementEditor] = useState<CreateArrangementEditorState | null>(null);

  useEffect(() => {
    void loadPrimaryEvent();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!showModal) return;
    void loadEvents();
    void loadTemplates();
  }, [showModal]);

  const countdownText = useMemo(() => {
    if (!primaryEvent) return '--';
    return getCountdownDisplay(primaryEvent.due_at, nowMs);
  }, [primaryEvent, nowMs]);

  const countdownTone = useMemo(() => {
    if (!primaryEvent) return 'upcoming';
    return getCountdownTone(primaryEvent.due_at, nowMs);
  }, [primaryEvent, nowMs]);

  async function loadPrimaryEvent(): Promise<void> {
    try {
      const event = await getPrimaryEvent();
      setPrimaryEvent(event);
    } catch (err) {
      if (err instanceof Error && err.message === '主事件不存在') {
        setPrimaryEvent(null);
        return;
      }
      console.error('Failed to load primary event', err);
      setPrimaryEvent(null);
    }
  }

  async function loadEvents(): Promise<void> {
    setLoading(true);
    try {
      const data = await listEvents();
      setEvents(data);
    } catch (err) {
      console.error('Failed to load events', err);
      setError(err instanceof Error ? err.message : '加载事件失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplates(): Promise<void> {
    setLoadingTemplates(true);
    try {
      const data = await listEventPlanTemplates();
      const nextTemplates = Array.isArray(data) ? data : [];
      setTemplates(nextTemplates);
      setSelectedTemplateId((current) => (
        current && nextTemplates.some((template) => template.id === current) ? current : ''
      ));
    } catch (err) {
      console.error('Failed to load event plan templates', err);
      setError(err instanceof Error ? err.message : '模板加载失败');
    } finally {
      setLoadingTemplates(false);
    }
  }

  function buildCreateWorkbenchItems(template: EventPlanTemplate | undefined): CreateWorkbenchItemState[] {
    if (!template) return [];
    return template.items.map((item) => ({
      kind: item.kind,
      title: item.title,
      content: item.content ?? '',
      offsetDays: Math.max(0, Math.floor(item.offset_days || 0)),
    }));
  }

  function applyTemplateToCreateForm(template: EventPlanTemplate): void {
    setCreateForm({
      name: template.default_event_name || template.name,
      startDate: template.default_start_date || '',
      dueAt: toDateTimeLocalValue(template.default_due_at),
      isPrimary: template.default_is_primary ?? CREATE_EVENT_DEFAULTS.isPrimary,
    });
    setCreateWorkbenchItems(buildCreateWorkbenchItems(template));
    setCreateArrangementEditor(null);
    setTemplateStatus(null);
    setError(null);
  }

  function handleApplyTemplate(): void {
    const template = templates.find((current) => current.id === selectedTemplateId);
    if (!template) {
      setError('请选择事件模板');
      return;
    }
    applyTemplateToCreateForm(template);
  }

  function removeCreateWorkbenchItem(index: number): void {
    setCreateWorkbenchItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function beginAddCreateArrangementItem(kind: CreateWorkbenchItemState['kind']): void {
    setCreateArrangementEditor({
      kind,
      index: null,
      title: '',
      content: '',
      offsetDays: 0,
    });
    setError(null);
  }

  function beginEditCreateArrangementItem(index: number): void {
    const item = createWorkbenchItems[index];
    if (!item) return;
    setCreateArrangementEditor({
      ...item,
      index,
    });
    setError(null);
  }

  function cancelCreateArrangementEditor(): void {
    setCreateArrangementEditor(null);
    setError(null);
  }

  function saveCreateArrangementItem(): void {
    if (!createArrangementEditor) return;
    const label = createArrangementEditor.kind === 'appointment' ? '日程' : '任务';
    const nextItem: CreateWorkbenchItemState = {
      kind: createArrangementEditor.kind,
      title: createArrangementEditor.title.trim(),
      content: createArrangementEditor.content.trim(),
      offsetDays: Math.max(0, Math.floor(createArrangementEditor.offsetDays || 0)),
    };
    if (!nextItem.title) {
      setError(`请输入${label}标题`);
      return;
    }
    setCreateWorkbenchItems((current) => {
      if (createArrangementEditor.index === null) return [...current, nextItem];
      return current.map((item, itemIndex) => (
        itemIndex === createArrangementEditor.index ? nextItem : item
      ));
    });
    setCreateArrangementEditor(null);
    setError(null);
  }

  function deleteCreateArrangementItem(): void {
    if (!createArrangementEditor || createArrangementEditor.index === null) return;
    removeCreateWorkbenchItem(createArrangementEditor.index);
    setCreateArrangementEditor(null);
    setError(null);
  }

  function previewWorkbenchItemTime(
    item: CreateWorkbenchItemState,
    template: EventPlanTemplate | undefined,
  ): string | null {
    const scheduleMode = template?.schedule_mode ?? 'before_due';
    const offsetDays = Math.max(0, Math.floor(item.offsetDays || 0));
    if (scheduleMode === 'from_start') {
      if (!createForm.startDate) return null;
      const [year, month, day] = createForm.startDate.split('-').map(Number);
      if (!year || !month || !day) return null;
      const scheduledMs = Date.UTC(year, month - 1, day + offsetDays, 9, 0, 0);
      return new Date(scheduledMs).toISOString();
    }
    if (!createForm.dueAt) return null;
    const dueDate = new Date(createForm.dueAt);
    if (Number.isNaN(dueDate.getTime())) return null;
    dueDate.setDate(dueDate.getDate() - offsetDays);
    return dueDate.toISOString();
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([loadPrimaryEvent(), loadEvents()]);
    window.dispatchEvent(new CustomEvent('ark:reload-focus'));
  }

  function resetCreateForm(): void {
    setCreateForm(CREATE_EVENT_DEFAULTS);
    setCreateWorkbenchItems([]);
    setSelectedTemplateId('');
    setTemplateStatus(null);
    setTemplateConflict(null);
    setCreateArrangementEditor(null);
  }

  function beginCreate(): void {
    setShowCreateEditor(true);
    setError(null);
    setTemplateStatus(null);
  }

  function cancelCreate(): void {
    setShowCreateEditor(false);
    resetCreateForm();
    setError(null);
  }

  function closeModal(): void {
    setShowModal(false);
    cancelCreate();
    setError(null);
  }

  function buildCreatePayload(): EventCreateInput | null {
    const name = createForm.name.trim();
    if (!name) {
      setError('请输入事件名称');
      return null;
    }
    if (!createForm.startDate) {
      setError('请选择开始日期');
      return null;
    }
    if (!createForm.dueAt) {
      setError('请选择到期时间');
      return null;
    }

    return {
      name,
      start_date: createForm.startDate,
      due_at: new Date(createForm.dueAt).toISOString(),
      is_primary: createForm.isPrimary,
    };
  }

  async function finishCreatedEvent(): Promise<void> {
    resetCreateForm();
    setShowCreateEditor(false);
    await refreshAll();
  }

  async function createWorkbenchItemsForEvent(createdEvent: EventItem, items: CreateWorkbenchItemState[]): Promise<void> {
    for (let index = 0; index < items.length; index += 1) {
      const formItem = items[index];
      const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
      const scheduledAt = previewWorkbenchItemTime(formItem, selectedTemplate);
      if (formItem.kind === 'task') {
        const payload: EventArrangementTaskInput = {
          title: formItem.title.trim(),
          content: formItem.content.trim() || null,
          priority: 0,
          targetDuration: 0,
          event: createdEvent.name,
          eventId: createdEvent.id,
          periodType: 'once',
          customPeriodDays: null,
          maxCompletionsPerPeriod: 1,
          weekdayOnly: false,
          timeInheritsFromEvent: false,
          timeOverridden: Boolean(scheduledAt),
          taskType: 'focus',
          tags: [],
          startDate: null,
          dueDate: scheduledAt,
        };
        await createEventArrangementTask(createdEvent, payload);
      } else {
        const payload: EventArrangementAppointmentInput = {
          title: formItem.title.trim(),
          content: formItem.content.trim() || null,
          status: 'pending',
          startsAt: null,
          endsAt: scheduledAt || '',
          repeatRule: null,
          eventId: createdEvent.id,
          periodType: 'once',
          customPeriodDays: null,
          maxCompletionsPerPeriod: 1,
          weekdayOnly: false,
          timeInheritsFromEvent: false,
          timeOverridden: true,
        };
        await createEventArrangementAppointment(createdEvent, payload);
      }
    }
  }

  function buildTemplateItems(): EventPlanTemplateItemInput[] | null {
    const items = createWorkbenchItems.map((item, index) => ({
      kind: item.kind,
      title: item.title.trim(),
      content: item.content.trim() || null,
      offset_days: Math.max(0, Math.floor(item.offsetDays || 0)),
      sort_order: index,
    }));
    if (items.some((item) => !item.title)) {
      setError('请输入安排内容标题');
      return null;
    }
    return items;
  }

  function buildTemplatePayload(): EventPlanTemplateInput | null {
    const name = createForm.name.trim();
    if (!name) {
      setError('请输入事件名称');
      return null;
    }
    const items = buildTemplateItems();
    if (!items) return null;
    return {
      name,
      description: null,
      schedule_mode: 'before_due',
      default_event_name: name,
      default_start_date: createForm.startDate || null,
      default_due_at: fromDateTimeLocalValue(createForm.dueAt),
      default_is_primary: createForm.isPrimary,
      items,
    };
  }

  async function handleSaveTemplate(): Promise<void> {
    if (savingTemplate) return;
    const payload = buildTemplatePayload();
    if (!payload) return;

    setSavingTemplate(true);
    setError(null);
    setTemplateStatus(null);
    try {
      const templates = await listEventPlanTemplates();
      const sameNameTemplate = templates.find((template) => template.name.trim() === payload.name);
      if (sameNameTemplate) {
        setTemplateConflict({ template: sameNameTemplate, payload });
        return;
      }
      await createEventPlanTemplate(payload);
      setTemplateStatus('已保存为模板');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存模板失败');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function saveConflictAsNewTemplate(): Promise<void> {
    if (!templateConflict || savingTemplate) return;
    setSavingTemplate(true);
    setError(null);
    setTemplateStatus(null);
    try {
      await createEventPlanTemplate(templateConflict.payload);
      setTemplateConflict(null);
      setTemplateStatus('已保存为模板');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存模板失败');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function updateConflictTemplate(): Promise<void> {
    if (!templateConflict || savingTemplate) return;
    setSavingTemplate(true);
    setError(null);
    setTemplateStatus(null);
    try {
      await updateEventPlanTemplate(templateConflict.template.id, templateConflict.payload);
      setTemplateConflict(null);
      setTemplateStatus('已更新模板');
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新模板失败');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function submitCreateEvent(): Promise<void> {
    if (submitting) return;
    const payload = buildCreatePayload();
    if (!payload) {
      return;
    }
    const workbenchItems = createWorkbenchItems;
    if (workbenchItems.some((item) => !item.title.trim())) {
      setError('请输入安排内容标题');
      setShowCreateEditor(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const createdEvent = await createEvent(payload);
      if (workbenchItems.length > 0) {
        await createWorkbenchItemsForEvent(createdEvent, workbenchItems);
        await finishCreatedEvent();
        return;
      }
      await finishCreatedEvent();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建事件失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateEvent(): Promise<void> {
    await submitCreateEvent();
  }

  const numberClassName =
    countdownTone === 'due'
      ? 'bg-gradient-to-r from-cyan-300 via-violet-300 to-amber-300 bg-clip-text text-transparent'
      : countdownTone === 'expired'
        ? 'text-red-400'
        : 'text-sky-300';
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);

  function openWorkbench(event: EventItem): void {
    resetCreateForm();
    setShowCreateEditor(false);
    setShowModal(false);
    setError(null);
    setWorkbenchEvent(event);
  }

  function renderCreateArrangementEditor(kind: CreateWorkbenchItemState['kind']) {
    if (!createArrangementEditor || createArrangementEditor.kind !== kind) return null;
    const label = kind === 'appointment' ? '日程' : '任务';
    const previewTime = previewWorkbenchItemTime(createArrangementEditor, selectedTemplate);
    return (
      <div className="grid gap-2 rounded-lg border border-blue-300/20 bg-blue-400/10 p-3">
        <label className="grid gap-1 text-xs text-white/60">
          {label}标题
          <input
            aria-label={`${label}标题`}
            value={createArrangementEditor.title}
            onChange={(event) => setCreateArrangementEditor((current) => (
              current ? { ...current, title: event.target.value } : current
            ))}
            className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </label>
        <label className="grid gap-1 text-xs text-white/60">
          {label}备注
          <input
            aria-label={`${label}备注`}
            value={createArrangementEditor.content}
            onChange={(event) => setCreateArrangementEditor((current) => (
              current ? { ...current, content: event.target.value } : current
            ))}
            className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </label>
        <label className="grid gap-1 text-xs text-white/60">
          {label}相对天数
          <input
            aria-label={`${label}相对天数`}
            type="number"
            min={0}
            value={createArrangementEditor.offsetDays}
            onChange={(event) => setCreateArrangementEditor((current) => (
              current
                ? { ...current, offsetDays: Math.max(0, Math.floor(Number(event.target.value) || 0)) }
                : current
            ))}
            className="rounded-lg border border-white/10 bg-[#121826] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </label>
        {previewTime ? (
          <div className="text-xs text-white/45">时间预览 {formatEventDateTime(previewTime)}</div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {createArrangementEditor.index !== null ? (
            <button
              type="button"
              onClick={deleteCreateArrangementItem}
              className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20"
            >
              删除{label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={cancelCreateArrangementEditor}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
          >
            取消
          </button>
          <button
            type="button"
            onClick={saveCreateArrangementItem}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            保存{label}
          </button>
        </div>
      </div>
    );
  }

  function renderCreateArrangementColumn(kind: CreateWorkbenchItemState['kind']) {
    const label = kind === 'appointment' ? '日程' : '任务';
    const items = createWorkbenchItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.kind === kind);

    return (
      <div className="flex min-h-[132px] flex-col rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="text-sm font-medium text-white/80">{label}</div>
        <div className="mt-3 grid flex-1 content-start gap-2">
          {items.map(({ item, index }) => (
            createArrangementEditor?.index === index ? (
              <div key={`${kind}-${index}`}>{renderCreateArrangementEditor(kind)}</div>
            ) : (
              <button
                key={`${kind}-${index}`}
                type="button"
                onClick={() => beginEditCreateArrangementItem(index)}
                className="min-h-10 rounded-lg bg-white/[0.05] px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/10"
              >
                {item.title || `未命名${label}`}
              </button>
            )
          ))}
          {createArrangementEditor?.kind === kind && createArrangementEditor.index === null
            ? renderCreateArrangementEditor(kind)
            : null}
          <button
            type="button"
            onClick={() => beginAddCreateArrangementItem(kind)}
            className="min-h-10 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/55 hover:bg-white/[0.07] hover:text-white"
          >
            添加{label}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setShowCreateEditor(false);
          setShowModal(true);
        }}
        className="absolute left-12 top-24 z-20 w-44 h-44 rounded-full border-[6px] border-white/30 bg-black/15 flex flex-col items-center justify-center text-white/90 shadow-[0_0_15px_rgba(255,255,255,0.2)] backdrop-blur-sm transition-colors hover:bg-black/30"
      >
        <span className="text-sm tracking-[0.35em] uppercase text-white/60">
          {primaryEvent ? primaryEvent.name : '未设置主事件'}
        </span>
        <span className={`mt-3 text-4xl font-bold leading-none ${numberClassName}`}>{countdownText}</span>
        <span className="mt-3 text-[11px] tracking-[0.3em] uppercase text-white/45">event</span>
      </button>

      {showModal ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={showCreateEditor ? '添加事件' : '事件总览'}
            className="w-[760px] max-w-[94vw] h-[76vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-14 border-b border-white/10 flex items-center justify-between px-5 bg-white/5">
              <h3 className="text-lg font-bold text-white">
                {showCreateEditor ? '添加事件' : '事件总览'}
              </h3>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 p-5 overflow-y-auto">
              {error ? <div className="mb-4 text-sm text-red-400">{error}</div> : null}
              {templateStatus ? <div className="mb-4 text-sm text-emerald-300">{templateStatus}</div> : null}

              {showCreateEditor ? (
                <div className="flex flex-col gap-4">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[220px] flex-1 flex flex-col gap-2">
                          <label className="text-sm text-white/70">事件模板</label>
                          <select
                            aria-label="事件模板"
                            value={selectedTemplateId}
                            onChange={(event) => setSelectedTemplateId(event.target.value)}
                            disabled={loadingTemplates}
                            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="">{loadingTemplates ? '模板加载中...' : '选择事件模板'}</option>
                            {templates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyTemplate}
                          disabled={loadingTemplates || !selectedTemplateId}
                          className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          套用模板
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1.4fr_0.9fr_1.1fr_auto] md:items-end">
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-white/70">事件名称</label>
                        <input
                          aria-label="事件名称"
                          value={createForm.name}
                          onChange={(event) => setCreateForm((state) => ({ ...state, name: event.target.value }))}
                          placeholder="例如：论文投稿截止"
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-white/70">开始日期</label>
                        <input
                          aria-label="开始日期"
                          type="date"
                          value={createForm.startDate}
                          onChange={(event) => setCreateForm((state) => ({ ...state, startDate: event.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-white/70">到期时间</label>
                        <input
                          aria-label="到期时间"
                          type="datetime-local"
                          value={createForm.dueAt}
                          onChange={(event) => setCreateForm((state) => ({ ...state, dueAt: event.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-white/70 pb-2">
                        <input
                          type="checkbox"
                          checked={createForm.isPrimary}
                          onChange={(event) => setCreateForm((state) => ({ ...state, isPrimary: event.target.checked }))}
                          className="h-4 w-4 rounded border-white/20 bg-white/5"
                        />
                        设为主事件
                      </label>
                    </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div>
                      <h4 className="text-base font-semibold text-white">安排</h4>
                      <p className="mt-1 text-sm text-white/45">安排内容</p>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {renderCreateArrangementColumn('task')}
                      {renderCreateArrangementColumn('appointment')}
                    </div>
                  </div>

                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {loading ? (
                    <div className="h-full min-h-[160px] flex items-center justify-center text-white/35">加载中...</div>
                  ) : events.length === 0 ? (
                    <div className="h-full min-h-[160px] flex items-center justify-center text-white/35">暂无事件</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {events.map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => openWorkbench(event)}
                          className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-start justify-between gap-4 text-left hover:bg-white/10 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-semibold text-white">{event.name}</span>
                              {event.is_primary ? (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/20">
                                  主事件
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 text-sm text-white/55">
                              创建于 {formatEventDateTime(event.created_at)}
                            </div>
                            <div className="mt-1 text-sm text-white/65">
                              开始于 {event.start_date}
                            </div>
                            <div className="mt-1 text-sm text-white/75">
                              到期于 {formatEventDateTime(event.due_at)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${getCountdownTone(event.due_at, nowMs) === 'due' ? 'bg-gradient-to-r from-cyan-300 via-violet-300 to-amber-300 bg-clip-text text-transparent' : getCountdownTone(event.due_at, nowMs) === 'expired' ? 'text-red-400' : 'text-sky-300'}`}>
                              {getCountdownDisplay(event.due_at, nowMs)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={beginCreate}
                    disabled={submitting}
                    className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-5 text-left text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    添加事件
                  </button>
                </div>
              )}
            </div>
            {showCreateEditor ? (
              <div
                role="group"
                aria-label="添加事件操作"
                className="shrink-0 border-t border-white/10 bg-[#1a1a1a]/95 px-5 py-4"
              >
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelCreate}
                    disabled={submitting || savingTemplate}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveTemplate()}
                    disabled={submitting || savingTemplate}
                    className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingTemplate ? '保存中...' : '保存为模板'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateEvent()}
                    disabled={submitting || savingTemplate}
                    className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? '提交中...' : '创建事件'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {workbenchEvent ? (
        <EventWorkbenchModal
          event={workbenchEvent}
          onClose={() => setWorkbenchEvent(null)}
          onChanged={refreshAll}
        />
      ) : null}

      {templateConflict ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
          onClick={() => setTemplateConflict(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="同名模板已存在"
            className="w-[420px] max-w-[94vw] rounded-2xl border border-white/10 bg-[#151923] p-5 text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">同名模板已存在</h3>
            <p className="mt-3 text-sm leading-6 text-white/65">
              已经有名为 <span className="font-medium text-white">{templateConflict.template.name}</span> 的事件模板。
              你可以更新这个模板，或者保留它并保存为新的模板。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTemplateConflict(null)}
                disabled={savingTemplate}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void saveConflictAsNewTemplate()}
                disabled={savingTemplate}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                保存为新模板
              </button>
              <button
                type="button"
                onClick={() => void updateConflictTemplate()}
                disabled={savingTemplate}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                更新模板
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </>
  );
};

export default EventCountdownCard;
