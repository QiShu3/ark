import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

import FocusWorkProvider from '../focus-work/FocusWorkProvider';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(async (path: string) => {
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
  }),
}));

describe('FocusWorkProvider', () => {
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
});
