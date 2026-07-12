import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeliberateBankOption, DeliberateWorkflowConfig, DeliberateWorkflowRun } from '../../lib/deliberate/api';

/* ── Mock API modules ──────────────────────────────────────── */

vi.mock('../../lib/deliberate/api', () => ({
  listDeliberateWorkflows: vi.fn().mockResolvedValue([]),
  listDeliberateBanks: vi.fn().mockResolvedValue([]),
  deleteDeliberateWorkflow: vi.fn(),
  listDeliberateRuns: vi.fn().mockResolvedValue([]),
  startDeliberateWorkflow: vi.fn(),
  listDeliberateSubApps: vi.fn().mockResolvedValue([]),
  listOwnedDeliberateSubApps: vi.fn().mockResolvedValue([]),
  createDeliberateSubApp: vi.fn(),
  createOwnedDeliberateSubApp: vi.fn(),
  patchDeliberateSubApp: vi.fn(),
  patchOwnedDeliberateSubApp: vi.fn(),
  deleteDeliberateSubApp: vi.fn(),
  deleteOwnedDeliberateSubApp: vi.fn(),
}));

vi.mock('../../lib/focusWorkflow', () => ({
  fetchWorkflowRecords: vi.fn().mockResolvedValue([]),
  startMultiDeliberateWorkflow: vi.fn(),
}));

