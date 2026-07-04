import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PlaceholderCard from '../PlaceholderCard';
import { apiJson } from '../../lib/api';
import { ONBOARDING_EVENTS } from '../../lib/onboardingEvents';

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
    current_cycle_count: 0,
    target_cycle_count: 1,
    cycle_period: 'daily',
    cycle_every_days: null,
    event: '',
    event_ids: [],
    task_type: 'focus',
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

function buildDeliberateWorkflowPreset(overrides: Partial<Record<string, unknown>> = {}) {
  return buildWorkflowPreset({
    id: 'deliberate-preset-1',
    name: '英语学习编排',
    phases: [
      {
        phase_type: 'deliberate_group',
        duration: 60,
        config_ids: ['cfg-a', 'cfg-b'],
        config_names: ['英语二阅读', '408'],
      },
    ],
    ...overrides,
  });
}

const primaryEvent = {
  id: 'event-1',
  user_id: 7,
  name: '高数期末',
  start_date: '2026-05-20',
  due_at: '2026-06-20T09:00:00Z',
  is_primary: true,
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
};

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
    window.localStorage.clear();
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
    await user.selectOptions(screen.getByLabelText('计时方式'), 'countup');
    await user.selectOptions(screen.getByLabelText('绑定任务'), task.id);
    expect(screen.queryByLabelText('绑定专注工作')).not.toBeInTheDocument();
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

  it('renders both app-managed tasks and user-created today tasks side-by-side in today arrangements', async () => {
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
      app_id: 'flash',
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
  });

  it('shows the default deliberate workflow as the selected start target and starts it through the unified API', async () => {
    const user = userEvent.setup();
    const workflowStarted = vi.fn();
    window.addEventListener(ONBOARDING_EVENTS.workflowStarted, workflowStarted);
    const preset = buildDeliberateWorkflowPreset({ id: 'preset-default', name: '英语学习编排', is_default: true });

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/focus/workflows') return Promise.resolve([preset]);
      if (path === '/todo/focus/workflow/start-multi-deliberate' && init?.method === 'POST') {
        return Promise.resolve({
          state: 'focus',
          workflow_name: preset.name,
          current_phase_index: 0,
          phases: preset.phases,
          task_id: null,
          task_title: null,
          pending_confirmation: false,
          pending_task_selection: true,
          remaining_seconds: null,
        });
      }
      return defaultApiResponse(path);
    });

    renderCard();

    expect(await screen.findByText('开始工作流')).toBeInTheDocument();
    expect(screen.getByText('英语学习编排')).toBeInTheDocument();

    try {
      await user.click(screen.getByRole('button', { name: '开始工作流 英语学习编排' }));

      await waitFor(() => {
        expect(mockApiJson).toHaveBeenCalledWith(
          '/todo/focus/workflow/start-multi-deliberate',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ config_ids: ['cfg-a', 'cfg-b'] }),
          }),
        );
        expect(workflowStarted).toHaveBeenCalledTimes(1);
      });
    } finally {
      window.removeEventListener(ONBOARDING_EVENTS.workflowStarted, workflowStarted);
    }
  });

  it('opens the focus workbench instead of skipping an active focus phase', async () => {
    const user = userEvent.setup();

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/focus/workflow/current') {
        return Promise.resolve({
          state: 'focus',
          workflow_name: '深度工作流',
          current_phase_index: 0,
          phases: [{ phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: null }],
          task_id: 'task-1',
          task_title: '任务 A',
          pending_confirmation: false,
          pending_task_selection: false,
          remaining_seconds: 1500,
          phase_timer_mode: 'countdown',
        });
      }
      if (path === '/todo/focus/workflow/focus-workbench/show' && init?.method === 'POST') {
        return Promise.resolve({
          state: 'focus',
          workflow_name: '深度工作流',
          current_phase_index: 0,
          phases: [{ phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: null }],
          task_id: 'task-1',
          task_title: '任务 A',
          pending_confirmation: false,
          pending_task_selection: false,
          remaining_seconds: 1500,
          active_focus_work_type: 'task_focus',
          focus_work_display_state: 'fullscreen',
        });
      }
      return defaultApiResponse(path);
    });

    renderCard();

    await user.click(await screen.findByRole('button', { name: /查看工作台 任务 A/ }));

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith('/todo/focus/workflow/focus-workbench/show', { method: 'POST' });
      expect(mockApiJson).not.toHaveBeenCalledWith('/todo/focus/workflow/skip_phase', { method: 'POST' });
    });
  });

  it('dispatches onboarding progress when ending a break phase', async () => {
    const user = userEvent.setup();
    const workflowPhaseEnded = vi.fn();
    window.addEventListener(ONBOARDING_EVENTS.workflowPhaseEnded, workflowPhaseEnded);

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/focus/workflow/current') {
        return Promise.resolve({
          state: 'break',
          workflow_name: '深度工作流',
          current_phase_index: 1,
          phases: [
            { phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: null },
            { phase_type: 'break', duration: 300, timer_mode: null, task_id: null },
          ],
          task_id: null,
          task_title: null,
          pending_confirmation: false,
          pending_task_selection: false,
          remaining_seconds: 300,
          phase_timer_mode: null,
        });
      }
      if (path === '/todo/focus/workflow/skip_phase' && init?.method === 'POST') {
        return Promise.resolve({
          state: 'normal',
          task_id: null,
          task_title: null,
          pending_confirmation: false,
          pending_task_selection: false,
          remaining_seconds: null,
        });
      }
      return defaultApiResponse(path);
    });

    try {
      renderCard();

      await user.click(await screen.findByRole('button', { name: /结束休息 休息中/ }));

      await waitFor(() => {
        expect(mockApiJson).toHaveBeenCalledWith('/todo/focus/workflow/skip_phase', { method: 'POST' });
        expect(workflowPhaseEnded).toHaveBeenCalledTimes(1);
      });
    } finally {
      window.removeEventListener(ONBOARDING_EVENTS.workflowPhaseEnded, workflowPhaseEnded);
    }
  });

  it('keeps ending the workflow on the first-row hover button and dispatches onboarding completion', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const workflowStopped = vi.fn();
    window.addEventListener(ONBOARDING_EVENTS.workflowStopped, workflowStopped);
    let stopped = false;

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/focus/workflow/current') {
        return Promise.resolve(stopped
          ? {
              state: 'normal',
              task_id: null,
              task_title: null,
              pending_confirmation: false,
              pending_task_selection: false,
              remaining_seconds: null,
            }
          : {
              state: 'focus',
              workflow_name: '深度工作流',
              current_phase_index: 0,
              phases: [{ phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: null }],
              task_id: 'task-1',
              task_title: '任务 A',
              pending_confirmation: false,
              pending_task_selection: false,
              remaining_seconds: 1500,
              phase_timer_mode: 'countdown',
            });
      }
      if (path === '/todo/focus/stop' && init?.method === 'POST') {
        stopped = true;
        return Promise.resolve({ ok: true });
      }
      return defaultApiResponse(path);
    });

    try {
      renderCard();

      await user.click(await screen.findByRole('button', { name: '结束工作流' }));

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledWith('当前正在工作流中，是否结束整个工作流？');
        expect(mockApiJson).toHaveBeenCalledWith('/todo/focus/stop', { method: 'POST' });
        expect(workflowStopped).toHaveBeenCalledTimes(1);
      });
    } finally {
      window.removeEventListener(ONBOARDING_EVENTS.workflowStopped, workflowStopped);
      confirmSpy.mockRestore();
    }
  });

  it('uses the last selected workflow from localStorage before the default workflow', async () => {
    window.localStorage.setItem('ark-home-selected-workflow-preset-id', 'preset-last');
    const defaultPreset = buildDeliberateWorkflowPreset({ id: 'preset-default', name: '默认工作流', is_default: true });
    const lastPreset = buildDeliberateWorkflowPreset({ id: 'preset-last', name: '上次工作流', is_default: false });

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflows') return Promise.resolve([defaultPreset, lastPreset]);
      return defaultApiResponse(path);
    });

    renderCard();

    expect(await screen.findByText('开始工作流')).toBeInTheDocument();
    expect(screen.getByText('上次工作流')).toBeInTheDocument();
  });

  it('reloads workflow presets so event workflows appear in the home launcher', async () => {
    const user = userEvent.setup();
    const presets: ReturnType<typeof buildWorkflowPreset>[] = [];

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflows') return Promise.resolve([...presets]);
      if (path === '/todo/events') return Promise.resolve([primaryEvent]);
      return defaultApiResponse(path);
    });

    renderCard();

    expect(await screen.findByRole('button', { name: '新建学习编排' })).toBeInTheDocument();

    presets.push(
      buildDeliberateWorkflowPreset({
        id: 'preset-event',
        name: '期末冲刺',
        event_id: 'event-1',
        event_name: '高数期末',
        is_default: false,
      }),
      buildDeliberateWorkflowPreset({
        id: 'preset-other',
        name: '其他事件工作流',
        event_id: 'event-other',
        event_name: '其他事件',
        is_default: false,
      }),
    );
    window.dispatchEvent(new Event('ark:reload-focus'));

    await waitFor(() => {
      expect(
        mockApiJson.mock.calls.filter(([path]) => path === '/todo/focus/workflows').length,
      ).toBeGreaterThan(1);
    });

    expect(await screen.findByRole('button', { name: /开始工作流 期末冲刺/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /开始工作流 其他事件工作流/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '切换工作流 期末冲刺' }));

    expect(await screen.findByRole('dialog', { name: '选择工作流' })).toBeInTheDocument();
    expect(screen.getByText('事件：高数期末')).toBeInTheDocument();
    expect(screen.queryByText('事件：其他事件')).not.toBeInTheDocument();
  });

  it('shows current-event workflows in the home workflow preset panel and allows editing, setting default, and deleting them', async () => {
    const user = userEvent.setup();
    const globalPreset = buildWorkflowPreset({ id: 'preset-global', name: '全局工作流', is_default: true });
    const eventPreset = buildWorkflowPreset({
      id: 'preset-event',
      name: '期末冲刺',
      event_id: 'event-1',
      event_name: '高数期末',
      is_default: false,
    });
    const otherPreset = buildWorkflowPreset({
      id: 'preset-other',
      name: '其他事件工作流',
      event_id: 'event-other',
      event_name: '其他事件',
      is_default: false,
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/focus/workflows') {
        if (init?.method === 'PATCH' || init?.method === 'DELETE' || init?.method === 'POST') {
          return Promise.resolve({});
        }
        return Promise.resolve([globalPreset, eventPreset, otherPreset]);
      }
      if (path === '/todo/events') return Promise.resolve([primaryEvent]);
      if (path.startsWith('/todo/events/event-1/workflows/')) {
        return Promise.resolve({});
      }
      if (path === '/todo/focus/workflows/preset-event/default') {
        return Promise.resolve({});
      }
      return defaultApiResponse(path);
    });

    renderCard();
    window.dispatchEvent(new Event('ark:open-workflow-modal'));

    const dialog = await screen.findByRole('dialog', { name: '工作流' });
    expect(within(dialog).getByText('全局工作流')).toBeInTheDocument();
    expect(within(dialog).getByText('期末冲刺')).toBeInTheDocument();
    expect(within(dialog).getByText('事件：高数期末')).toBeInTheDocument();
    expect(within(dialog).queryByText('其他事件工作流')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '工作流 期末冲刺 更多操作' })).toBeInTheDocument();

    // 1. Edit current-event workflow
    await user.click(within(dialog).getByText('期末冲刺'));
    expect(screen.getByLabelText('工作流名称')).toHaveValue('期末冲刺');

    // Change name and save
    await user.clear(screen.getByLabelText('工作流名称'));
    await user.type(screen.getByLabelText('工作流名称'), '期末冲刺修改');
    await user.click(screen.getByRole('button', { name: '保存工作流' }));

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith(
        '/todo/events/event-1/workflows/preset-event',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"name":"期末冲刺修改"'),
        })
      );
    });

    // 2. Set as default
    const eventPresetCard = screen.getByText('期末冲刺').closest('.border') as HTMLElement;
    expect(eventPresetCard).toBeInTheDocument();
    
    // Open three dots menu
    await user.click(within(eventPresetCard).getByRole('button', { name: '工作流 期末冲刺 更多操作' }));
    
    const setDefaultBtn = within(eventPresetCard).getByRole('button', { name: '设为默认' });
    await user.click(setDefaultBtn);
    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith('/todo/focus/workflows/preset-event/default', { method: 'POST' });
    });

    // 3. Delete event workflow
    // Open three dots menu again
    await user.click(within(eventPresetCard).getByRole('button', { name: '工作流 期末冲刺 更多操作' }));
    
    const deleteBtn = within(eventPresetCard).getByRole('button', { name: '删除' });
    await user.click(deleteBtn);
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('确认删除该工作流吗？');
      expect(mockApiJson).toHaveBeenCalledWith('/todo/events/event-1/workflows/preset-event', { method: 'DELETE' });
    });

    confirmSpy.mockRestore();
  });

  it('opens the workflow picker from the workflow name and switches without starting', async () => {
    const user = userEvent.setup();
    const first = buildDeliberateWorkflowPreset({ id: 'preset-a', name: 'A 工作流', is_default: true });
    const second = buildDeliberateWorkflowPreset({ id: 'preset-b', name: 'B 工作流', is_default: false });

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflows') return Promise.resolve([first, second]);
      return defaultApiResponse(path);
    });

    renderCard();

    await user.click(await screen.findByRole('button', { name: '切换工作流 A 工作流' }));
    await user.click(screen.getByRole('button', { name: '选择工作流 B 工作流' }));

    expect(window.localStorage.getItem('ark-home-selected-workflow-preset-id')).toBe('preset-b');
    expect(screen.getByRole('button', { name: '切换工作流 B 工作流' })).toBeInTheDocument();
    expect(mockApiJson.mock.calls.some(([path]) => path === '/todo/focus/workflows/preset-b/start')).toBe(false);
    expect(mockApiJson.mock.calls.some(([path]) => path === '/todo/focus/workflow/start-multi-deliberate')).toBe(false);
  });

  it('does not open the legacy workflow modal when creating from the picker', async () => {
    const user = userEvent.setup();
    const preset = buildDeliberateWorkflowPreset({ id: 'preset-a', name: 'A 工作流', is_default: true });

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflows') return Promise.resolve([preset]);
      return defaultApiResponse(path);
    });

    renderCard();

    await user.click(await screen.findByRole('button', { name: '切换工作流 A 工作流' }));
    await user.click(screen.getByRole('button', { name: '新建学习编排' }));

    expect(screen.queryByRole('heading', { name: '工作流' })).not.toBeInTheDocument();
  });

  it('does not open the legacy workflow modal from the empty workflow state', async () => {
    const user = userEvent.setup();

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflows') return Promise.resolve([]);
      return defaultApiResponse(path);
    });

    renderCard();

    await user.click(await screen.findByRole('button', { name: '新建学习编排' }));

    expect(screen.queryByRole('heading', { name: '工作流' })).not.toBeInTheDocument();
  });

  it('keeps the normal start-workflow hover scoped to workflow switching only', async () => {
    const preset = buildDeliberateWorkflowPreset({ id: 'preset-default', name: '深度工作流', is_default: true });

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflows') return Promise.resolve([preset]);
      return defaultApiResponse(path);
    });

    renderCard();

    const launcher = await screen.findByRole('button', { name: '开始工作流 深度工作流' });
    const nestedActions = within(launcher).getAllByRole('button');

    expect(nestedActions.map((item) => item.getAttribute('aria-label') ?? item.textContent?.trim())).toEqual([
      '切换工作流 深度工作流',
    ]);
  });

  it('keeps the inactive split-card workflow status outside the main task entry', async () => {
    const preset = buildDeliberateWorkflowPreset({ id: 'preset-default', name: '深度工作流', is_default: true });

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflows') return Promise.resolve([preset]);
      return defaultApiResponse(path);
    });

    render(
      <MemoryRouter>
        <PlaceholderCard index={1} split={2} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith('/todo/focus/workflows');
    });
    expect(screen.getByText('当前工作流')).toBeInTheDocument();
    expect(screen.getByText('深度工作流')).toBeInTheDocument();
    expect(screen.getByText('2 个专注工作')).toBeInTheDocument();
    expect(screen.queryByText('运行 深度工作流')).not.toBeInTheDocument();
    expect(screen.getByTitle('学习编排设置')).toBeInTheDocument();
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
    await user.selectOptions(screen.getByLabelText('计时方式'), 'countup');

    expect(screen.queryByLabelText('专注时长')).not.toBeInTheDocument();
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

  it('opens the task picker from the dashboard pending-selection event', async () => {
    const todoTask = buildTask({ id: 'task-todo', title: '待办任务' });

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/tasks?limit=100') {
        return Promise.resolve([todoTask]);
      }
      return defaultApiResponse(path);
    });

    renderCard();

    window.dispatchEvent(new Event('ark:open-focus-task-picker'));

    expect(await screen.findByRole('dialog', { name: '全部任务' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '选择任务 待办任务' })).toBeInTheDocument();
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

    await user.click(await screen.findByRole('button', { name: '工作流 深度工作流 更多操作' }));
    await user.click(screen.getByRole('button', { name: '复制' }));

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
    await user.click(screen.getByRole('button', { name: '添加学习阶段' }));

    expect(screen.queryByLabelText('阶段 1 类型')).not.toBeInTheDocument();
    expect(screen.getByText('流程编辑')).toBeInTheDocument();
    expect(screen.getByText('(共 2 个阶段)')).toBeInTheDocument();
    
    // We should see three nodes/texts with "运行时选择任务" (two in nodes, one in editor pane)
    expect(screen.getAllByText('运行时选择任务')).toHaveLength(3);

    // Delete the second stage (which is active editing after adding)
    await user.click(screen.getByRole('button', { name: '删除阶段' }));

    expect(screen.getByText('(共 1 个阶段)')).toBeInTheDocument();
    expect(screen.getAllByText('运行时选择任务')).toHaveLength(2);
  });

  it('prompts before closing when the workflow draft has unsaved changes', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderCard();
    window.dispatchEvent(new Event('ark:open-workflow-modal'));

    await user.type(await screen.findByLabelText('工作流名称'), '未保存草稿');
    await user.click(screen.getByRole('button', { name: '关闭工作流预设弹窗' }));

    expect(confirmSpy).toHaveBeenCalledWith('当前工作流还有未保存修改，确定要放弃吗？');
    expect(screen.getByRole('heading', { name: '工作流' })).toBeInTheDocument();

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

    expect(await screen.findByRole('heading', { name: '工作流' })).toBeInTheDocument();
    expect(screen.getByText('这里管理的是可复用的专注流程模板，运行控制仍在主面板中完成。')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog', { name: '工作流' });
    await user.click(within(dialog).getByText('深度工作流'));

    expect(screen.getByText('编辑中')).toBeInTheDocument();
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

  it('does not repeatedly refetch the workflow after the phase time-expired prompt is reached', async () => {
    let workflowRequestCount = 0;
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflow/current') {
        workflowRequestCount += 1;
        return Promise.resolve({
          state: 'focus',
          workflow_name: '自定义工作流',
          current_phase_index: 0,
          phases: [
            { phase_type: 'focus', duration: 300, task_id: 'task-a', focus_work_type: null },
            { phase_type: 'break', duration: 300 },
          ],
          task_id: 'task-a',
          task_title: '待办任务',
          active_focus_work_type: 'task_focus',
          focus_work_display_state: 'fullscreen',
          pending_confirmation: false,
          pending_task_selection: false,
          remaining_seconds: 0,
          is_paused: false,
          phase_runtime_state: 'phase_time_expired_prompt',
        });
      }
      return defaultApiResponse(path);
    });

    renderCard();

    expect(await screen.findByText('00:00')).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(workflowRequestCount).toBe(1);
  });
});
