import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, ShoppingBag, Trash2, X } from 'lucide-react';

import {
  createEventPlanTemplate,
  deleteEventPlanTemplate,
  createEvent,
  getPrimaryEvent,
  listEventPlanTemplates,
  listEventTemplateStore,
  listEvents,
  updateEvent,
  updateEventPlanTemplate,
  type EventCreateInput,
  type EventPlanTemplateAppConfigInput,
  type EventPlanTemplateInput,
  type EventPlanTemplateItemInput,
  type EventPlanTemplateWorkflowInput,
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
import { fetchVocabDecks, initializeVocabAppTask } from '../lib/vocab/api';
import { saveEventERCConfig, type ERCPracticeConfigInput, type ERCReviewConfigInput } from '../lib/erc/configSync';
import { apiJson } from '../lib/api';
import { dispatchOnboardingEvent, ONBOARDING_EVENTS } from '../lib/onboardingEvents';
import type { VocabDeck } from '../lib/vocab/types';
import AppModalFrame from './AppModalFrame';
import EventWorkbenchModal from './events/EventWorkbenchModal';
import WorkflowPhaseChips from './WorkflowPhaseChips';
import WorkflowPresetModal from './WorkflowPresetModal';
import {
  cloneWorkflowForm,
  createDefaultWorkflowForm,
  createWorkflowCopyDraft,
  createWorkflowFormFromPreset,
  isWorkflowFormDirty,
  normalizeWorkflowFormPhases,
  type WorkflowFormState,
  type WorkflowPreset,
} from './workflowPresetForm';
import type { Task } from './taskTypes';
import type { EventItem, EventPlanTemplate, EventTemplateStoreTemplate } from '../lib/events/types';

type EventFormState = {
  name: string;
  startDate: string;
  dueAt: string;
  isPrimary: boolean;
};

type ConfiguredAppState = {
  clientId: string;
  appType: 'vocab_today' | 'erc_practice' | 'erc_review';
  config: {
    deckId?: string;
    deckName?: string;
    dailyTargetCount?: number;
    dailyArticleTarget?: number;
    reviewScope?: 'due' | 'mistakes' | 'all';
    dailyQuestionTarget?: number;
    defaultFocusDuration: number; // in seconds
    addToTodayPlan: boolean;
  };
};

type AppEditorState = {
  appType: 'vocab_today' | 'erc_practice' | 'erc_review';
  deckId: string;
  dailyTargetCount: number;
  dailyArticleTarget: number;
  reviewScope: 'due' | 'mistakes' | 'all';
  dailyQuestionTarget: number;
  focusDurationMin: number;
  addToTodayPlan: boolean;
  index: number | null;
};

type CreateWorkbenchItemState = {
  clientId: string;
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
  source: 'manual' | 'store';
};

type EventCountdownCardProps = {
  variant?: 'floating' | 'nav';
};

const CREATE_EVENT_DEFAULTS: EventFormState = {
  name: '',
  startDate: '',
  dueAt: '',
  isPrimary: false,
};

const EventCountdownCard: React.FC<EventCountdownCardProps> = ({ variant = 'floating' }) => {
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
  const [createWorkflowDrafts, setCreateWorkflowDrafts] = useState<WorkflowPreset[]>([]);
  const [showCreateWorkflowModal, setShowCreateWorkflowModal] = useState(false);
  const [editingCreateWorkflowId, setEditingCreateWorkflowId] = useState<string | null>(null);
  const [createWorkflowForm, setCreateWorkflowForm] = useState<WorkflowFormState>(() => createDefaultWorkflowForm(false));
  const [createWorkflowFormBaseline, setCreateWorkflowFormBaseline] = useState<WorkflowFormState>(() =>
    createDefaultWorkflowForm(false),
  );
  const [createWorkflowError, setCreateWorkflowError] = useState<string | null>(null);
  const [createWorkflowSubmitting, setCreateWorkflowSubmitting] = useState(false);
  const [templates, setTemplates] = useState<EventPlanTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateStore, setShowTemplateStore] = useState(false);
  const [storeTemplates, setStoreTemplates] = useState<EventTemplateStoreTemplate[]>([]);
  const [selectedStoreTemplateId, setSelectedStoreTemplateId] = useState<string | null>(null);
  const [previewStoreTemplate, setPreviewStoreTemplate] = useState<EventTemplateStoreTemplate | null>(null);
  const [loadingTemplateStore, setLoadingTemplateStore] = useState(false);
  const [savingStoreTemplateId, setSavingStoreTemplateId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);
  const [templateConflict, setTemplateConflict] = useState<TemplateConflictState | null>(null);
  const [createArrangementEditor, setCreateArrangementEditor] = useState<CreateArrangementEditorState | null>(null);
  const [configuredApps, setConfiguredApps] = useState<ConfiguredAppState[]>([]);
  const [appEditor, setAppEditor] = useState<AppEditorState | null>(null);
  const [decks, setDecks] = useState<VocabDeck[]>([]);

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
    void fetchVocabDecks()
      .then((res) => setDecks(res))
      .catch((err) => console.error('Failed to load decks', err));
  }, [showModal]);

  const countdownText = useMemo(() => {
    if (!primaryEvent) return '--';
    return getCountdownDisplay(primaryEvent.due_at, nowMs);
  }, [primaryEvent, nowMs]);

  const countdownTone = useMemo(() => {
    if (!primaryEvent) return 'upcoming';
    return getCountdownTone(primaryEvent.due_at, nowMs);
  }, [primaryEvent, nowMs]);

  const createWorkflowTaskOptions = buildCreateWorkflowTaskOptions(createWorkbenchItems, configuredApps, createForm.name);

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

  async function loadTemplateStore(): Promise<void> {
    setLoadingTemplateStore(true);
    try {
      const data = await listEventTemplateStore();
      setStoreTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load event template store', err);
      setError(err instanceof Error ? err.message : '事件商店加载失败');
    } finally {
      setLoadingTemplateStore(false);
    }
  }

  function makeCreateArrangementClientId(): string {
    return `arrangement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function makeConfiguredAppClientId(): string {
    return `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getConfiguredAppTaskTitle(app: ConfiguredAppState): string {
    if (app.appType === 'vocab_today') {
      return `今日单词 (应用：${app.config.deckName || '未命名词书'})`;
    }
    if (app.appType === 'erc_practice') {
      return '真题练习 (应用)';
    }
    return '错题复习 (应用)';
  }

  function buildCreateWorkbenchItems(template: EventPlanTemplate | undefined): CreateWorkbenchItemState[] {
    if (!template) return [];
    return template.items.map((item) => ({
      clientId: typeof item.details?.client_id === 'string' ? item.details.client_id : makeCreateArrangementClientId(),
      kind: item.kind,
      title: item.title,
      content: item.content ?? '',
      offsetDays: Math.max(0, Math.floor(item.offset_days || 0)),
    }));
  }

  function buildConfiguredApps(template: EventPlanTemplate | undefined): ConfiguredAppState[] {
    if (!template?.app_configs) return [];
    return template.app_configs
      .filter((item) => ['vocab_today', 'erc_practice', 'erc_review'].includes(item.app_type))
      .map((item) => ({
        clientId: item.client_id || makeConfiguredAppClientId(),
        appType: item.app_type,
        config: {
          deckId: typeof item.config.deckId === 'string' ? item.config.deckId : undefined,
          deckName: typeof item.config.deckName === 'string' ? item.config.deckName : undefined,
          dailyTargetCount: typeof item.config.dailyTargetCount === 'number' ? item.config.dailyTargetCount : undefined,
          dailyArticleTarget: typeof item.config.dailyArticleTarget === 'number' ? item.config.dailyArticleTarget : undefined,
          reviewScope: item.config.reviewScope === 'mistakes' || item.config.reviewScope === 'all'
            ? item.config.reviewScope
            : item.config.reviewScope === 'due'
              ? 'due'
              : undefined,
          dailyQuestionTarget: typeof item.config.dailyQuestionTarget === 'number' ? item.config.dailyQuestionTarget : undefined,
          defaultFocusDuration: typeof item.config.defaultFocusDuration === 'number'
            ? item.config.defaultFocusDuration
            : 25 * 60,
          addToTodayPlan: typeof item.config.addToTodayPlan === 'boolean' ? item.config.addToTodayPlan : true,
        },
      }));
  }

  function buildWorkflowDrafts(template: EventPlanTemplate | undefined): WorkflowPreset[] {
    if (!template?.workflows) return [];
    const now = new Date().toISOString();
    return template.workflows.map((workflow) => ({
      id: workflow.client_id || makeCreateWorkflowDraftId(),
      user_id: 0,
      event_id: null,
      name: workflow.name,
      focus_duration: workflow.focus_duration,
      break_duration: workflow.break_duration,
      default_focus_timer_mode: workflow.default_focus_timer_mode,
      phases: normalizeWorkflowFormPhases(workflow.phases, workflow.default_focus_timer_mode),
      is_default: false,
      created_at: now,
      updated_at: now,
    }));
  }

  function buildTaskOption(
    id: string,
    title: string,
    content: string | null,
    eventName: string,
    appTaskType: Task['app_task_type'] = null,
  ): Task {
    const now = new Date().toISOString();
    return {
      id,
      user_id: 0,
      title: title || '未命名任务',
      content,
      status: 'todo',
      current_cycle_count: 0,
      target_cycle_count: 0,
      cycle_period: 'daily',
      cycle_every_days: null,
      event: eventName.trim(),
      event_ids: [],
      event_id: null,
      is_recurring: false,
      period_type: 'once',
      custom_period_days: null,
      max_completions_per_period: 1,
      weekday_only: false,
      time_inherits_from_event: false,
      time_overridden: false,
      task_type: 'focus',
      app_task_type: appTaskType,
      actual_duration: 0,
      start_date: null,
      due_date: null,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    };
  }

  function buildCreateWorkflowTaskOptions(
    items: CreateWorkbenchItemState[],
    apps: ConfiguredAppState[],
    eventName: string,
  ): Task[] {
    const manualTaskOptions = items
      .filter((item) => item.kind === 'task')
      .map((item) => buildTaskOption(item.clientId, item.title, item.content || null, eventName));
    const appTaskOptions = apps.map((app) => (
      buildTaskOption(app.clientId, getConfiguredAppTaskTitle(app), getAppConfigSummary(app), eventName, app.appType)
    ));
    return [...appTaskOptions, ...manualTaskOptions];
  }

  function applyTemplateToCreateForm(template: EventPlanTemplate): void {
    setCreateForm({
      name: template.default_event_name || template.name,
      startDate: template.default_start_date || '',
      dueAt: toDateTimeLocalValue(template.default_due_at),
      isPrimary: template.default_is_primary ?? CREATE_EVENT_DEFAULTS.isPrimary,
    });
    setCreateWorkbenchItems(buildCreateWorkbenchItems(template));
    setConfiguredApps(buildConfiguredApps(template));
    setCreateWorkflowDrafts(buildWorkflowDrafts(template));
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
    dispatchOnboardingEvent(ONBOARDING_EVENTS.templateApplied);
  }

  function removeCreateWorkbenchItem(index: number): void {
    const removedItem = createWorkbenchItems[index];
    setCreateWorkbenchItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (removedItem?.kind === 'task') {
      clearCreateWorkflowTaskBinding(removedItem.clientId);
    }
  }

  function beginAddCreateArrangementItem(kind: CreateWorkbenchItemState['kind']): void {
    setCreateArrangementEditor({
      clientId: makeCreateArrangementClientId(),
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
      clientId: createArrangementEditor.clientId,
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

  function makeCreateWorkflowDraftId(): string {
    return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function buildCreateWorkflowPayload(form: WorkflowFormState, taskIdMap?: Map<string, string>) {
    const focusDuration = form.phases.find((phase) => phase.phase_type === 'focus')?.duration ?? 25 * 60;
    const breakDuration = form.phases.find((phase) => phase.phase_type === 'break')?.duration ?? 5 * 60;
    const defaultFocusTimerMode = form.phases.find((phase) => phase.phase_type === 'focus')?.timer_mode ?? 'countdown';

    return {
      name: form.name.trim(),
      focus_duration: focusDuration,
      break_duration: breakDuration,
      default_focus_timer_mode: defaultFocusTimerMode,
      phases: form.phases.map((phase) => ({
        phase_type: phase.phase_type,
        duration: phase.duration,
        timer_mode: phase.timer_mode,
        task_id: phase.task_id ? (taskIdMap ? taskIdMap.get(phase.task_id) ?? null : phase.task_id) : null,
      })),
      is_default: false,
    };
  }

  function buildCreateWorkflowDraft(form: WorkflowFormState, existing?: WorkflowPreset): WorkflowPreset {
    const payload = buildCreateWorkflowPayload(form);
    const now = new Date().toISOString();
    return {
      id: existing?.id ?? makeCreateWorkflowDraftId(),
      user_id: existing?.user_id ?? 0,
      event_id: null,
      name: payload.name,
      focus_duration: payload.focus_duration,
      break_duration: payload.break_duration,
      default_focus_timer_mode: payload.default_focus_timer_mode,
      phases: normalizeWorkflowFormPhases(payload.phases, payload.default_focus_timer_mode),
      is_default: false,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
  }

  function validateCreateWorkflowForm(form: WorkflowFormState): string | null {
    if (!form.name.trim()) return '请输入工作流名称';
    if (!form.phases.length) return '请至少保留一个阶段';
    for (let index = 0; index < form.phases.length; index += 1) {
      const phase = form.phases[index];
      if (!phase.duration || phase.duration < 60) return '阶段时长至少 1 分钟';
      if (index > 0 && form.phases[index - 1].phase_type === phase.phase_type) {
        return '专注与休息阶段需要交替排列';
      }
    }
    if (form.phases[0].phase_type !== 'focus') return '工作流需要以专注阶段开始';
    return null;
  }

  function replaceCreateWorkflowDraftForm(nextForm: WorkflowFormState, nextEditingId: string | null): void {
    const snapshot = cloneWorkflowForm(nextForm);
    setEditingCreateWorkflowId(nextEditingId);
    setCreateWorkflowForm(snapshot);
    setCreateWorkflowFormBaseline(cloneWorkflowForm(snapshot));
    setCreateWorkflowError(null);
  }

  function isCreateWorkflowFormDirty(): boolean {
    return isWorkflowFormDirty(createWorkflowForm, createWorkflowFormBaseline);
  }

  function confirmCreateWorkflowDiscard(): boolean {
    if (!isCreateWorkflowFormDirty()) return true;
    return window.confirm('当前工作流还有未保存修改，确定要放弃吗？');
  }

  function openNewCreateWorkflow(): void {
    if (!confirmCreateWorkflowDiscard()) return;
    replaceCreateWorkflowDraftForm(createDefaultWorkflowForm(false), null);
    setShowCreateWorkflowModal(true);
  }

  function closeCreateWorkflowModal(): void {
    if (!confirmCreateWorkflowDiscard()) return;
    setShowCreateWorkflowModal(false);
  }

  function editCreateWorkflowDraft(workflow: WorkflowPreset): void {
    if (!confirmCreateWorkflowDiscard()) return;
    replaceCreateWorkflowDraftForm(createWorkflowFormFromPreset(workflow), workflow.id);
    setShowCreateWorkflowModal(true);
  }

  function copyCreateWorkflowDraft(workflow: WorkflowPreset): void {
    if (!confirmCreateWorkflowDiscard()) return;
    replaceCreateWorkflowDraftForm(createWorkflowCopyDraft(workflow), null);
    setShowCreateWorkflowModal(true);
  }

  function resetCreateWorkflowForm(): void {
    replaceCreateWorkflowDraftForm(createDefaultWorkflowForm(false), null);
  }

  function clearCreateWorkflowTaskBinding(taskId: string): void {
    const clearPhases = (phases: WorkflowFormState['phases']) => (
      phases.map((phase) => (
        phase.task_id === taskId ? { ...phase, task_id: null } : phase
      ))
    );
    setCreateWorkflowForm((state) => ({
      ...state,
      phases: clearPhases(state.phases),
    }));
    setCreateWorkflowDrafts((current) => (
      current.map((workflow) => ({
        ...workflow,
        phases: workflow.phases.map((phase) => (
          phase.task_id === taskId ? { ...phase, task_id: null } : phase
        )),
      }))
    ));
  }

  function addCreateWorkflowPhase(): void {
    setCreateWorkflowForm((state) => ({
      ...state,
      phases: normalizeWorkflowFormPhases([
        ...state.phases,
        { duration: 5 * 60, timer_mode: 'countdown', task_id: null },
        { duration: 5 * 60, timer_mode: 'countdown', task_id: null },
      ]),
    }));
  }

  function removeCreateWorkflowPhase(index: number): void {
    setCreateWorkflowForm((state) => {
      if (state.phases.length <= 2) return state;
      const groupStart = index % 2 === 0 ? index : index - 1;
      return {
        ...state,
        phases: normalizeWorkflowFormPhases(
          state.phases.filter((_, phaseIndex) => phaseIndex !== groupStart && phaseIndex !== groupStart + 1),
        ),
      };
    });
  }

  function deleteCreateWorkflowDraft(workflowId: string): void {
    if (!window.confirm('确认删除该工作流吗？')) return;
    setCreateWorkflowDrafts((current) => current.filter((workflow) => workflow.id !== workflowId));
    if (editingCreateWorkflowId === workflowId) {
      resetCreateWorkflowForm();
      setShowCreateWorkflowModal(false);
    }
  }

  function submitCreateWorkflowDraft(): void {
    if (createWorkflowSubmitting) return;
    const validationError = validateCreateWorkflowForm(createWorkflowForm);
    if (validationError) {
      setCreateWorkflowError(validationError);
      return;
    }
    setCreateWorkflowSubmitting(true);
    const existing = editingCreateWorkflowId
      ? createWorkflowDrafts.find((workflow) => workflow.id === editingCreateWorkflowId)
      : undefined;
    const nextDraft = buildCreateWorkflowDraft(createWorkflowForm, existing);
    setCreateWorkflowDrafts((current) => {
      if (!editingCreateWorkflowId) return [...current, nextDraft];
      return current.map((workflow) => (workflow.id === editingCreateWorkflowId ? nextDraft : workflow));
    });
    replaceCreateWorkflowDraftForm(createDefaultWorkflowForm(false), null);
    setShowCreateWorkflowModal(false);
    setCreateWorkflowSubmitting(false);
  }

  async function createWorkflowDraftsForEvent(
    createdEvent: EventItem,
    workflows: WorkflowPreset[],
    taskIdMap: Map<string, string>,
  ): Promise<void> {
    for (const workflow of workflows) {
      await apiJson<WorkflowPreset>(`/todo/events/${createdEvent.id}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCreateWorkflowPayload(createWorkflowFormFromPreset(workflow), taskIdMap)),
      });
    }
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
  }

  function resetCreateForm(): void {
    setCreateForm(CREATE_EVENT_DEFAULTS);
    setCreateWorkbenchItems([]);
    setCreateWorkflowDrafts([]);
    setShowCreateWorkflowModal(false);
    replaceCreateWorkflowDraftForm(createDefaultWorkflowForm(false), null);
    setSelectedTemplateId('');
    setTemplateStatus(null);
    setTemplateConflict(null);
    setCreateArrangementEditor(null);
    setConfiguredApps([]);
    setAppEditor(null);
  }

  function beginCreate(): void {
    setShowCreateEditor(true);
    setError(null);
    setTemplateStatus(null);
    dispatchOnboardingEvent(ONBOARDING_EVENTS.addEventOpened);
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
    dispatchOnboardingEvent(ONBOARDING_EVENTS.eventOverviewClosed);
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

  async function createWorkbenchItemsForEvent(
    createdEvent: EventItem,
    items: CreateWorkbenchItemState[],
  ): Promise<Map<string, string>> {
    const taskIdMap = new Map<string, string>();
    for (let index = 0; index < items.length; index += 1) {
      const formItem = items[index];
      const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
      const scheduledAt = previewWorkbenchItemTime(formItem, selectedTemplate);
      if (formItem.kind === 'task') {
        const payload: EventArrangementTaskInput = {
          title: formItem.title.trim(),
          content: formItem.content.trim() || null,
          event: createdEvent.name,
          eventId: createdEvent.id,
          periodType: 'once',
          customPeriodDays: null,
          maxCompletionsPerPeriod: 1,
          weekdayOnly: false,
          timeInheritsFromEvent: false,
          timeOverridden: Boolean(scheduledAt),
          taskType: 'focus',
          appTaskType: null,
          startDate: null,
          dueDate: scheduledAt,
        };
        const createdTask = await createEventArrangementTask(createdEvent, payload);
        taskIdMap.set(formItem.clientId, createdTask.id);
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
    return taskIdMap;
  }

  function buildTemplateItems(): EventPlanTemplateItemInput[] | null {
    const items = createWorkbenchItems.map((item, index) => ({
      kind: item.kind,
      title: item.title.trim(),
      content: item.content.trim() || null,
      offset_days: Math.max(0, Math.floor(item.offsetDays || 0)),
      sort_order: index,
      details: {
        client_id: item.clientId,
        period_type: 'once',
        custom_period_days: null,
        max_completions_per_period: 1,
        weekday_only: false,
        time_inherits_from_event: false,
        time_overridden: true,
        task_type: item.kind === 'task' ? 'focus' : undefined,
      },
    }));
    if (items.some((item) => !item.title)) {
      setError('请输入安排内容标题');
      return null;
    }
    return items;
  }

  function buildTemplateAppConfigs(): EventPlanTemplateAppConfigInput[] {
    return configuredApps.map((app) => ({
      client_id: app.clientId,
      app_type: app.appType,
      config: {
        deckId: app.config.deckId ?? null,
        deckName: app.config.deckName ?? null,
        dailyTargetCount: app.config.dailyTargetCount ?? null,
        dailyArticleTarget: app.config.dailyArticleTarget ?? null,
        reviewScope: app.config.reviewScope ?? null,
        dailyQuestionTarget: app.config.dailyQuestionTarget ?? null,
        defaultFocusDuration: app.config.defaultFocusDuration,
        addToTodayPlan: app.config.addToTodayPlan,
      },
    }));
  }

  function buildTemplateWorkflows(): EventPlanTemplateWorkflowInput[] {
    return createWorkflowDrafts.map((workflow) => ({
      client_id: workflow.id,
      name: workflow.name,
      focus_duration: workflow.focus_duration,
      break_duration: workflow.break_duration,
      default_focus_timer_mode: workflow.default_focus_timer_mode,
      phases: workflow.phases.map((phase) => ({
        phase_type: phase.phase_type,
        duration: phase.duration,
        timer_mode: phase.timer_mode,
        task_id: phase.task_id,
        focus_work_type: phase.focus_work_type,
        is_temporary: phase.is_temporary,
        record_focus: phase.record_focus,
      })),
    }));
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
      app_configs: buildTemplateAppConfigs(),
      workflows: buildTemplateWorkflows(),
    };
  }

  function buildTemplateStorePayload(template: EventTemplateStoreTemplate): EventPlanTemplateInput {
    return {
      name: template.name,
      description: template.description,
      schedule_mode: template.schedule_mode,
      default_event_name: template.default_event_name ?? template.name,
      default_start_date: template.default_start_date ?? null,
      default_due_at: template.default_due_at ?? null,
      default_is_primary: template.default_is_primary ?? false,
      items: template.items.map((item) => ({
        kind: item.kind,
        title: item.title,
        content: item.content,
        offset_days: item.offset_days,
        sort_order: item.sort_order,
        details: item.details ?? {},
      })),
      app_configs: template.app_configs ?? [],
      workflows: template.workflows ?? [],
    };
  }

  function rememberSavedTemplate(template: EventPlanTemplate, status: string): void {
    setTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
    setSelectedTemplateId(template.id);
    setTemplateStatus(status);
    setShowTemplateStore(false);
    setPreviewStoreTemplate(null);
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
        setTemplateConflict({ template: sameNameTemplate, payload, source: 'manual' });
        return;
      }
      const createdTemplate = await createEventPlanTemplate(payload);
      rememberSavedTemplate(createdTemplate, '已保存为模板');
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
      const createdTemplate = await createEventPlanTemplate(templateConflict.payload);
      const source = templateConflict.source;
      setTemplateConflict(null);
      rememberSavedTemplate(createdTemplate, '已保存为模板');
      if (source === 'store') {
        dispatchOnboardingEvent(ONBOARDING_EVENTS.storeTemplateSaved);
      }
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
      const updatedTemplate = await updateEventPlanTemplate(templateConflict.template.id, templateConflict.payload);
      const source = templateConflict.source;
      setTemplateConflict(null);
      rememberSavedTemplate(updatedTemplate, '已更新模板');
      if (source === 'store') {
        dispatchOnboardingEvent(ONBOARDING_EVENTS.storeTemplateSaved);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新模板失败');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleSaveStoreTemplate(template: EventTemplateStoreTemplate): Promise<void> {
    if (savingTemplate || savingStoreTemplateId) return;
    const payload = buildTemplateStorePayload(template);
    setSavingTemplate(true);
    setSavingStoreTemplateId(template.id);
    setError(null);
    setTemplateStatus(null);
    try {
      const nextTemplates = await listEventPlanTemplates();
      setTemplates(Array.isArray(nextTemplates) ? nextTemplates : []);
      const sameNameTemplate = nextTemplates.find((item) => item.name.trim() === payload.name.trim());
      if (sameNameTemplate) {
        setTemplateConflict({ template: sameNameTemplate, payload, source: 'store' });
        return;
      }
      const createdTemplate = await createEventPlanTemplate(payload);
      rememberSavedTemplate(createdTemplate, '已保存到我的事件模板');
      dispatchOnboardingEvent(ONBOARDING_EVENTS.storeTemplateSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存模板失败');
    } finally {
      setSavingStoreTemplateId(null);
      setSavingTemplate(false);
    }
  }

  async function handleDeleteSelectedTemplate(): Promise<void> {
    if (savingTemplate || deletingTemplate || !selectedTemplateId) return;
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) {
      setError('请选择事件模板');
      return;
    }
    if (!window.confirm(`确认删除事件模板「${template.name}」吗？`)) return;

    setDeletingTemplate(true);
    setError(null);
    setTemplateStatus(null);
    try {
      await deleteEventPlanTemplate(template.id);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      setSelectedTemplateId('');
      setTemplateStatus('已删除模板');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除模板失败');
    } finally {
      setDeletingTemplate(false);
    }
  }

  function openStoreTemplatePreview(template: EventTemplateStoreTemplate): void {
    setSelectedStoreTemplateId(template.id);
    setPreviewStoreTemplate(template);
    dispatchOnboardingEvent(ONBOARDING_EVENTS.storeTemplateSelected);
  }

  async function submitCreateEvent(): Promise<void> {
    if (submitting) return;
    const payload = buildCreatePayload();
    if (!payload) {
      return;
    }
    const workbenchItems = createWorkbenchItems;
    const workflowDrafts = createWorkflowDrafts;
    if (workbenchItems.some((item) => !item.title.trim())) {
      setError('请输入安排内容标题');
      setShowCreateEditor(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const shouldPromoteToPrimary = workflowDrafts.length > 0 && !payload.is_primary && primaryEvent === null;
      const createdEvent = await createEvent(payload);
      const workflowTaskIdMap = new Map<string, string>();
      const ercApps: {
        practice?: ERCPracticeConfigInput;
        practiceClientId?: string;
        review?: ERCReviewConfigInput;
        reviewClientId?: string;
      } = {};

      for (const app of configuredApps) {
        if (app.appType === 'vocab_today') {
          const appTaskStatus = await initializeVocabAppTask({
            deck_id: app.config.deckId!,
            daily_target_count: app.config.dailyTargetCount!,
            default_focus_duration: app.config.defaultFocusDuration,
            add_to_today_plan: app.config.addToTodayPlan,
            event_id: createdEvent.id,
          });
          if (appTaskStatus.task_id) workflowTaskIdMap.set(app.clientId, appTaskStatus.task_id);
        } else if (app.appType === 'erc_practice') {
          ercApps.practice = {
            daily_article_target: app.config.dailyArticleTarget!,
            default_focus_duration: app.config.defaultFocusDuration,
            add_to_today_plan: app.config.addToTodayPlan,
          };
          ercApps.practiceClientId = app.clientId;
        } else if (app.appType === 'erc_review') {
          ercApps.review = {
            review_scope: app.config.reviewScope!,
            daily_question_target: app.config.dailyQuestionTarget!,
            default_focus_duration: app.config.defaultFocusDuration,
            add_to_today_plan: app.config.addToTodayPlan,
          };
          ercApps.reviewClientId = app.clientId;
        }
      }

      if (ercApps.practice || ercApps.review) {
        const ercStatus = await saveEventERCConfig({
          eventId: createdEvent.id,
          practice: ercApps.practice,
          review: ercApps.review,
        });
        if (ercApps.practiceClientId && ercStatus.practice.task_id) {
          workflowTaskIdMap.set(ercApps.practiceClientId, ercStatus.practice.task_id);
        }
        if (ercApps.reviewClientId && ercStatus.review.task_id) {
          workflowTaskIdMap.set(ercApps.reviewClientId, ercStatus.review.task_id);
        }
      }

      if (workbenchItems.length > 0) {
        const manualTaskIdMap = await createWorkbenchItemsForEvent(createdEvent, workbenchItems);
        manualTaskIdMap.forEach((taskId, clientId) => workflowTaskIdMap.set(clientId, taskId));
      }

      if (workflowDrafts.length > 0) {
        await createWorkflowDraftsForEvent(createdEvent, workflowDrafts, workflowTaskIdMap);
      }

      if (shouldPromoteToPrimary) {
        await updateEvent(createdEvent.id, { is_primary: true });
      }

      await finishCreatedEvent();
      dispatchOnboardingEvent(ONBOARDING_EVENTS.eventCreated);
      if (payload.is_primary || workflowDrafts.length > 0) {
        window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      }
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
        ? 'text-[var(--ark-danger)]'
        : 'text-[var(--ark-countdown-text)]';
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const templateStoreCategories = useMemo(() => {
    const groups = new Map<string, EventTemplateStoreTemplate[]>();
    for (const template of storeTemplates) {
      const category = template.category || '通用';
      groups.set(category, [...(groups.get(category) ?? []), template]);
    }
    return Array.from(groups.entries());
  }, [storeTemplates]);

  function beginAddConfiguredApp(): void {
    const unconfiguredTypes = (['vocab_today', 'erc_practice', 'erc_review'] as const)
      .filter(type => !configuredApps.some(app => app.appType === type));
      
    if (unconfiguredTypes.length === 0) return;
    
    const initialType = unconfiguredTypes[0];
    setAppEditor({
      appType: initialType,
      deckId: initialType === 'vocab_today' ? (decks[0]?.id || '') : '',
      dailyTargetCount: 20,
      dailyArticleTarget: 1,
      reviewScope: 'due',
      dailyQuestionTarget: 10,
      focusDurationMin: 25,
      addToTodayPlan: true,
      index: null,
    });
    setError(null);
  }

  function beginEditConfiguredApp(index: number): void {
    const app = configuredApps[index];
    if (!app) return;
    setAppEditor({
      appType: app.appType,
      deckId: app.config.deckId || '',
      dailyTargetCount: app.config.dailyTargetCount || 20,
      dailyArticleTarget: app.config.dailyArticleTarget || 1,
      reviewScope: app.config.reviewScope || 'due',
      dailyQuestionTarget: app.config.dailyQuestionTarget || 10,
      focusDurationMin: Math.round(app.config.defaultFocusDuration / 60),
      addToTodayPlan: app.config.addToTodayPlan,
      index,
    });
    setError(null);
  }

  function saveAppEditorConfig(): void {
    if (!appEditor) return;
    
    if (appEditor.appType === 'vocab_today' && !appEditor.deckId) {
      setError('请选择词书');
      return;
    }

    const deckName = appEditor.appType === 'vocab_today'
      ? (decks.find(d => d.id === appEditor.deckId)?.name || '未命名词书')
      : undefined;

    const nextApp: ConfiguredAppState = {
      clientId: appEditor.index === null
        ? makeConfiguredAppClientId()
        : configuredApps[appEditor.index]?.clientId ?? makeConfiguredAppClientId(),
      appType: appEditor.appType,
      config: {
        deckId: appEditor.appType === 'vocab_today' ? appEditor.deckId : undefined,
        deckName,
        dailyTargetCount: appEditor.appType === 'vocab_today' ? appEditor.dailyTargetCount : undefined,
        dailyArticleTarget: appEditor.appType === 'erc_practice' ? appEditor.dailyArticleTarget : undefined,
        reviewScope: appEditor.appType === 'erc_review' ? appEditor.reviewScope : undefined,
        dailyQuestionTarget: appEditor.appType === 'erc_review' ? appEditor.dailyQuestionTarget : undefined,
        defaultFocusDuration: appEditor.focusDurationMin * 60,
        addToTodayPlan: appEditor.addToTodayPlan,
      },
    };

    setConfiguredApps((current) => {
      if (appEditor.index === null) return [...current, nextApp];
      return current.map((item, idx) => (idx === appEditor.index ? nextApp : item));
    });
    setAppEditor(null);
    setError(null);
  }

  function deleteConfiguredApp(): void {
    if (!appEditor || appEditor.index === null) return;
    const targetIdx = appEditor.index;
    const removedApp = configuredApps[targetIdx];
    setConfiguredApps((current) => current.filter((_, idx) => idx !== targetIdx));
    if (removedApp) {
      clearCreateWorkflowTaskBinding(removedApp.clientId);
    }
    setAppEditor(null);
    setError(null);
  }

  function getAppConfigSummary(app: ConfiguredAppState): string {
    if (app.appType === 'vocab_today') {
      return `词书: ${app.config.deckName || '加载中...'}, 每日 ${app.config.dailyTargetCount} 词, 专注 ${Math.round(app.config.defaultFocusDuration / 60)} 分钟`;
    }
    if (app.appType === 'erc_practice') {
      return `每日 ${app.config.dailyArticleTarget} 篇文章, 专注 ${Math.round(app.config.defaultFocusDuration / 60)} 分钟`;
    }
    return `范围: ${app.config.reviewScope === 'due' ? '到期复习' : app.config.reviewScope === 'mistakes' ? '错题复习' : '全部'}, 每日 ${app.config.dailyQuestionTarget} 题, 专注 ${Math.round(app.config.defaultFocusDuration / 60)} 分钟`;
  }

  function getStoreAppName(appType: string): string {
    if (appType === 'vocab_today') return '今日单词';
    if (appType === 'erc_practice') return '真题练习';
    if (appType === 'erc_review') return '错题复习';
    return appType;
  }

  function getStoreAppSummary(app: EventTemplateStoreTemplate['app_configs'][number]): string {
    const config = app.config ?? {};
    const focusDuration = typeof config.defaultFocusDuration === 'number'
      ? `专注 ${Math.round(config.defaultFocusDuration / 60)} 分钟`
      : null;
    if (app.app_type === 'vocab_today') {
      const deckName = typeof config.deckName === 'string' && config.deckName
        ? config.deckName
        : typeof config.deckId === 'string'
          ? config.deckId
          : '未设置';
      const dailyTarget = typeof config.dailyTargetCount === 'number' ? `每日 ${config.dailyTargetCount} 词` : null;
      return [`词书 ${deckName}`, dailyTarget, focusDuration].filter(Boolean).join(' · ');
    }
    if (app.app_type === 'erc_practice') {
      const dailyTarget = typeof config.dailyArticleTarget === 'number' ? `每日 ${config.dailyArticleTarget} 篇文章` : null;
      return [dailyTarget, focusDuration].filter(Boolean).join(' · ');
    }
    if (app.app_type === 'erc_review') {
      const scope = config.reviewScope === 'due'
        ? '到期复习'
        : config.reviewScope === 'mistakes'
          ? '错题复习'
          : config.reviewScope === 'all'
            ? '全部'
            : null;
      const dailyTarget = typeof config.dailyQuestionTarget === 'number' ? `每日 ${config.dailyQuestionTarget} 题` : null;
      return [scope, dailyTarget, focusDuration].filter(Boolean).join(' · ');
    }
    return focusDuration ?? '应用配置';
  }

  function getStoreTemplateBindingName(template: EventTemplateStoreTemplate, taskId: string | null | undefined): string | null {
    if (!taskId) return null;
    const app = template.app_configs?.find((item) => item.client_id === taskId);
    if (app) return getStoreAppName(app.app_type);
    const workbenchItem = template.items.find((item) => item.details?.client_id === taskId);
    if (workbenchItem) return workbenchItem.title;
    return taskId;
  }

  function renderAppEditor() {
    if (!appEditor) return null;
    const unconfiguredTypes = (['vocab_today', 'erc_practice', 'erc_review'] as const)
      .filter(type => !configuredApps.some(app => app.appType === type) || (appEditor.index !== null && appEditor.appType === type));

    return (
      <div className="grid gap-3 rounded-lg border border-blue-300/20 bg-blue-400/10 p-3 text-left">
        {appEditor.index === null ? (
          <label className="grid gap-1 text-xs text-ark-text-muted">
            选择应用
            <select
              aria-label="选择应用"
              value={appEditor.appType}
              onChange={(event) => {
                const val = event.target.value as AppEditorState['appType'];
                setAppEditor((current) => {
                  if (!current) return current;
                  return {
                    ...current,
                    appType: val,
                    deckId: val === 'vocab_today' ? (decks[0]?.id || '') : '',
                  };
                });
              }}
              className="rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {unconfiguredTypes.map((type) => (
                <option key={type} value={type}>
                  {type === 'vocab_today' ? '今日单词 (背单词)' : type === 'erc_practice' ? '真题练习 (ERC)' : '错题复习 (ERC)'}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="text-sm font-medium text-ark-text">
            应用：
            <span className="text-blue-300">
              {appEditor.appType === 'vocab_today' ? '今日单词' : appEditor.appType === 'erc_practice' ? '真题练习' : '错题复习'}
            </span>
          </div>
        )}

        {appEditor.appType === 'vocab_today' ? (
          <>
            <label className="grid gap-1 text-xs text-ark-text-muted">
              选择词书
              <select
                aria-label="选择词书"
                value={appEditor.deckId}
                onChange={(event) => setAppEditor((current) => (
                  current ? { ...current, deckId: event.target.value } : current
                ))}
                className="rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="">选择词书</option>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({deck.word_count}词)
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-ark-text-muted">
              每日目标词数
              <input
                aria-label="每日目标词数"
                type="number"
                min={1}
                max={500}
                value={appEditor.dailyTargetCount}
                onChange={(event) => setAppEditor((current) => (
                  current
                    ? { ...current, dailyTargetCount: Math.max(1, Math.min(500, Number(event.target.value) || 20)) }
                    : current
                ))}
                className="rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </label>
          </>
        ) : null}

        {appEditor.appType === 'erc_practice' ? (
          <label className="grid gap-1 text-xs text-ark-text-muted">
            每日目标文章数
            <input
              aria-label="每日目标文章数"
              type="number"
              min={1}
              max={50}
              value={appEditor.dailyArticleTarget}
              onChange={(event) => setAppEditor((current) => (
                current
                  ? { ...current, dailyArticleTarget: Math.max(1, Math.min(50, Number(event.target.value) || 1)) }
                  : current
              ))}
              className="rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </label>
        ) : null}

        {appEditor.appType === 'erc_review' ? (
          <>
            <label className="grid gap-1 text-xs text-ark-text-muted">
              复习范围
              <select
                aria-label="复习范围"
                value={appEditor.reviewScope}
                onChange={(event) => setAppEditor((current) => (
                  current ? { ...current, reviewScope: event.target.value as AppEditorState['reviewScope'] } : current
                ))}
                className="rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="due">到期复习 (due)</option>
                <option value="mistakes">全部错题 (mistakes)</option>
                <option value="all">全部题目 (all)</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-ark-text-muted">
              每日目标题数
              <input
                aria-label="每日目标题数"
                type="number"
                min={1}
                max={200}
                value={appEditor.dailyQuestionTarget}
                onChange={(event) => setAppEditor((current) => (
                  current
                    ? { ...current, dailyQuestionTarget: Math.max(1, Math.min(200, Number(event.target.value) || 10)) }
                    : current
                ))}
                className="rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </label>
          </>
        ) : null}

        <label className="grid gap-1 text-xs text-ark-text-muted">
          默认专注时长 (分钟)
          <input
            aria-label="默认专注时长 (分钟)"
            type="number"
            min={1}
            value={appEditor.focusDurationMin}
            onChange={(event) => setAppEditor((current) => (
              current ? { ...current, focusDurationMin: Math.max(1, Number(event.target.value) || 25) } : current
            ))}
            className="rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-ark-text">
          <input
            aria-label="同步到今日计划"
            type="checkbox"
            checked={appEditor.addToTodayPlan}
            onChange={(event) => setAppEditor((current) => (
              current ? { ...current, addToTodayPlan: event.target.checked } : current
            ))}
            className="h-4 w-4 rounded border-ark-border bg-ark-surface-subtle text-blue-500 focus:ring-blue-500/50"
          />
          同步到今日计划
        </label>

        <div className="flex flex-wrap justify-end gap-2 mt-2">
          {appEditor.index !== null ? (
            <button
              type="button"
              onClick={deleteConfiguredApp}
              className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20"
            >
              删除应用
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setAppEditor(null)}
            className="rounded-lg border border-ark-border px-3 py-2 text-sm text-ark-text hover:bg-ark-surface-subtle"
          >
            取消
          </button>
          <button
            type="button"
            onClick={saveAppEditorConfig}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            保存应用
          </button>
        </div>
      </div>
    );
  }

  function renderCreateAppsColumn() {
    const unconfiguredTypes = (['vocab_today', 'erc_practice', 'erc_review'] as const)
      .filter(type => !configuredApps.some(app => app.appType === type));

    return (
      <div className="flex min-h-[100px] flex-col rounded-lg border border-ark-border bg-ark-surface-subtle p-3 text-left">
        <div className="text-sm font-medium text-ark-text">应用任务配置</div>
        <div className="mt-3 grid flex-1 content-start gap-2">
          {configuredApps.map((app, index) => (
            appEditor?.index === index ? (
              <div key={`app-edit-${index}`}>{renderAppEditor()}</div>
            ) : (
              <button
                key={`app-item-${index}`}
                type="button"
                onClick={() => beginEditConfiguredApp(index)}
                className="min-h-12 rounded-lg bg-ark-surface-subtle border border-ark-border px-3 py-2 text-left hover:bg-ark-surface-subtle flex flex-col justify-center animate-fadeIn"
              >
                <div className="text-sm font-semibold text-ark-text">
                  {app.appType === 'vocab_today' ? '今日单词' : app.appType === 'erc_practice' ? '真题练习' : '错题复习'}
                </div>
                <div className="text-xs text-ark-text-muted mt-1 truncate">
                  {getAppConfigSummary(app)}
                </div>
              </button>
            )
          ))}

          {appEditor?.index === null ? renderAppEditor() : null}

          {appEditor === null && unconfiguredTypes.length > 0 ? (
            <button
              type="button"
              onClick={beginAddConfiguredApp}
              className="min-h-10 rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle px-3 py-2 text-center text-sm text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text"
            >
              添加应用
            </button>
          ) : appEditor === null ? (
            <div className="text-xs text-ark-text-faint text-center py-2">已添加全部可用应用</div>
          ) : null}
        </div>
      </div>
    );
  }

  function openWorkbench(event: EventItem): void {
    resetCreateForm();
    setShowCreateEditor(false);
    setShowModal(false);
    setError(null);
    setWorkbenchEvent(event);
  }

  function openEventOverview(): void {
    setError(null);
    setShowCreateEditor(false);
    setShowModal(true);
    dispatchOnboardingEvent(ONBOARDING_EVENTS.primaryEventOpened);
  }

  function renderCreateArrangementEditor(kind: CreateWorkbenchItemState['kind']) {
    if (!createArrangementEditor || createArrangementEditor.kind !== kind) return null;
    const label = kind === 'appointment' ? '日程' : '任务';
    const previewTime = previewWorkbenchItemTime(createArrangementEditor, selectedTemplate);
    return (
      <div className="grid gap-2 rounded-lg border border-blue-300/20 bg-blue-400/10 p-3">
        <label className="grid gap-1 text-xs text-ark-text-muted">
          {label}标题
          <input
            aria-label={`${label}标题`}
            value={createArrangementEditor.title}
            onChange={(event) => setCreateArrangementEditor((current) => (
              current ? { ...current, title: event.target.value } : current
            ))}
            className="rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </label>
        <label className="grid gap-1 text-xs text-ark-text-muted">
          {label}备注
          <input
            aria-label={`${label}备注`}
            value={createArrangementEditor.content}
            onChange={(event) => setCreateArrangementEditor((current) => (
              current ? { ...current, content: event.target.value } : current
            ))}
            className="rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </label>
        <label className="grid gap-1 text-xs text-ark-text-muted">
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
            className="rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </label>
        {previewTime ? (
          <div className="text-xs text-ark-text-faint">时间预览 {formatEventDateTime(previewTime)}</div>
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
            className="rounded-lg border border-ark-border px-3 py-2 text-sm text-ark-text hover:bg-ark-surface-subtle"
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
    const manualItems = createWorkbenchItems
      .map((item, index) => ({ item, index, isVirtual: false }))
      .filter(({ item }) => item.kind === kind);

    const virtualItems = kind === 'task'
      ? configuredApps.map((app, index) => ({
          item: {
            clientId: app.clientId,
            kind: 'task' as const,
            title: getConfiguredAppTaskTitle(app),
            content: getAppConfigSummary(app),
            offsetDays: 0,
          },
          index,
          isVirtual: true,
        }))
      : [];

    const allItems = [...virtualItems, ...manualItems];

    return (
      <div className="flex min-h-[132px] flex-col rounded-lg border border-ark-border bg-ark-surface-subtle p-3">
        <div className="text-sm font-medium text-ark-text">{label}</div>
        <div className="mt-3 grid flex-1 content-start gap-2">
          {allItems.map(({ item, index, isVirtual }) => {
            if (isVirtual) {
              return (
                <div
                  key={`virtual-app-${index}`}
                  className="min-h-12 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-left text-sm font-medium text-blue-300 flex items-center justify-between animate-fadeIn"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{item.title}</div>
                    <div className="text-xs text-ark-text-faint mt-1 truncate">{item.content}</div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-normal shrink-0 ml-2">
                    托管
                  </span>
                </div>
              );
            }
            return createArrangementEditor?.index === index ? (
              <div key={`${kind}-${index}`}>{renderCreateArrangementEditor(kind)}</div>
            ) : (
              <button
                key={`${kind}-${index}`}
                type="button"
                onClick={() => beginEditCreateArrangementItem(index)}
                className="min-h-10 rounded-lg bg-ark-surface-subtle px-3 py-2 text-left text-sm font-medium text-ark-text hover:bg-ark-surface-subtle"
              >
                {item.title || `未命名${label}`}
              </button>
            );
          })}
          {createArrangementEditor?.kind === kind && createArrangementEditor.index === null
            ? renderCreateArrangementEditor(kind)
            : null}
          <button
            type="button"
            onClick={() => beginAddCreateArrangementItem(kind)}
            className="min-h-10 rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle px-3 py-2 text-left text-sm text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text"
          >
            添加{label}
          </button>
        </div>
      </div>
    );
  }

  function renderCreateWorkflowSection() {
    return (
      <div className="rounded-xl border border-ark-border bg-ark-surface-subtle p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-ark-text">工作流</h4>
            <p className="mt-1 text-sm text-ark-text-faint">事件创建后保存到当前事件</p>
          </div>
          <button
            type="button"
            onClick={openNewCreateWorkflow}
            className="rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2 text-sm text-ark-text hover:bg-ark-surface-subtle hover:text-ark-text"
          >
            新建工作流
          </button>
        </div>

        {createWorkflowDrafts.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle px-3 py-4 text-sm text-ark-text-faint">
            暂无工作流
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            {createWorkflowDrafts.map((workflow) => (
              <div
                key={workflow.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => editCreateWorkflowDraft(workflow)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-ark-text">{workflow.name}</div>
                  <WorkflowPhaseChips
                    phases={workflow.phases}
                    className="mt-2"
                    getTaskTitle={(taskId) => createWorkflowTaskOptions.find((task) => task.id === taskId)?.title}
                  />
                </button>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => copyCreateWorkflowDraft(workflow)}
                    className="rounded-lg border border-ark-border px-2 py-1 text-xs text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text"
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCreateWorkflowDraft(workflow.id)}
                    className="rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-1 text-xs text-red-200 hover:bg-red-500/20"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {variant === 'nav' ? (
        <button
          type="button"
          onClick={openEventOverview}
          data-onboarding-anchor="primary-event"
          className="ark-event-nav-trigger ark-focus-ring flex h-[64px] min-w-[172px] max-w-[240px] flex-col justify-center rounded-[24px] px-2 text-left transition-colors"
          aria-label={`打开主事件：${primaryEvent ? primaryEvent.name : '未设置主事件'}，倒计时 ${countdownText}`}
        >
          <span className="max-w-full truncate text-[22px] font-semibold leading-7 text-[var(--ark-text)] ark-font-display">
            {primaryEvent ? primaryEvent.name : '未设置主事件'}
          </span>
          <span className={`mt-0.5 text-[17px] font-semibold leading-5 ark-font-display ${numberClassName}`}>
            {countdownText}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={openEventOverview}
          data-onboarding-anchor="primary-event"
          className="ark-panel-card ark-focus-ring absolute left-12 top-24 z-20 flex h-44 w-44 flex-col items-center justify-center rounded-full border-[6px] text-[var(--ark-text)] shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-colors hover:bg-[var(--ark-surface-subtle)]"
        >
          <span className="text-xs font-medium tracking-wide text-[var(--ark-text-muted)]">
            {primaryEvent ? primaryEvent.name : '未设置主事件'}
          </span>
          <span className={`mt-3 text-4xl font-semibold leading-none ark-font-display ${numberClassName}`}>{countdownText}</span>
          <span className="mt-3 text-[10px] tracking-[0.2em] uppercase text-[var(--ark-text-faint)]">event</span>
        </button>
      )}

      {typeof document !== 'undefined' ? createPortal(
        <>
      {showModal ? (
        <AppModalFrame
          open={true}
          onClose={closeModal}
          zIndexClassName="z-[70]"
          ariaLabel={showCreateEditor ? '添加事件' : '事件总览'}
          panelClassName="flex h-[76vh] w-[760px] max-w-[94vw] flex-col overflow-hidden rounded-2xl shadow-2xl"
        >
            <div className="h-14 border-b ark-border flex items-center justify-between px-5 bg-[var(--ark-surface-subtle)]">
              <h3 className="text-base font-semibold text-ark-text">
                {showCreateEditor ? '添加事件' : '事件总览'}
              </h3>
              <button
                data-onboarding-anchor="event-overview-close"
                onClick={closeModal}
                className="p-2 hover:bg-ark-surface-subtle rounded-full transition-colors text-ark-text-muted hover:text-ark-text"
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
                    <div className="rounded-xl border border-ark-border bg-ark-surface-subtle p-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[220px] flex-1 flex flex-col gap-2">
                          <label className="text-sm text-ark-text">事件模板</label>
                          <select
                            aria-label="事件模板"
                            value={selectedTemplateId}
                            onChange={(event) => setSelectedTemplateId(event.target.value)}
                            disabled={loadingTemplates}
                            className="w-full px-3 py-2 rounded-lg bg-ark-surface-subtle border border-ark-border text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-60"
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
                          onClick={() => {
                            setShowTemplateStore(true);
                            setSelectedStoreTemplateId(null);
                            setPreviewStoreTemplate(null);
                            dispatchOnboardingEvent(ONBOARDING_EVENTS.eventStoreOpened);
                            void loadTemplateStore();
                          }}
                          disabled={loadingTemplateStore}
                          data-onboarding-anchor="event-store-button"
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-ark-border bg-ark-surface-subtle text-sm text-ark-text hover:bg-ark-surface-subtle hover:text-ark-text transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ShoppingBag size={16} aria-hidden="true" />
                          事件商店
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyTemplate}
                          disabled={loadingTemplates || !selectedTemplateId}
                          data-onboarding-anchor="event-template-apply-button"
                          className="px-3 py-2 rounded-lg border border-ark-border bg-ark-surface-subtle text-sm text-ark-text hover:bg-ark-surface-subtle hover:text-ark-text transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          套用模板
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSelectedTemplate()}
                          disabled={loadingTemplates || savingTemplate || deletingTemplate || !selectedTemplateId}
                          className="event-danger-button inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-400/20 bg-red-500/10 text-sm text-red-200 hover:bg-red-500/20 transition-colors disabled:cursor-not-allowed disabled:border-red-500/25 disabled:bg-red-500/10 disabled:text-slate-950"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          {deletingTemplate ? '删除中...' : '删除模板'}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1.4fr_0.9fr_1.1fr_auto] md:items-end">
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-ark-text">事件名称</label>
                        <input
                          aria-label="事件名称"
                          value={createForm.name}
                          onChange={(event) => setCreateForm((state) => ({ ...state, name: event.target.value }))}
                          placeholder="例如：论文投稿截止"
                          className="w-full px-3 py-2 rounded-lg bg-ark-surface-subtle border border-ark-border text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-ark-text">开始日期</label>
                        <input
                          aria-label="开始日期"
                          type="date"
                          value={createForm.startDate}
                          onChange={(event) => setCreateForm((state) => ({ ...state, startDate: event.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-ark-surface-subtle border border-ark-border text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-ark-text">到期时间</label>
                        <input
                          aria-label="到期时间"
                          type="datetime-local"
                          value={createForm.dueAt}
                          onChange={(event) => setCreateForm((state) => ({ ...state, dueAt: event.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-ark-surface-subtle border border-ark-border text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-ark-text pb-2">
                        <input
                          type="checkbox"
                          checked={createForm.isPrimary}
                          onChange={(event) => setCreateForm((state) => ({ ...state, isPrimary: event.target.checked }))}
                          className="h-4 w-4 rounded border-ark-border bg-ark-surface-subtle"
                        />
                        设为主事件
                      </label>
                    </div>

                    {/* 应用 */}
                    <div className="rounded-xl border border-ark-border bg-ark-surface-subtle p-4">
                      <div>
                        <h4 className="text-base font-semibold text-ark-text">应用</h4>
                        <p className="mt-1 text-sm text-ark-text-faint">配置子应用托管的每日任务</p>
                      </div>
                      <div className="mt-4">
                        {renderCreateAppsColumn()}
                      </div>
                    </div>

                    <div className="rounded-xl border border-ark-border bg-ark-surface-subtle p-4">
                      <div>
                        <h4 className="text-base font-semibold text-ark-text">安排</h4>
                        <p className="mt-1 text-sm text-ark-text-faint">安排内容</p>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {renderCreateArrangementColumn('task')}
                        {renderCreateArrangementColumn('appointment')}
                      </div>
                    </div>

                    {renderCreateWorkflowSection()}

                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {loading ? (
                    <div className="h-full min-h-[160px] flex items-center justify-center text-ark-text-faint">加载中...</div>
                  ) : events.length === 0 ? (
                    <div className="h-full min-h-[160px] flex items-center justify-center text-ark-text-faint">暂无事件</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {[...events].sort((a, b) => (a.is_primary ? -1 : b.is_primary ? 1 : 0)).map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => openWorkbench(event)}
                          className="rounded-xl border border-ark-border bg-ark-surface-subtle p-4 flex items-start justify-between gap-4 text-left hover:bg-ark-surface-subtle transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-semibold text-ark-text">{event.name}</span>
                              {event.is_primary ? (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/20">
                                  主事件
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 text-sm text-ark-text-muted">
                              创建于 {formatEventDateTime(event.created_at)}
                            </div>
                            <div className="mt-1 text-sm text-ark-text-muted">
                              开始于 {event.start_date}
                            </div>
                            <div className="mt-1 text-sm text-ark-text">
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
                    data-onboarding-anchor="event-add-button"
                    className="rounded-xl border border-dashed border-ark-border bg-ark-surface-subtle px-4 py-5 text-left text-sm text-ark-text hover:bg-ark-surface-subtle hover:text-ark-text transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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
                className="shrink-0 border-t ark-border bg-[var(--ark-surface-strong)] px-5 py-4"
              >
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelCreate}
                    disabled={submitting || savingTemplate}
                    className="px-3 py-2 rounded-lg bg-ark-surface-subtle hover:bg-ark-surface-subtle border border-ark-border text-ark-text hover:text-ark-text transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveTemplate()}
                    disabled={submitting || savingTemplate}
                    className="px-3 py-2 rounded-lg border border-ark-border bg-ark-surface-subtle text-ark-text hover:bg-ark-surface-subtle transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingTemplate ? '保存中...' : '保存为模板'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateEvent()}
                    disabled={submitting || savingTemplate}
                    data-onboarding-anchor="event-create-button"
                    className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? '提交中...' : '创建事件'}
                  </button>
                </div>
              </div>
            ) : null}
        </AppModalFrame>
      ) : null}

      {workbenchEvent ? (
        <EventWorkbenchModal
          event={workbenchEvent}
          onClose={() => setWorkbenchEvent(null)}
          onChanged={refreshAll}
        />
      ) : null}

      <WorkflowPresetModal
        open={showCreateWorkflowModal}
        presets={createWorkflowDrafts}
        tasks={createWorkflowTaskOptions}
        editingWorkflowId={editingCreateWorkflowId}
        workflowForm={createWorkflowForm}
        workflowError={createWorkflowError}
        workflowSubmitting={createWorkflowSubmitting}
        onClose={closeCreateWorkflowModal}
        onCreateNew={openNewCreateWorkflow}
        onSelectPreset={editCreateWorkflowDraft}
        onCopyPreset={copyCreateWorkflowDraft}
        onSetDefault={() => undefined}
        onDeletePreset={deleteCreateWorkflowDraft}
        onUpdateForm={setCreateWorkflowForm}
        onAddPhase={addCreateWorkflowPhase}
        onRemovePhase={removeCreateWorkflowPhase}
        onSubmit={submitCreateWorkflowDraft}
        onReset={resetCreateWorkflowForm}
        isTaskHiddenFromActionList={() => false}
        title="工作流"
        description={createForm.name.trim() || '新事件'}
        savedListLabel="待保存工作流"
        emptyText="暂无工作流"
        showDefaultControls={false}
        zIndexClass="z-[90]"
      />

      {showTemplateStore ? (
        <AppModalFrame
          open={true}
          onClose={() => {
            setShowTemplateStore(false);
            setPreviewStoreTemplate(null);
          }}
          zIndexClassName="z-[90]"
          ariaLabel="事件商店"
          panelClassName="w-[760px] max-w-[94vw] overflow-hidden rounded-2xl border border-ark-border bg-ark-panel text-ark-text shadow-2xl"
        >
            <div className="flex items-center justify-between border-b border-ark-border px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold">事件商店</h3>
                <p className="mt-1 text-sm text-ark-text-faint">保存项目内置模板到我的事件模板</p>
              </div>
              <button
                type="button"
                aria-label="关闭事件商店"
                onClick={() => {
                  setShowTemplateStore(false);
                  setPreviewStoreTemplate(null);
                }}
                className="rounded-full p-2 text-ark-text-muted transition-colors hover:bg-ark-surface-subtle hover:text-ark-text"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[calc(82vh-76px)] overflow-y-auto px-5 py-4">
              {loadingTemplateStore ? (
                <div className="flex min-h-[180px] items-center justify-center text-sm text-ark-text-faint">加载中...</div>
              ) : storeTemplates.length === 0 ? (
                <div className="flex min-h-[180px] items-center justify-center text-sm text-ark-text-faint">
                  暂无内置模板
                </div>
              ) : (
                <div className="space-y-5">
                  {templateStoreCategories.map(([category, categoryTemplates]) => (
                    <section key={category}>
                      <h4 className="text-sm font-medium text-ark-text">{category}</h4>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {categoryTemplates.map((template) => (
                          <article
                            key={template.id}
                            role="button"
                            tabIndex={0}
                            data-onboarding-anchor={template.name.includes('考研英语') ? 'event-store-template-kaoyan' : undefined}
                            onClick={() => openStoreTemplatePreview(template)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              openStoreTemplatePreview(template);
                            }}
                            className={`rounded-xl border p-4 transition-colors ${
                              selectedStoreTemplateId === template.id
                                ? 'border-cyan-300/60 bg-cyan-300/10'
                                : 'border-ark-border bg-ark-surface-subtle hover:bg-ark-surface-subtle'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h5 className="text-base font-semibold text-ark-text">{template.name}</h5>
                                {template.description ? (
                                  <p className="mt-2 text-sm leading-5 text-ark-text-muted">{template.description}</p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedStoreTemplateId(template.id);
                                  void handleSaveStoreTemplate(template);
                                }}
                                disabled={savingTemplate || savingStoreTemplateId === template.id}
                                data-onboarding-anchor={
                                  selectedStoreTemplateId === template.id && !templateConflict && !previewStoreTemplate
                                    ? 'event-store-save-selected'
                                    : undefined
                                }
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Save size={15} aria-hidden="true" />
                                {savingStoreTemplateId === template.id ? '保存中...' : '保存'}
                              </button>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2 text-xs text-ark-text-muted">
                              <span className="rounded-full border border-ark-border bg-ark-surface-subtle px-2 py-1">
                                {template.schedule_mode === 'before_due' ? '按截止倒推' : '按开始顺推'}
                              </span>
                              <span className="rounded-full border border-ark-border bg-ark-surface-subtle px-2 py-1">
                                {template.items.length} 个工作台内容
                              </span>
                            </div>
                            {template.items.length > 0 ? (
                              <ul className="mt-3 space-y-1 text-sm text-ark-text-muted">
                                {template.items.slice(0, 3).map((item) => (
                                  <li key={item.id} className="truncate">
                                    {item.kind === 'task' ? '任务' : '日程'} · {item.title}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
        </AppModalFrame>
      ) : null}

      {showTemplateStore && previewStoreTemplate ? (
        <AppModalFrame
          open={true}
          onClose={() => setPreviewStoreTemplate(null)}
          zIndexClassName="z-[95]"
          ariaLabel={`${previewStoreTemplate.name} 模板内容`}
          panelClassName="flex w-[720px] max-w-[94vw] flex-col overflow-hidden rounded-2xl border border-ark-border bg-ark-panel text-ark-text shadow-2xl"
        >
            <div className="flex items-start justify-between gap-4 border-b border-ark-border px-5 py-4">
              <div className="min-w-0">
                <div className="text-xs font-medium text-cyan-200/80">{previewStoreTemplate.category || '通用'}</div>
                <h3 className="mt-1 truncate text-lg font-semibold">{previewStoreTemplate.name}</h3>
                {previewStoreTemplate.description ? (
                  <p className="mt-2 text-sm leading-5 text-ark-text-muted">{previewStoreTemplate.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="关闭模板内容"
                onClick={() => setPreviewStoreTemplate(null)}
                className="rounded-full p-2 text-ark-text-muted transition-colors hover:bg-ark-surface-subtle hover:text-ark-text"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-4 overflow-y-auto px-5 py-4">
              <section>
                <h4 className="text-sm font-medium text-ark-text">事件信息</h4>
                <div className="mt-3 grid gap-2 text-sm text-ark-text-muted sm:grid-cols-2">
                  <div className="rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2">
                    名称：{previewStoreTemplate.default_event_name || previewStoreTemplate.name}
                  </div>
                  <div className="rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2">
                    模式：{previewStoreTemplate.schedule_mode === 'before_due' ? '按截止倒推' : '按开始顺推'}
                  </div>
                  <div className="rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2">
                    开始：{previewStoreTemplate.default_start_date || '未设置'}
                  </div>
                  <div className="rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2">
                    到期：{previewStoreTemplate.default_due_at ? formatEventDateTime(previewStoreTemplate.default_due_at) : '未设置'}
                  </div>
                </div>
              </section>

              <section>
                <h4 className="text-sm font-medium text-ark-text">应用配置</h4>
                {previewStoreTemplate.app_configs?.length ? (
                  <div className="mt-3 grid gap-2">
                    {previewStoreTemplate.app_configs.map((app) => (
                      <div
                        key={app.client_id}
                        className="rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2"
                      >
                        <div className="text-sm font-medium text-ark-text">{getStoreAppName(app.app_type)}</div>
                        <div className="mt-1 text-xs text-ark-text-muted">{getStoreAppSummary(app)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle px-3 py-4 text-sm text-ark-text-faint">
                    暂无应用配置
                  </div>
                )}
              </section>

              <section>
                <h4 className="text-sm font-medium text-ark-text">工作台内容</h4>
                {previewStoreTemplate.items.length ? (
                  <div className="mt-3 grid gap-2">
                    {previewStoreTemplate.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2"
                      >
                        <div className="text-sm font-medium text-ark-text">
                          {item.kind === 'task' ? '任务' : '日程'} · {item.title}
                        </div>
                        {item.content ? <div className="mt-1 text-xs text-ark-text-muted">{item.content}</div> : null}
                        <div className="mt-1 text-xs text-ark-text-faint">相对天数 {item.offset_days}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle px-3 py-4 text-sm text-ark-text-faint">
                    暂无工作台内容
                  </div>
                )}
              </section>

              <section>
                <h4 className="text-sm font-medium text-ark-text">工作流</h4>
                {previewStoreTemplate.workflows?.length ? (
                  <div className="mt-3 grid gap-3">
                    {previewStoreTemplate.workflows.map((workflow) => (
                      <div
                        key={workflow.client_id}
                        className="rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-medium text-ark-text">{workflow.name}</div>
                          <div className="text-xs text-ark-text-faint">
                            {workflow.default_focus_timer_mode === 'countdown' ? '倒计时' : '正计时'}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {workflow.phases.map((phase, index) => {
                            const bindingName = getStoreTemplateBindingName(previewStoreTemplate, phase.task_id);
                            return (
                              <div
                                key={`${workflow.client_id}-${index}`}
                                className="rounded-md bg-ark-surface-subtle px-3 py-2 text-xs text-ark-text-muted"
                              >
                                {index + 1}. {phase.phase_type === 'focus' ? '专注' : '休息'}
                                {' '}
                                {Math.round(phase.duration / 60)} 分钟
                                {bindingName ? ` · ${bindingName}` : ''}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle px-3 py-4 text-sm text-ark-text-faint">
                    暂无工作流
                  </div>
                )}
              </section>
            </div>

            <div className="flex justify-end gap-2 border-t border-ark-border px-5 py-4">
              <button
                type="button"
                onClick={() => setPreviewStoreTemplate(null)}
                className="rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2 text-sm text-ark-text hover:bg-ark-surface-subtle hover:text-ark-text"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={() => void handleSaveStoreTemplate(previewStoreTemplate)}
                disabled={savingTemplate || savingStoreTemplateId === previewStoreTemplate.id}
                data-onboarding-anchor={selectedStoreTemplateId === previewStoreTemplate.id && !templateConflict ? 'event-store-save-selected' : undefined}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={15} aria-hidden="true" />
                {savingStoreTemplateId === previewStoreTemplate.id ? '保存中...' : '保存'}
              </button>
            </div>
        </AppModalFrame>
      ) : null}

      {templateConflict ? (
        <AppModalFrame
          open={true}
          onClose={() => setTemplateConflict(null)}
          zIndexClassName="z-[100]"
          ariaLabel="同名模板已存在"
          panelClassName="w-[420px] max-w-[94vw] rounded-2xl border border-ark-border bg-ark-panel p-5 text-ark-text shadow-2xl"
        >
            <h3 className="text-lg font-semibold">同名模板已存在</h3>
            <p className="mt-3 text-sm leading-6 text-ark-text-muted">
              已经有名为 <span className="font-medium text-ark-text">{templateConflict.template.name}</span> 的事件模板。
              你可以更新这个模板，或者保留它并保存为新的模板。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTemplateConflict(null)}
                disabled={savingTemplate}
                className="rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2 text-sm text-ark-text hover:bg-ark-surface-subtle hover:text-ark-text disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void saveConflictAsNewTemplate()}
                disabled={savingTemplate}
                className="rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2 text-sm text-ark-text hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-60"
              >
                保存为新模板
              </button>
              <button
                type="button"
                onClick={() => void updateConflictTemplate()}
                disabled={savingTemplate}
                data-onboarding-anchor={templateConflict.source === 'store' ? 'event-store-save-selected' : undefined}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                更新模板
              </button>
            </div>
        </AppModalFrame>
      ) : null}

        </>,
        document.body,
      ) : null}
    </>
  );
};

export default EventCountdownCard;
