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
        render: ({ onCompleteTaskAndFinish }: { onCompleteTaskAndFinish?: () => void }) => (
          <button type="button" onClick={onCompleteTaskAndFinish}>完成今日单词</button>
        ),
      };
    }
    if (type === 'task_focus') {
      return {
        type: 'task_focus',
        title: '任务专注',
        subtitle: '任务',
        render: ({
          workflow,
          onCompleteTaskAndFinish,
        }: {
          workflow: { task_title?: string | null };
          onCompleteTaskAndFinish?: () => void;
        }) => (
          <div>
            <div>{workflow.task_title}</div>
            <button type="button" onClick={onCompleteTaskAndFinish}>完成任务并结束专注</button>
          </div>
        ),
      };
    }
    return null;
  },
}));

function mockCurrentWorkflow(overrides: Record<string, unknown> = {}) {
  apiJson.mockImplementation(async (path: string) => {
    if (path === '/todo/focus/workflow/current') {
      return {
        state: 'focus',
        current_phase_index: 0,
        phases: [{ phase_type: 'focus', duration: 1500, task_id: 'task-1' }],
        task_id: 'task-1',
        task_title: '撰写周报',
        pending_confirmation: false,
        pending_task_selection: false,
        remaining_seconds: 1200,
        elapsed_seconds: 300,
        active_focus_work_type: 'task_focus',
        focus_work_display_state: 'fullscreen',
        is_paused: false,
        record_focus: true,
        ...overrides,
      };
    }
    if (path === '/todo/tasks/task-1') {
      return {
        id: 'task-1',
        title: '撰写周报',
        content: '整理本周交付内容',
        tags: ['report'],
        status: 'todo',
        target_duration: 1500,
        actual_duration: 600,
        current_cycle_count: 0,
        target_cycle_count: 0,
      };
    }
    return { state: 'normal' };
  });
}

describe('FocusWorkProvider', () => {
  beforeEach(() => {
    apiJson.mockReset();
    mockCurrentWorkflow();
  });

  it('renders fullscreen task focus when current workflow exposes task_focus', async () => {
    render(
      <FocusWorkProvider>
        <div>Page</div>
      </FocusWorkProvider>,
    );

    expect(await screen.findByText('撰写周报')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '暂停专注' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '完成任务并结束专注' })).toBeInTheDocument();
  });

  it('renders vocab adapter for app-managed task focus', async () => {
    mockCurrentWorkflow({
      task_id: 'task-vocab',
      task_title: '今日单词',
      active_focus_work_type: 'vocab_today',
      active_task_source_type: 'app',
      active_task_app_id: 'vocab',
      active_task_app_task_type: 'vocab_today',
      focus_work_display_state: 'fullscreen',
      pending_confirmation: false,
      pending_task_selection: false,
      remaining_seconds: 1500,
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );

    expect(await screen.findByRole('button', { name: '完成今日单词' })).toBeInTheDocument();
  });

  it('pauses app-managed focus work from the modal shell', async () => {
    const user = userEvent.setup();
    mockCurrentWorkflow({
      task_id: 'task-vocab',
      task_title: '今日单词',
      active_focus_work_type: 'vocab_today',
      active_task_source_type: 'app',
      active_task_app_id: 'vocab',
      active_task_app_task_type: 'vocab_today',
      focus_work_display_state: 'fullscreen',
      pending_confirmation: false,
      pending_task_selection: false,
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );
    await user.click(await screen.findByRole('button', { name: '暂停专注' }));

    expect(apiJson).toHaveBeenCalledWith('/todo/focus/workflow/pause', { method: 'POST' });
  });

  it('ends an app-managed focus round without completing the app task', async () => {
    const user = userEvent.setup();
    mockCurrentWorkflow({
      task_id: 'task-vocab',
      task_title: '今日单词',
      active_focus_work_type: 'vocab_today',
      active_task_source_type: 'app',
      active_task_app_id: 'vocab',
      active_task_app_task_type: 'vocab_today',
      focus_work_display_state: 'fullscreen',
      pending_confirmation: false,
      pending_task_selection: false,
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );
    await user.click(await screen.findByRole('button', { name: '结束本轮专注' }));

    expect(apiJson).toHaveBeenCalledWith(
      '/todo/focus/workflow/focus-work-result',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          focus_work_type: 'vocab_today',
          result: 'completed',
          progress_snapshot: {
            completedTask: false,
          },
        }),
      }),
    );
    expect(apiJson).not.toHaveBeenCalledWith('/todo/tasks/task-vocab/complete', expect.anything());
  });

  it('resumes paused app-managed focus work from the modal shell', async () => {
    const user = userEvent.setup();
    mockCurrentWorkflow({
      task_id: 'task-erc',
      task_title: 'ERC 复习',
      active_focus_work_type: 'vocab_today',
      active_task_source_type: 'app',
      active_task_app_id: 'vocab',
      active_task_app_task_type: 'vocab_today',
      focus_work_display_state: 'fullscreen',
      pending_confirmation: false,
      pending_task_selection: false,
      is_paused: true,
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );
    await user.click(await screen.findByRole('button', { name: '继续专注' }));

    expect(apiJson).toHaveBeenCalledWith('/todo/focus/workflow/resume', { method: 'POST' });
  });

  it('submits completed result for app-managed vocab completion without direct task complete', async () => {
    const user = userEvent.setup();
    mockCurrentWorkflow({
      task_id: 'task-vocab',
      task_title: '今日单词',
      active_focus_work_type: 'vocab_today',
      active_task_source_type: 'app',
      active_task_app_id: 'vocab',
      active_task_app_task_type: 'vocab_today',
      focus_work_display_state: 'fullscreen',
      pending_confirmation: false,
      pending_task_selection: false,
    });

    render(
      <FocusWorkProvider>
        <div>App</div>
      </FocusWorkProvider>,
    );
    await user.click(await screen.findByRole('button', { name: '完成今日单词' }));

    expect(apiJson).toHaveBeenCalledWith(
      '/todo/focus/workflow/focus-work-result',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          focus_work_type: 'vocab_today',
          result: 'completed',
          progress_snapshot: {
            taskId: 'task-vocab',
            completedTask: true,
            appTaskType: 'vocab_today',
          },
        }),
      }),
    );
    expect(apiJson).not.toHaveBeenCalledWith('/todo/tasks/task-vocab/complete', expect.anything());
  });
});
