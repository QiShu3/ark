import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../lib/api';
import FocusStats from './FocusStats';

interface Task {
  id: string;
  user_id: number;
  title: string;
  content: string | null;
  status: 'todo' | 'done';
  priority: number;
  target_duration: number;
  current_cycle_count: number;
  target_cycle_count: number;
  cycle_period: 'daily' | 'weekly' | 'monthly' | 'custom';
  cycle_every_days: number | null;
  event: string;
  tags: string[];
  actual_duration: number;
  start_date: string | null;
  due_date: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

interface PlaceholderCardProps {
  index: number;
  split?: number;
}

type PomodoroStatus = 'normal' | 'focus' | 'rest';

interface PomodoroCurrent {
  status: PomodoroStatus;
  workflow_task_id: string | null;
  current_task_id: string | null;
  started_at: string | null;
  elapsed_seconds: number;
  limit_seconds: number | null;
  remaining_seconds: number | null;
  requires_confirmation: boolean;
}

interface TodayFocusSummary {
  minutes: number;
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
  tagsText: string;
  startDate: string;
  dueDate: string;
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
  tagsText: '',
  startDate: '',
  dueDate: '',
};

/**
 * 右侧占位卡片组件
 * 用于展示占位内容
 */
const PlaceholderCard: React.FC<PlaceholderCardProps> = ({ index, split = 1 }) => {
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showTaskAssistantModal, setShowTaskAssistantModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'daily' | 'weekly' | 'periodic' | 'custom' | 'all'>('today');
  const navigate = useNavigate();

  // Focus State
  const [pomodoroCurrent, setPomodoroCurrent] = useState<PomodoroCurrent | null>(null);
  const [focusDurationStr, setFocusDurationStr] = useState('0min');
  const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
  const [showFocusTaskPicker, setShowFocusTaskPicker] = useState(false);
  const [focusTargetTaskId, setFocusTargetTaskId] = useState<string | null>(null);
  const [focusQuickActionBusy, setFocusQuickActionBusy] = useState(false);

  const [createTaskSubmitting, setCreateTaskSubmitting] = useState(false);
  const [createTaskError, setCreateTaskError] = useState<string | null>(null);
  const [createTaskForm, setCreateTaskForm] = useState<CreateTaskForm>(CREATE_TASK_FORM_DEFAULTS);
  const [showCreateTaskMoreFields, setShowCreateTaskMoreFields] = useState(false);
  const [taskAssistantInput, setTaskAssistantInput] = useState('');
  const [taskAssistantError, setTaskAssistantError] = useState<string | null>(null);
  const [taskAssistantSubmitting, setTaskAssistantSubmitting] = useState(false);

  // Task Management State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editTaskSubmitting, setEditTaskSubmitting] = useState(false);
  const [editTaskError, setEditTaskError] = useState<string | null>(null);
  const [editTaskForm, setEditTaskForm] = useState<{
    title: string;
    content: string;
    priority: 0 | 1 | 2 | 3;
    targetMinutes: number;
    currentCycleCount: number;
    targetCycleCount: number;
    cyclePeriod: 'daily' | 'weekly' | 'monthly' | 'custom';
    customCycleDays: number;
    event: string;
    tagsText: string;
    startDate: string;
    dueDate: string;
  }>({
    title: '',
    content: '',
    priority: 0,
    targetMinutes: 0,
    currentCycleCount: 0,
    targetCycleCount: 1,
    cyclePeriod: 'daily',
    customCycleDays: 1,
    event: '',
    tagsText: '',
    startDate: '',
    dueDate: '',
  });

  useEffect(() => {
    _loadTasks();
    _loadCurrentFocus();
    _loadTodayFocus();
  }, []);

  // Update focus duration timer
  useEffect(() => {
    if (!pomodoroCurrent || pomodoroCurrent.status === 'normal' || !pomodoroCurrent.started_at) {
      setFocusDurationStr('0min');
      return;
    }

    const updateDuration = () => {
      // 更新当前任务专注时长
      const start = new Date(pomodoroCurrent.started_at).getTime();
      const now = new Date().getTime();
      const diffSecondsRaw = Math.floor((now - start) / 1000);
      const diffSecondsSafe = diffSecondsRaw < 0 ? 0 : diffSecondsRaw;
      const limited = pomodoroCurrent.limit_seconds
        ? Math.min(diffSecondsSafe, pomodoroCurrent.limit_seconds)
        : diffSecondsSafe;
      const diffMinutes = Math.floor(limited / 60);
      setFocusDurationStr(`${diffMinutes}min`);
      
      // 同时刷新今日专注总时长，保持同步
      _loadTodayFocus();
    };

    updateDuration();
    const timer = setInterval(updateDuration, 60000); // Update every minute
    return () => clearInterval(timer);
  }, [pomodoroCurrent]);

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
    setCreateTaskForm({ ...CREATE_TASK_FORM_DEFAULTS });
    setShowCreateTaskMoreFields(false);
  }

