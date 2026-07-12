import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HomeRightDashboard from '../HomeRightDashboard';
import { apiJson } from '../../lib/api';
import {
  fetchCurrentFocusWorkflow,
  fetchWorkflowRecordSettlement,
  fetchWorkflowRecords,
  startMultiDeliberateWorkflow,
} from '../../lib/focusWorkflow';
import { getPrimaryEvent } from '../../lib/events/api';
import { loadAppRegistry } from '../../lib/appRegistry';
import { useAuthStore } from '../../lib/auth';
import { dispatchOnboardingEvent, ONBOARDING_EVENTS } from '../../lib/onboardingEvents';
import type { WorkflowPreset } from '../workflowPresetForm';

vi.mock('../CalendarWidget', () => ({
  default: () => <div data-testid="calendar-widget" />,
}));

vi.mock('../AchievementModal', () => ({
  default: () => null,
}));

vi.mock('../deliberate/DeliberateWorkflowPreviewModal', () => ({
  default: ({ open, preset, presets, subApps, onClose, onStart }: {
    open: boolean;
    preset: WorkflowPreset | null;
    presets?: WorkflowPreset[];
    subApps?: { id: string; name: string }[];
    onClose: () => void;
    onStart: (configIds: string[]) => void;
  }) => {
    if (!open || !preset) return null;
    const groupPhase = preset.phases.find((ph) => ph.phase_type === 'deliberate_group');
    const configIds = groupPhase?.config_ids ?? [];
    const configNames = groupPhase?.config_names ?? [];
    return (
      <div role="dialog" aria-label="编排预览">
        <div>{preset.name}</div>
        <div>{subApps?.map((app) => app.name).join('、')}</div>
        <div>{presets?.length ?? 0} 个工作流</div>
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
  fetchWorkflowRecords: vi.fn(),
  fetchWorkflowRecordSettlement: vi.fn(),
  startMultiDeliberateWorkflow: vi.fn(),
}));

vi.mock('../../lib/events/api', () => ({
  getPrimaryEvent: vi.fn(),
}));

vi.mock('../../lib/appRegistry', () => ({
  loadAppRegistry: vi.fn(),
}));

vi.mock('../../lib/onboardingEvents', () => ({
  ONBOARDING_EVENTS: { workflowStarted: 'ark:first-guide-workflow-started' },
  dispatchOnboardingEvent: vi.fn(),
}));

const mockApiJson = vi.mocked(apiJson);
const mockStartMulti = vi.mocked(startMultiDeliberateWorkflow);
const mockFetchWorkflow = vi.mocked(fetchCurrentFocusWorkflow);
const mockFetchWorkflowRecords = vi.mocked(fetchWorkflowRecords);
const mockFetchWorkflowSettlement = vi.mocked(fetchWorkflowRecordSettlement);
const mockGetPrimaryEvent = vi.mocked(getPrimaryEvent);
const mockLoadAppRegistry = vi.mocked(loadAppRegistry);
const mockDispatchOnboardingEvent = vi.mocked(dispatchOnboardingEvent);

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
    useAuthStore.getState().clear();
    mockApiJson.mockImplementation((path: string) => defaultApiResponse(path));
    mockStartMulti.mockResolvedValue(undefined as never);
    mockFetchWorkflowRecords.mockResolvedValue([]);
    mockFetchWorkflowSettlement.mockResolvedValue({
      workflow_name: '默认番茄',
      result: 'completed',
      phases: [],
      nodes: [],
      total_phases: 0,
      total_answered: 0,
      total_correct: 0,
      total_accuracy: null,
      total_duration_seconds: 0,
      fork_count: 0,
      retry_count: 0,
      best_accuracy: null,
      first_try_passed_count: 0,
    });
    mockDispatchOnboardingEvent.mockClear();
    mockGetPrimaryEvent.mockRejectedValue(new Error('主事件不存在'));
    mockLoadAppRegistry.mockResolvedValue([]);
  });

  it('renders the unified home dashboard sections and shortcuts', async () => {
    renderDashboard();

    const startLearning = await screen.findByRole('button', { name: '开始学习' });
    expect(startLearning).toBeInTheDocument();
    expect(startLearning).not.toHaveAttribute('data-onboarding-anchor');
    expect(screen.getByText('当前工作流：默认番茄')).toBeInTheDocument();
    expect(screen.getByText('上次工作流结果')).toBeInTheDocument();
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
    expect(mockDispatchOnboardingEvent).toHaveBeenCalledWith(ONBOARDING_EVENTS.workflowStarted);
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

  it('loads workflows from the current event sub-apps before opening the preview', async () => {
    const user = userEvent.setup();
    const english = buildWorkflowPreset({ id: 'english-preset', name: '英语二工作流', app_id: 'english-app' });
    const math = buildWorkflowPreset({ id: 'math-preset', name: '数学二工作流', app_id: 'math-app' });
    mockGetPrimaryEvent.mockResolvedValue({ id: 'event-1' } as never);
    mockLoadAppRegistry.mockResolvedValue([
      { id: 'english-app', name: '英语二', eventId: 'event-1' },
      { id: 'math-app', name: '数学二', eventId: 'event-1' },
      { id: 'other-app', name: '其他事件', eventId: 'event-2' },
    ] as never);
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/focus/workflows?app_id=english-app') return Promise.resolve([english]);
      if (path === '/todo/focus/workflows?app_id=math-app') return Promise.resolve([math]);
      return defaultApiResponse(path);
    });

    renderDashboard();
    await user.click(await screen.findByRole('button', { name: '开始学习' }));

    expect(await screen.findByRole('dialog', { name: '编排预览' })).toHaveTextContent('英语二、数学二');
    expect(screen.getByText('2 个工作流')).toBeInTheDocument();
    expect(mockApiJson).toHaveBeenCalledWith('/todo/focus/workflows?app_id=english-app');
    expect(mockApiJson).toHaveBeenCalledWith('/todo/focus/workflows?app_id=math-app');
    expect(mockApiJson).not.toHaveBeenCalledWith('/todo/focus/workflows?app_id=other-app');
  });

  it('keeps the visible learning entry available as the onboarding target for guests', async () => {
    useAuthStore.getState().setUser({
      id: 1,
      username: 'guest',
      email: null,
      is_active: true,
      is_admin: false,
      is_guest: true,
      created_at: '2026-07-12T00:00:00Z',
    });
    renderDashboard();

    const startLearning = await screen.findByRole('button', { name: '开始学习' });
    expect(startLearning).toHaveAttribute('data-onboarding-anchor', 'guest-learning-entry');
    expect(startLearning.closest('[aria-hidden="true"]')).toBeNull();
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

    expect(await screen.findByText('上次工作流结果')).toBeInTheDocument();
    expect(screen.getByText('当前工作流：考研英语')).toBeInTheDocument();
    expect(screen.getByText('下个任务')).toBeInTheDocument();
    expect(screen.queryByText('10:00')).not.toBeInTheDocument();
  });

  it('shows the latest completed workflow result and opens its review', async () => {
    const user = userEvent.setup();
    mockFetchWorkflowRecords.mockResolvedValue([
      {
        id: 'record-old',
        workflow_id: 'workflow-0',
        workflow_name: '较早完成的工作流',
        nodes: [],
        status: 'completed',
        started_at: '2026-07-11T08:00:00+08:00',
        completed_at: '2026-07-11T09:00:00+08:00',
        created_at: '2026-07-12T11:00:00+08:00',
      },
      {
        id: 'record-1',
        workflow_id: 'workflow-1',
        workflow_name: '408 冲刺',
        nodes: [],
        status: 'completed',
        started_at: '2026-07-12T09:30:00+08:00',
        completed_at: '2026-07-12T10:42:00+08:00',
        created_at: '2026-07-12T09:30:00+08:00',
      },
    ]);
    mockFetchWorkflowSettlement.mockResolvedValue({
      workflow_name: '408 冲刺',
      result: 'completed',
      phases: [],
      nodes: [],
      total_phases: 4,
      total_answered: 20,
      total_correct: 17,
      total_accuracy: 0.85,
      total_duration_seconds: 72 * 60,
      fork_count: 0,
      retry_count: 0,
      best_accuracy: 0.9,
      first_try_passed_count: 4,
    });

    renderDashboard();

    expect(await screen.findByText('408 冲刺')).toBeInTheDocument();
    expect(screen.queryByText('较早完成的工作流')).not.toBeInTheDocument();
    expect(screen.getByText('4 项')).toBeInTheDocument();
    expect(await screen.findByText('1 小时 12 分钟')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /上次工作流结果/ }));

    expect(await screen.findByRole('dialog', { name: '工作流结算' })).toBeInTheDocument();
    expect(mockFetchWorkflowSettlement).toHaveBeenCalledWith('record-1');
  });
});
