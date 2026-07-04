import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HomeRightDashboard from '../HomeRightDashboard';
import { apiJson } from '../../lib/api';
import { fetchCurrentFocusWorkflow, startMultiDeliberateWorkflow } from '../../lib/focusWorkflow';
import type { WorkflowPreset } from '../workflowPresetForm';

vi.mock('../CalendarWidget', () => ({
  default: () => <div data-testid="calendar-widget" />,
}));

vi.mock('../AchievementModal', () => ({
  default: () => null,
}));

vi.mock('../deliberate/DeliberateWorkflowPreviewModal', () => ({
  default: ({ open, preset, onClose, onStart }: { open: boolean; preset: WorkflowPreset | null; onClose: () => void; onStart: (configIds: string[]) => void }) => {
    if (!open || !preset) return null;
    const groupPhase = preset.phases.find((ph) => ph.phase_type === 'deliberate_group');
    const configIds = groupPhase?.config_ids ?? [];
    const configNames = groupPhase?.config_names ?? [];
    return (
      <div role="dialog" aria-label="编排预览">
        <div>{preset.name}</div>
        <div>{configNames.length} 个专注工作</div>
        {configNames.map((name: string, i: number) => (
          <div key={i}>{name}</div>
        ))}
        <button onClick={onClose}>关闭</button>
        <button onClick={() => onStart(configIds)}>启动工作流</button>
        <button onClick={onClose}>编辑编排</button>
      </div>
    );
  },
}));

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

vi.mock('../../lib/focusWorkflow', () => ({
  fetchCurrentFocusWorkflow: vi.fn(),
  startMultiDeliberateWorkflow: vi.fn(),
}));

const mockApiJson = vi.mocked(apiJson);
const mockStartMulti = vi.mocked(startMultiDeliberateWorkflow);
const mockFetchWorkflow = vi.mocked(fetchCurrentFocusWorkflow);

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
      { phase_type: 'deliberate_group', duration: 0, config_ids: ['cfg-a', 'cfg-b'], config_names: ['选择练习A', '闪卡复习'] },
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
    mockStartMulti.mockResolvedValue(undefined as never);
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

  it('previews and starts the deliberate workflow', async () => {
    const user = userEvent.setup();
    const defaultWorkflow = buildWorkflowPreset();
    const longWorkflow = buildWorkflowPreset({
      id: 'workflow-2',
      name: '长专注',
      is_default: false,
      phases: [
        { phase_type: 'deliberate_group', duration: 0, config_ids: ['cfg-c', 'cfg-d', 'cfg-e'], config_names: ['选择练习C', '输入练习D', '闪卡E'] },
      ],
    });

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflows') return Promise.resolve([defaultWorkflow, longWorkflow]);
      return defaultApiResponse(path);
    });

    renderDashboard();

    await user.click(await screen.findByRole('button', { name: '开始学习' }));

    expect(await screen.findByRole('dialog', { name: '编排预览' })).toBeInTheDocument();
    expect(screen.getByText('默认番茄')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '启动工作流' }));

    await waitFor(() => {
      expect(mockStartMulti).toHaveBeenCalledWith(['cfg-a', 'cfg-b']);
    });
  });

  it('skips legacy workflow presets when opening the deliberate workflow preview', async () => {
    const user = userEvent.setup();
    const legacyWorkflow = buildWorkflowPreset({
      id: 'legacy-workflow',
      name: '旧番茄',
      is_default: true,
      phases: [
        { phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: null },
        { phase_type: 'break', duration: 300, timer_mode: 'countdown', task_id: null },
      ],
    });
    const deliberateWorkflow = buildWorkflowPreset({
      id: 'workflow-deliberate',
      name: '英语编排',
      is_default: false,
      phases: [
        { phase_type: 'deliberate_group', duration: 60, config_ids: ['cfg-reading'], config_names: ['英语二阅读'] },
      ],
    });

    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflows') return Promise.resolve([legacyWorkflow, deliberateWorkflow]);
      return defaultApiResponse(path);
    });

    renderDashboard();

    await user.click(await screen.findByRole('button', { name: '开始学习' }));

    expect(await screen.findByRole('dialog', { name: '编排预览' })).toBeInTheDocument();
    expect(screen.getByText('英语编排')).toBeInTheDocument();
    expect(screen.queryByText('旧番茄')).not.toBeInTheDocument();
  });

  it('renders the active workflow name and its phases chain when a workflow is active', async () => {
    mockFetchWorkflow.mockResolvedValue({
      state: 'focus',
      workflow_name: '考研英语',
      current_phase_index: 1,
      phases: [
        { phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: null, focus_work_type: 'vocab_today' },
        { phase_type: 'break', duration: 300, timer_mode: 'countdown', task_id: null },
        { phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: null, focus_work_type: 'practice' },
      ],
      task_id: null,
      task_title: null,
      pending_confirmation: false,
      pending_task_selection: false,
      remaining_seconds: 600,
    });

    renderDashboard();

    expect(await screen.findByText('今日进度')).toBeInTheDocument();
    expect(screen.getByText('当前工作流：考研英语')).toBeInTheDocument();
    expect(screen.getByText('考研英语')).toBeInTheDocument();
    expect(screen.getByText('今日单词')).toBeInTheDocument();
    expect(screen.getAllByText('选择练习').length).toBe(2);
    expect(screen.getByText('下个任务')).toBeInTheDocument();
    expect(screen.queryByText('10:00')).not.toBeInTheDocument();
  });
});
