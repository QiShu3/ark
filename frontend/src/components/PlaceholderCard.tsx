import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../lib/api';
import FocusStats from './FocusStats';
import WorkflowProgressBar from './WorkflowProgressBar';
import CalendarWidget from './CalendarWidget';
import PhoneSimulator from './PhoneSimulator';
import TaskEditModal from './TaskEditModal';
import AppointmentEditModal from './AppointmentEditModal';
import type { Appointment, Task } from './taskTypes';
import {
  buildWorkflowNotificationPrompt,
  deriveWorkflowNotification,
  type WorkflowNotificationSnapshot,
} from '../lib/workflowNotifications';
import { formatClockTime } from './workflowProgress';

interface PlaceholderCardProps {
  index: number;
  split?: number;
  /** RightPanel 容器的 ref，用于 PhoneSimulator 的覆盖定位 */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

interface FocusSession {
  id: string;
  task_id: string;
  start_time: string;
  duration: number;
}

interface TodayFocusSummary {
  minutes: number;
}

interface FocusWorkflow {
  state: 'normal' | 'focus' | 'break';
  workflow_name?: string | null;
  current_phase_index?: number | null;
  phases?: { phase_type: 'focus' | 'break'; duration: number; timer_mode?: 'countdown' | 'countup' | null; task_id?: string | null }[];
  task_id: string | null;
  task_title: string | null;
  pending_confirmation: boolean;
  pending_task_selection?: boolean;
  remaining_seconds: number | null;
  phase_started_at?: string | null;
  phase_planned_duration?: number | null;
  phase_timer_mode?: 'countdown' | 'countup' | null;
  elapsed_seconds?: number | null;
  runtime_task_id?: string | null;
  completed_workflow_name?: string | null;
}

interface WorkflowPreset {
  id: string;
  user_id: number;
  name: string;
  focus_duration: number;
  break_duration: number;
  default_focus_timer_mode?: 'countdown' | 'countup';
  phases: { phase_type: 'focus' | 'break'; duration: number; timer_mode?: 'countdown' | 'countup' | null; task_id?: string | null }[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

type WorkflowFormPhase = {
  phase_type: 'focus' | 'break';
  duration: number;
  timer_mode: 'countdown' | 'countup';
  task_id: string | null;
};

type WorkflowFormState = {
  name: string;
  defaultFocusTimerMode: 'countdown' | 'countup';
  phases: WorkflowFormPhase[];
  isDefault: boolean;
};

function createDefaultWorkflowForm(isDefault: boolean): WorkflowFormState {
  return {
    name: '',
    defaultFocusTimerMode: 'countdown',
    phases: [
      { phase_type: 'focus', duration: 25 * 60, timer_mode: 'countdown', task_id: null },
      { phase_type: 'break', duration: 5 * 60, timer_mode: 'countdown', task_id: null },
    ],
    isDefault,
  };
}

type CreateTaskForm = {
  title: string;
  content: string;
  priority: 0 | 1 | 2 | 3;
  targetMinutes: number;
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

type CreateArrangementKind = 'task' | 'appointment';

type CreateAppointmentForm = {
  title: string;
  content: string;
  startsAt: string;
  endsAt: string;
  repeatRule: string;
};

type CreateArrangementPreset = Partial<CreateTaskForm & CreateAppointmentForm> & {
  kind?: CreateArrangementKind;
};

type TaskAssistantDraft = Partial<CreateTaskForm> & Partial<CreateAppointmentForm> & {
  id: string;
  rawTitle: string;
  kind?: CreateArrangementKind;
  sourceText?: string;
  state: 'pending' | 'created' | 'ignored';
};

const CREATE_TASK_FORM_DEFAULTS: CreateTaskForm = {
  title: '',
  content: '',
  priority: 0,
  targetMinutes: 25,
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

const CREATE_APPOINTMENT_FORM_DEFAULTS: CreateAppointmentForm = {
  title: '',
  content: '',
  startsAt: '',
  endsAt: '',
  repeatRule: '',
};

/**
 * 右侧占位卡片组件
 * 用于展示占位内容
 */
const PlaceholderCard: React.FC<PlaceholderCardProps> = ({ index, split = 1, anchorRef }) => {
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showTaskAssistantModal, setShowTaskAssistantModal] = useState(false);
  const [showPhoneSimulator, setShowPhoneSimulator] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'daily' | 'weekly' | 'periodic' | 'custom' | 'all'>('today');
  const [activeArrangementTab, setActiveArrangementTab] = useState<'tasks' | 'appointments'>('tasks');
  const [activeAppointmentTab, setActiveAppointmentTab] = useState<'all' | 'today' | 'needs_confirmation' | 'repeating'>('all');
  const navigate = useNavigate();

  // Focus State
  const [currentFocus, setCurrentFocus] = useState<FocusSession | null>(null);
  const [focusDurationStr, setFocusDurationStr] = useState('0min');
  const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
  const [focusWorkflow, setFocusWorkflow] = useState<FocusWorkflow | null>(null);
  const [confirmingFocusPhase, setConfirmingFocusPhase] = useState(false);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [showCompletedToday, setShowCompletedToday] = useState(false);
  const [showCompletedAll, setShowCompletedAll] = useState(false);
  const [workflowPresets, setWorkflowPresets] = useState<WorkflowPreset[]>([]);
  const [workflowSubmitting, setWorkflowSubmitting] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [workflowForm, setWorkflowForm] = useState<WorkflowFormState>(() => createDefaultWorkflowForm(false));
  const [showFocusTaskPicker, setShowFocusTaskPicker] = useState(false);
  const [focusTargetTaskId, setFocusTargetTaskId] = useState<string | null>(null);
  const [focusQuickActionBusy, setFocusQuickActionBusy] = useState(false);

  const [createTaskSubmitting, setCreateTaskSubmitting] = useState(false);
  const [createTaskError, setCreateTaskError] = useState<string | null>(null);
  const [createArrangementKind, setCreateArrangementKind] = useState<CreateArrangementKind>('task');
  const [createTaskForm, setCreateTaskForm] = useState<CreateTaskForm>(CREATE_TASK_FORM_DEFAULTS);
  const [createAppointmentForm, setCreateAppointmentForm] = useState<CreateAppointmentForm>(CREATE_APPOINTMENT_FORM_DEFAULTS);
  const [showCreateTaskMoreFields, setShowCreateTaskMoreFields] = useState(false);
  const [taskAssistantInput, setTaskAssistantInput] = useState('');
  const [taskAssistantError, setTaskAssistantError] = useState<string | null>(null);
  const [taskAssistantSubmitting, setTaskAssistantSubmitting] = useState(false);
  const [showTaskDraftModal, setShowTaskDraftModal] = useState(false);
  const [taskAssistantDrafts, setTaskAssistantDrafts] = useState<TaskAssistantDraft[]>([]);
  const [activeTaskDraftId, setActiveTaskDraftId] = useState<string | null>(null);
  const [workflowRenderTick, setWorkflowRenderTick] = useState(() => Date.now());

  // Task Management State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [showEditAppointmentModal, setShowEditAppointmentModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    _loadTasks();
    _loadAppointments();
    _loadCurrentFocus();
    _loadTodayFocus();
    _loadFocusWorkflow();
    _loadWorkflowPresets();
  }, []);

  // Listen for global reload event so all cards stay cleanly in sync
  useEffect(() => {
    const handleReload = () => {
      _loadTasks();
      _loadAppointments();
      _loadCurrentFocus();
      _loadTodayFocus();
      _loadFocusWorkflow();
    };
    window.addEventListener('ark:reload-focus', handleReload);
    return () => window.removeEventListener('ark:reload-focus', handleReload);
  }, []);

  useEffect(() => {
    if (index !== 0) return;
    const handler = () => {
      setWorkflowError(null);
      setEditingWorkflowId(null);
      setWorkflowForm(createDefaultWorkflowForm(workflowPresets.length === 0));
      setShowWorkflowModal(true);
      _loadWorkflowPresets();
    };
    window.addEventListener('ark:open-workflow-modal', handler);
    return () => window.removeEventListener('ark:open-workflow-modal', handler);
  }, [index, workflowPresets.length]);

  // Sync today focus minutes periodically
  useEffect(() => {
    const timer = setInterval(() => {
      _loadTodayFocus();
      _loadFocusWorkflow();
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Calculate a stable end time to prevent countdown jitter/flashback
  const targetEndTimeRef = React.useRef<number | null>(null);
  const isFetchingRef = React.useRef(false);
  const previousWorkflowSnapshotRef = React.useRef<WorkflowNotificationSnapshot | null>(null);
  const lastWorkflowNotificationKeyRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (
      !focusWorkflow
      || focusWorkflow.state === 'normal'
      || focusWorkflow.pending_task_selection
      || focusWorkflow.phase_timer_mode === 'countup'
      || focusWorkflow.remaining_seconds === null
      || focusWorkflow.remaining_seconds === undefined
    ) {
      targetEndTimeRef.current = null;
      return;
    }
    if (focusWorkflow.pending_confirmation) {
      targetEndTimeRef.current = null;
      return;
    }
    const newEnd = Date.now() + focusWorkflow.remaining_seconds * 1000;
    if (targetEndTimeRef.current === null) {
      targetEndTimeRef.current = newEnd;
    } else {
      // If difference is small (< 3s), keep the old target to avoid visual flashback
      if (Math.abs(newEnd - targetEndTimeRef.current) >= 3000) {
        targetEndTimeRef.current = newEnd;
      }
    }
  }, [focusWorkflow]);

  // Update local countdown for focus workflow
  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      if (
        focusWorkflow
        && focusWorkflow.state === 'focus'
        && !focusWorkflow.pending_confirmation
        && !focusWorkflow.pending_task_selection
        && focusWorkflow.phase_timer_mode === 'countup'
        && focusWorkflow.phase_started_at
      ) {
        setWorkflowRenderTick(now);
        const startedAt = new Date(focusWorkflow.phase_started_at).getTime();
        const startedElapsed = Math.max(0, Math.round(focusWorkflow.elapsed_seconds ?? 0));
        const liveElapsed = Number.isFinite(startedAt)
          ? Math.max(startedElapsed, Math.round((now - startedAt) / 1000))
          : startedElapsed;
        setFocusDurationStr(formatClockTime(liveElapsed));
        if (liveElapsed >= 2 * 60 * 60 && !isFetchingRef.current) {
          isFetchingRef.current = true;
          _loadFocusWorkflow().finally(() => {
            isFetchingRef.current = false;
          });
        }
        return;
      }

      if (targetEndTimeRef.current === null) {
        if (focusWorkflow?.state !== 'normal' && focusWorkflow?.pending_confirmation) {
          setFocusDurationStr('00:00');
        } else if (focusWorkflow?.pending_task_selection) {
          setFocusDurationStr('待选');
        } else if (currentFocus) {
          const start = new Date(currentFocus.start_time).getTime();
          const diffMinutes = Math.floor((now - start) / 60000);
          setFocusDurationStr(`${diffMinutes}min`);
        } else {
          setFocusDurationStr('0min');
        }
        return;
      }

      setWorkflowRenderTick(now);
      const left = Math.round((targetEndTimeRef.current - now) / 1000);
      if (left <= 0) {
        setFocusDurationStr(formatClockTime(0));
        if (!isFetchingRef.current) {
          isFetchingRef.current = true;
          _loadFocusWorkflow().finally(() => {
            isFetchingRef.current = false;
          });
        }
      } else {
        setFocusDurationStr(formatClockTime(left));
      }
    };

    // Initial update
    updateTimer();

    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [
    currentFocus,
    focusWorkflow,
    focusWorkflow?.elapsed_seconds,
    focusWorkflow?.pending_confirmation,
    focusWorkflow?.pending_task_selection,
    focusWorkflow?.phase_started_at,
    focusWorkflow?.phase_timer_mode,
    focusWorkflow?.state,
  ]);

  const workflowForProgress = React.useMemo<FocusWorkflow>(() => {
    if (!focusWorkflow) {
      return {
        state: 'normal',
        task_id: null,
        task_title: null,
        pending_confirmation: false,
        pending_task_selection: false,
        remaining_seconds: null,
      };
    }
    if (
      focusWorkflow.state === 'normal'
      || focusWorkflow.pending_confirmation
      || focusWorkflow.pending_task_selection
    ) {
      return focusWorkflow;
    }
    if (focusWorkflow.phase_timer_mode === 'countup') {
      if (!focusWorkflow.phase_started_at) {
        return focusWorkflow;
      }
      const startedAt = new Date(focusWorkflow.phase_started_at).getTime();
      const baseElapsed = Math.max(0, Math.round(focusWorkflow.elapsed_seconds ?? 0));
      if (!Number.isFinite(startedAt)) {
        return focusWorkflow;
      }
      const liveElapsed = Math.max(baseElapsed, Math.round((workflowRenderTick - startedAt) / 1000));
      if (liveElapsed === focusWorkflow.elapsed_seconds) {
        return focusWorkflow;
      }
      return {
        ...focusWorkflow,
        elapsed_seconds: liveElapsed,
      };
    }
    if (focusWorkflow.remaining_seconds === null || targetEndTimeRef.current === null) {
      return focusWorkflow;
    }
    const liveRemaining = Math.max(0, Math.round((targetEndTimeRef.current - workflowRenderTick) / 1000));
    if (liveRemaining === focusWorkflow.remaining_seconds) {
      return focusWorkflow;
    }
    return {
      ...focusWorkflow,
      remaining_seconds: liveRemaining,
    };
  }, [focusWorkflow, workflowRenderTick]);

  const defaultWorkflowName = React.useMemo(() => {
    const preset = workflowPresets.find((item) => item.is_default) ?? workflowPresets[0];
    return preset?.name?.trim() || '工作流';
  }, [workflowPresets]);

  useEffect(() => {
    if (showTaskModal && activeTab === 'all') {
      _loadTasks();
    }
  }, [showTaskModal, activeTab]);

  useEffect(() => {
    if (!focusTargetTaskId) return;
    const task = tasks.find((t) => t.id === focusTargetTaskId);
    if (!task || task.status === 'done') {
      setFocusTargetTaskId(null);
    }
  }, [tasks, focusTargetTaskId]);


  function _resetCreateTaskForm(): void {
    setCreateTaskSubmitting(false);
    setCreateTaskError(null);
    setCreateArrangementKind('task');
    setCreateTaskForm({ ...CREATE_TASK_FORM_DEFAULTS });
    setCreateAppointmentForm({ ...CREATE_APPOINTMENT_FORM_DEFAULTS });
    setShowCreateTaskMoreFields(false);
    setActiveTaskDraftId(null);
  }

  function _openCreateTaskModal(preset?: CreateArrangementPreset): void {
    const nowDate = new Date();
    const localNow = new Date(nowDate.getTime() - nowDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const kind = preset?.kind === 'appointment' ? 'appointment' : 'task';
    const nextStartDate = typeof preset?.startDate === 'string' && preset.startDate.trim() ? preset.startDate : localNow;
    setCreateTaskError(null);
    setShowCreateTaskMoreFields(false);
    setCreateArrangementKind(kind);
    setCreateTaskForm({ ...CREATE_TASK_FORM_DEFAULTS, ...(preset || {}), startDate: nextStartDate });
    setCreateAppointmentForm({
      ...CREATE_APPOINTMENT_FORM_DEFAULTS,
      title: typeof preset?.title === 'string' ? preset.title : '',
      content: typeof preset?.content === 'string' ? preset.content : '',
      startsAt: typeof preset?.startsAt === 'string' ? preset.startsAt : '',
      endsAt: typeof preset?.endsAt === 'string' ? preset.endsAt : '',
      repeatRule: typeof preset?.repeatRule === 'string' ? preset.repeatRule : '',
    });
    setShowCreateTaskModal(true);
  }

  function _closeCreateTaskModal(): void {
    const shouldReturnToDrafts = !!activeTaskDraftId && taskAssistantDrafts.some((draft) => draft.state === 'pending');
    setShowCreateTaskModal(false);
    _resetCreateTaskForm();
    if (shouldReturnToDrafts) {
      setShowTaskDraftModal(true);
    }
  }

  function _toDateTimeLocal(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function _parseJsonValue(candidate: string): unknown {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  function _extractJsonValue(text: string): unknown {
    const direct = text.trim();
    if (!direct) return null;
    const directParsed = _parseJsonValue(direct);
    if (directParsed) return directParsed;
    const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      const fencedParsed = _parseJsonValue(fenced[1].trim());
      if (fencedParsed) return fencedParsed;
    }
    const objectStart = direct.indexOf('{');
    const objectEnd = direct.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      const objectParsed = _parseJsonValue(direct.slice(objectStart, objectEnd + 1));
      if (objectParsed) return objectParsed;
    }
    const arrayStart = direct.indexOf('[');
    const arrayEnd = direct.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return _parseJsonValue(direct.slice(arrayStart, arrayEnd + 1));
    }
    return null;
  }

  function _extractTaskDraftObjects(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return [];
    }
    const payloadObj = payload as Record<string, unknown>;
    if (Array.isArray(payloadObj.tasks)) {
      return payloadObj.tasks.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
    }
    if (Array.isArray(payloadObj.drafts)) {
      return payloadObj.drafts.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
    }
    return [];
  }

