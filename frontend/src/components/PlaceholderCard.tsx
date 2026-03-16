import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../lib/api';
import FocusStats from './FocusStats';

interface Task {
  id: string;
  user_id: number;
  title: string;
  content: string | null;
  category: string;
  status: 'todo' | 'doing' | 'done';
  priority: number;
  target_duration: number;
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

interface FocusSession {
  id: string;
  task_id: string;
  start_time: string;
  duration: number;
}

interface TodayFocusSummary {
  minutes: number;
}

/**
 * 右侧占位卡片组件
 * 用于展示占位内容
 */
const PlaceholderCard: React.FC<PlaceholderCardProps> = ({ index, split = 1 }) => {
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'daily' | 'weekly' | 'periodic' | 'custom' | 'all'>('today');
  const navigate = useNavigate();

  // Focus State
  const [currentFocus, setCurrentFocus] = useState<FocusSession | null>(null);
  const [focusDurationStr, setFocusDurationStr] = useState('0min');
  const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);

  const [createTaskSubmitting, setCreateTaskSubmitting] = useState(false);
  const [createTaskError, setCreateTaskError] = useState<string | null>(null);
  const [createTaskForm, setCreateTaskForm] = useState<{
    title: string;
    content: string;
    category: string;
    priority: 0 | 1 | 2 | 3;
    targetMinutes: number;
    startDate: string;
    dueDate: string;
  }>({
    title: '',
    content: '',
    category: '',
    priority: 0,
    targetMinutes: 25,
    startDate: '',
    dueDate: '',
  });

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
    category: string;
    status: 'todo' | 'doing' | 'done';
    priority: 0 | 1 | 2 | 3;
    targetMinutes: number;
    startDate: string;
    dueDate: string;
  }>({
    title: '',
    content: '',
    category: '',
    status: 'todo',
    priority: 0,
    targetMinutes: 0,
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
    if (!currentFocus) {
      setFocusDurationStr('0min');
      return;
    }

    const updateDuration = () => {
      // 更新当前任务专注时长
      const start = new Date(currentFocus.start_time).getTime();
      const now = new Date().getTime();
      const diffMinutes = Math.floor((now - start) / 60000);
      setFocusDurationStr(`${diffMinutes}min`);
      
      // 同时刷新今日专注总时长，保持同步
      _loadTodayFocus();
    };

    updateDuration();
    const timer = setInterval(updateDuration, 60000); // Update every minute
    return () => clearInterval(timer);
  }, [currentFocus]);

  useEffect(() => {
    if (showTaskModal && activeTab === 'all') {
      _loadTasks();
    }
  }, [showTaskModal, activeTab]);


  function _resetCreateTaskForm(): void {
    setCreateTaskSubmitting(false);
    setCreateTaskError(null);
    setCreateTaskForm({
      title: '',
      content: '',
      category: '',
      priority: 0,
      targetMinutes: 25,
      startDate: '',
      dueDate: '',
    });
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

  async function _startFocus(taskId: string) {
    try {
      const res = await apiJson(`/todo/tasks/${taskId}/focus/start`, {
        method: 'POST'
      });
      setCurrentFocus(res as FocusSession);
      _loadTasks(); // Reload tasks to update UI if needed
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
      _loadTasks();
    } catch (e) {
      console.error('Failed to stop focus', e);
    }
  }

  function _openEditTask(task: Task) {
    setSelectedTask(task);
    setEditTaskForm({
      title: task.title,
      content: task.content || '',
      category: task.category,
      status: task.status,
      priority: task.priority as 0 | 1 | 2 | 3,
      targetMinutes: Math.round(task.target_duration / 60),
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
      await apiJson(`/todo/tasks/${selectedTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTaskForm.title.trim(),
          content: editTaskForm.content.trim() || null,
          category: editTaskForm.category.trim(),
          status: editTaskForm.status,
          priority: editTaskForm.priority,
          target_duration: Math.round(editTaskForm.targetMinutes * 60),
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
                      task.status === 'doing' ? 'bg-blue-500' :
                      'bg-white/30'
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
                
                {(task.content || task.category || task.due_date) && (
                  <div className="flex items-center gap-4 text-xs text-white/40 pl-4">
                    {task.category && (
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-white/30" />
                        {task.category}
                      </span>
                    )}
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
              暂无进行中的任务
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
      await apiJson('/todo/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: createTaskForm.content.trim() ? createTaskForm.content : null,
          category: createTaskForm.category.trim(),
          status: 'todo',
          priority: createTaskForm.priority,
          target_duration: Math.round(targetMinutes * 60),
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

  if (index === 0) {
    const targetTask = _pickTodayFocusTask();
    const isFocusing = !!currentFocus;
    // 如果正在专注，显示正在专注的任务名；否则显示即将专注的任务名
    const displayTaskTitle = isFocusing 
      ? tasks.find(t => t.id === currentFocus.task_id)?.title || '未知任务'
      : targetTask?.title || '无计划';

    return (
      <>
        <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 p-2 flex gap-2">
          <div className="flex-[2] flex flex-col rounded overflow-hidden">
            <div 
              className={`group relative flex-[2] bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer ${
                isFocusing ? 'bg-blue-500/10 border border-blue-500/20' : ''
              }`}
              onClick={_handleFocusToggle}
            >
              {/* 右上角切换按钮 */}
              <button 
                className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-white/40 hover:text-white/80 transition-all opacity-0 group-hover:opacity-100 z-10 w-12 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: 切换专注模式
                  console.log('Switch focus mode');
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 7l-5-5-5 5"/>
                  <path d="M19 7H3"/>
                  <path d="M5 17l5 5 5-5"/>
                  <path d="M5 17h16"/>
                </svg>
              </button>

              <span className={`text-4xl font-bold group-hover:opacity-0 transition-opacity duration-300 ${
                isFocusing ? 'text-blue-400' : ''
              }`}>
                {isFocusing ? focusDurationStr : `${todayFocusMinutes}min`}
              </span>
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-2xl font-bold">
                  {isFocusing ? '结束专注' : '开始专注'}
                </span>
                <span className="text-sm text-white/60 mt-1">
                  {isFocusing ? '正在专注于：' : '即将专注于：'}
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
                setShowCreateTaskModal(true);
                setCreateTaskError(null);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>

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

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-white/70">分类</label>
                    <input
                      value={editTaskForm.category}
                      onChange={(e) => setEditTaskForm((s) => ({ ...s, category: e.target.value }))}
                      placeholder="例如：工作/学习"
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
                    <label className="text-sm text-white/70">状态</label>
                    <select
                      value={editTaskForm.status}
                      onChange={(e) => setEditTaskForm((s) => ({ ...s, status: e.target.value as 'todo' | 'doing' | 'done' }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="todo">待办</option>
                      <option value="doing">进行中</option>
                      <option value="done">已完成</option>
                    </select>
                  </div>
                </div>

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
                    <label className="text-sm text-white/70">分类</label>
                    <input
                      value={createTaskForm.category}
                      onChange={(e) => setCreateTaskForm((s) => ({ ...s, category: e.target.value }))}
                      placeholder="例如：工作/学习"
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
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
                    <label className="text-sm text-white/70">状态</label>
                    <input
                      value="todo"
                      disabled
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60"
                    />
                  </div>
                </div>

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
                    <label className="text-sm text-white/70">截止日期</label>
                    <input
                      type="datetime-local"
                      value={createTaskForm.dueDate}
                      onChange={(e) => setCreateTaskForm((s) => ({ ...s, dueDate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

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
      </>
    );
  }

  if (split > 1) {
    return (
      <div className="flex-1 flex gap-2">
        {Array.from({ length: split }).map((_, subIndex) => (
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
