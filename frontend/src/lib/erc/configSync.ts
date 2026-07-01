import { fetchChoiceConfigStatus, saveChoiceConfig } from './api';
import type { ChoiceConfigSavePayload, ChoiceConfigStatus, ChoiceModuleStatus } from './types';

export type ChoiceConfigInput = {
  daily_article_target: number;
  default_focus_duration: number;
  add_to_today_plan: boolean;
  set_id?: string | null;
};

const DEFAULT_CHOICE_CONFIG: ChoiceConfigInput = {
  daily_article_target: 1,
  default_focus_duration: 1500,
  add_to_today_plan: true,
};

function numberConfig(config: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = config?.[key];
  return typeof value === 'number' ? value : fallback;
}

function booleanConfig(config: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = config?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function choiceConfigFromModule(module: ChoiceModuleStatus): ChoiceConfigInput {
  return {
    daily_article_target: numberConfig(module.config, 'daily_article_target', DEFAULT_CHOICE_CONFIG.daily_article_target),
    default_focus_duration: numberConfig(module.config, 'default_focus_duration', DEFAULT_CHOICE_CONFIG.default_focus_duration),
    add_to_today_plan: booleanConfig(module.config, 'add_to_today_plan', DEFAULT_CHOICE_CONFIG.add_to_today_plan),
    set_id: typeof module.config.set_id === 'string' ? module.config.set_id : null,
  };
}

export type SaveEventChoiceConfigInput = {
  eventId: string;
  choice?: ChoiceConfigInput;
};

function normalizeChoiceConfig(
  input: ChoiceConfigInput | undefined,
  current: ChoiceConfigStatus,
): ChoiceConfigInput {
  if (input) return input;
  if (current.choice.enabled) return choiceConfigFromModule(current.choice);
  return DEFAULT_CHOICE_CONFIG;
}

export async function saveEventChoiceConfig(input: SaveEventChoiceConfigInput): Promise<ChoiceConfigStatus> {
  const current = await fetchChoiceConfigStatus(input.eventId);
  const choice = normalizeChoiceConfig(input.choice, current);
  const payload: ChoiceConfigSavePayload = {
    event_id: input.eventId,
    choice_enabled: Boolean(input.choice),
    choice: {
      daily_article_target: choice.daily_article_target,
      default_focus_duration: choice.default_focus_duration,
      add_to_today_plan: choice.add_to_today_plan,
      set_id: choice.set_id ?? null,
    },
  };
  return saveChoiceConfig(payload);
}
