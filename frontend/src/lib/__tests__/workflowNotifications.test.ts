import { describe, expect, it } from 'vitest';

import {
  buildWorkflowNotificationPrompt,
  deriveWorkflowNotification,
  type WorkflowNotificationSnapshot,
} from '../workflowNotifications';

function makeSnapshot(
  overrides: Partial<WorkflowNotificationSnapshot> = {},
): WorkflowNotificationSnapshot {
  return {
    state: 'focus',
    workflow_name: '深度工作流',
    current_phase_index: 0,
    phases: [
      { phase_type: 'focus', duration: 1500, task_id: 'task-1' },
      { phase_type: 'break', duration: 300 },
    ],
    task_id: 'task-1',
    runtime_task_id: 'task-1',
    task_title: '写方案',
    pending_confirmation: false,
    pending_task_selection: false,
    remaining_seconds: 120,
    completed_workflow_name: null,
    ...overrides,
  };
}

describe('workflowNotifications', () => {
  it('detects focus to break transitions', () => {
    const event = deriveWorkflowNotification(
      makeSnapshot(),
      makeSnapshot({
        state: 'break',
        current_phase_index: 1,
        task_id: null,
        runtime_task_id: null,
        remaining_seconds: 300,
      }),
    );

    expect(event?.type).toBe('focus_to_break');
    expect(event?.key).toContain('focus_to_break');
  });

  it('prefers pending task selection over a raw phase transition', () => {
    const event = deriveWorkflowNotification(
      makeSnapshot({
        state: 'break',
        current_phase_index: 1,
        task_id: null,
        runtime_task_id: null,
        task_title: null,
      }),
      makeSnapshot({
        state: 'focus',
        current_phase_index: 2,
        phases: [
          { phase_type: 'focus', duration: 1500, task_id: 'task-1' },
          { phase_type: 'break', duration: 300 },
          { phase_type: 'focus', duration: 1500, task_id: null },
        ],
        task_id: null,
        runtime_task_id: null,
        task_title: null,
        pending_task_selection: true,
        remaining_seconds: null,
      }),
    );

    expect(event?.type).toBe('pending_task_selection');
  });

  it('returns null when only the countdown changes', () => {
    const event = deriveWorkflowNotification(
      makeSnapshot({ remaining_seconds: 120 }),
      makeSnapshot({ remaining_seconds: 119 }),
    );

    expect(event).toBeNull();
  });

  it('builds a constrained workflow reminder prompt', () => {
    const prompt = buildWorkflowNotificationPrompt({
      type: 'pending_confirmation',
      key: 'workflow:pending_confirmation:深度工作流:0:task-1',
      workflowName: '深度工作流',
      taskTitle: '写方案',
      phaseIndex: 0,
      state: 'focus',
    });

    expect(prompt).toContain('来源：workflow_notification');
    expect(prompt).toContain('事件类型：pending_confirmation');
    expect(prompt).toContain('规则优先级：以这条消息中的规则为准');
    expect(prompt).toContain('pending_confirmation 必须提醒“等待确认继续”');
    expect(prompt).toContain('<suggestions>JSON数组</suggestions>');
    expect(prompt).toContain('不要重新打招呼');
  });
});
