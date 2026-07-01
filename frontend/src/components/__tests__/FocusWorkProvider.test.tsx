import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FocusWorkProvider from '../focus-work/FocusWorkProvider';

const { apiJson } = vi.hoisted(() => ({
  apiJson: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  apiJson,
}));

vi.mock('../focus-work/focusWorkRegistry', () => ({
  getFocusWorkDefinition: (type: string | null | undefined) => {
    if (type === 'vocab_today') {
      return {
        type: 'vocab_today',
        title: '今日单词',
        subtitle: '背单词',
        render: ({ disabled, onContentCompleted }: {
          disabled: boolean;
          onContentCompleted: (progressSnapshot?: Record<string, unknown>) => void;
        }) => (
          <button type="button" disabled={disabled} onClick={() => onContentCompleted({ completed_word_count: 100 })}>
            完成今日单词
          </button>
        ),
      };
    }
    if (type === 'task_focus') {
      return {
        type: 'task_focus',
        title: '任务专注',
        subtitle: '任务',
        render: ({ run, disabled, onContentCompleted }: {
          run: { task_id?: string | null; config_snapshot?: Record<string, unknown> | null };
          disabled: boolean;
          onContentCompleted: (progressSnapshot?: Record<string, unknown>) => void;
        }) => (
          <div>
            <div>{String(run.config_snapshot?.task_title ?? '未命名任务')}</div>
            <button type="button" disabled={disabled} onClick={() => onContentCompleted({ task_id: run.task_id })}>
              完成任务内容
            </button>
          </div>
        ),
      };
    }
    return null;
  },
}));

function makeRun(overrides: Record<string, unknown> = {}) {
  const focusWorkType = String(overrides.focus_work_type ?? 'task_focus');
  return {
    id: 'run-1',
    workflow_id: 'workflow-1',
    phase_index: 0,
    task_id: 'task-1',
    focus_work_type: focusWorkType,
    app_id: focusWorkType === 'vocab_today' ? 'flash' : null,
    app_task_type: focusWorkType === 'vocab_today' ? 'vocab_today' : null,
    counts_for_task_completion: true,
    status: 'running',
    progress_snapshot: null,
    config_snapshot: {
      task_title: focusWorkType === 'vocab_today' ? '今日单词' : '撰写周报',
    },
    completion_reason: null,
    source_run_id: null,
    ...overrides,
  };
}

function makeWorkflow(overrides: Record<string, unknown> = {}, runOverrides: Record<string, unknown> = {}) {
  const activeRun = makeRun(runOverrides);
  return {
    state: 'focus',
    current_phase_index: 0,
    phases: [{ phase_type: 'focus', duration: 1500, task_id: activeRun.task_id }],
    task_id: activeRun.task_id,
    runtime_task_id: activeRun.task_id,
    task_title: String(activeRun.config_snapshot?.task_title ?? '撰写周报'),
    pending_confirmation: false,
    pending_task_selection: false,
    remaining_seconds: 1200,
    elapsed_seconds: 300,
    active_focus_work_type: activeRun.focus_work_type,
    focus_work_display_state: 'fullscreen',
    phase_runtime_state: 'running_run',
    phase_runtime_state_before_timeout_prompt: null,
    active_run_id: activeRun.id,
    active_run: activeRun,
    is_paused: false,
    record_focus: true,
    ...overrides,
  };
}

