import React, { useEffect, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';

import {
  applyEventPlanTemplate,
  createEvent,
  getPrimaryEvent,
  listEventPlanTemplates,
  listEvents,
  updateEventPlanDraftItem,
  type EventCreateInput,
  type EventPlanDraftItemInput,
} from '../lib/events/api';
import { formatEventDateTime, getCountdownDisplay, getCountdownTone, toDateTimeLocalValue } from '../lib/events/dateTime';
import EventWorkbenchModal from './events/EventWorkbenchModal';
import EventTemplateManagerModal from './events/EventTemplateManagerModal';
import type { EventItem, EventPlanTemplate, EventWorkbench } from '../lib/events/types';

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

const CREATE_EVENT_DEFAULTS: EventFormState = {
  name: '',
  startDate: '',
  dueAt: '',
  isPrimary: true,
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
  const [templates, setTemplates] = useState<EventPlanTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showCreateEditor, setShowCreateEditor] = useState(false);
  const [createForm, setCreateForm] = useState<EventFormState>(CREATE_EVENT_DEFAULTS);
  const [createWorkbenchItems, setCreateWorkbenchItems] = useState<CreateWorkbenchItemState[]>([]);

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

  function handleSelectTemplate(templateId: string): void {
    setSelectedTemplateId(templateId);
    const template = templates.find((current) => current.id === templateId);
    if (!template) {
      setCreateWorkbenchItems([]);
      return;
    }
    const templateDueAt = toDateTimeLocalValue(template.default_due_at);
    setCreateWorkbenchItems(buildCreateWorkbenchItems(template));
    setCreateForm((state) => ({
      ...state,
      name: state.name || template.default_event_name || '',
      startDate: state.startDate || template.default_start_date || '',
      dueAt: state.dueAt || templateDueAt,
      isPrimary: template.default_is_primary ?? state.isPrimary,
    }));
  }

  function getCreateDefaultsFromTemplate(template: EventPlanTemplate | undefined): EventFormState {
    if (!template) return CREATE_EVENT_DEFAULTS;
    return {
      name: template.default_event_name || '',
      startDate: template.default_start_date || '',
      dueAt: toDateTimeLocalValue(template.default_due_at),
      isPrimary: template.default_is_primary ?? CREATE_EVENT_DEFAULTS.isPrimary,
    };
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

  function updateCreateWorkbenchItem(index: number, patch: Partial<CreateWorkbenchItemState>): void {
    setCreateWorkbenchItems((current) => (
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    ));
  }

  function previewWorkbenchItemTime(
    template: EventPlanTemplate | undefined,
    item: CreateWorkbenchItemState,
  ): string | null {
    if (!template) return null;
    const offsetDays = Math.max(0, Math.floor(item.offsetDays || 0));
    if (template.schedule_mode === 'from_start') {
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
  }

  function resetCreateForm(): void {
    setCreateForm(CREATE_EVENT_DEFAULTS);
    setCreateWorkbenchItems([]);
  }

  function beginCreate(): void {
    const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
    setCreateWorkbenchItems(buildCreateWorkbenchItems(selectedTemplate));
    setCreateForm((state) => {
      if (state.name || state.startDate || state.dueAt || state.isPrimary !== CREATE_EVENT_DEFAULTS.isPrimary) {
        return state;
      }
      return getCreateDefaultsFromTemplate(selectedTemplate);
    });
    setShowCreateEditor(true);
    setError(null);
  }

  function cancelCreate(): void {
    setShowCreateEditor(false);
    resetCreateForm();
    setSelectedTemplateId('');
    setError(null);
  }

  function closeModal(): void {
    setShowModal(false);
    cancelCreate();
    setShowTemplateManager(false);
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

  async function finishCreatedEvent(event: EventItem): Promise<void> {
    resetCreateForm();
    setShowCreateEditor(false);
    setSelectedTemplateId('');
    setShowModal(false);
    setShowTemplateManager(false);
    await refreshAll();
    setWorkbenchEvent(event);
  }

  async function syncCreatedWorkbenchItems(
    eventId: string,
    workbench: EventWorkbench,
    template: EventPlanTemplate,
    items: CreateWorkbenchItemState[],
  ): Promise<EventWorkbench> {
    const draftItems = workbench.plan_draft?.items ?? [];
    let nextWorkbench = workbench;
    for (let index = 0; index < Math.min(items.length, draftItems.length); index += 1) {
      const formItem = items[index];
      const draftItem = draftItems[index];
      const scheduledAt = previewWorkbenchItemTime(template, formItem);
      const patch: EventPlanDraftItemInput = {
        title: formItem.title.trim(),
        content: formItem.content.trim() || null,
      };
      if (scheduledAt) {
        if (draftItem.kind === 'appointment') {
          patch.starts_at = null;
          patch.ends_at = scheduledAt;
        } else {
          patch.scheduled_for = scheduledAt;
        }
      }
      nextWorkbench = await updateEventPlanDraftItem(eventId, draftItem.id, patch);
    }
    return nextWorkbench;
  }

  async function submitCreateEvent(): Promise<void> {
    if (submitting) return;
    const payload = buildCreatePayload();
    if (!payload) {
      return;
    }
    const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
    const workbenchItems = selectedTemplate
      ? (createWorkbenchItems.length ? createWorkbenchItems : buildCreateWorkbenchItems(selectedTemplate))
      : [];
    if (selectedTemplate && workbenchItems.some((item) => !item.title.trim())) {
      setError('请输入工作台内容标题');
      setShowCreateEditor(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const createdEvent = await createEvent(payload);
      if (selectedTemplate && selectedTemplate.items.length > 0) {
        const workbench = await applyEventPlanTemplate(createdEvent.id, selectedTemplate.id);
        const syncedWorkbench = await syncCreatedWorkbenchItems(createdEvent.id, workbench, selectedTemplate, workbenchItems);
        await finishCreatedEvent(syncedWorkbench.event ?? createdEvent);
        return;
      }
      await finishCreatedEvent(createdEvent);
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
    setSelectedTemplateId('');
    setShowCreateEditor(false);
    setShowModal(false);
    setShowTemplateManager(false);
    setError(null);
    setWorkbenchEvent(event);
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

              {showCreateEditor ? (
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[220px] flex-1 flex flex-col gap-2">
                        <label className="text-sm text-white/70">事件模板</label>
                        <select
                          aria-label="事件模板"
                          value={selectedTemplateId}
                          onChange={(event) => handleSelectTemplate(event.target.value)}
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
                        onClick={() => setShowTemplateManager(true)}
                        aria-label="进入模板工作台"
                        title="进入模板工作台"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <Settings size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 flex flex-col gap-4">
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

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-4">
                    <div>
                      <h4 className="text-base font-semibold text-white">事件工作台</h4>
                      <p className="mt-1 text-sm text-white/45">
                        {selectedTemplate
                          ? (createWorkbenchItems.length > 0 ? '工作台内容' : '暂无工作台内容')
                          : '选择模板后会显示工作台内容'}
                      </p>
                    </div>
                    {selectedTemplate && createWorkbenchItems.length > 0 ? (
                      <div className="grid gap-3 border-t border-blue-300/20 pt-4">
                        {createWorkbenchItems.map((item, index) => {
                          const previewTime = previewWorkbenchItemTime(selectedTemplate, item);
                          return (
                            <div
                              key={`${item.kind}-${index}`}
                              className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3"
                            >
                              <div className="grid gap-2 md:grid-cols-[76px_1fr_96px]">
                                <div className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm text-white/70">
                                  {item.kind === 'appointment' ? '日程' : '任务'}
                                </div>
                                <input
                                  aria-label={index === 0 ? '内容标题' : `内容标题 ${index + 1}`}
                                  value={item.title}
                                  onChange={(event) => updateCreateWorkbenchItem(index, { title: event.target.value })}
                                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                />
                                <input
                                  aria-label={index === 0 ? '相对天数' : `相对天数 ${index + 1}`}
                                  type="number"
                                  min={0}
                                  value={item.offsetDays}
                                  onChange={(event) => updateCreateWorkbenchItem(index, {
                                    offsetDays: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                                  })}
                                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                />
                              </div>
                              <input
                                aria-label={index === 0 ? '内容备注' : `内容备注 ${index + 1}`}
                                value={item.content}
                                onChange={(event) => updateCreateWorkbenchItem(index, { content: event.target.value })}
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                              />
                              {previewTime ? (
                                <div className="text-xs text-white/45">
                                  时间预览 {formatEventDateTime(previewTime)}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/10 bg-white/5 px-3 py-4 text-sm text-white/45">
                        暂无工作台内容
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelCreate}
                        disabled={submitting}
                        className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCreateEvent()}
                        disabled={submitting}
                        className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {submitting ? '提交中...' : '创建事件'}
                      </button>
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

      {showTemplateManager ? (
        <EventTemplateManagerModal
          templates={templates}
          onClose={() => setShowTemplateManager(false)}
          onChanged={loadTemplates}
        />
      ) : null}
    </>
  );
};

export default EventCountdownCard;