vi.mock('../../lib/choice/api', () => ({
  fetchSetSnapshots: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn().mockResolvedValue([]),
  apiFetch: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

/* ── Imports after mocks ───────────────────────────────────── */

import {
  deleteDeliberateWorkflow,
  listDeliberateBanks,
  listDeliberateRuns,
  listDeliberateWorkflows,
  startDeliberateWorkflow,
  listDeliberateSubApps,
} from '../../lib/deliberate/api';
import { fetchSetSnapshots } from '../../lib/choice/api';
import { apiJson } from '../../lib/api';
import { startMultiDeliberateWorkflow } from '../../lib/focusWorkflow';

import DeliberateWorkflow from '../DeliberateWorkflow';

/* ── Fixtures ──────────────────────────────────────────────── */

const mockConfig: DeliberateWorkflowConfig = {
  id: 'cfg-1',
  name: '每日练习',
  kind: 'choice',
  focus_work_type: 'choice',
  bank_id: 'bank-1',
  target_count: 20,
  scope: {},
  completion: { mode: 'question_count', question_count: 20 },
  pass_criteria: {},
  children: [],
  primary_filter: 'all',
  sort_order: 'sequential',
  question_rotation: 'none',
  use_fsrs: false,
  scheduling_mode: 'manual',
  fsrs_config: null,
  backflow_rule: 'none',
  bank_summary: { id: 'bank-1', name: '408题库', kind: 'choice', item_count: 100, question_count: 100 },
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const mockBanks: DeliberateBankOption[] = [
  { id: 'bank-1', name: '408题库', kind: 'choice', count: 100, item_count: 100, question_count: 100 },
];

const mockInputBank: DeliberateBankOption = {
  id: 'input-bank-1',
  name: '408 输入题库',
  kind: 'input',
  count: 3,
  item_count: 3,
  question_count: 3,
};

const mockRuns: DeliberateWorkflowRun[] = [
  {
    id: 'run-1',
    config_id: 'cfg-1',
    focus_work_type: 'choice',
    bank_id: 'bank-1',
    status: 'completed',
    progress_snapshot: {},
    created_at: '2025-01-02T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
  },
];

/* ── Helpers ───────────────────────────────────────────────── */

function renderPage() {
  return render(
    <MemoryRouter>
      <DeliberateWorkflow />
    </MemoryRouter>,
  );
}

/* ── Tests ─────────────────────────────────────────────────── */

describe('DeliberateWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    window.localStorage.removeItem('ark:deliberate-workflow:selected-id');
    (listDeliberateWorkflows as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listDeliberateBanks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listDeliberateRuns as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (fetchSetSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (apiJson as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (startMultiDeliberateWorkflow as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('renders the page title', async () => {
    renderPage();
    expect(await screen.findByText('刻意学习流')).toBeInTheDocument();
  });

  it('uses the routed sub-app metadata instead of the admin sub-app API', async () => {
    render(
      <MemoryRouter>
        <DeliberateWorkflow
          appId="guest-english"
          appName="英语二"
          appDescription="考研英语二词汇与阅读训练"
          bankIds={['bank-english']}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('英语二')).toBeInTheDocument();
    expect(screen.getByText('考研英语二词汇与阅读训练')).toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(listDeliberateSubApps).not.toHaveBeenCalled();
  });

  it('shows the management empty state when no saved configs exist', async () => {
    renderPage();
    expect(await screen.findByText('暂无专注工作配置，请新建')).toBeInTheDocument();
    expect(screen.getByText('题库管理')).toBeInTheDocument();
    expect(screen.getByText('工作流编排')).toBeInTheDocument();
  });

  it('shows config list when configs exist', async () => {
    (listDeliberateWorkflows as ReturnType<typeof vi.fn>).mockResolvedValue([mockConfig]);
    renderPage();
    const headings = await screen.findAllByText('每日练习');
    expect(headings.length).toBeGreaterThan(0);
  });

  it('starts deliberate workflow when "开始专注" is clicked', async () => {
    (listDeliberateWorkflows as ReturnType<typeof vi.fn>).mockResolvedValue([mockConfig]);
    (listDeliberateRuns as ReturnType<typeof vi.fn>).mockResolvedValue(mockRuns);
    (startDeliberateWorkflow as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    renderPage();
    const startButtons = await screen.findAllByRole('button', { name: '开始' });
    fireEvent.click(startButtons[0]);

    await waitFor(() => expect(startDeliberateWorkflow).toHaveBeenCalledWith('cfg-1'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('starts a saved orchestration directly with preset config ids', async () => {
    const firstConfig = { ...mockConfig, id: 'cfg-a', name: 'test3', kind: 'flash_card' as const, focus_work_type: 'flash_card' as const };
    const secondConfig = { ...mockConfig, id: 'cfg-b', name: 'test2' };
    (listDeliberateWorkflows as ReturnType<typeof vi.fn>).mockResolvedValue([firstConfig, secondConfig]);
    (apiJson as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path === '/todo/focus/workflows') {
        return Promise.resolve([
          {
            id: 'preset-1',
            user_id: 1,
            name: '完整流程测试',
            focus_duration: 3600,
            break_duration: 300,
            phases: [{
              phase_type: 'deliberate_group',
              duration: 3600,
              timer_mode: 'countup',
              config_ids: ['cfg-a', 'cfg-b'],
              config_names: ['test3', 'test2'],
            }],
            is_default: false,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();
    await screen.findByText('完整流程测试');
    fireEvent.click(screen.getByRole('button', { name: '启动' }));

    await waitFor(() => expect(startMultiDeliberateWorkflow).toHaveBeenCalledWith(['cfg-a', 'cfg-b']));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('shows delete confirmation dialog when "删除" is clicked', async () => {
    (listDeliberateWorkflows as ReturnType<typeof vi.fn>).mockResolvedValue([mockConfig]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPage();
    await screen.findByText('删除');
    fireEvent.click(screen.getByText('删除'));

    expect(window.confirm).toHaveBeenCalledWith('删除配置「每日练习」？');
    expect(deleteDeliberateWorkflow).not.toHaveBeenCalled();
  });

  it('deletes workflow when confirmation is accepted', async () => {
    (listDeliberateWorkflows as ReturnType<typeof vi.fn>).mockResolvedValue([mockConfig]);
    (deleteDeliberateWorkflow as ReturnType<typeof vi.fn>).mockResolvedValue({ detail: 'ok' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    await screen.findByText('删除');
    fireEvent.click(screen.getByText('删除'));

    await waitFor(() => expect(deleteDeliberateWorkflow).toHaveBeenCalledWith('cfg-1'));
  });

  it('displays error message on API failure', async () => {
    (listDeliberateWorkflows as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('网络错误'));
    renderPage();
    expect(await screen.findByText('网络错误')).toBeInTheDocument();
  });

  it('persists selected config id to localStorage', async () => {
    (listDeliberateWorkflows as ReturnType<typeof vi.fn>).mockResolvedValue([mockConfig]);
    renderPage();
    await screen.findAllByText('每日练习');

    await waitFor(() => {
      expect(window.localStorage.getItem('ark:deliberate-workflow:selected-id')).toBe('cfg-1');
    });
  });

  it('calculates the accuracy trend from input snapshot answers', async () => {
    (listDeliberateBanks as ReturnType<typeof vi.fn>).mockImplementation((kind: string) => (
      Promise.resolve(kind === 'input' ? [mockInputBank] : [])
    ));
    (apiJson as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path.startsWith('/api/input/snapshots?bank_id=input-bank-1')) {
        return Promise.resolve([
          {
            id: 'input-snapshot-1',
            set_id: 'input-bank-1',
            total_questions: 3,
            answered_count: 3,
            correct_count: 3,
            mode_breakdown: { fill: 3 },
            focus_stats: { total_sessions: 1, total_minutes: 2 },
            trigger_reason: 'phase_end',
            created_at: '2026-07-12T10:25:00Z',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    const inputBankOption = await screen.findByRole('option', { name: '408 输入题库 (3 题)' });
    const bankSelect = inputBankOption.parentElement as HTMLSelectElement;
    fireEvent.change(bankSelect, { target: { value: 'input-bank-1' } });

    expect(await screen.findByLabelText('正确率 100%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