  function _isLegacySingleTaskPayload(payload: unknown): payload is Record<string, unknown> {
    return !!payload && typeof payload === 'object' && !Array.isArray(payload);
  }

  function _limitTitleLength(value: string, maxChars: number): string {
    return Array.from(value).slice(0, maxChars).join('');
  }

  function _draftToCreateTaskForm(inputText: string, draft: Record<string, unknown>): Partial<CreateTaskForm> {
    const titleRaw = (typeof draft.title === 'string' ? draft.title : inputText.trim()).trim() || '新任务';
    const title = _limitTitleLength(titleRaw, 10);
    const content = typeof draft.content === 'string'
      ? draft.content
      : (typeof draft.description === 'string' ? draft.description : '');
    const priorityRaw = Number(draft.priority);
    const targetMinutesRaw = Number(draft.targetMinutes);
    const targetCycleCountRaw = Number(draft.targetCycleCount);
    const customCycleDaysRaw = Number(draft.customCycleDays);
    const cyclePeriodRaw = typeof draft.cyclePeriod === 'string' ? draft.cyclePeriod : '';
    const taskTypeRaw = typeof draft.taskType === 'string' ? draft.taskType : (typeof draft.task_type === 'string' ? draft.task_type : 'focus');
    const tagsValue = Array.isArray(draft.tags)
      ? draft.tags.filter((x): x is string => typeof x === 'string').join(', ')
      : (typeof draft.tagsText === 'string' ? draft.tagsText : '');
    return {
      title,
      content,
      priority: (Number.isFinite(priorityRaw) ? Math.min(3, Math.max(0, Math.round(priorityRaw))) : 0) as 0 | 1 | 2 | 3,
      targetMinutes: Number.isFinite(targetMinutesRaw) && targetMinutesRaw >= 0 ? Math.round(targetMinutesRaw) : 25,
      targetCycleCount: Number.isFinite(targetCycleCountRaw) && targetCycleCountRaw >= 0 ? Math.round(targetCycleCountRaw) : 1,
      cyclePeriod: cyclePeriodRaw === 'daily' || cyclePeriodRaw === 'weekly' || cyclePeriodRaw === 'monthly' || cyclePeriodRaw === 'custom'
        ? cyclePeriodRaw
        : 'daily',
      customCycleDays: Number.isFinite(customCycleDaysRaw) && customCycleDaysRaw >= 1 ? Math.round(customCycleDaysRaw) : 1,
      event: typeof draft.event === 'string' ? draft.event : '',
      eventIds: [],
      taskType: (taskTypeRaw === 'checkin' ? 'checkin' : 'focus') as 'focus' | 'checkin',
      tagsText: tagsValue,
      startDate: _toDateTimeLocal(draft.startDate),
      dueDate: _toDateTimeLocal(draft.dueDate),
    };
  }

  function _isAppointmentDraft(draft: Record<string, unknown>): boolean {
    const kind = typeof draft.kind === 'string' ? draft.kind : (typeof draft.type === 'string' ? draft.type : '');
    if (kind === 'appointment') return true;
    return typeof draft.endsAt === 'string' || typeof draft.ends_at === 'string';
  }

  function _draftToCreateAppointmentForm(inputText: string, draft: Record<string, unknown>): Partial<CreateAppointmentForm> & { kind: 'appointment' } {
    const titleRaw = (typeof draft.title === 'string' ? draft.title : inputText.trim()).trim() || '新日程';
    const startsAt = _toDateTimeLocal(draft.startsAt ?? draft.starts_at);
    const endsAt = _toDateTimeLocal(draft.endsAt ?? draft.ends_at);
    return {
      kind: 'appointment',
      title: _limitTitleLength(titleRaw, 10),
      content: typeof draft.content === 'string'
        ? draft.content
        : (typeof draft.description === 'string' ? draft.description : ''),
      startsAt,
      endsAt,
      repeatRule: typeof draft.repeatRule === 'string'
        ? draft.repeatRule
        : (typeof draft.repeat_rule === 'string' ? draft.repeat_rule : ''),
    };
  }

