import React, { useEffect, useMemo, useState } from 'react';

import { apiJson } from '../lib/api';

type EventItem = {
  id: string;
  user_id: number;
  name: string;
  due_at: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

type EventFormState = {
  name: string;
  dueAt: string;
  isPrimary: boolean;
};

const CREATE_EVENT_DEFAULTS: EventFormState = {
  name: '',
  dueAt: '',
  isPrimary: false,
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
  const [createForm, setCreateForm] = useState<EventFormState>(CREATE_EVENT_DEFAULTS);
  const [editForm, setEditForm] = useState<EventFormState>(CREATE_EVENT_DEFAULTS);

  useEffect(() => {
    void loadPrimaryEvent();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!showModal) return;
    void loadEvents();
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

  async function handleCreateEvent(): Promise<void> {
    if (submitting) return;
    const name = createForm.name.trim();
    if (!name) {
      setError('请输入事件名称');
      return;
    }
    if (!createForm.dueAt) {
      setError('请选择到期时间');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiJson<EventItem>('/todo/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          due_at: new Date(createForm.dueAt).toISOString(),
          is_primary: createForm.isPrimary,
        }),
      });
      resetCreateForm();
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建事件失败');
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

            <div className="h-[16.666%] min-h-[150px] border-b border-white/10 p-5 bg-white/[0.03]">
              <div className="grid h-full grid-cols-[1.4fr_1.1fr_auto_auto] gap-3 items-end">
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
                <button
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
                          <div className="grid grid-cols-[1.4fr_1.1fr_auto] gap-3 items-end">
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
    </>
  );
};

export default EventCountdownCard;
