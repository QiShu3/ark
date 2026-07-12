import type { Task } from './taskTypes';
import type { FocusWorkType } from './workflowProgress';

export type WorkflowPhaseType = 'focus' | 'break' | 'deliberate_group';
export type WorkflowTimerMode = 'countdown' | 'countup';

export type WorkflowPresetPhase = {
  phase_type: WorkflowPhaseType;
  duration: number;
  timer_mode?: WorkflowTimerMode | null;
  task_id?: string | null;
  focus_work_type?: FocusWorkType | null;
  is_temporary?: boolean;
  record_focus?: boolean;
  config_ids?: string[];
  config_names?: string[];
};

export interface WorkflowPreset {
  id: string;
  user_id: number;
  event_id?: string | null;
  event_name?: string | null;
  app_id?: string | null;
  name: string;
  icon?: string | null;
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
  icon: string | null;
  phases: WorkflowFormPhase[];
  isDefault: boolean;
};

type WorkflowPhaseDraft = {
  duration: number;
  timer_mode?: WorkflowTimerMode | null;
  task_id?: string | null;
};

export function normalizeWorkflowFormPhases(
  phases: WorkflowPhaseDraft[],
  defaultFocusTimerMode: WorkflowTimerMode = 'countdown',
): WorkflowFormPhase[] {
  const normalized: WorkflowFormPhase[] = [];
  for (let index = 0; index < phases.length; index += 2) {
    const focusPhase = phases[index];
    const breakPhase = phases[index + 1];
    if (!focusPhase) continue;
    normalized.push({
      phase_type: 'focus',
      duration: focusPhase.duration,
      timer_mode: focusPhase.timer_mode ?? defaultFocusTimerMode,
      task_id: focusPhase.task_id ?? null,
    });
    normalized.push({
      phase_type: 'break',
      duration: breakPhase?.duration ?? 5 * 60,
      timer_mode: 'countdown',
      task_id: null,
    });
  }
  return normalized;
}

export function createDefaultWorkflowForm(isDefault: boolean): WorkflowFormState {
  return {
    name: '',
    icon: 'file',
    phases: normalizeWorkflowFormPhases([
      { duration: 25 * 60, timer_mode: 'countdown', task_id: null },
      { duration: 5 * 60, timer_mode: 'countdown', task_id: null },
    ]),
    isDefault,
  };
}

export function createWorkflowFormFromPreset(preset: WorkflowPreset): WorkflowFormState {
  const defaultFocusTimerMode = preset.default_focus_timer_mode ?? 'countdown';
  const phases: WorkflowPhaseDraft[] = preset.phases.length
    ? preset.phases
    : [
        {
          duration: preset.focus_duration,
          timer_mode: defaultFocusTimerMode,
          task_id: null,
        },
        { duration: preset.break_duration, timer_mode: 'countdown', task_id: null },
      ];

  return {
    name: preset.name,
    icon: preset.icon ?? 'file',
    phases: normalizeWorkflowFormPhases(phases, defaultFocusTimerMode),
    isDefault: preset.is_default,
  };
}

export function getWorkflowPresetPhases(preset: WorkflowPreset | null | undefined): WorkflowPresetPhase[] {
  if (!preset) return [];
  if (Array.isArray(preset.phases) && preset.phases.length > 0) return preset.phases;
  return [
    { phase_type: 'focus', duration: preset.focus_duration, timer_mode: preset.default_focus_timer_mode ?? 'countdown' },
    { phase_type: 'break', duration: preset.break_duration, timer_mode: 'countdown' },
  ];
}

export function getDeliberateWorkflowPhase(preset: WorkflowPreset | null | undefined): WorkflowPresetPhase | null {
  return getWorkflowPresetPhases(preset).find((phase) => phase.phase_type === 'deliberate_group') ?? null;
}

export function isDeliberateWorkflowPreset(preset: WorkflowPreset | null | undefined): boolean {
  return getDeliberateWorkflowPhase(preset) !== null;
}

export function getDeliberateWorkflowConfigIds(preset: WorkflowPreset | null | undefined): string[] {
  return (getDeliberateWorkflowPhase(preset)?.config_ids ?? [])
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

export function getDeliberateWorkflowConfigNames(preset: WorkflowPreset | null | undefined): string[] {
  const ids = getDeliberateWorkflowConfigIds(preset);
  const names = (getDeliberateWorkflowPhase(preset)?.config_names ?? [])
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
  return ids.map((_, index) => names[index] ?? `专注工作 ${index + 1}`);
}

export function isStartableDeliberateWorkflowPreset(preset: WorkflowPreset | null | undefined): boolean {
  return getDeliberateWorkflowConfigIds(preset).length > 0;
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

export function getWorkflowTaskOptions(tasks: Task[], isTaskHiddenFromActionList: (task: Task) => boolean): Task[] {
  return tasks.filter((task) => task.status !== 'done' && !isTaskHiddenFromActionList(task));
}
