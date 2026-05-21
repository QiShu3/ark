import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PlaceholderCard from '../PlaceholderCard';
import { apiJson } from '../../lib/api';

vi.mock('../AchievementCard', () => ({
  default: () => <div data-testid="achievement-card">Achievement Card</div>,
}));

const mockApiJson = vi.mocked(apiJson);

function buildTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'task-1',
    user_id: 7,
    title: '任务 A',
    content: null,
    status: 'todo',
    priority: 1,
    target_duration: 1500,
    current_cycle_count: 0,
    target_cycle_count: 1,
    cycle_period: 'daily',
    cycle_every_days: null,
    event: '',
    event_ids: [],
    task_type: 'focus',
    tags: [],
    actual_duration: 0,
    start_date: null,
    due_date: null,
    is_deleted: false,
    created_at: '2026-04-16T08:00:00+08:00',
    updated_at: '2026-04-16T08:00:00+08:00',
    ...overrides,
  };
}

function buildWorkflowPreset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'preset-1',
    user_id: 7,
    name: '深度工作流',
    focus_duration: 1500,
    break_duration: 300,
    default_focus_timer_mode: 'countdown',
    phases: [
      { phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: null },
      { phase_type: 'break', duration: 300, timer_mode: null, task_id: null },
    ],
    is_default: true,
    created_at: '2026-04-16T08:00:00+08:00',
    updated_at: '2026-04-16T08:00:00+08:00',
    ...overrides,
  };
}

function defaultApiResponse(path: string) {
  if (path === '/todo/focus/current') {
    return Promise.reject(new Error('no focus'));
  }
  if (path === '/todo/focus/today') {
    return Promise.resolve({ minutes: 0 });
  }
  if (path === '/todo/focus/workflow/current') {
    return Promise.resolve({
      state: 'normal',
      task_id: null,
      task_title: null,
      pending_confirmation: false,
      pending_task_selection: false,
      remaining_seconds: null,
    });
  }
  if (path === '/todo/focus/workflows') {
    return Promise.resolve([]);
  }
  if (path === '/todo/tasks?limit=100') {
    return Promise.resolve([]);
  }
  return Promise.resolve({});
}

function renderCard() {
  return render(
    <MemoryRouter>
      <PlaceholderCard index={0} />
    </MemoryRouter>,
  );
}

