import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HomeRightDashboard from '../HomeRightDashboard';
import { apiJson } from '../../lib/api';
import type { WorkflowPreset } from '../workflowPresetForm';

vi.mock('../CalendarWidget', () => ({
  default: () => <div data-testid="calendar-widget" />,
}));

vi.mock('../AchievementModal', () => ({
  default: () => null,
}));

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

const mockApiJson = vi.mocked(apiJson);

function buildWorkflowPreset(overrides: Partial<WorkflowPreset> = {}): WorkflowPreset {
  return {
    id: 'workflow-1',
    user_id: 7,
    event_id: null,
    event_name: null,
    name: '默认番茄',
    focus_duration: 1500,
    break_duration: 300,
    default_focus_timer_mode: 'countdown',
    phases: [
      { phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: null },
      { phase_type: 'break', duration: 300, timer_mode: 'countdown', task_id: null },
    ],
    is_default: true,
    created_at: '2026-04-16T08:00:00+08:00',
    updated_at: '2026-04-16T08:00:00+08:00',
    ...overrides,
  };
}

function defaultApiResponse(path: string) {
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
  if (path === '/todo/focus/today') return Promise.resolve({ minutes: 0 });
  if (path === '/todo/tasks?limit=100') return Promise.resolve([]);
  if (path === '/todo/appointments') return Promise.resolve([]);
  if (path === '/todo/achievements/summary') return Promise.resolve(null);
  if (path === '/todo/focus/workflows') return Promise.resolve([buildWorkflowPreset()]);
  return Promise.resolve({});
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <HomeRightDashboard />
    </MemoryRouter>,
  );
}

describe('HomeRightDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiJson.mockImplementation((path: string) => defaultApiResponse(path));
  });

  it('renders the unified home dashboard sections and shortcuts', async () => {
    renderDashboard();

    expect(await screen.findByRole('button', { name: '开始学习' })).toBeInTheDocument();
    expect(screen.getByText('当前工作流：默认番茄')).toBeInTheDocument();
    expect(screen.getByText('今日进度')).toBeInTheDocument();
    expect(screen.getByText('任务')).toBeInTheDocument();
    expect(screen.getByText('日程')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-widget')).toBeInTheDocument();
    expect(screen.getByText('数据分析')).toBeInTheDocument();
    expect(screen.getByText('成就')).toBeInTheDocument();
    expect(screen.getByText('应用中心')).toBeInTheDocument();
  });

  it('previews and switches the workflow before starting study', async () => {
    const user = userEvent.setup();
    const defaultWorkflow = buildWorkflowPreset();
    const longWorkflow = buildWorkflowPreset({
      id: 'workflow-2',
      name: '长专注',
      is_default: false,
      phases: [
        { phase_type: 'focus', duration: 2700, timer_mode: 'countup', task_id: null },
        { phase_type: 'break', duration: 600, timer_mode: 'countdown', task_id: null },
      ],
    });

    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/todo/focus/workflows') return Promise.resolve([defaultWorkflow, longWorkflow]);
      if (path === '/todo/focus/workflows/workflow-2/start' && init?.method === 'POST') {
        return Promise.resolve({ state: 'focus' });
      }
      return defaultApiResponse(path);
    });

    renderDashboard();

    await user.click(await screen.findByRole('button', { name: '开始学习' }));

    expect(await screen.findByRole('dialog', { name: '开始学习' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /默认番茄/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /长专注/ }));

    expect(screen.getByRole('heading', { name: '长专注' })).toBeInTheDocument();
    expect(screen.getAllByText('2 个阶段 · 专注 45 分钟 · 休息 10 分钟').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '开始本次工作流' }));

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith('/todo/focus/workflows/workflow-2/start', { method: 'POST' });
    });
  });

  it('renders the active workflow name and its phases chain when a workflow is active', async () => {
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflow/current') {
        return Promise.resolve({
          state: 'focus',
          workflow_name: '考研英语',
          current_phase_index: 1,
          phases: [
            { phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: null, focus_work_type: 'vocab_today' },
            { phase_type: 'break', duration: 300, timer_mode: 'countdown', task_id: null },
            { phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: null, focus_work_type: 'erc_practice' },
          ],
          task_id: null,
          task_title: null,
          pending_confirmation: false,
          pending_task_selection: false,
          remaining_seconds: 600,
        });
      }
      return defaultApiResponse(path);
    });

    renderDashboard();

    expect(await screen.findByText('今日进度')).toBeInTheDocument();
    expect(screen.getByText('当前工作流：考研英语')).toBeInTheDocument();
    expect(screen.getByText('考研英语')).toBeInTheDocument();
    expect(screen.getByText('今日单词')).toBeInTheDocument();
    expect(screen.getByText('ERC 真题练习')).toBeInTheDocument();
    expect(screen.getByText('下个任务：ERC 真题练习 (25分钟)')).toBeInTheDocument();
    expect(screen.queryByText('10:00')).not.toBeInTheDocument();
  });
});