  function _buildAssistantDrafts(inputText: string, records: Record<string, unknown>[]): TaskAssistantDraft[] {
    return records
      .map((record, index) => {
        const preset = _draftToCreateTaskForm(inputText, record);
        const appointmentPreset = _isAppointmentDraft(record) ? _draftToCreateAppointmentForm(inputText, record) : null;
        const rawTitle = (typeof record.title === 'string' ? record.title.trim() : preset.title?.trim()) || `安排 ${index + 1}`;
        return {
          ...(appointmentPreset ?? preset),
          id: `${Date.now()}-${index}`,
          rawTitle,
          sourceText: typeof record.sourceText === 'string'
            ? record.sourceText
            : (typeof record.source === 'string' ? record.source : ''),
          state: 'pending' as const,
        };
      })
      .filter((draft) => !!draft.title?.trim());
  }

  function _draftKindLabel(draft: TaskAssistantDraft): '任务' | '日程' {
    return draft.kind === 'appointment' ? '日程' : '任务';
  }

  function _formatDraftDateLabel(label: string, value?: string): string | null {
    if (!value?.trim()) return null;
    return `${label}：${value.replace('T', ' ')}`;
  }

  function _openDraftInCreateForm(draft: TaskAssistantDraft): void {
    setActiveTaskDraftId(draft.id);
    setShowTaskDraftModal(false);
    _openCreateTaskModal(draft);
  }

  function _ignoreTaskDraft(draftId: string): void {
    setTaskAssistantDrafts((drafts) => drafts.map((draft) => (
      draft.id === draftId ? { ...draft, state: 'ignored' } : draft
    )));
  }

  function _resetTaskAssistant(): void {
    setShowTaskAssistantModal(false);
    setTaskAssistantError(null);
    setTaskAssistantInput('');
  }

  function _closeTaskDraftModal(): void {
    setShowTaskDraftModal(false);
    setTaskAssistantDrafts([]);
    setActiveTaskDraftId(null);
  }

  function _allDraftsHandled(drafts: TaskAssistantDraft[]): boolean {
    return drafts.length > 0 && drafts.every((draft) => draft.state !== 'pending');
  }

  function _completeActiveTaskDraft(): void {
    if (!activeTaskDraftId) return;
    setTaskAssistantDrafts((drafts) => {
      const nextDrafts = drafts.map((draft) => (
        draft.id === activeTaskDraftId ? { ...draft, state: 'created' as const } : draft
      ));
      if (!_allDraftsHandled(nextDrafts)) {
        setShowTaskDraftModal(true);
      }
      return nextDrafts;
    });
    setActiveTaskDraftId(null);
  }