  function _openCreateTaskModal(preset?: Partial<CreateTaskForm>): void {
    const nowDate = new Date();
    const localNow = new Date(nowDate.getTime() - nowDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const nextStartDate = preset?.startDate && preset.startDate.trim() ? preset.startDate : localNow;
    setCreateTaskError(null);
    setShowCreateTaskMoreFields(false);
    setCreateTaskForm({ ...CREATE_TASK_FORM_DEFAULTS, ...(preset || {}), startDate: nextStartDate });
    setShowCreateTaskModal(true);
  }

  function _toDateTimeLocal(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 16);
  }

  function _parseJsonObject(candidate: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }

  function _extractJsonObject(text: string): Record<string, unknown> | null {
    const direct = text.trim();
    if (!direct) return null;
    const directParsed = _parseJsonObject(direct);
    if (directParsed) return directParsed;
    const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      const fencedParsed = _parseJsonObject(fenced[1].trim());
      if (fencedParsed) return fencedParsed;
    }
    const start = direct.indexOf('{');
    const end = direct.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return _parseJsonObject(direct.slice(start, end + 1));
    }
    return null;
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
      tagsText: tagsValue,
      startDate: _toDateTimeLocal(draft.startDate),
      dueDate: _toDateTimeLocal(draft.dueDate),
    };
  }

  async function _generateTaskByAssistant(): Promise<void> {
    if (taskAssistantSubmitting) return;
    const text = taskAssistantInput.trim();
    if (!text) {
      setTaskAssistantError('请输入任务描述');
      return;
    }
    setTaskAssistantSubmitting(true);
    setTaskAssistantError(null);
    try {
      const res = await apiJson<{ reply: string }>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `请将以下任务描述解析成一个 JSON 对象，仅返回 JSON，不要返回其他文字。字段包含：title, content, priority(0-3), targetMinutes, targetCycleCount, cyclePeriod(daily|weekly|monthly|custom), customCycleDays, event, tags(字符串数组), startDate, dueDate。其中 title 必须简练且不超过 10 个字。任务描述：${text}`,
          history: [],
          scope: 'general',
        }),
      });
      const payload = _extractJsonObject(typeof res.reply === 'string' ? res.reply : '');
      if (!payload) {
        throw new Error('AI 返回格式无法识别');
      }
      const preset = _draftToCreateTaskForm(text, payload);
      setShowTaskAssistantModal(false);
      setTaskAssistantInput('');
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

  async function _loadCurrentFocus() {
    try {
      const res = await apiJson('/todo/pomodoro/current');
      setPomodoroCurrent(res as PomodoroCurrent);
    } catch {
      setPomodoroCurrent(null);
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

  async function _startFocus(taskId: string) {
    try {
      const res = await apiJson(`/todo/tasks/${taskId}/focus/start`, {
        method: 'POST'
      });
      setPomodoroCurrent({
        status: 'focus',
        workflow_task_id: (res as { task_id: string }).task_id,
        current_task_id: (res as { task_id: string }).task_id,
        started_at: (res as { start_time: string }).start_time,
        elapsed_seconds: 0,
        limit_seconds: (res as { limit_seconds?: number }).limit_seconds ?? 1500,
        remaining_seconds: (res as { remaining_seconds?: number }).remaining_seconds ?? 1500,
        requires_confirmation: false,
      });
      _loadTasks();
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
      setPomodoroCurrent({ status: 'normal', workflow_task_id: null, current_task_id: null, started_at: null, elapsed_seconds: 0, limit_seconds: null, remaining_seconds: null, requires_confirmation: false });
      await Promise.all([_loadTasks(), _loadCurrentFocus(), _loadTodayFocus()]);
    } catch (e) {
      console.error('Failed to stop focus', e);
    }
  }

  async function _stopBreak() {
    try {
      await apiJson('/todo/break/stop', {
        method: 'POST'
      });
      setPomodoroCurrent({ status: 'normal', workflow_task_id: null, current_task_id: null, started_at: null, elapsed_seconds: 0, limit_seconds: null, remaining_seconds: null, requires_confirmation: false });
      await _loadCurrentFocus();
    } catch (e) {
      console.error('Failed to stop break', e);
      alert('结束休息失败');
    }
  }

  async function _advancePomodoro() {
    try {
      const res = await apiJson('/todo/pomodoro/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setPomodoroCurrent(res as PomodoroCurrent);
      await Promise.all([_loadTasks(), _loadCurrentFocus(), _loadTodayFocus()]);
    } catch (e) {
      console.error('Failed to advance pomodoro', e);
      const msg = e instanceof Error ? e.message : '推进番茄钟状态失败';
      alert(msg);
    }
  }

  function _openEditTask(task: Task) {
    setSelectedTask(task);
    setEditTaskForm({
      title: task.title,
      content: task.content || '',
      priority: task.priority as 0 | 1 | 2 | 3,
      targetMinutes: Math.round(task.target_duration / 60),
      currentCycleCount: task.current_cycle_count,
      targetCycleCount: task.target_cycle_count,
      cyclePeriod: task.cycle_period,
      customCycleDays: task.cycle_every_days ?? 1,
      event: task.event || '',
      tagsText: task.tags.join(', '),
      startDate: task.start_date ? new Date(task.start_date).toISOString().slice(0, 16) : '',
      dueDate: task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '',
    });
    setShowEditTaskModal(true);
  }

  async function _submitEditTask() {
    if (editTaskSubmitting || !selectedTask) return;
    setEditTaskSubmitting(true);
    setEditTaskError(null);
    try {
      const startDate = editTaskForm.startDate ? new Date(editTaskForm.startDate).toISOString() : null;
      const dueDate = editTaskForm.dueDate ? new Date(editTaskForm.dueDate).toISOString() : null;
      const cycleEveryDays = editTaskForm.cyclePeriod === 'custom' ? Math.max(1, Math.floor(editTaskForm.customCycleDays || 1)) : null;
      const tags = editTaskForm.tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      await apiJson(`/todo/tasks/${selectedTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTaskForm.title.trim(),
          content: editTaskForm.content.trim() || null,
          priority: editTaskForm.priority,
          target_duration: Math.round(editTaskForm.targetMinutes * 60),
          current_cycle_count: Math.max(0, Math.floor(editTaskForm.currentCycleCount || 0)),
          target_cycle_count: Math.max(0, Math.floor(editTaskForm.targetCycleCount || 0)),
          cycle_period: editTaskForm.cyclePeriod,
          cycle_every_days: cycleEveryDays,
          event: editTaskForm.event.trim(),
          tags,
          start_date: startDate,
          due_date: dueDate,
        }),
      });
      setShowEditTaskModal(false);
      _loadTasks();
    } catch (e) {
      setEditTaskError(e instanceof Error ? e.message : '编辑任务失败');
    } finally {
      setEditTaskSubmitting(false);
    }
  }

  async function _handleDeleteTask(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    if (!window.confirm('确定要删除这个任务吗？')) return;
    try {
      await apiJson(`/todo/tasks/${task.id}`, { method: 'DELETE' });
      _loadTasks();
    } catch (e) {
      console.error('Failed to delete task', e);
    }
  }

  async function _handleCompleteTask(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    try {
      await apiJson(`/todo/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' })
      });
      _loadTasks();
    } catch (e) {
      console.error('Failed to complete task', e);
    }
  }

  function _renderAllTasksPane() {
    if (tasksLoading && tasks.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white/30 animate-pulse">
          <span className="text-lg">加载中...</span>
        </div>
      );
    }
    if (tasks.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white/30">
          <span className="text-lg">暂无任务</span>
        </div>
      );
    }

    const activeTasks = tasks.filter(t => t.status !== 'done');
    const completedTasks = tasks.filter(t => t.status === 'done');

    return (
      <div className="flex flex-col gap-6 pb-4">
        {/* 进行中任务列表 */}
        <div className="flex flex-col gap-3">
          {activeTasks.length > 0 ? (
            activeTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => _openEditTask(task)}
                className="group flex flex-col gap-2 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer relative"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <div className={`w-2 h-2 rounded-full ${
                      task.status === 'done' ? 'bg-green-500/50' : 'bg-white/30'
                    }`} />
                    <span className="font-medium text-white/90 line-clamp-1">
                      {task.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-md border ${
                      task.priority === 3 ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                      task.priority === 2 ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
                      'bg-white/5 border-white/10 text-white/40'
                    }`}>
                      P{task.priority}
                    </span>
                    
                    {/* 操作按钮 - 仅在悬停时显示 */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => _handleCompleteTask(e, task)}
                        className="p-1.5 rounded-md hover:bg-green-500/20 text-white/40 hover:text-green-400 transition-colors"
                        title="完成任务"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </button>
                      <button
                        onClick={(e) => _handleDeleteTask(e, task)}
                        className="p-1.5 rounded-md hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                        title="删除任务"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                
                {(task.content || task.due_date) && (
                  <div className="flex items-center gap-4 text-xs text-white/40 pl-4">
                    {task.due_date && (
                      <span className={new Date(task.due_date) < new Date() ? 'text-red-400' : ''}>
                        {new Date(task.due_date).toLocaleDateString()} 截止
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-white/20 text-sm">
              暂无待办任务
            </div>
          )}
        </div>

        {/* 已完成任务区域 */}
        {completedTasks.length > 0 && (
          <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
            <h4 className="text-xs font-bold text-white/30 uppercase tracking-wider px-1">
              已完成 ({completedTasks.length})
            </h4>
            {completedTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => _openEditTask(task)}
                className="group flex flex-col gap-2 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-all cursor-pointer opacity-60 hover:opacity-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="w-2 h-2 rounded-full bg-green-500/50" />
                    <span className="font-medium text-white/70 line-clamp-1 line-through decoration-white/30">
                      {task.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 已完成任务只显示删除按钮 */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => _handleDeleteTask(e, task)}
                        className="p-1.5 rounded-md hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                        title="删除任务"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
    
    const status = pomodoroCurrent?.status ?? 'normal';
    if (status === 'focus') {
      if (pomodoroCurrent?.requires_confirmation) {
        if (confirm('本轮专注已达上限，是否进入休息？')) {
          await _advancePomodoro();
        }
        return;
      }
      if (confirm('是否结束当前专注并回到普通状态？')) {
        await _stopFocus();
      }
      return;
    }

    if (status === 'rest') {
      if (pomodoroCurrent?.requires_confirmation) {
        if (confirm('本轮休息已达上限，是否开始下一轮专注？')) {
          await _advancePomodoro();
        }
      } else if (confirm('是否提前结束休息并回到普通状态？')) {
        await _stopBreak();
      }
      return;
    }

    // 普通状态 -> 开始专注
    if (status === 'normal') {
      // 简单的停止逻辑，或者根据需求：如果点击的是同一个任务则停止，不同任务则切换？
      // 这里的 UI 是全局的“专注状态”，所以点击意味着结束当前专注。
      // 但是根据用户需求 1: "检查...是否是即将要专注的特定任务...是则跳转第二步(开始专注?)...否则提示...然后跳转第二步"
      // 这意味着点击这个 div 总是倾向于 "开始专注目标任务"。
      const targetTask = _pickTodayFocusTask();
      if (targetTask) {
        await _startFocus(targetTask.id);
      } else {
        alert('今日无待办任务，请先创建或安排任务');
      }
    }
  }

  function _switchFocusTarget(task: Task) {
    if (task.status === 'done') return;
    setFocusTargetTaskId(task.id);
    setShowFocusTaskPicker(false);
  }

  async function _handleCompleteAndStopFocus(e: React.MouseEvent) {
    e.stopPropagation();
    if (focusQuickActionBusy) return;
    const targetTaskId = pomodoroCurrent?.current_task_id ?? _pickTodayFocusTask()?.id ?? null;
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
      if (pomodoroCurrent?.status === 'focus' && pomodoroCurrent.current_task_id === targetTaskId) {
        await apiJson('/todo/focus/stop', { method: 'POST' });
        setPomodoroCurrent({ status: 'normal', workflow_task_id: null, current_task_id: null, started_at: null, elapsed_seconds: 0, limit_seconds: null, remaining_seconds: null, requires_confirmation: false });
      }
      setFocusTargetTaskId((prev) => (prev === targetTaskId ? null : prev));
      await Promise.all([_loadTasks(), _loadCurrentFocus(), _loadTodayFocus()]);
    } catch (e) {
      console.error('Failed to complete and stop focus', e);
      alert('完成任务失败');
    } finally {
      setFocusQuickActionBusy(false);
    }
  }

  async function _submitCreateTask(): Promise<void> {
    if (createTaskSubmitting) return;
    const title = createTaskForm.title.trim();
    if (!title) {
      setCreateTaskError('请输入任务标题');
      return;
    }
    const targetMinutes = Number.isFinite(createTaskForm.targetMinutes) ? createTaskForm.targetMinutes : 0;
    if (targetMinutes < 0) {
      setCreateTaskError('目标时长不能为负数');
      return;
    }

    setCreateTaskSubmitting(true);
    setCreateTaskError(null);
    try {
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
          tags,
          start_date: startDate,
          due_date: dueDate,
        }),
      });
      setShowCreateTaskModal(false);
      _resetCreateTaskForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '创建任务失败';
      setCreateTaskError(msg);
    } finally {
      setCreateTaskSubmitting(false);
    }
  }

  function _renderCalendarView() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const monthLabel = `${year}年${month + 1}月`;
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const cells = Array.from({ length: 42 }, (_, i) => {
      const offset = i - firstWeekday + 1;
      if (offset < 1) {
        return {
          day: daysInPrevMonth + offset,
          inCurrentMonth: false,
          isToday: false,
        };
      }
      if (offset > daysInMonth) {
        return {
          day: offset - daysInMonth,
          inCurrentMonth: false,
          isToday: false,
        };
      }
      return {
        day: offset,
        inCurrentMonth: true,
        isToday: offset === today,
      };
    });

    return (
      <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 p-3 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/85 text-sm font-semibold">日历</span>
          <span className="text-white/60 text-xs">{monthLabel}</span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[10px] text-white/45 mb-1">
          {weekdays.map((day) => (
            <div key={day} className="h-5 flex items-center justify-center">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 flex-1">
          {cells.map((cell, idx) => (
            <div
              key={`${cell.day}-${idx}`}
              className={`h-6 rounded flex items-center justify-center text-[11px] ${
                cell.isToday
                  ? 'bg-blue-500/70 text-white font-semibold'
                  : cell.inCurrentMonth
                    ? 'text-white/80 bg-white/[0.03]'
                    : 'text-white/25'
              }`}
            >
              {cell.day}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (index === 0) {
    const targetTask = _pickTodayFocusTask();
    const status = pomodoroCurrent?.status ?? 'normal';
    const isFocusing = status === 'focus';
    const isResting = status === 'rest';
    const activeTaskId = pomodoroCurrent?.current_task_id ?? null;
    const workflowTaskId = pomodoroCurrent?.workflow_task_id ?? null;
    const displayTaskTitle = isFocusing
      ? tasks.find(t => t.id === activeTaskId)?.title || '未知任务'
      : isResting
        ? tasks.find(t => t.id === workflowTaskId)?.title || '休息中'
        : targetTask?.title || '无计划';
    const hoverActionText = isFocusing
      ? (pomodoroCurrent?.requires_confirmation ? '进入休息' : '结束专注')
      : isResting
        ? (pomodoroCurrent?.requires_confirmation ? '开始下一轮专注' : '结束休息')
        : '开始专注';
    const hoverStatusLabel = isFocusing ? '正在专注于：' : isResting ? '休息中（任务）：' : '即将专注于：';
    const showDuration = isFocusing || isResting;

    return (
      <>
        <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 p-2 flex gap-2">
          <div className="flex-[2] flex flex-col rounded overflow-hidden">
            <div 
              className={`group relative flex-[2] bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer ${
                isFocusing ? 'bg-blue-500/10 border border-blue-500/20' : isResting ? 'bg-emerald-500/10 border border-emerald-500/20' : ''
              }`}
              onClick={_handleFocusToggle}
            >
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

              <span className={`text-4xl font-bold group-hover:opacity-0 transition-opacity duration-300 ${
                isFocusing ? 'text-blue-400' : isResting ? 'text-emerald-300' : ''
              }`}>
                {showDuration ? focusDurationStr : `${todayFocusMinutes}min`}
              </span>
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-2xl font-bold">
                  {hoverActionText}
                </span>
                <span className="text-sm text-white/60 mt-1">
                  {hoverStatusLabel}
                  {displayTaskTitle}
                </span>
              </div>
            </div>
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
            <span className="writing-vertical-rl text-lg font-bold tracking-widest">任务</span>
            
            {/* 右下角加号按钮 */}
            <button 
              className="absolute bottom-2 right-2 w-8 h-8 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white shadow-lg transition-all hover:scale-105 active:scale-95 group-hover/task:opacity-100 opacity-60 backdrop-blur-sm"
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

        {showEditTaskModal && selectedTask && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setShowEditTaskModal(false)}
          >
            <div
              className="w-[520px] max-w-[92vw] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-14 border-b border-white/10 flex items-center justify-between px-5 bg-white/5">
                <h3 className="text-lg font-bold text-white">编辑任务</h3>
                <button
                  onClick={() => setShowEditTaskModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="p-5 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-white/70">标题</label>
                  <input
                    value={editTaskForm.title}
                    onChange={(e) => setEditTaskForm((s) => ({ ...s, title: e.target.value }))}
                    placeholder="例如：完成周报"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-white/70">优先级</label>
                  <select
                    value={editTaskForm.priority}
                    onChange={(e) => setEditTaskForm((s) => ({ ...s, priority: Number(e.target.value) as 0 | 1 | 2 | 3 }))}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value={0}>0 低</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3 高</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-white/70">备注</label>
                  <textarea
                    value={editTaskForm.content}
                    onChange={(e) => setEditTaskForm((s) => ({ ...s, content: e.target.value }))}
                    placeholder="可选：补充描述/拆解步骤"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[88px] resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-white/70">目标时长（分钟）</label>
                    <input
                      type="number"
                      min={0}
                      value={editTaskForm.targetMinutes}
                      onChange={(e) => setEditTaskForm((s) => ({ ...s, targetMinutes: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-white/70">循环周期</label>
                    <select
                      value={editTaskForm.cyclePeriod}
                      onChange={(e) => setEditTaskForm((s) => ({ ...s, cyclePeriod: e.target.value as 'daily' | 'weekly' | 'monthly' | 'custom' }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                      value={editTaskForm.currentCycleCount}
                      onChange={(e) => setEditTaskForm((s) => ({ ...s, currentCycleCount: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-white/70">目的循环次数</label>
                    <input
                      type="number"
                      min={0}
                      value={editTaskForm.targetCycleCount}
                      onChange={(e) => setEditTaskForm((s) => ({ ...s, targetCycleCount: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                {editTaskForm.cyclePeriod === 'custom' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-white/70">自定义间隔（天）</label>
                    <input
                      type="number"
                      min={1}
                      value={editTaskForm.customCycleDays}
                      onChange={(e) => setEditTaskForm((s) => ({ ...s, customCycleDays: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-white/70">开始日期</label>
                    <input
                      type="datetime-local"
                      value={editTaskForm.startDate}
                      onChange={(e) => setEditTaskForm((s) => ({ ...s, startDate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-white/70">截止日期</label>
                    <input
                      type="datetime-local"
                      value={editTaskForm.dueDate}
                      onChange={(e) => setEditTaskForm((s) => ({ ...s, dueDate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-white/70">事件</label>
                    <input
                      value={editTaskForm.event}
                      onChange={(e) => setEditTaskForm((s) => ({ ...s, event: e.target.value }))}
                      placeholder="例如：晨间阅读"
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-white/70">标签</label>
                    <input
                      value={editTaskForm.tagsText}
                      onChange={(e) => setEditTaskForm((s) => ({ ...s, tagsText: e.target.value }))}
                      placeholder="逗号分隔，例如：学习,arxiv"
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                {editTaskError && <div className="text-sm text-red-400">{editTaskError}</div>}

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    onClick={() => setShowEditTaskModal(false)}
                    className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors"
                    disabled={editTaskSubmitting}
                  >
                    取消
                  </button>
                  <button
                    onClick={_submitEditTask}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={editTaskSubmitting}
                  >
                    {editTaskSubmitting ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 任务悬浮页面 */}
        {showTaskModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[80%] h-[80%] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* 顶部标题栏 */}
              <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-white/5">
                <h2 className="text-xl font-bold text-white">任务管理</h2>
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

              {/* 切换顶栏 */}
              <div className="h-12 border-b border-white/10 flex items-center px-6 gap-8 bg-white/[0.02]">
                {[
                  { id: 'today', label: '今日任务' },
                  { id: 'daily', label: '每日任务' },
                  { id: 'weekly', label: '每周任务' },
                  { id: 'periodic', label: '周期任务' },
                  { id: 'custom', label: '自定义任务' },
                  { id: 'all', label: '全部任务' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as 'today' | 'daily' | 'weekly' | 'periodic' | 'custom' | 'all')}
                    className={`h-full relative px-2 text-sm transition-colors ${
                      activeTab === tab.id ? 'text-white font-bold' : 'text-white/40 hover:text-white/60'
                    }`}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                    )}
                  </button>
                ))}
              </div>
              
              {/* 内容区域 */}
              <div className="flex-1 p-6 overflow-y-auto">
                {activeTab === 'today' && (
                  <div className="flex flex-col items-center justify-center h-full text-white/30 animate-in fade-in slide-in-from-left-4 duration-300">
                    <span className="text-lg">今日任务列表内容占位</span>
                  </div>
                )}
                {activeTab === 'daily' && (
                  <div className="flex flex-col items-center justify-center h-full text-white/30 animate-in fade-in slide-in-from-left-4 duration-300">
                    <span className="text-lg">每日任务列表内容占位</span>
                  </div>
                )}
                {activeTab === 'weekly' && (
                  <div className="flex flex-col items-center justify-center h-full text-white/30 animate-in fade-in slide-in-from-left-4 duration-300">
                    <span className="text-lg">每周任务列表内容占位</span>
                  </div>
                )}
                {activeTab === 'periodic' && (
                  <div className="flex flex-col items-center justify-center h-full text-white/30 animate-in fade-in slide-in-from-left-4 duration-300">
                    <span className="text-lg">周期任务列表内容占位</span>
                  </div>
                )}
                {activeTab === 'custom' && (
                  <div className="flex flex-col items-center justify-center h-full text-white/30 animate-in fade-in slide-in-from-left-4 duration-300">
                    <span className="text-lg">自定义任务列表内容占位</span>
                  </div>
                )}
                {activeTab === 'all' && (
                  <div className="h-full animate-in fade-in slide-in-from-left-4 duration-300">
                    {_renderAllTasksPane()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showCreateTaskModal && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => {
              setShowCreateTaskModal(false);
              _resetCreateTaskForm();
            }}
          >
            <div
              className="w-[520px] max-w-[92vw] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-14 border-b border-white/10 flex items-center justify-between px-5 bg-white/5">
                <h3 className="text-lg font-bold text-white">创建任务</h3>
                <button
                  onClick={() => {
                    setShowCreateTaskModal(false);
                    _resetCreateTaskForm();
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="p-5 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-white/70">标题</label>
                  <input
                    value={createTaskForm.title}
                    onChange={(e) => setCreateTaskForm((s) => ({ ...s, title: e.target.value }))}
                    placeholder="例如：完成周报"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-white/70">目标时长（分钟）</label>
                    <input
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

                {createTaskError && <div className="text-sm text-red-400">{createTaskError}</div>}

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    onClick={() => {
                      setShowCreateTaskModal(false);
                      _resetCreateTaskForm();
                    }}
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
                    {showCreateTaskMoreFields ? '收起' : '更多'}
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
          </div>
        )}
        {showTaskAssistantModal && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => {
              setShowTaskAssistantModal(false);
              setTaskAssistantError(null);
            }}
          >
            <div
              className="w-[560px] h-[420px] max-w-[92vw] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-[1] border-b border-white/10 px-5 bg-white/5 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">任务解析助手</h3>
                <button
                  onClick={() => {
                    setShowTaskAssistantModal(false);
                    setTaskAssistantError(null);
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
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
                  placeholder="请输入任务目标、截止时间、优先级等信息，助手会自动帮你填充任务参数"
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
                  自定义任务
                </button>
                <button
                  onClick={_generateTaskByAssistant}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={taskAssistantSubmitting}
                >
                  {taskAssistantSubmitting ? '生成中...' : '快捷生成任务'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (split > 1) {
    return (
      <div className="flex-1 flex gap-2">
        {Array.from({ length: split }).map((_, subIndex) => (
          index === 1 && subIndex === 0 ? (
            <React.Fragment key={subIndex}>{_renderCalendarView()}</React.Fragment>
          ) : (
            <div
              key={subIndex}
              onClick={index === 3 && subIndex === 2 ? () => navigate('/apps') : undefined}
              className={`flex-1 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 flex items-center justify-center text-white/50 hover:bg-white/20 transition-colors ${
                index === 3 && subIndex === 2 ? 'cursor-pointer' : ''
              }`}
            >
              {index === 3 && subIndex === 2 ? (
                <span className="text-white/80 font-medium">应用中心</span>
              ) : index === 3 && subIndex === 0 ? (
                <span className="text-white/80 font-medium">成就</span>
              ) : (
                <span>Placeholder {index + 1}-{subIndex + 1}</span>
              )}
            </div>
          )
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 flex items-center justify-center text-white/50 hover:bg-white/20 transition-colors">
      <span>Placeholder {index + 1}</span>
    </div>
  );
};

export default PlaceholderCard;
