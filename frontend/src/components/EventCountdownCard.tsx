import React, { useEffect, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';

import { apiJson } from '../lib/api';
import { applyEventPlanTemplate, listEventPlanTemplates } from '../lib/events/api';
import EventWorkbenchModal from './events/EventWorkbenchModal';
import EventTemplateManagerModal from './events/EventTemplateManagerModal';
import type { EventItem, EventPlanTemplate } from '../lib/events/types';

type EventFormState = {
  name: string;
  startDate: string;
  dueAt: string;
  isPrimary: boolean;
};

const CREATE_EVENT_DEFAULTS: EventFormState = {
  name: '',
  startDate: '',
  dueAt: '',
  isPrimary: true,
};

type EventCreatePayload = {
  name: string;
  start_date: string;
  due_at: string;
  is_primary: boolean;
};

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const localTime = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 16);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getCountdownDisplay(dueAt: string, nowMs: number): string {
  const dueMs = new Date(dueAt).getTime();
  if (Number.isNaN(dueMs)) return '--';
  const diff = Math.abs(dueMs - nowMs);
  if (diff <= 60 * 60 * 1000) {
    const totalSeconds = Math.floor(diff / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  if (diff <= 24 * 60 * 60 * 1000) {
    const totalMinutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  const totalHours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${String(hours).padStart(2, '0')}h`;
}

function getCountdownTone(dueAt: string, nowMs: number): 'upcoming' | 'due' | 'expired' {
  const dueMs = new Date(dueAt).getTime();
  if (Number.isNaN(dueMs)) return 'upcoming';
  const diff = dueMs - nowMs;
  if (Math.abs(diff) <= 60 * 1000) return 'due';
  return diff > 0 ? 'upcoming' : 'expired';
}

const EventCountdownCard: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [primaryEvent, setPrimaryEvent] = useState<EventItem | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [workbenchEvent, setWorkbenchEvent] = useState<EventItem | null>(null);
  const [templates, setTemplates] = useState<EventPlanTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [createForm, setCreateForm] = useState<EventFormState>(CREATE_EVENT_DEFAULTS);
  const [editForm, setEditForm] = useState<EventFormState>(CREATE_EVENT_DEFAULTS);

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
      const event = await apiJson<EventItem>('/todo/events/primary');
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
      const data = await apiJson<EventItem[]>('/todo/events');
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
    if (!template) return;
    const templateDueAt = toDateTimeLocal(template.default_due_at);
    setCreateForm((state) => ({
      ...state,
      name: state.name || template.default_event_name || '',
      startDate: state.startDate || template.default_start_date || '',
      dueAt: state.dueAt || templateDueAt,
      isPrimary: template.default_is_primary ?? state.isPrimary,
    }));
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([loadPrimaryEvent(), loadEvents()]);
  }

  function resetCreateForm(): void {
    setCreateForm(CREATE_EVENT_DEFAULTS);
  }

  function beginEdit(event: EventItem): void {
    setEditingEventId(event.id);
    setEditForm({
      name: event.name,
      startDate: event.start_date,
      dueAt: toDateTimeLocal(event.due_at),
      isPrimary: event.is_primary,
    });
    setError(null);
  }

  function cancelEdit(): void {
    setEditingEventId(null);
    setEditForm(CREATE_EVENT_DEFAULTS);
    setError(null);
  }

  function buildCreatePayload(): EventCreatePayload | null {
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

  async function createEvent(payload: EventCreatePayload): Promise<EventItem> {
    return apiJson<EventItem>('/todo/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async function finishCreatedEvent(event: EventItem): Promise<void> {
    resetCreateForm();
    cancelEdit();
    setSelectedTemplateId('');
    setShowModal(false);
    await refreshAll();
    setWorkbenchEvent(event);
  }

  async function handleCreateEvent(): Promise<void> {
    if (submitting) return;
    const payload = buildCreatePayload();
    if (!payload) return;

    setSubmitting(true);
    setError(null);
    try {
      const createdEvent = await createEvent(payload);
      await finishCreatedEvent(createdEvent);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建事件失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateWithTemplate(): Promise<void> {
    if (submitting) return;
    const payload = buildCreatePayload();
    if (!payload) return;
    if (!selectedTemplateId) {
      setError('请选择事件模板');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const createdEvent = await createEvent(payload);
      const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
      if (selectedTemplate && selectedTemplate.items.length === 0) {
        await finishCreatedEvent(createdEvent);
        return;
      }
      const workbench = await applyEventPlanTemplate(createdEvent.id, selectedTemplateId);
      await finishCreatedEvent(workbench.event ?? createdEvent);
    } catch (err) {
      setError(err instanceof Error ? err.message : '套用模板失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEdit(): Promise<void> {
    if (submitting || !editingEventId) return;
    const name = editForm.name.trim();
    if (!name) {
      setError('请输入事件名称');
      return;
    }
    if (!editForm.startDate) {
      setError('请选择开始日期');
      return;
    }
    if (!editForm.dueAt) {
      setError('请选择到期时间');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiJson<EventItem>(`/todo/events/${editingEventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          start_date: editForm.startDate,
          due_at: new Date(editForm.dueAt).toISOString(),
          is_primary: editForm.isPrimary,
        }),
      });
      cancelEdit();
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '编辑事件失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetPrimary(eventId: string): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiJson<EventItem>(`/todo/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      });
      if (editingEventId === eventId) {
        cancelEdit();
      }
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置主事件失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEvent(eventId: string): Promise<void> {
    if (submitting) return;
    if (!window.confirm('确定要删除这个事件吗？')) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiJson(`/todo/events/${eventId}`, { method: 'DELETE' });
      if (editingEventId === eventId) {
        cancelEdit();
      }
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除事件失败');
    } finally {
      setSubmitting(false);
    }
  }

  const numberClassName =
    countdownTone === 'due'
      ? 'bg-gradient-to-r from-cyan-300 via-violet-300 to-amber-300 bg-clip-text text-transparent'
      : countdownTone === 'expired'
        ? 'text-red-400'
        : 'text-sky-300';

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          if (primaryEvent) {
            setWorkbenchEvent(primaryEvent);
            return;
          }
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
          onClick={() => {
            setShowModal(false);
            cancelEdit();
          }}
        >
          <div
            className="w-[760px] max-w-[94vw] h-[76vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-14 border-b border-white/10 flex items-center justify-between px-5 bg-white/5">
              <h3 className="text-lg font-bold text-white">事件编辑</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  cancelEdit();
                }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="min-h-[220px] border-b border-white/10 p-5 bg-white/[0.03]">
              <div className="grid gap-3 md:grid-cols-[1.35fr_0.95fr_1.15fr]">
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
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="flex items-center gap-2 text-sm text-white/70 pb-2">
                  <input
                    type="checkbox"
                    checked={createForm.isPrimary}
                    onChange={(event) => setCreateForm((state) => ({ ...state, isPrimary: event.target.checked }))}
                    className="h-4 w-4 rounded border-white/20 bg-white/5"
                  />
                  设为主事件
                </label>
                <div className="min-w-[180px] flex-1 flex flex-col gap-2">
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
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateWithTemplate()}
                    disabled={submitting || loadingTemplates || !selectedTemplateId}
                    className="px-4 py-2 rounded-lg bg-amber-300 text-black font-semibold hover:bg-amber-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    套用模板
                  </button>
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
                <button
                  type="button"
                  onClick={handleCreateEvent}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? '提交中...' : '添加事件'}
                </button>
              </div>
            </div>

            <div className="flex-1 p-5 overflow-y-auto">
              {error ? <div className="mb-4 text-sm text-red-400">{error}</div> : null}

              {loading ? (
                <div className="h-full flex items-center justify-center text-white/35">加载中...</div>
              ) : events.length === 0 ? (
                <div className="h-full flex items-center justify-center text-white/35">暂无事件</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {events.map((event) => {
                    const isEditing = editingEventId === event.id;
                    return (
                      <div
                        key={event.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-4"
                      >
                        {isEditing ? (
                          <div className="grid grid-cols-[1.4fr_0.9fr_1.1fr_auto] gap-3 items-end">
                            <div className="flex flex-col gap-2">
                              <label className="text-sm text-white/70">事件名称</label>
                              <input
                                aria-label="编辑事件名称"
                                value={editForm.name}
                                onChange={(current) => setEditForm((state) => ({ ...state, name: current.target.value }))}
                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-sm text-white/70">开始日期</label>
                              <input
                                aria-label="编辑开始日期"
                                type="date"
                                value={editForm.startDate}
                                onChange={(current) => setEditForm((state) => ({ ...state, startDate: current.target.value }))}
                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-sm text-white/70">到期时间</label>
                              <input
                                aria-label="编辑到期时间"
                                type="datetime-local"
                                value={editForm.dueAt}
                                onChange={(current) => setEditForm((state) => ({ ...state, dueAt: current.target.value }))}
                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                              />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-white/70 pb-2">
                              <input
                                type="checkbox"
                                checked={editForm.isPrimary}
                                onChange={(current) => setEditForm((state) => ({ ...state, isPrimary: current.target.checked }))}
                                className="h-4 w-4 rounded border-white/20 bg-white/5"
                              />
                              主事件
                            </label>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-4">
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
                                创建于 {formatDateTime(event.created_at)}
                              </div>
                              <div className="mt-1 text-sm text-white/65">
                                开始于 {event.start_date}
                              </div>
                              <div className="mt-1 text-sm text-white/75">
                                到期于 {formatDateTime(event.due_at)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-2xl font-bold ${getCountdownTone(event.due_at, nowMs) === 'due' ? 'bg-gradient-to-r from-cyan-300 via-violet-300 to-amber-300 bg-clip-text text-transparent' : getCountdownTone(event.due_at, nowMs) === 'expired' ? 'text-red-400' : 'text-sky-300'}`}>
                                {getCountdownDisplay(event.due_at, nowMs)}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={cancelEdit}
                                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors"
                                disabled={submitting}
                              >
                                取消
                              </button>
                              <button
                                onClick={handleSaveEdit}
                                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                disabled={submitting}
                              >
                                保存
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  cancelEdit();
                                  setShowModal(false);
                                  setWorkbenchEvent(event);
                                }}
                                aria-label={`打开工作台：${event.name}`}
                                className="px-3 py-2 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                disabled={submitting}
                              >
                                打开工作台
                              </button>
                              <button
                                onClick={() => void handleSetPrimary(event.id)}
                                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                disabled={submitting || event.is_primary}
                              >
                                设为主事件
                              </button>
                              <button
                                onClick={() => beginEdit(event)}
                                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors"
                                disabled={submitting}
                              >
                                编辑
                              </button>
                              <button
                                onClick={() => void handleDeleteEvent(event.id)}
                                className="px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 transition-colors"
                                disabled={submitting}
                              >
                                删除
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