  async function _generateTaskByAssistant(): Promise<void> {
    if (taskAssistantSubmitting) return;
    const text = taskAssistantInput.trim();
    if (!text) {
      setTaskAssistantError('请输入安排描述');
      return;
    }
    setTaskAssistantSubmitting(true);
    setTaskAssistantError(null);
    try {
      const res = await apiJson<{ reply: string }>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `请判断以下原始通知文本包含一个还是多个“安排”，并仅返回 JSON，不要返回其他文字。返回格式为：{"mode":"single"|"multiple","tasks":[{"kind":"task|appointment","title":"不超过10个字的简练标题","content":"保留必要上下文和要求","priority":0-3,"targetMinutes":25,"targetCycleCount":1,"cyclePeriod":"daily|weekly|monthly|custom","customCycleDays":1,"event":"","tags":["字符串标签"],"startDate":"","dueDate":"","startsAt":"","endsAt":"","repeatRule":"","sourceText":"来自原文的依据片段"}]}。需要专注投入的事项标记为 task；只需出席或到点确认的事项标记为 appointment。task 使用 targetMinutes/startDate/dueDate 等字段；appointment 使用 startsAt/endsAt/repeatRule 等字段。如果只有一个事项，tasks 只放一项；如果有多个独立事项，必须拆成多个安排草稿，不要合并。原始通知文本：${text}`,
          history: [],
          scope: 'general',
        }),
      });
      const payload = _extractJsonValue(typeof res.reply === 'string' ? res.reply : '');
      if (!payload) {
        throw new Error('AI 返回格式无法识别');
      }
      const taskObjects = _extractTaskDraftObjects(payload);
      if (taskObjects.length > 1) {
        const drafts = _buildAssistantDrafts(text, taskObjects);
        if (drafts.length <= 1) {
          throw new Error('AI 返回的多任务草稿不完整');
        }
        setTaskAssistantDrafts(drafts);
        _resetTaskAssistant();
        setShowTaskDraftModal(true);
        return;
      }
      const singleDraft = taskObjects[0] ?? (_isLegacySingleTaskPayload(payload) ? payload : null);
      if (!singleDraft) {
        throw new Error('AI 返回格式无法识别');
      }
      const preset = _isAppointmentDraft(singleDraft)
        ? _draftToCreateAppointmentForm(text, singleDraft)
        : _draftToCreateTaskForm(text, singleDraft);
      _resetTaskAssistant();
      _openCreateTaskModal(preset);
    } catch (e) {
      setTaskAssistantError(e instanceof Error ? e.message : '快捷生成失败');
    } finally {
      setTaskAssistantSubmitting(false);
    }
  }

  async function _loadTasks() {
    setTasksLoading(true);
    try {
      const res = await apiJson('/todo/tasks?limit=100');
      setTasks(res as Task[]);
    } catch (e) {
      console.error('Failed to load tasks', e);
    } finally {
      setTasksLoading(false);
    }
  }

  async function _loadAppointments() {
    setAppointmentsLoading(true);
    try {
      const res = await apiJson('/todo/appointments');
      setAppointments(Array.isArray(res) ? res as Appointment[] : []);
    } catch (e) {
      console.error('Failed to load appointments', e);
      setAppointments([]);
    } finally {
      setAppointmentsLoading(false);
    }
  }

  async function _loadCurrentFocus() {
    try {
      const res = await apiJson('/todo/focus/current');
      setCurrentFocus(res as FocusSession);
    } catch {
      // 404 means no focus, which is fine
      setCurrentFocus(null);
    }
  }

  async function _loadTodayFocus() {
    try {
      const res = await apiJson('/todo/focus/today');
      setTodayFocusMinutes((res as TodayFocusSummary).minutes);
    } catch (e) {
      console.error('Failed to load today focus', e);
    }
  }

  async function _loadFocusWorkflow() {
    try {
      const res = await apiJson('/todo/focus/workflow/current');
      const workflow = res as FocusWorkflow;
      setFocusWorkflow(workflow);
      const reminder = deriveWorkflowNotification(previousWorkflowSnapshotRef.current, workflow);
      previousWorkflowSnapshotRef.current = workflow;
      if (reminder && reminder.key !== lastWorkflowNotificationKeyRef.current) {
        lastWorkflowNotificationKeyRef.current = reminder.key;
        window.dispatchEvent(
          new CustomEvent('ark:main-agent-workflow-notification', {
            detail: {
              key: reminder.key,
              prompt: buildWorkflowNotificationPrompt(reminder),
            },
          }),
        );
      }
      if (workflow.state !== 'focus' || workflow.pending_confirmation || workflow.pending_task_selection) {
        setCurrentFocus(null);
      }
    } catch (e) {
      console.error('Failed to load focus workflow', e);
      previousWorkflowSnapshotRef.current = null;
      setFocusWorkflow({
        state: 'normal',
        task_id: null,
        task_title: null,
        pending_confirmation: false,
        pending_task_selection: false,
        remaining_seconds: null,
      });
    }
  }

  async function _loadWorkflowPresets() {
    try {
      const res = await apiJson('/todo/focus/workflows');
      setWorkflowPresets(res as WorkflowPreset[]);
    } catch (e) {
      console.error('Failed to load workflow presets', e);
      setWorkflowError(e instanceof Error ? e.message : '加载工作流失败');
    }
  }

  function _editWorkflowPreset(preset: WorkflowPreset) {
    setEditingWorkflowId(preset.id);
    setWorkflowForm({
      name: preset.name,
      defaultFocusTimerMode: preset.default_focus_timer_mode ?? 'countdown',
      phases: preset.phases.length
        ? preset.phases.map((phase) => ({
            phase_type: phase.phase_type,
            duration: phase.duration,
            timer_mode: phase.phase_type === 'focus' ? (phase.timer_mode ?? preset.default_focus_timer_mode ?? 'countdown') : 'countdown',
            task_id: phase.phase_type === 'focus' ? (phase.task_id ?? null) : null,
          }))
        : [
            {
              phase_type: 'focus',
              duration: preset.focus_duration,
              timer_mode: preset.default_focus_timer_mode ?? 'countdown',
              task_id: null,
            },
            { phase_type: 'break', duration: preset.break_duration, timer_mode: 'countdown', task_id: null },
          ],
      isDefault: preset.is_default,
    });
    setWorkflowError(null);
  }

  function _updateWorkflowPhase(index: number, patch: Partial<WorkflowFormPhase>) {
    setWorkflowForm((s) => {
      const next = s.phases.map((phase, i) => {
        if (i !== index) return phase;
        const updated = { ...phase, ...patch };
        if (updated.phase_type === 'break') {
          updated.timer_mode = 'countdown';
          updated.task_id = null;
        }
        return updated;
      });
      return { ...s, phases: next };
    });
  }

  function _addWorkflowPhase() {
    setWorkflowForm((s) => {
      const last = s.phases[s.phases.length - 1];
      const nextType: 'focus' | 'break' = last?.phase_type === 'focus' ? 'break' : 'focus';
      return {
        ...s,
        phases: [
          ...s.phases,
          {
            phase_type: nextType,
            duration: 5 * 60,
            timer_mode: nextType === 'focus' ? s.defaultFocusTimerMode : 'countdown',
            task_id: null,
          },
        ],
      };
    });
  }

  function _removeWorkflowPhase(index: number) {
    setWorkflowForm((s) => {
      if (s.phases.length <= 1) return s;
      return { ...s, phases: s.phases.filter((_, i) => i !== index) };
    });
  }

  async function _submitWorkflowPreset() {
    if (workflowSubmitting) return;
    const name = workflowForm.name.trim();
    if (!name) {
      setWorkflowError('请输入工作流名称');
      return;
    }
    if (!workflowForm.phases.length) {
      setWorkflowError('至少配置一个阶段');
      return;
    }
    for (let i = 0; i < workflowForm.phases.length; i++) {
      const phase = workflowForm.phases[i];
      if (phase.duration < 60) {
        setWorkflowError('每个阶段时长不能小于 60 秒');
        return;
      }
      if (i > 0 && workflowForm.phases[i - 1].phase_type === phase.phase_type) {
        setWorkflowError('相邻阶段必须交替 focus / break');
        return;
      }
    }
    if (workflowForm.phases[0].phase_type !== 'focus') {
      setWorkflowError('第一个阶段必须是专注');
      return;
    }
    const focusDuration = workflowForm.phases.find((phase) => phase.phase_type === 'focus')?.duration ?? 1500;
    const breakDuration = workflowForm.phases.find((phase) => phase.phase_type === 'break')?.duration ?? 300;
    setWorkflowSubmitting(true);
    setWorkflowError(null);
    try {
      const body = JSON.stringify({
        name,
        phases: workflowForm.phases.map((phase) => ({
          phase_type: phase.phase_type,
          duration: Math.round(phase.duration),
          timer_mode: phase.phase_type === 'focus' ? phase.timer_mode : undefined,
          task_id: phase.phase_type === 'focus' ? phase.task_id : undefined,
        })),
        focus_duration: Math.round(focusDuration),
        break_duration: Math.round(breakDuration),
        default_focus_timer_mode: workflowForm.defaultFocusTimerMode,
        is_default: workflowForm.isDefault,
      });
      if (editingWorkflowId) {
        await apiJson(`/todo/focus/workflows/${editingWorkflowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      } else {
        await apiJson('/todo/focus/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      }
      setEditingWorkflowId(null);
      setWorkflowForm(createDefaultWorkflowForm(false));
      await _loadWorkflowPresets();
    } catch (e) {
      setWorkflowError(e instanceof Error ? e.message : '保存工作流失败');
    } finally {
      setWorkflowSubmitting(false);
    }
  }

  async function _deleteWorkflowPreset(presetId: string) {
    if (!window.confirm('确认删除该工作流吗？')) return;
    try {
      await apiJson(`/todo/focus/workflows/${presetId}`, { method: 'DELETE' });
      if (editingWorkflowId === presetId) {
        setEditingWorkflowId(null);
      }
      await _loadWorkflowPresets();
    } catch (e) {
      setWorkflowError(e instanceof Error ? e.message : '删除工作流失败');
    }
  }

  async function _setDefaultWorkflowPreset(presetId: string) {
    try {
      await apiJson(`/todo/focus/workflows/${presetId}/default`, { method: 'POST' });
      await _loadWorkflowPresets();
    } catch (e) {
      setWorkflowError(e instanceof Error ? e.message : '设置默认工作流失败');
    }
  }

  async function _confirmFocusWorkflowPhase() {
    if (confirmingFocusPhase) return;
    setConfirmingFocusPhase(true);
    try {
      const res = await apiJson('/todo/focus/workflow/confirm', { method: 'POST' }) as FocusWorkflow;
      if (res.state === 'normal' && res.completed_workflow_name) {
        alert(`恭喜完成${res.completed_workflow_name}工作流`);
      }
      await Promise.all([_loadCurrentFocus(), _loadTodayFocus(), _loadFocusWorkflow()]);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (e) {
      console.error('Failed to confirm focus workflow', e);
      alert('阶段确认失败');
    } finally {
      setConfirmingFocusPhase(false);
    }
  }

  async function _selectFocusWorkflowTask(taskId: string) {
    try {
      const res = await apiJson('/todo/focus/workflow/select-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      }) as FocusWorkflow;
      setFocusWorkflow(res);
      setShowFocusTaskPicker(false);
      await Promise.all([_loadCurrentFocus(), _loadTodayFocus(), _loadFocusWorkflow(), _loadTasks()]);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (e) {
      console.error('Failed to select workflow task', e);
      alert('选择任务失败');
    }
  }

  async function _startFocus(taskId: string) {
    try {
      const res = await apiJson(`/todo/tasks/${taskId}/focus/start`, {
        method: 'POST'
      });
      setCurrentFocus(res as FocusSession);
      await Promise.all([_loadTasks(), _loadFocusWorkflow()]);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (e) {
      console.error('Failed to start focus', e);
      alert('开始专注失败');
    }
  }

  async function _stopFocus() {
    try {
      await apiJson('/todo/focus/stop', {
        method: 'POST'
      });
      setCurrentFocus(null);
      await Promise.all([_loadTasks(), _loadFocusWorkflow()]);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (e) {
      console.error('Failed to stop focus', e);
    }
  }

  function _openEditTask(task: Task) {
    setSelectedTask(task);
    setShowEditTaskModal(true);
  }

  function _openEditAppointment(appointment: Appointment) {
    setSelectedAppointment(appointment);
    setShowEditAppointmentModal(true);
  }

  function _isToday(value: string | null): boolean {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  }

  function _formatShortDateTime(value: string | null): string {
    if (!value) return '无时间';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '无时间';
    return `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  async function _handleDeleteTask(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    if (!window.confirm(`确定要删除任务「${task.title}」吗？`)) return;
    try {
      await apiJson(`/todo/tasks/${task.id}`, { method: 'DELETE' });
      await _loadTasks();
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      if (showEditTaskModal) {
        setShowEditTaskModal(false);
      }
    } catch (e) {
      console.error('删除任务失败:', e);
    }
  }

  async function _handleCompleteTask(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    try {
      setTasks(tasks.map(t => t.id === task.id ? { ...t, status: 'done' } : t));
      await apiJson(`/todo/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' })
      });
      _loadTasks();
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (e) {
      console.error('Failed to complete task', e);
      _loadTasks();
    }
  }

  async function _handleUndoCompleteTask(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    try {
      setTasks(tasks.map(t => t.id === task.id ? { ...t, status: 'todo' } : t));
      await apiJson(`/todo/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'todo' })
      });
      _loadTasks();
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (e) {
      console.error('Failed to undo complete task', e);
      _loadTasks();
    }
  }

  function _renderSmallTaskCard(task: Task, draggable: boolean, summaryEntry = false) {
    return (
      <div
        key={task.id}
        draggable={draggable}
        onDragStart={(e) => {
          if (draggable) {
            e.dataTransfer.setData('text/plain', task.id);
          }
        }}
        onClick={() => _openEditTask(task)}
        className="group flex flex-col gap-1.5 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer relative"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <div className={`w-1.5 h-1.5 shrink-0 rounded-full ${
              task.status === 'done' ? 'bg-green-500/50' : (task.task_type === 'checkin' ? 'bg-emerald-500/70' : 'bg-blue-400/50')
            }`} />
            <span className={`font-medium text-sm line-clamp-1 ${task.status === 'done' ? 'text-white/40 line-through decoration-white/30' : 'text-white/90'}`}>
              {task.title}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {task.priority > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                task.priority === 3 ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                task.priority === 2 ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
                'bg-white/5 border-white/10 text-white/40'
              }`}>
                P{task.priority}
              </span>
            )}
            {summaryEntry ? (
              <span className="rounded-full border border-blue-300/15 bg-blue-300/10 px-2 py-0.5 text-[10px] font-semibold text-blue-100">
                进入任务
              </span>
            ) : (
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                {task.status !== 'done' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); _handleCompleteTask(e, task); }}
                    className="p-1 rounded hover:bg-green-500/20 text-white/40 hover:text-green-400"
                    title="完成"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </button>
                )}
                {task.status === 'done' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); _handleUndoCompleteTask(e, task); }}
                    className="p-1 rounded hover:bg-blue-500/20 text-white/40 hover:text-blue-400"
                    title="撤销完成"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 14 4 9 9 4"></polyline>
                      <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                    </svg>
                  </button>
                )}
                {task.status === 'done' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); _handleDeleteTask(e, task); }}
                    className="p-1 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400"
                    title="删除"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function _renderSmallAppointmentCard(appointment: Appointment) {
    const isCancelled = appointment.status === 'cancelled';
    const isNeedsConfirmation = appointment.status === 'needs_confirmation';
    return (
      <div
        key={appointment.id}
        onClick={() => _openEditAppointment(appointment)}
        className={`group flex flex-col gap-1.5 p-3 rounded-xl border transition-all cursor-pointer relative ${
          isCancelled
            ? 'bg-white/[0.025] border-white/5 opacity-55'
            : isNeedsConfirmation
              ? 'bg-amber-500/10 border-amber-400/20 hover:bg-amber-500/15'
              : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`w-1.5 h-1.5 shrink-0 rounded-full ${
              isCancelled ? 'bg-white/30' : isNeedsConfirmation ? 'bg-amber-400' : 'bg-cyan-300/70'
            }`} />
            <span className={`font-medium text-sm line-clamp-1 ${isCancelled ? 'text-white/40 line-through decoration-white/25' : 'text-white/90'}`}>
              {appointment.title}
            </span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-white/5 border-white/10 text-white/45">
            {_formatShortDateTime(appointment.ends_at)}
          </span>
        </div>
        <div className="pl-3.5 text-[11px] text-white/40">
          {isNeedsConfirmation ? '待确认' : isCancelled ? '已取消' : '截止时间'}
        </div>
      </div>
    );
  }

  function _renderFilteredTasksPane() {
    if (tasksLoading && tasks.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white/30 animate-pulse">
          <span className="text-sm">加载中...</span>
        </div>
      );
    }
    
    let filtered = tasks;
    if (activeTab === 'daily') filtered = tasks.filter(t => t.cycle_period === 'daily');
    else if (activeTab === 'weekly') filtered = tasks.filter(t => t.cycle_period === 'weekly');
    else if (activeTab === 'periodic') filtered = tasks.filter(t => t.cycle_period === 'monthly');
    else if (activeTab === 'custom') filtered = tasks.filter(t => t.cycle_period === 'custom');

    const activeTasks = filtered.filter(t => t.status !== 'done');
    const completedTasks = filtered.filter(t => t.status === 'done');

    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white/30">
          <span className="text-sm">暂无任务</span>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6 pb-4">
        {activeTasks.length > 0 && (
          <div className="flex flex-col gap-2">
            {activeTasks.map(t => _renderSmallTaskCard(t, true))}
          </div>
        )}
        {completedTasks.length > 0 && (
          <div className="flex flex-col gap-2 pt-4 border-t border-white/5 opacity-60">
            <div className="flex justify-between items-center px-1">
              <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
                已完成 ({completedTasks.length})
              </h4>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCompletedAll(!showCompletedAll); }}
                className="text-[10px] text-blue-400/80 hover:text-blue-300"
              >
                {showCompletedAll ? '收起' : '展开'}
              </button>
            </div>
            {showCompletedAll && completedTasks.map(t => _renderSmallTaskCard(t, false))}
          </div>
        )}
      </div>
    );
  }

  function _renderFilteredAppointmentsPane() {
    if (appointmentsLoading && appointments.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white/30 animate-pulse">
          <span className="text-sm">加载中...</span>
        </div>
      );
    }

    let filtered = appointments;
    if (activeAppointmentTab === 'today') {
      filtered = appointments.filter((appointment) => _isToday(appointment.ends_at));
    } else if (activeAppointmentTab === 'needs_confirmation') {
      filtered = appointments.filter((appointment) => appointment.status === 'needs_confirmation');
    } else if (activeAppointmentTab === 'repeating') {
      filtered = appointments.filter((appointment) => !!appointment.repeat_rule);
    }

    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white/30">
          <span className="text-sm">暂无日程</span>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 pb-4">
        {filtered.map((appointment) => _renderSmallAppointmentCard(appointment))}
      </div>
    );
  }

  function _pickTodayFocusTask(): Task | null {
    if (!tasks.length) return null;
    try {
      if (focusTargetTaskId) {
        const picked = tasks.find((t) => t.id === focusTargetTaskId && t.status !== 'done');
        if (picked) return picked;
      }
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      const candidates = tasks.filter(t => {
        if (t.status === 'done') return false;
        const start = t.start_date ? new Date(t.start_date) : null;
        const end = t.due_date ? new Date(t.due_date) : null;
        
        const startCondition = start ? start < tomorrowStart : true;
        const endCondition = end ? end >= todayStart : true;
        
        return startCondition && endCondition;
      });
      
      if (!candidates.length) return null;
      
      candidates.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      return candidates[0];
    } catch {
      return null;
    }
  }

  async function _handleFocusToggle(e: React.MouseEvent) {
    e.stopPropagation();
    
    if (focusWorkflow && focusWorkflow.state !== 'normal') {
      if (focusWorkflow.pending_task_selection) {
        setShowFocusTaskPicker(true);
        _loadTasks();
        return;
      }
      if (focusWorkflow.pending_confirmation) {
        await _confirmFocusWorkflowPhase();
      } else {
        try {
          await apiJson('/todo/focus/workflow/skip_phase', { method: 'POST' });
          await Promise.all([_loadCurrentFocus(), _loadTodayFocus(), _loadFocusWorkflow()]);
          window.dispatchEvent(new CustomEvent('ark:reload-focus'));
        } catch (err) {
          console.error('Failed to skip phase', err);
        }
      }
      return;
    }

    // 如果当前正在专注，则停止
    if (currentFocus) {
      // 简单的停止逻辑，或者根据需求：如果点击的是同一个任务则停止，不同任务则切换？
      // 这里的 UI 是全局的“专注状态”，所以点击意味着结束当前专注。
      // 但是根据用户需求 1: "检查...是否是即将要专注的特定任务...是则跳转第二步(开始专注?)...否则提示...然后跳转第二步"
      // 这意味着点击这个 div 总是倾向于 "开始专注目标任务"。
      
      const targetTask = _pickTodayFocusTask();
      
      // 如果没有目标任务，但当前有专注，点击应该是停止？
      if (!targetTask) {
        if (confirm('当前无今日待办任务，是否结束当前专注？')) {
          await _stopFocus();
        }
        return;
      }

      // 如果当前专注的就是目标任务 -> 用户可能是想停止？
      // 但用户需求说：
      // "该 div 的悬停状态下显示的文字 由 开始专注 变成结束专注... 任务名称则变为正在专注的任务"
      // 这意味着如果已经专注，UI 显示为“结束专注”，点击它应该执行“结束专注”的操作。
      
      if (currentFocus.task_id === targetTask.id) {
         await _stopFocus();
         return;
      }

      // 如果当前专注的不是目标任务 -> 切换
      alert('正在专注其他任务，将为您切换到新任务');
      await _stopFocus();
      await _startFocus(targetTask.id);
    } else {
      // 当前无专注 -> 开始专注目标任务
      const targetTask = _pickTodayFocusTask();
      if (targetTask) {
        await _startFocus(targetTask.id);
      } else {
        alert('今日无待办任务，请先创建或安排任务');
      }
    }
  }

  async function _switchFocusTarget(task: Task) {
    if (task.status === 'done') return;
    if (focusWorkflow?.pending_task_selection) {
      await _selectFocusWorkflowTask(task.id);
      return;
    }
    setFocusTargetTaskId(task.id);
    setShowFocusTaskPicker(false);
  }

  async function _handleCompleteAndStopFocus(e: React.MouseEvent) {
    e.stopPropagation();
    if (focusQuickActionBusy) return;
    const targetTaskId = currentFocus?.task_id ?? _pickTodayFocusTask()?.id ?? null;
    if (!targetTaskId) {
      alert('没有可完成的即将专注任务');
      return;
    }
    setFocusQuickActionBusy(true);
    try {
      await apiJson(`/todo/tasks/${targetTaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      if (currentFocus?.task_id === targetTaskId) {
        await apiJson('/todo/focus/stop', { method: 'POST' });
        setCurrentFocus(null);
      }
      setFocusTargetTaskId((prev) => (prev === targetTaskId ? null : prev));
      await Promise.all([_loadTasks(), _loadCurrentFocus(), _loadTodayFocus()]);
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (e) {
      console.error('Failed to complete and stop focus', e);
      alert('完成任务失败');
    } finally {
      setFocusQuickActionBusy(false);
    }
  }

  async function _submitCreateTask(): Promise<void> {
    if (createTaskSubmitting) return;
    const title = (createArrangementKind === 'appointment' ? createAppointmentForm.title : createTaskForm.title).trim();
    if (!title) {
      setCreateTaskError(createArrangementKind === 'appointment' ? '请输入日程标题' : '请输入任务标题');
      return;
    }
    if (createArrangementKind === 'appointment') {
      if (!createAppointmentForm.endsAt.trim()) {
        setCreateTaskError('请输入结束时间');
        return;
      }
    }
    const targetMinutes = Number.isFinite(createTaskForm.targetMinutes) ? createTaskForm.targetMinutes : 0;
    if (createArrangementKind === 'task' && targetMinutes < 0) {
      setCreateTaskError('目标时长不能为负数');
      return;
    }

    setCreateTaskSubmitting(true);
    setCreateTaskError(null);
    try {
      if (createArrangementKind === 'appointment') {
        await apiJson('/todo/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content: createAppointmentForm.content.trim() || null,
            starts_at: createAppointmentForm.startsAt ? new Date(createAppointmentForm.startsAt).toISOString() : null,
            ends_at: new Date(createAppointmentForm.endsAt).toISOString(),
            repeat_rule: createAppointmentForm.repeatRule.trim() || null,
          }),
        });
        setShowCreateTaskModal(false);
        _completeActiveTaskDraft();
        _resetCreateTaskForm();
        window.dispatchEvent(new CustomEvent('ark:reload-focus'));
        return;
      }
      const startDate = createTaskForm.startDate ? new Date(createTaskForm.startDate).toISOString() : null;
      const dueDate = createTaskForm.dueDate ? new Date(createTaskForm.dueDate).toISOString() : null;
      const cycleEveryDays = createTaskForm.cyclePeriod === 'custom' ? Math.max(1, Math.floor(createTaskForm.customCycleDays || 1)) : null;
      const tags = createTaskForm.tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      await apiJson('/todo/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: createTaskForm.content.trim() ? createTaskForm.content : null,
          status: 'todo',
          priority: createTaskForm.priority,
          target_duration: Math.round(targetMinutes * 60),
          current_cycle_count: 0,
          target_cycle_count: Math.max(0, Math.floor(createTaskForm.targetCycleCount || 0)),
          cycle_period: createTaskForm.cyclePeriod,
          cycle_every_days: cycleEveryDays,
          event: createTaskForm.event.trim(),
          event_ids: createTaskForm.eventIds,
          task_type: createTaskForm.taskType,
          tags,
          start_date: startDate,
          due_date: dueDate,
        }),
      });
      setShowCreateTaskModal(false);
      _completeActiveTaskDraft();
      _resetCreateTaskForm();
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '创建任务失败';
      setCreateTaskError(msg);
    } finally {
      setCreateTaskSubmitting(false);
    }
  }

  if (index === 0) {
    const targetTask = _pickTodayFocusTask();
    const isFocusing = !!currentFocus;
    const isWorkflowActive = !!focusWorkflow && focusWorkflow.state !== 'normal';
    const hasPendingTransition = !!focusWorkflow?.pending_confirmation;
    const hasPendingTaskSelection = !!focusWorkflow?.pending_task_selection;
    const isBreakPhase = focusWorkflow?.state === 'break';
    
    // 如果正在专注，显示正在专注的任务名；否则显示即将专注的任务名
    let displayTaskTitle = targetTask?.title || '无计划';
    if (isWorkflowActive) {
      if (isBreakPhase) {
        displayTaskTitle = '休息中...';
      } else if (hasPendingTaskSelection) {
        displayTaskTitle = '等待选择任务';
      } else {
        displayTaskTitle = focusWorkflow?.task_title || tasks.find(t => t.id === focusWorkflow?.task_id)?.title || '未知任务';
      }
    } else if (isFocusing) {
      displayTaskTitle = tasks.find(t => t.id === currentFocus.task_id)?.title || '未知任务';
    }

    return (
      <>
        <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 p-2 flex gap-2">
          <div className="flex-[2] flex flex-col rounded overflow-hidden">
            <div 
              className={`group relative flex-[2] bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer ${
                isFocusing || isWorkflowActive ? 'bg-blue-500/10 border border-blue-500/20' : ''
              }`}
              onClick={_handleFocusToggle}
            >
              {/* 左上角结束工作流按钮 */}
              {isWorkflowActive && (
                <button
                  className="absolute top-2 left-2 px-2 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all opacity-0 group-hover:opacity-100 z-10 w-10 flex items-center justify-center"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm('当前正在工作流中，是否结束整个工作流？')) {
                      await _stopFocus();
                    }
                  }}
                  title="结束工作流"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}

              {/* 右上角切换按钮 */}
              <button 
                className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-white/40 hover:text-white/80 transition-all opacity-0 group-hover:opacity-100 z-10 w-12 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFocusTaskPicker(true);
                  _loadTasks();
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 7l-5-5-5 5"/>
                  <path d="M19 7H3"/>
                  <path d="M5 17l5 5 5-5"/>
                  <path d="M5 17h16"/>
                </svg>
              </button>
              <button
                className="absolute top-14 right-2 px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-white/40 hover:text-emerald-300 transition-all opacity-0 group-hover:opacity-100 z-10 w-12 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={_handleCompleteAndStopFocus}
                disabled={focusQuickActionBusy}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>

              <div className="flex flex-col items-center justify-center group-hover:opacity-0 transition-opacity duration-300">
                {isWorkflowActive && (
                  <span className="text-sm font-medium text-white/70 mb-1">
                    {focusWorkflow.state === 'focus' ? '专注阶段' : '休息阶段'}
                  </span>
                )}
                <span className={`text-4xl font-bold ${
                  isFocusing || isWorkflowActive ? 'text-blue-400' : ''
                }`}>
                  {isFocusing || isWorkflowActive ? focusDurationStr : `${todayFocusMinutes}min`}
                </span>
              </div>
              
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-2xl font-bold">
                  {isWorkflowActive
                    ? (hasPendingTaskSelection ? '选择任务' : (hasPendingTransition ? '确认流转' : '跳过阶段'))
                    : (isFocusing ? '结束专注' : '开始专注')}
                </span>
                <span className="text-sm text-white/60 mt-1">
                  {isWorkflowActive && isBreakPhase ? '' : (isFocusing || isWorkflowActive ? '正在专注于：' : '即将专注于：')}
                  {displayTaskTitle}
                </span>
              </div>
            </div>
            {hasPendingTaskSelection && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm bg-sky-500/15 border-t border-sky-400/30">
                <span>当前专注阶段尚未绑定任务，先选一个未完成任务再开始。</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowFocusTaskPicker(true);
                    _loadTasks();
                  }}
                  className="px-3 py-1 rounded bg-sky-400/80 text-black font-medium hover:bg-sky-300"
                >
                  选择当前阶段任务
                </button>
              </div>
            )}
            {hasPendingTransition && (
              <div className="flex items-center justify-between px-3 py-2 text-sm bg-amber-500/15 border-t border-amber-400/30">
                <span>
                  {isBreakPhase ? '休息阶段已结束，等待确认进入专注' : '专注阶段已结束，等待确认进入休息'}
                </span>
                <button
                  onClick={_confirmFocusWorkflowPhase}
                  disabled={confirmingFocusPhase}
                  className="px-3 py-1 rounded bg-amber-400/80 text-black font-medium hover:bg-amber-300 disabled:opacity-60"
                >
                  {confirmingFocusPhase ? '确认中' : '确认流转'}
                </button>
              </div>
            )}
            <div 
              className="flex-1 bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              onClick={() => setShowStatsModal(true)}
            >
              <span className="text-sm font-medium">每日目标：120min</span>
            </div>
          </div>
          <div 
            onClick={() => setShowTaskModal(true)}
            className="flex-1 bg-white/5 rounded flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer relative group/task"
          >
            <span className="writing-vertical-rl text-lg font-bold tracking-widest">安排</span>
            
            {/* 右下角加号按钮 */}
            <button 
              className="absolute bottom-2 right-2 w-8 h-8 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white shadow-lg transition-all hover:scale-105 active:scale-95 group-hover/task:opacity-100 opacity-60 backdrop-blur-sm"
              aria-label="快捷创建安排"
              onClick={(e) => {
                e.stopPropagation();
                setTaskAssistantError(null);
                setShowTaskAssistantModal(true);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>

        {showFocusTaskPicker && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowFocusTaskPicker(false)}
          >
            <div
              className="w-[560px] max-w-[92vw] max-h-[72vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-14 border-b border-white/10 flex items-center justify-between px-5 bg-white/5">
                <h3 className="text-lg font-bold text-white">全部任务</h3>
                <button
                  onClick={() => setShowFocusTaskPicker(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[calc(72vh-56px)] flex flex-col gap-2">
                {tasks.filter((task) => task.status !== 'done').map((task) => (
                  <button
                    key={task.id}
                    onClick={() => _switchFocusTarget(task)}
                    aria-label={`选择任务 ${task.title}`}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      focusTargetTaskId === task.id
                          ? 'border-blue-500/40 bg-blue-500/10 text-white'
                          : 'border-white/10 bg-white/5 text-white/85 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span>{task.title}</span>
                      <span className="text-xs text-white/45">待办</span>
                    </div>
                  </button>
                ))}
                {tasks.filter((task) => task.status !== 'done').length === 0 && (
                  <div className="text-center text-white/35 py-6">暂无任务</div>
                )}
              </div>
            </div>
          </div>
        )}

        {showWorkflowModal && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowWorkflowModal(false)}
          >
            <div
              className="w-[760px] max-w-[94vw] max-h-[78vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-14 border-b border-white/10 flex items-center justify-between px-5 bg-white/5">
                <h3 className="text-lg font-bold text-white">工作流管理</h3>
                <button
                  onClick={() => setShowWorkflowModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-0 h-[calc(78vh-56px)]">
                <div className="border-r border-white/10 p-4 overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-white/70">已保存工作流</span>
                    <button
                      onClick={() => {
                        setEditingWorkflowId(null);
                        setWorkflowForm(createDefaultWorkflowForm(workflowPresets.length === 0));
                        setWorkflowError(null);
                      }}
                      className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                    >
                      新建
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {workflowPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className={`rounded-lg border p-3 cursor-pointer transition-colors ${preset.is_default ? 'border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                        onClick={() => _editWorkflowPreset(preset)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-white">{preset.name}</div>
                            <div className="text-xs text-white/60 mt-1">
                              {preset.phases.map((phase, idx) => `${idx + 1}.${phase.phase_type === 'focus' ? '专注' : '休息'} ${Math.round(phase.duration / 60)}min`).join(' · ')}
                            </div>
                          </div>
                          {preset.is_default && <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/30">默认</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              _setDefaultWorkflowPreset(preset.id);
                            }}
                            className="text-xs px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30"
                          >
                            设为默认
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              _deleteWorkflowPreset(preset.id);
                            }}
                            className="text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                    {workflowPresets.length === 0 && (
                      <div className="text-center text-white/35 py-8">暂无工作流，先创建一个</div>
                    )}
                  </div>
                </div>
                <div className="p-4 overflow-y-auto">
                  <h4 className="text-sm text-white/70 mb-3">{editingWorkflowId ? '编辑工作流' : '创建工作流'}</h4>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                      <label htmlFor="workflow-name" className="text-xs text-white/60">名称</label>
                      <input
                        id="workflow-name"
                        aria-label="工作流名称"
                        value={workflowForm.name}
                        onChange={(e) => setWorkflowForm((s) => ({ ...s, name: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        placeholder="例如：番茄默认"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="workflow-default-timer-mode" className="text-xs text-white/60">默认专注计时方式</label>
                      <select
                        id="workflow-default-timer-mode"
                        aria-label="默认专注计时方式"
                        value={workflowForm.defaultFocusTimerMode}
                        onChange={(e) => {
                          const mode = e.target.value as 'countdown' | 'countup';
                          setWorkflowForm((s) => ({
                            ...s,
                            defaultFocusTimerMode: mode,
                            phases: s.phases.map((phase) => (
                              phase.phase_type === 'focus' && phase.timer_mode === s.defaultFocusTimerMode
                                ? { ...phase, timer_mode: mode }
                                : phase
                            )),
                          }));
                        }}
                        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="countdown">倒计时</option>
                        <option value="countup">正计时</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/60">阶段配置</span>
                      <button onClick={_addWorkflowPhase} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">新增阶段</button>
                    </div>
                    <div className="flex flex-col gap-2">
                      {workflowForm.phases.map((phase, idx) => (
                        <div key={`${phase.phase_type}-${idx}`} className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                          <select
                            aria-label={`阶段 ${idx + 1} 类型`}
                            value={phase.phase_type}
                            onChange={(e) => _updateWorkflowPhase(idx, { phase_type: e.target.value as 'focus' | 'break' })}
                            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          >
                            <option value="focus">专注</option>
                            <option value="break">休息</option>
                          </select>
                          {phase.phase_type === 'focus' && phase.timer_mode === 'countup' ? (
                            <div className="grid grid-cols-[1fr,auto] gap-2">
                              <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/60 flex items-center">
                                正计时阶段不需要单独设置时长
                              </div>
                              <button
                                onClick={() => _removeWorkflowPhase(idx)}
                                className="px-2 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs"
                                disabled={workflowForm.phases.length <= 1}
                              >
                                删除
                              </button>
                            </div>
                          ) : (
                            <div className="grid grid-cols-[1fr,auto] gap-2">
                              <input
                                aria-label={`阶段 ${idx + 1} 时长（分钟）`}
                                type="number"
                                min={1}
                                value={Math.round(phase.duration / 60)}
                                onChange={(e) => _updateWorkflowPhase(idx, { duration: Math.max(60, Number(e.target.value || 1) * 60) })}
                                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                              />
                              <button
                                onClick={() => _removeWorkflowPhase(idx)}
                                className="px-2 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs"
                                disabled={workflowForm.phases.length <= 1}
                              >
                                删除
                              </button>
                            </div>
                          )}
                          {phase.phase_type === 'focus' ? (
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                aria-label={`阶段 ${idx + 1} 计时方式`}
                                value={phase.timer_mode}
                                onChange={(e) => _updateWorkflowPhase(idx, { timer_mode: e.target.value as 'countdown' | 'countup' })}
                                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                              >
                                <option value="countdown">倒计时</option>
                                <option value="countup">正计时</option>
                              </select>
                              <select
                                aria-label={`阶段 ${idx + 1} 绑定任务`}
                                value={phase.task_id ?? ''}
                                onChange={(e) => _updateWorkflowPhase(idx, { task_id: e.target.value || null })}
                                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                              >
                                <option value="">运行时选择任务</option>
                                {tasks.filter((task) => task.status !== 'done').map((task) => (
                                  <option key={task.id} value={task.id}>{task.title}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="text-xs text-white/45 px-1">休息阶段不绑定任务，固定使用倒计时。</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-white/75">
                      <input
                        type="checkbox"
                        checked={workflowForm.isDefault}
                        onChange={(e) => setWorkflowForm((s) => ({ ...s, isDefault: e.target.checked }))}
                      />
                      设为默认工作流
                    </label>
                    {workflowError && <div className="text-sm text-red-400">{workflowError}</div>}
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        onClick={() => {
                          setEditingWorkflowId(null);
                          setWorkflowForm(createDefaultWorkflowForm(false));
                          setWorkflowError(null);
                        }}
                        className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
                        disabled={workflowSubmitting}
                      >
                        重置
                      </button>
                      <button
                        onClick={_submitWorkflowPreset}
                        className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
                        disabled={workflowSubmitting}
                      >
                        {workflowSubmitting ? '保存中...' : (editingWorkflowId ? '保存修改' : '创建工作流')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 专注时长统计悬浮页面 */}
        {showStatsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[80%] h-[80%] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* 顶部标题栏 */}
              <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-white/5">
                <h2 className="text-xl font-bold text-white">专注统计</h2>
                <button 
                  onClick={() => setShowStatsModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              
              {/* 内容区域 */}
              <div className="flex-1 p-6 overflow-hidden">
                <FocusStats 
                  onTaskClick={(taskId) => {
                    const t = tasks.find(x => x.id === taskId);
                    if (t) _openEditTask(t);
                  }} 
                />
              </div>
            </div>
          </div>
        )}

        <TaskEditModal
          open={showEditTaskModal}
          task={selectedTask}
          onClose={() => {
            setShowEditTaskModal(false);
            setSelectedTask(null);
          }}
        />

        <AppointmentEditModal
          open={showEditAppointmentModal}
          appointment={selectedAppointment}
          onClose={() => {
            setShowEditAppointmentModal(false);
            setSelectedAppointment(null);
          }}
          onChanged={_loadAppointments}
        />

        {/* 安排悬浮页面 */}
        {showTaskModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[80%] h-[80%] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* 顶部标题栏 */}
              <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-white/5">
                <h2 className="text-xl font-bold text-white">安排管理</h2>
                <button 
                  onClick={() => setShowTaskModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              {/* 内容区域，双栏布局 */}
              <div className="flex-1 flex overflow-hidden">
                {/* 左栏：安排总览 */}
                <div 
                  className="w-[360px] min-w-[360px] border-r border-white/10 bg-black/20 flex flex-col transition-colors z-10"
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'; }}
                  onDragLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.currentTarget.style.backgroundColor = '';
                    const taskId = e.dataTransfer.getData('text/plain');
                    if (!taskId) return;
                    
                    const taskToMove = tasks.find(t => t.id === taskId);
                    if (taskToMove && taskToMove.start_date) {
                      const start = new Date(taskToMove.start_date);
                      const now = new Date();
                      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                      const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
                      
                      if (start >= tomorrowStart) {
                        const diffTime = start.getTime() - todayStart.getTime();
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        if (!window.confirm(`该任务原定于 ${diffDays} 天后开始，你确定要提前将其安排到今日吗？`)) {
                          return;
                        }
                      }
                    }

                    try {
                      // 乐观更新
                      setTasks(tasks.map(t => {
                        if (t.id === taskId) {
                          const nowIso = new Date().toISOString();
                          return {
                            ...t,
                            due_date: nowIso,
                            start_date: t.start_date && new Date(t.start_date) > new Date() ? nowIso : t.start_date
                          };
                        }
                        return t;
                      }));
                      await apiJson(`/todo/tasks/${taskId}/move-to-today`, { method: 'PATCH' });
                      _loadTasks();
                      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
                    } catch (err) {
                      console.error('Move to today failed', err);
                      _loadTasks();
                    }
                  }}
                >
                  <div className="h-12 border-b border-white/5 flex items-center px-5 shrink-0 bg-white/[0.01]">
                    <span className="font-bold text-white tracking-wide">安排总览</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
                    {(() => {
                      const todayTasks = tasks.filter(t => {
                        const now = new Date();
                        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
                        const start = t.start_date ? new Date(t.start_date) : null;
                        const end = t.due_date ? new Date(t.due_date) : null;
                        const okStart = start ? start < tomorrowStart : true;
                        const okEnd = end ? end >= todayStart : true;
                        return okStart && okEnd;
                      });
                      
                      const activeTodayTasks = todayTasks.filter(t => t.status !== 'done');
                      const dones = todayTasks.filter(t => t.status === 'done');
                      const todayAppointments = appointments.filter((appointment) => appointment.status !== 'needs_confirmation' && _isToday(appointment.ends_at));
                      const needsConfirmationAppointments = appointments.filter((appointment) => appointment.status === 'needs_confirmation');
                      
                      return (
                        <>
                          {needsConfirmationAppointments.length > 0 && (
                            <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                              有 {needsConfirmationAppointments.length} 个日程待确认
                            </div>
                          )}
                          {activeTodayTasks.length > 0 ? (
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-col gap-2">
                                <h4 className="text-[10px] font-bold text-blue-300 uppercase tracking-widest px-1 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                  今日任务
                                </h4>
                              </div>
                              <div className="flex flex-col gap-2">
                                {activeTodayTasks.map(t => _renderSmallTaskCard(t, false, true))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-10 opacity-30 text-sm">
                              今日无待办，从右侧拖拽任务安排
                            </div>
                          )}

                          {todayAppointments.length > 0 && (
                            <div className="flex flex-col gap-2">
                              <h4 className="text-[10px] font-bold text-cyan-300 uppercase tracking-widest px-1 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
                                今日日程
                              </h4>
                              {todayAppointments.map((appointment) => _renderSmallAppointmentCard(appointment))}
                            </div>
                          )}

                          {needsConfirmationAppointments.length > 0 && (
                            <div className="flex flex-col gap-2">
                              <h4 className="text-[10px] font-bold text-amber-300 uppercase tracking-widest px-1 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
                                待确认日程
                              </h4>
                              {needsConfirmationAppointments.map((appointment) => _renderSmallAppointmentCard(appointment))}
                            </div>
                          )}
                          
                          {dones.length > 0 && (
                            <div className="flex flex-col gap-2 pt-4 border-t border-white/5 opacity-60">
                              <div className="flex justify-between items-center px-1">
                                <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                                  已完成 ({dones.length})
                                </h4>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowCompletedToday(!showCompletedToday); }}
                                  className="text-[10px] text-blue-400/80 hover:text-blue-300"
                                >
                                  {showCompletedToday ? '收起' : '展开'}
                                </button>
                              </div>
                              {showCompletedToday && dones.map(t => _renderSmallTaskCard(t, false, true))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* 右栏：安排仓库 */}
                <div className="flex-1 flex flex-col bg-transparent relative">
                  <div className="h-12 border-b border-white/10 flex items-center justify-between px-6 gap-6 shrink-0 bg-white/[0.01]">
                    <div className="flex h-full items-center gap-5">
                      {[
                        { id: 'tasks', label: '任务' },
                        { id: 'appointments', label: '日程' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveArrangementTab(tab.id as 'tasks' | 'appointments')}
                          className={`h-full relative px-1 text-sm transition-colors ${
                            activeArrangementTab === tab.id ? 'text-white font-bold' : 'text-white/40 hover:text-white/60'
                          }`}
                        >
                          {tab.label}
                          {activeArrangementTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="flex h-full items-center gap-4">
                      {activeArrangementTab === 'tasks' && [
                        { id: 'all', label: '全部' },
                        { id: 'daily', label: '每日' },
                        { id: 'weekly', label: '每周' },
                        { id: 'periodic', label: '周期' },
                        { id: 'custom', label: '自定义' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as 'all' | 'daily' | 'weekly' | 'periodic' | 'custom')}
                          className={`h-full relative px-1 text-xs transition-colors ${
                            activeTab === tab.id ? 'text-white font-bold' : 'text-white/35 hover:text-white/60'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                      {activeArrangementTab === 'appointments' && [
                        { id: 'all', label: '全部' },
                        { id: 'today', label: '今日' },
                        { id: 'needs_confirmation', label: '待确认' },
                        { id: 'repeating', label: '重复' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveAppointmentTab(tab.id as 'all' | 'today' | 'needs_confirmation' | 'repeating')}
                          className={`h-full relative px-1 text-xs transition-colors ${
                            activeAppointmentTab === tab.id ? 'text-white font-bold' : 'text-white/35 hover:text-white/60'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 p-6 overflow-y-auto w-full max-w-[500px] xl:max-w-none">
                    {activeArrangementTab === 'tasks' ? _renderFilteredTasksPane() : _renderFilteredAppointmentsPane()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showCreateTaskModal && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 pt-16"
            onClick={_closeCreateTaskModal}
          >
            <div
              className="w-[520px] max-w-[92vw] max-h-[calc(100vh-6rem)] flex flex-col bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-14 shrink-0 border-b border-white/10 flex items-center justify-between px-5 bg-white/5">
                <h3 className="text-lg font-bold text-white">创建安排</h3>
                <button
                  onClick={_closeCreateTaskModal}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-white/70">安排类型</label>
                  <select
                    aria-label="安排类型"
                    value={createArrangementKind}
                    onChange={(e) => setCreateArrangementKind(e.target.value as CreateArrangementKind)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="task">任务</option>
                    <option value="appointment">日程</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-white/70">标题</label>
                  <input
                    aria-label="标题"
                    value={createArrangementKind === 'appointment' ? createAppointmentForm.title : createTaskForm.title}
                    onChange={(e) => (
                      createArrangementKind === 'appointment'
                        ? setCreateAppointmentForm((s) => ({ ...s, title: e.target.value }))
                        : setCreateTaskForm((s) => ({ ...s, title: e.target.value }))
                    )}
                    placeholder={createArrangementKind === 'appointment' ? '例如：参加站会' : '例如：完成周报'}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    autoFocus
                  />
                </div>

                {createArrangementKind === 'appointment' ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm text-white/70">备注</label>
                      <textarea
                        value={createAppointmentForm.content}
                        onChange={(e) => setCreateAppointmentForm((s) => ({ ...s, content: e.target.value }))}
                        placeholder="可选：补充地点、材料或注意事项"
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[88px] resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-white/70">开始时间</label>
                        <input
                          aria-label="开始时间"
                          type="datetime-local"
                          value={createAppointmentForm.startsAt}
                          onChange={(e) => setCreateAppointmentForm((s) => ({ ...s, startsAt: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-white/70">结束时间</label>
                        <input
                          aria-label="结束时间"
                          type="datetime-local"
                          value={createAppointmentForm.endsAt}
                          onChange={(e) => setCreateAppointmentForm((s) => ({ ...s, endsAt: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm text-white/70">重复规则</label>
                      <input
                        aria-label="重复规则"
                        value={createAppointmentForm.repeatRule}
                        onChange={(e) => setCreateAppointmentForm((s) => ({ ...s, repeatRule: e.target.value }))}
                        placeholder="例如：weekly"
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-white/70">目标时长（分钟）</label>
                        <input
                          aria-label="目标时长（分钟）"
                          type="number"
                          min={0}
                          value={createTaskForm.targetMinutes}
                          onChange={(e) => setCreateTaskForm((s) => ({ ...s, targetMinutes: Number(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-white/70">截止日期</label>
                        <input
                          aria-label="截止日期"
                          type="datetime-local"
                          value={createTaskForm.dueDate}
                          onChange={(e) => setCreateTaskForm((s) => ({ ...s, dueDate: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-sm text-white/70">标签</label>
                      <input
                        aria-label="标签"
                        value={createTaskForm.tagsText}
                        onChange={(e) => setCreateTaskForm((s) => ({ ...s, tagsText: e.target.value }))}
                        placeholder="逗号分隔，例如：学习,arxiv"
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    {showCreateTaskMoreFields && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-2">
                            <label className="text-sm text-white/70">任务类型</label>
                            <select
                              value={createTaskForm.taskType}
                              onChange={(e) => setCreateTaskForm((s) => ({ ...s, taskType: e.target.value as 'focus' | 'checkin' }))}
                              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            >
                              <option value="focus">专注任务</option>
                              <option value="checkin">快速打卡</option>
                            </select>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-sm text-white/70">优先级</label>
                            <select
                              value={createTaskForm.priority}
                              onChange={(e) => setCreateTaskForm((s) => ({ ...s, priority: Number(e.target.value) as 0 | 1 | 2 | 3 }))}
                              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            >
                              <option value={0}>0 低</option>
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3 高</option>
                            </select>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-sm text-white/70">循环周期</label>
                            <select
                              value={createTaskForm.cyclePeriod}
                              onChange={(e) => setCreateTaskForm((s) => ({ ...s, cyclePeriod: e.target.value as 'daily' | 'weekly' | 'monthly' | 'custom' }))}
                              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            >
                              <option value="daily">每日</option>
                              <option value="weekly">每周</option>
                              <option value="monthly">每月</option>
                              <option value="custom">自定义</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-sm text-white/70">备注</label>
                          <textarea
                            value={createTaskForm.content}
                            onChange={(e) => setCreateTaskForm((s) => ({ ...s, content: e.target.value }))}
                            placeholder="可选：补充描述/拆解步骤"
                            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[88px] resize-none"
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-sm text-white/70">目的循环次数</label>
                          <input
                            type="number"
                            min={0}
                            value={createTaskForm.targetCycleCount}
                            onChange={(e) => setCreateTaskForm((s) => ({ ...s, targetCycleCount: Number(e.target.value) }))}
                            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>

                        {createTaskForm.cyclePeriod === 'custom' && (
                          <div className="flex flex-col gap-2">
                            <label className="text-sm text-white/70">自定义间隔（天）</label>
                            <input
                              type="number"
                              min={1}
                              value={createTaskForm.customCycleDays}
                              onChange={(e) => setCreateTaskForm((s) => ({ ...s, customCycleDays: Number(e.target.value) }))}
                              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-2">
                            <label className="text-sm text-white/70">开始日期</label>
                            <input
                              type="datetime-local"
                              value={createTaskForm.startDate}
                              onChange={(e) => setCreateTaskForm((s) => ({ ...s, startDate: e.target.value }))}
                              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-sm text-white/70">事件</label>
                            <input
                              value={createTaskForm.event}
                              onChange={(e) => setCreateTaskForm((s) => ({ ...s, event: e.target.value }))}
                              placeholder="例如：晨间阅读"
                              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {createTaskError && <div className="text-sm text-red-400">{createTaskError}</div>}
              </div>
              <div className="p-5 pt-3 shrink-0 border-t border-white/10 flex items-center justify-end gap-3 bg-[#1a1a1a]">
                  <button
                    onClick={_closeCreateTaskModal}
                    className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors"
                    disabled={createTaskSubmitting}
                  >
                    取消
                  </button>
                  <button
                    onClick={() => setShowCreateTaskMoreFields((v) => !v)}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={createTaskSubmitting}
                  >
                    {createArrangementKind === 'appointment' ? '简表单' : (showCreateTaskMoreFields ? '收起' : '更多')}
                  </button>
                  <button
                    onClick={_submitCreateTask}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={createTaskSubmitting}
                  >
                    {createTaskSubmitting ? '创建中...' : '创建'}
                  </button>
              </div>
            </div>
          </div>
        )}
        {showTaskDraftModal && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={_closeTaskDraftModal}
          >
            <div
              className="w-[680px] max-w-[94vw] max-h-[78vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-16 shrink-0 border-b border-white/10 px-5 bg-white/5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">识别到 {taskAssistantDrafts.length} 个安排草稿</h3>
                  <p className="text-xs text-white/45 mt-1">请逐个确认，需要的草稿会进入现有创建表单。</p>
                </div>
                <button
                  onClick={_closeTaskDraftModal}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                  aria-label="关闭安排草稿"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex flex-col gap-3">
                {taskAssistantDrafts.map((draft, idx) => (
                  <div
                    key={draft.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      draft.state === 'pending'
                        ? 'bg-white/5 border-white/10'
                        : 'bg-white/[0.02] border-white/5 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/35">#{idx + 1}</span>
                          <h4 className="font-semibold text-white truncate">{draft.title || draft.rawTitle}</h4>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${
                              draft.kind === 'appointment'
                                ? 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200'
                                : 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100'
                            }`}
                          >
                            {_draftKindLabel(draft)}
                          </span>
                          {draft.state === 'created' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">已创建</span>
                          )}
                          {draft.state === 'ignored' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10">已忽略</span>
                          )}
                        </div>
                        {draft.content ? (
                          <p className="text-sm text-white/65 mt-2 line-clamp-2">{draft.content}</p>
                        ) : null}
                        {draft.sourceText ? (
                          <p className="text-xs text-white/35 mt-2 line-clamp-2">依据：{draft.sourceText}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-2 mt-3 text-xs text-white/45">
                          {draft.kind === 'appointment' ? (
                            <>
                              {_formatDraftDateLabel('开始', draft.startsAt) ? <span>{_formatDraftDateLabel('开始', draft.startsAt)}</span> : null}
                              {_formatDraftDateLabel('结束', draft.endsAt) ? <span>{_formatDraftDateLabel('结束', draft.endsAt)}</span> : null}
                              {draft.repeatRule ? <span>重复：{draft.repeatRule}</span> : null}
                            </>
                          ) : (
                            <>
                              {_formatDraftDateLabel('截止', draft.dueDate) ? <span>{_formatDraftDateLabel('截止', draft.dueDate)}</span> : null}
                              {draft.targetMinutes !== undefined ? <span>时长：{draft.targetMinutes} 分钟</span> : null}
                              {draft.tagsText ? <span>标签：{draft.tagsText}</span> : null}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {draft.state === 'pending' ? (
                          <>
                            <button
                              onClick={() => _ignoreTaskDraft(draft.id)}
                              className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-colors"
                            >
                              忽略
                            </button>
                            <button
                              onClick={() => _openDraftInCreateForm(draft)}
                              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                              aria-label={`创建“${draft.title || draft.rawTitle}”`}
                            >
                              创建
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                {taskAssistantDrafts.length > 0 && taskAssistantDrafts.every((draft) => draft.state !== 'pending') ? (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    所有草稿都已处理，可以关闭确认页。
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
        {showTaskAssistantModal && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={_resetTaskAssistant}
          >
            <div
              className="w-[560px] h-[420px] max-w-[92vw] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-[1] border-b border-white/10 px-5 bg-white/5 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">安排解析助手</h3>
                <button
                  onClick={_resetTaskAssistant}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                  aria-label="关闭安排解析助手"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div className="flex-[4] p-5 flex flex-col gap-3">
                <textarea
                  value={taskAssistantInput}
                  onChange={(e) => setTaskAssistantInput(e.target.value)}
                  placeholder="请输入安排目标、截止时间、优先级等信息，助手会自动帮你判断任务或日程"
                  className="w-full h-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  autoFocus
                />
                {taskAssistantError ? <div className="text-sm text-red-400">{taskAssistantError}</div> : null}
              </div>
              <div className="flex-[1] px-5 pb-5 flex items-end justify-end gap-3">
                <button
                  onClick={() => {
                    setShowTaskAssistantModal(false);
                    _openCreateTaskModal();
                  }}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-colors"
                  disabled={taskAssistantSubmitting}
                >
                  自定义安排
                </button>
                <button
                  onClick={_generateTaskByAssistant}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={taskAssistantSubmitting}
                >
                  {taskAssistantSubmitting ? '生成中...' : '快捷生成安排'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (split > 1) {
    const mergePlaceholders = index === 1 && split === 2;
    const subCardCount = mergePlaceholders ? 1 : split;
    const showWorkflowProgress = mergePlaceholders && focusWorkflow?.state !== 'normal';
    return (
      <div className="flex-1 flex gap-2">
        {Array.from({ length: subCardCount }).map((_, subIndex) => (
          index === 2 && subIndex === 0 ? (
            <React.Fragment key={subIndex}><CalendarWidget className="flex-1" /></React.Fragment>
          ) : (
            <div
              key={subIndex}
              onClick={
                index === 3 && subIndex === 1 ? () => navigate('/apps') :
                index === 3 && subIndex === 2 ? () => setShowPhoneSimulator(true) :
                undefined
              }
              className={`flex-1 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 flex items-center justify-center text-white/50 hover:bg-white/20 transition-colors ${
                (index === 3 && subIndex === 1) || (index === 3 && subIndex === 2) ? 'cursor-pointer' : ''
              }`}
            >
              {showWorkflowProgress ? (
                <WorkflowProgressBar workflow={workflowForProgress} />
              ) : index === 3 && subIndex === 1 ? (
                <span className="text-white/80 font-medium">应用中心</span>
              ) : index === 3 && subIndex === 0 ? (
                <span className="text-white/80 font-medium">成就</span>
              ) : mergePlaceholders ? (
                <div className="flex w-full h-full rounded-lg overflow-hidden border border-white/10 group shadow-lg">
                  {/* 左侧：一键运行 */}
                  <div
                    className="flex-[3] bg-blue-500/10 hover:bg-blue-500/20 transition-colors flex items-center justify-center cursor-pointer border-r border-white/10 relative overflow-hidden"
                    onClick={(e) => {
                      e.stopPropagation();
                      // 尝试寻找未完成的专注任务，或者弹出提示
                      const targetTask = _pickTodayFocusTask();
                      if (targetTask) {
                        _startFocus(targetTask.id);
                      } else {
                        alert('今日无待办任务，请先创建或安排任务');
                      }
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                      </div>
                      <span className="font-bold text-white/90 text-sm tracking-wide">
                        运行 {defaultWorkflowName}
                      </span>
                    </div>
                  </div>
                  {/* 右侧：设置弹窗 */}
                  <div
                    className="flex-[1] bg-white/5 hover:bg-white/15 transition-colors flex items-center justify-center cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(new Event('ark:open-workflow-modal'));
                    }}
                    title="工作流设置"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60 group-hover:text-white/90 transition-colors">
                      <circle cx="12" cy="12" r="3"></circle>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                  </div>
                </div>
              ) : index === 3 && subIndex === 2 ? (
                <>
                  <span className="font-medium text-white/80">
                    快捷入口
                  </span>
                  {showPhoneSimulator && anchorRef && (
                    <PhoneSimulator
                      anchorRef={anchorRef}
                      onClose={() => setShowPhoneSimulator(false)}
                    />
                  )}
                </>
              ) : (
                <span className="font-medium">{index === 2 && subIndex === 1 ? '数据分析' : `占位区 ${index + 1}-${subIndex + 1}`}</span>
              )}
            </div>
          )
        ))}
      </div>
    );
  }

  return (
    <div
      onClick={index === 0 ? () => setShowTaskModal(true) : undefined}
      className={`flex-1 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 flex items-center justify-center text-white/50 hover:bg-white/20 transition-colors ${index === 0 ? 'cursor-pointer' : ''}`}
    >
      <span className="font-medium text-lg text-white/80">{index === 0 ? '今日安排' : `占位区 ${index + 1}`}</span>
    </div>
  );
};

export default PlaceholderCard;