function mockCurrentWorkflow(overrides: Record<string, unknown> = {}, runOverrides: Record<string, unknown> = {}) {
  let currentSnapshot = makeWorkflow(overrides, runOverrides);
  apiJson.mockImplementation(async (path: string, options?: { body?: string; method?: string }) => {
    if (path === '/todo/focus/workflow/current') {
      return currentSnapshot;
    }
    if (path === '/todo/focus/workflow/pause') {
      currentSnapshot = {
        ...currentSnapshot,
        is_paused: true,
        active_run: { ...currentSnapshot.active_run, status: 'paused' },
      };
      return currentSnapshot;
    }
    if (path === '/todo/focus/workflow/resume') {
      currentSnapshot = {
        ...currentSnapshot,
        is_paused: false,
        active_run: { ...currentSnapshot.active_run, status: 'running' },
      };
      return currentSnapshot;
    }
    if (path === `/todo/focus/workflow/runs/${currentSnapshot.active_run.id}/content-complete`) {
      currentSnapshot = {
        ...currentSnapshot,
        phase_runtime_state: currentSnapshot.active_run.counts_for_task_completion
          ? 'counted_run_completed_confirming'
          : 'extra_run_completed',
        active_run: {
          ...currentSnapshot.active_run,
          status: 'content_completed',
          progress_snapshot: options?.body ? JSON.parse(options.body).progress_snapshot : {},
        },
      };
      return currentSnapshot;
    }
    if (path === `/todo/focus/workflow/runs/${currentSnapshot.active_run.id}/complete-task-and-end-phase`) {
      currentSnapshot = { ...currentSnapshot, state: 'break', phase_runtime_state: 'break_running', active_run: null, active_run_id: null };
      return currentSnapshot;
    }
    if (path === '/todo/focus/workflow/runs') {
      currentSnapshot = {
        ...currentSnapshot,
        phase_runtime_state: 'running_run',
        active_run_id: 'run-extra',
        active_run: {
          ...currentSnapshot.active_run,
          id: 'run-extra',
          counts_for_task_completion: JSON.parse(options?.body ?? '{}').mode !== 'extra',
          status: 'running',
          source_run_id: currentSnapshot.active_run.id,
        },
      };
      return currentSnapshot;
    }
    if (path === '/todo/focus/workflow/end-phase') {
      currentSnapshot = { ...currentSnapshot, state: 'break', phase_runtime_state: 'break_running', active_run: null, active_run_id: null };
      return currentSnapshot;
    }
    if (path === '/todo/focus/workflow/extend-phase') {
      currentSnapshot = {
        ...currentSnapshot,
        phase_runtime_state: currentSnapshot.phase_runtime_state_before_timeout_prompt ?? 'running_run',
      };
      return currentSnapshot;
    }
    if (path === '/todo/focus/workflow/skip_phase') {
      currentSnapshot = { ...currentSnapshot, state: 'break', phase_runtime_state: 'break_running', active_run: null, active_run_id: null };
      return currentSnapshot;
    }
    return { state: 'normal' };
  });
}

