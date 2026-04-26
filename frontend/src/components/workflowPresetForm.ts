import type { Task } from './taskTypes';

export type WorkflowPhaseType = 'focus' | 'break';
export type WorkflowTimerMode = 'countdown' | 'countup';

export type WorkflowPresetPhase = {
  phase_type: WorkflowPhaseType;
  duration: number;
  timer_mode?: WorkflowTimerMode | null;
  task_id?: string | null;
};

export interface WorkflowPreset {
  id: string;
  user_id: number;
  name: string;
  focus_duration: number;
  break_duration: number;
  default_focus_timer_mode?: WorkflowTimerMode;
  phases: WorkflowPresetPhase[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type WorkflowFormPhase = {
  phase_type: WorkflowPhaseType;
  duration: number;
  timer_mode: WorkflowTimerMode;
  task_id: string | null;
};

export type WorkflowFormState = {
  name: string;
  defaultFocusTimerMode: WorkflowTimerMode;
  phases: WorkflowFormPhase[];
  isDefault: boolean;
};

export function createDefaultWorkflowForm(isDefault: boolean): WorkflowFormState {
  return {
    name: '',
    defaultFocusTimerMode: 'countdown',
    phases: [
      { phase_type: 'focus', duration: 25 * 60, timer_mode: 'countdown', task_id: null },
      { phase_type: 'break', duration: 5 * 60, timer_mode: 'countdown', task_id: null },
    ],
    isDefault,
  };
}

export function createWorkflowFormFromPreset(preset: WorkflowPreset): WorkflowFormState {
  return {
    name: preset.name,
    defaultFocusTimerMode: preset.default_focus_timer_mode ?? 'countdown',
    phases: preset.phases.length
      ? preset.phases.map((phase) => ({
          phase_type: phase.phase_type,
          duration: phase.duration,
          timer_mode: phase.phase_type === 'focus'
            ? (phase.timer_mode ?? preset.default_focus_timer_mode ?? 'countdown')
            : 'countdown',
          task_id: phase.phase_type === 'focus' ? (phase.task_id ?? null) : null,
        }))
      : [
          {
            phase_type: 'focus',
            duration: preset.focus_duration,
            timer_mode: preset.default_focus_timer_mode ?? 'countdown',
            task_id: null,
          },
          { phase_type: 'break', duration: preset.break_duration, timer_mode: 'countdown', task_id: null },
        ],
    isDefault: preset.is_default,
  };
}

export function createWorkflowCopyDraft(preset: WorkflowPreset): WorkflowFormState {
  const next = createWorkflowFormFromPreset(preset);
  return {
    ...next,
    name: `${preset.name}（副本）`,
    isDefault: false,
  };
}

export function cloneWorkflowForm(form: WorkflowFormState): WorkflowFormState {
  return {
    ...form,
    phases: form.phases.map((phase) => ({ ...phase })),
  };
}

export function serializeWorkflowForm(form: WorkflowFormState): string {
  return JSON.stringify(form);
}

export function isWorkflowFormDirty(form: WorkflowFormState, baseline: WorkflowFormState): boolean {
  return serializeWorkflowForm(form) !== serializeWorkflowForm(baseline);
}

export function buildWorkflowPreview(form: WorkflowFormState): {
  summary: string;
  sequence: string;
} {
  const focusMinutes = Math.round(
    form.phases
      .filter((phase) => phase.phase_type === 'focus')
      .reduce((total, phase) => total + phase.duration, 0) / 60,
  );
  const breakMinutes = Math.round(
    form.phases
      .filter((phase) => phase.phase_type === 'break')
      .reduce((total, phase) => total + phase.duration, 0) / 60,
  );

  return {
    summary: `共 ${form.phases.length} 个阶段 · 专注 ${focusMinutes}min · 休息 ${breakMinutes}min`,
    sequence: form.phases
      .map((phase, index) => `${index + 1}.${phase.phase_type === 'focus' ? '专注' : '休息'} ${Math.round(phase.duration / 60)}min`)
      .join(' · '),
  };
}

export function moveWorkflowPhase(form: WorkflowFormState, index: number, direction: -1 | 1): WorkflowFormState {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= form.phases.length) {
    return form;
  }

  const phases = form.phases.map((phase) => ({ ...phase }));
  const [moved] = phases.splice(index, 1);
  phases.splice(targetIndex, 0, moved);

  return {
    ...form,
    phases,
  };
}

export function getWorkflowTaskOptions(tasks: Task[], isTaskHiddenFromActionList: (task: Task) => boolean): Task[] {
  return tasks.filter((task) => task.status !== 'done' && !isTaskHiddenFromActionList(task));
}