describe('PlaceholderCard workflow UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiJson.mockImplementation((path: string) => defaultApiResponse(path));
  });

  it('submits default timer mode and phase task binding when saving a workflow preset', async () => {
    const user = userEvent.setup();
    const task = buildTask();

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/tasks?limit=100') {
        return Promise.resolve([task]);
      }
      if (path === '/todo/focus/workflows' && init?.method === 'POST') {
        return Promise.resolve({
          id: 'preset-1',
          user_id: 7,
          name: '深度工作',
          focus_duration: 1500,
          break_duration: 300,
          default_focus_timer_mode: 'countup',
          phases: [
            { phase_type: 'focus', duration: 1500, timer_mode: 'countup', task_id: task.id },
            { phase_type: 'break', duration: 300, timer_mode: null, task_id: null },
          ],
          is_default: false,
          created_at: '2026-04-16T08:00:00+08:00',
          updated_at: '2026-04-16T08:00:00+08:00',
        });
      }
      return defaultApiResponse(path);
    });

    renderCard();
    window.dispatchEvent(new Event('ark:open-workflow-modal'));

    await user.type(await screen.findByLabelText('工作流名称'), '深度工作');
    expect(screen.queryByLabelText('默认专注计时方式')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('阶段 1 计时方式'), 'countup');
    await user.selectOptions(screen.getByLabelText('阶段 1 绑定任务'), task.id);
    expect(screen.queryByLabelText('阶段 1 绑定专注工作')).not.toBeInTheDocument();
    expect(screen.queryByText('背单词：今日单词')).not.toBeInTheDocument();
    expect(screen.queryByText('ERC：开始复习')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '创建工作流' }));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(([path, init]) => path === '/todo/focus/workflows' && init?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call?.[1]?.body ?? '{}'));
      expect(body.default_focus_timer_mode).toBe('countup');
      expect(body.phases[0]).toMatchObject({
        phase_type: 'focus',
        duration: 1500,
        timer_mode: 'countup',
        task_id: task.id,
      });
      expect(body.phases[0]).not.toHaveProperty('focus_work_type');
    });
  });

  it('renders AchievementCard in the right-panel achievement slot', () => {
    render(
      <MemoryRouter>
        <PlaceholderCard index={3} split={3} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('achievement-card')).toBeInTheDocument();
  });

  it('separates app-managed tasks from user-created today tasks', async () => {
    const user = userEvent.setup();
    const userTask = buildTask({
      id: 'task-user',
      title: '写论文摘要',
      manually_scheduled_for_today: true,
      source_type: 'user',
      managed_by_app: false,
    });
    const appTask = buildTask({
      id: 'task-vocab',
      title: '今日单词',
      manually_scheduled_for_today: true,
      source_type: 'app',
      app_id: 'vocab',
      app_task_type: 'vocab_today',
      app_config_id: 'config-vocab',
      managed_by_app: true,
    });

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/tasks?limit=100') {
        return Promise.resolve([userTask, appTask]);
      }
      return defaultApiResponse(path);
    });

    renderCard();

    await user.click(screen.getByText('安排'));
    expect((await screen.findAllByText('写论文摘要')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('今日单词').length).toBeGreaterThan(0);
    expect(screen.getAllByText('今日任务').length).toBeGreaterThan(0);
    expect(screen.getAllByText('应用任务').length).toBeGreaterThan(0);
  });

  it('hides the duration input for countup focus phases but still submits a default target duration', async () => {
    const user = userEvent.setup();

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/focus/workflows' && init?.method === 'POST') {
        return Promise.resolve({
          id: 'preset-2',
          user_id: 7,
          name: '正计时流',
          focus_duration: 1500,
          break_duration: 300,
          default_focus_timer_mode: 'countup',
          phases: [
            { phase_type: 'focus', duration: 1500, timer_mode: 'countup', task_id: null },
            { phase_type: 'break', duration: 300, timer_mode: null, task_id: null },
          ],
          is_default: false,
          created_at: '2026-04-16T08:00:00+08:00',
          updated_at: '2026-04-16T08:00:00+08:00',
        });
      }
      return defaultApiResponse(path);
    });

    renderCard();
    window.dispatchEvent(new Event('ark:open-workflow-modal'));

    await user.type(await screen.findByLabelText('工作流名称'), '正计时流');
    await user.selectOptions(screen.getByLabelText('阶段 1 计时方式'), 'countup');

    expect(screen.queryByLabelText('阶段 1 时长（分钟）')).not.toBeInTheDocument();
    expect(screen.getByText('正计时阶段不需要单独设置时长')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '创建工作流' }));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(([path, init]) => path === '/todo/focus/workflows' && init?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call?.[1]?.body ?? '{}'));
      expect(body.phases[0]).toMatchObject({
        phase_type: 'focus',
        timer_mode: 'countup',
        duration: 1500,
      });
    });
  });

  it('lets the user select a task for the current pending workflow phase', async () => {
    const user = userEvent.setup();
    const todoTask = buildTask({ id: 'task-todo', title: '待办任务' });
    const doneTask = buildTask({ id: 'task-done', title: '已完成任务', status: 'done' });

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/tasks?limit=100') {
        return Promise.resolve([todoTask, doneTask]);
      }
      if (path === '/todo/focus/workflow/current') {
        return Promise.resolve({
          state: 'focus',
          workflow_name: '深度工作流',
          current_phase_index: 0,
          phases: [{ phase_type: 'focus', duration: 1500, timer_mode: 'countup', task_id: null }],
          task_id: null,
          task_title: null,
          pending_confirmation: false,
          pending_task_selection: true,
          remaining_seconds: null,
          phase_timer_mode: 'countup',
          elapsed_seconds: null,
        });
      }
      if (path === '/todo/focus/workflow/select-task' && init?.method === 'POST') {
        return Promise.resolve({
          state: 'focus',
          workflow_name: '深度工作流',
          current_phase_index: 0,
          phases: [{ phase_type: 'focus', duration: 1500, timer_mode: 'countup', task_id: null }],
          task_id: todoTask.id,
          task_title: todoTask.title,
          pending_confirmation: false,
          pending_task_selection: false,
          remaining_seconds: null,
          phase_timer_mode: 'countup',
          elapsed_seconds: 0,
          runtime_task_id: todoTask.id,
          phase_started_at: '2026-04-16T08:00:00+08:00',
        });
      }
      return defaultApiResponse(path);
    });

    renderCard();

    await user.click(await screen.findByRole('button', { name: '选择当前阶段任务' }));
    await user.click(await screen.findByRole('button', { name: '选择任务 待办任务' }));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(
        ([path, init]) => path === '/todo/focus/workflow/select-task' && init?.method === 'POST',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call?.[1]?.body ?? '{}'));
      expect(body).toEqual({ task_id: todoTask.id });
    });
  });

  it('copies an existing preset into a new draft', async () => {
    const user = userEvent.setup();
    const preset = buildWorkflowPreset();

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/focus/workflows' && !init?.method) {
        return Promise.resolve([preset]);
      }
      if (path === '/todo/focus/workflows' && init?.method === 'POST') {
        return Promise.resolve(buildWorkflowPreset({ id: 'preset-copy', name: '深度工作流（副本）', is_default: false }));
      }
      return defaultApiResponse(path);
    });

    renderCard();
    window.dispatchEvent(new Event('ark:open-workflow-modal'));

    await user.click(await screen.findByRole('button', { name: '复制工作流 深度工作流' }));

    expect(await screen.findByLabelText('工作流名称')).toHaveValue('深度工作流（副本）');
    expect(screen.getByRole('heading', { name: '创建工作流' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '创建工作流' }));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(([path, requestInit]) => path === '/todo/focus/workflows' && requestInit?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call?.[1]?.body ?? '{}'));
      expect(body.name).toBe('深度工作流（副本）');
    });
  });

  it('keeps workflow phases as fixed focus and break steps', async () => {
    const user = userEvent.setup();

    renderCard();
    window.dispatchEvent(new Event('ark:open-workflow-modal'));

    await user.type(await screen.findByLabelText('工作流名称'), '新的节奏');
    await user.click(screen.getByRole('button', { name: '新增专注阶段' }));

    expect(screen.queryByLabelText('阶段 1 类型')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上移阶段 3' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下移阶段 1' })).not.toBeInTheDocument();
    expect(screen.getByText('专注阶段 1')).toBeInTheDocument();
    expect(screen.getByText('配套休息 1')).toBeInTheDocument();
    expect(screen.getByText('专注阶段 2')).toBeInTheDocument();
    expect(screen.getByText('配套休息 2')).toBeInTheDocument();
    expect(screen.getByText('共 4 个阶段 · 专注 30min · 休息 10min')).toBeInTheDocument();
    expect(screen.getByText('1.专注 25min · 2.休息 5min · 3.专注 5min · 4.休息 5min')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '删除专注阶段 2' }));

    expect(screen.queryByText('专注阶段 2')).not.toBeInTheDocument();
    expect(screen.queryByText('配套休息 2')).not.toBeInTheDocument();
    expect(screen.getByText('1.专注 25min · 2.休息 5min')).toBeInTheDocument();
  });

  it('prompts before closing when the workflow draft has unsaved changes', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderCard();
    window.dispatchEvent(new Event('ark:open-workflow-modal'));

    await user.type(await screen.findByLabelText('工作流名称'), '未保存草稿');
    await user.click(screen.getByRole('button', { name: '关闭工作流预设弹窗' }));

    expect(confirmSpy).toHaveBeenCalledWith('当前工作流还有未保存修改，确定要放弃吗？');
    expect(screen.getByRole('heading', { name: '工作流预设' })).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('shows clearer preset-management copy and the active editing state', async () => {
    const user = userEvent.setup();
    const preset = buildWorkflowPreset();

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/focus/workflows' && !init?.method) {
        return Promise.resolve([preset]);
      }
      return defaultApiResponse(path);
    });

    renderCard();
    window.dispatchEvent(new Event('ark:open-workflow-modal'));

    expect(await screen.findByRole('heading', { name: '工作流预设' })).toBeInTheDocument();
    expect(screen.getByText('这里管理的是可复用的专注流程模板，运行控制仍在主面板中完成。')).toBeInTheDocument();

    await user.click(screen.getByText('深度工作流'));

    expect(screen.getByText('编辑中')).toBeInTheDocument();
  });

  it('dispatches a workflow reminder event when focus advances into break', async () => {
    const reminderSpy = vi.fn();
    window.addEventListener('ark:main-agent-workflow-notification', reminderSpy as EventListener);

    let currentWorkflow = {
      state: 'focus',
      workflow_name: '深度工作流',
      current_phase_index: 0,
      phases: [
        { phase_type: 'focus', duration: 1500, task_id: 'task-a' },
        { phase_type: 'break', duration: 300 },
      ],
      task_id: 'task-a',
      task_title: '待办任务',
      pending_confirmation: false,
      pending_task_selection: false,
      remaining_seconds: 30,
    };

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflow/current') {
        return Promise.resolve(currentWorkflow);
      }
      return defaultApiResponse(path);
    });

    renderCard();

    await waitFor(() => {
      expect(mockApiJson.mock.calls.some(([path]) => path === '/todo/focus/workflow/current')).toBe(true);
    });

    currentWorkflow = {
      ...currentWorkflow,
      state: 'break',
      current_phase_index: 1,
      task_id: null,
      remaining_seconds: 300,
    };

    window.dispatchEvent(new Event('ark:reload-focus'));

    await waitFor(() => {
      expect(reminderSpy).toHaveBeenCalledTimes(1);
    });

    const event = reminderSpy.mock.calls[0][0] as CustomEvent<{ key: string; prompt: string }>;
    expect(event.detail.key).toContain('focus_to_break');
    expect(event.detail.prompt).toContain('来源：workflow_notification');

    window.removeEventListener('ark:main-agent-workflow-notification', reminderSpy as EventListener);
  });

  it('keeps the right-panel workflow timer frozen while task focus is paused', async () => {
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflow/current') {
        return Promise.resolve({
          state: 'focus',
          workflow_name: '自定义工作流',
          current_phase_index: 0,
          phases: [
            { phase_type: 'focus', duration: 1500, task_id: 'task-a', focus_work_type: null },
            { phase_type: 'break', duration: 300 },
          ],
          task_id: 'task-a',
          task_title: '待办任务',
          active_focus_work_type: 'task_focus',
          focus_work_display_state: 'fullscreen',
          pending_confirmation: false,
          pending_task_selection: false,
          remaining_seconds: 754,
          is_paused: true,
        });
      }
      return defaultApiResponse(path);
    });

    renderCard();

    expect(await screen.findByText('12:34')).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(screen.getAllByText('12:34').length).toBeGreaterThan(0);
  });

  it('does not dispatch the same workflow reminder twice across repeated reloads', async () => {
    const reminderSpy = vi.fn();
    window.addEventListener('ark:main-agent-workflow-notification', reminderSpy as EventListener);

    let currentWorkflow = {
      state: 'focus',
      workflow_name: '深度工作流',
      current_phase_index: 0,
      phases: [{ phase_type: 'focus', duration: 1500, task_id: 'task-a' }],
      task_id: 'task-a',
      task_title: '待办任务',
      pending_confirmation: false,
      pending_task_selection: false,
      remaining_seconds: 10,
    };

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflow/current') {
        return Promise.resolve(currentWorkflow);
      }
      return defaultApiResponse(path);
    });

    renderCard();

    await waitFor(() => {
      expect(mockApiJson.mock.calls.some(([path]) => path === '/todo/focus/workflow/current')).toBe(true);
    });

    currentWorkflow = {
      ...currentWorkflow,
      pending_confirmation: true,
      remaining_seconds: 0,
    };

    window.dispatchEvent(new Event('ark:reload-focus'));

    await waitFor(() => {
      expect(reminderSpy).toHaveBeenCalledTimes(1);
    });

    window.dispatchEvent(new Event('ark:reload-focus'));

    await waitFor(() => {
      expect(reminderSpy).toHaveBeenCalledTimes(1);
    });

    window.removeEventListener('ark:main-agent-workflow-notification', reminderSpy as EventListener);
  });
});