describe('FocusWorkProvider', () => {
  beforeEach(() => {
    apiJson.mockReset();
    mockCurrentWorkflow();
  });

  it('renders active task content without task-business completion controls inside the child work', async () => {
    render(
      <FocusWorkProvider>
        <div>Page</div>
      </FocusWorkProvider>,
    );

    expect(await screen.findByText('撰写周报')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '暂停专注' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '放弃本阶段' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '完成任务内容' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '结束本轮专注' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '完成任务并结束专注' })).not.toBeInTheDocument();
  });

  it('renders app focus work as content-only child work', async () => {
    mockCurrentWorkflow({}, {
      task_id: 'task-vocab',
      focus_work_type: 'vocab_today',
      app_id: 'flash',
      app_task_type: 'vocab_today',
      config_snapshot: { task_title: '今日单词' },
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );

    expect(await screen.findByRole('button', { name: '完成今日单词' })).toBeInTheDocument();
  });

  it('pauses active focus work from the modal shell', async () => {
    const user = userEvent.setup();
    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '暂停专注' }));

    expect(apiJson).toHaveBeenCalledWith('/todo/focus/workflow/pause', { method: 'POST' });
  });

  it('resumes paused focus work from the modal shell', async () => {
    const user = userEvent.setup();
    mockCurrentWorkflow({ is_paused: true }, { status: 'paused' });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '继续专注' }));

    expect(apiJson).toHaveBeenCalledWith('/todo/focus/workflow/resume', { method: 'POST' });
  });

  it('moves from content completion to workbench task-confirmation actions', async () => {
    const user = userEvent.setup();
    mockCurrentWorkflow({}, {
      task_id: 'task-vocab',
      focus_work_type: 'vocab_today',
      app_id: 'flash',
      app_task_type: 'vocab_today',
      config_snapshot: { task_title: '今日单词' },
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '完成今日单词' }));

    expect(apiJson).toHaveBeenCalledWith(
      '/todo/focus/workflow/runs/run-1/content-complete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ progress_snapshot: { completed_word_count: 100 } }),
      }),
    );
    expect(await screen.findByRole('button', { name: '完成任务并结束阶段' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再来一轮' })).toBeInTheDocument();
    expect(apiJson).not.toHaveBeenCalledWith('/todo/tasks/task-vocab/complete', expect.anything());

    await user.click(screen.getByRole('button', { name: '完成任务并结束阶段' }));

    expect(apiJson).toHaveBeenCalledWith('/todo/focus/workflow/runs/run-1/complete-task-and-end-phase', {
      method: 'POST',
    });
  });

  it('starts an extra run from counted completion without completing the task', async () => {
    const user = userEvent.setup();
    mockCurrentWorkflow({ phase_runtime_state: 'counted_run_completed_confirming' }, {
      status: 'content_completed',
      progress_snapshot: { completed_word_count: 100 },
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '再来一轮' }));

    expect(apiJson).toHaveBeenCalledWith(
      '/todo/focus/workflow/runs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ mode: 'extra' }),
      }),
    );
    expect(apiJson).not.toHaveBeenCalledWith('/todo/tasks/task-1/complete', expect.anything());
  });

  it('shows child fork options when mastery check fails', async () => {
    const user = userEvent.setup();
    mockCurrentWorkflow({ phase_runtime_state: 'counted_run_completed_confirming' }, {
      status: 'content_completed',
      progress_snapshot: {
        mastery_check: { enabled: true, passed: false, threshold: 80, accuracy: 40 },
      },
      config_snapshot: {
        task_title: '今日单词',
        children: [{ config_id: 'child-cfg-1', label: '错题复习', is_recommended: true }],
      },
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );

    expect(await screen.findByText('选择fork到：')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /错题复习/ }));

    expect(apiJson).toHaveBeenCalledWith('/api/admin/deliberate-workflows/child-cfg-1');
    expect(apiJson).toHaveBeenCalledWith(
      '/todo/focus/workflow/runs/fork',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"child_config_id":"child-cfg-1"'),
      }),
    );
  });

  it('lets extra completion end the phase or start another extra run', async () => {
    const user = userEvent.setup();
    mockCurrentWorkflow({ phase_runtime_state: 'extra_run_completed' }, {
      counts_for_task_completion: false,
      status: 'content_completed',
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );

    expect(await screen.findByRole('button', { name: '结束阶段' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再来一轮' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '结束阶段' }));

    expect(apiJson).toHaveBeenCalledWith('/todo/focus/workflow/end-phase', { method: 'POST' });
  });

  it('shows no-content state for empty extra runs instead of another repeat action', async () => {
    mockCurrentWorkflow({ phase_runtime_state: 'extra_run_completed' }, {
      counts_for_task_completion: false,
      status: 'content_completed',
      progress_snapshot: { no_available_content: true },
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );

    expect(await screen.findByRole('heading', { name: '暂无可加练内容' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '结束阶段' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再来一轮' })).not.toBeInTheDocument();
  });

  it('lets expired phase extend time or end without task auto-completion', async () => {
    const user = userEvent.setup();
    mockCurrentWorkflow({
      phase_runtime_state: 'phase_time_expired_prompt',
      phase_runtime_state_before_timeout_prompt: 'running_run',
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );

    expect(await screen.findByRole('button', { name: '延长时间' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '结束该阶段' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '延长时间' }));

    expect(apiJson).toHaveBeenCalledWith(
      '/todo/focus/workflow/extend-phase',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ extend_seconds: 300 }),
      }),
    );
    expect(apiJson).not.toHaveBeenCalledWith('/todo/tasks/task-1/complete', expect.anything());
  });
});
