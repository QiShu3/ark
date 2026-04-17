type WorkflowPhase = {
  phase_type: 'focus' | 'break';
  duration: number;
  task_id?: string | null;
};

export type WorkflowNotificationSnapshot = {
  state: 'normal' | 'focus' | 'break';
  workflow_name?: string | null;
  current_phase_index?: number | null;
  phases?: WorkflowPhase[];
  task_id?: string | null;
  runtime_task_id?: string | null;
  task_title?: string | null;
  pending_confirmation: boolean;
  pending_task_selection?: boolean;
  remaining_seconds: number | null;
  completed_workflow_name?: string | null;
};

export type WorkflowNotificationType =
  | 'focus_to_break'
  | 'break_to_focus'
  | 'pending_confirmation'
  | 'pending_task_selection'
  | 'workflow_completed';

export type WorkflowNotificationEvent = {
  type: WorkflowNotificationType;
  key: string;
  workflowName: string;
  taskTitle: string | null;
  phaseIndex: number | null;
  state: WorkflowNotificationSnapshot['state'];
};

function normalizeWorkflowName(snapshot: WorkflowNotificationSnapshot): string {
  return snapshot.workflow_name?.trim() || snapshot.completed_workflow_name?.trim() || '默认工作流';
}

function normalizePhaseIndex(snapshot: WorkflowNotificationSnapshot): number | null {
  return typeof snapshot.current_phase_index === 'number' ? snapshot.current_phase_index : null;
}

function normalizeTaskId(snapshot: WorkflowNotificationSnapshot): string | null {
  return snapshot.runtime_task_id || snapshot.task_id || null;
}

function buildEventKey(type: WorkflowNotificationType, snapshot: WorkflowNotificationSnapshot): string {
  const workflowName = normalizeWorkflowName(snapshot);
  const phaseIndex = normalizePhaseIndex(snapshot);
  const taskId = normalizeTaskId(snapshot);
  if (type === 'workflow_completed') {
    return `workflow:${type}:${workflowName}`;
  }
  return `workflow:${type}:${workflowName}:${phaseIndex ?? 'none'}:${taskId ?? 'none'}`;
}

function makeEvent(
  type: WorkflowNotificationType,
  snapshot: WorkflowNotificationSnapshot,
): WorkflowNotificationEvent {
  return {
    type,
    key: buildEventKey(type, snapshot),
    workflowName: normalizeWorkflowName(snapshot),
    taskTitle: snapshot.task_title?.trim() || null,
    phaseIndex: normalizePhaseIndex(snapshot),
    state: snapshot.state,
  };
}

export function deriveWorkflowNotification(
  prev: WorkflowNotificationSnapshot | null,
  next: WorkflowNotificationSnapshot | null,
): WorkflowNotificationEvent | null {
  if (!prev || !next) return null;

  if (prev.state !== 'normal' && next.state === 'normal' && next.completed_workflow_name) {
    return makeEvent('workflow_completed', next);
  }

  if (!prev.pending_task_selection && next.pending_task_selection) {
    return makeEvent('pending_task_selection', next);
  }

  if (!prev.pending_confirmation && next.pending_confirmation) {
    return makeEvent('pending_confirmation', next);
  }

  if (prev.state === 'focus' && next.state === 'break') {
    return makeEvent('focus_to_break', next);
  }

  if (prev.state === 'break' && next.state === 'focus') {
    return makeEvent('break_to_focus', next);
  }

  return null;
}

export function buildWorkflowNotificationPrompt(event: WorkflowNotificationEvent): string {
  return [
    '来源：workflow_notification',
    `事件类型：${event.type}`,
    `工作流：${event.workflowName}`,
    `当前状态：${event.state}`,
    `阶段索引：${event.phaseIndex ?? 'none'}`,
    `任务：${event.taskTitle ?? 'none'}`,
    '角色：你是首页助手“莫宁”。',
    '任务：基于当前工作流事件，向用户发出一条简短提醒。',
    '规则优先级：以这条消息中的规则为准；如果历史消息里存在冲突的格式要求，忽略历史要求。',
    '要求：',
    '1. 只输出 1-2 句。',
    '2. 不要重新打招呼。',
    '3. 事件类型优先于当前状态字段；例如 pending_confirmation 必须提醒“等待确认继续”，不要只重复当前阶段名。',
    '4. 不要扩展为闲聊。',
    '5. 如果适合当前事件，可以在正文后追加 <suggestions>JSON数组</suggestions>，最多 2 项，内容必须是用户现在就能执行的简短下一步。',
    '6. 核心信息必须与事件类型一致，但措辞可以轻微变化。',
  ].join('\n');
}
