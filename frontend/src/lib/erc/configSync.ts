import { fetchChoiceConfigStatus, saveChoiceConfig } from './api';
import type { ChoiceConfigSavePayload, ChoiceConfigStatus, ChoiceModuleStatus } from './types';

export type ChoiceConfigInput = {
  daily_article_target: number;
  default_focus_duration: number;
  add_to_today_plan: boolean;
  set_id?: string | null;
};

export type ReviewConfigInput = {
  review_scope: 'due' | 'mistakes' | 'all';
  daily_question_target: number;
  default_focus_duration: number;
  add_to_today_plan: boolean;
  set_id?: string | null;
};

export type PracticeConfigInput = ChoiceConfigInput;

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
  practice?: PracticeConfigInput;
  review?: ReviewConfigInput;
};

function normalizeChoiceConfig(
  input: ChoiceConfigInput | PracticeConfigInput | ReviewConfigInput | undefined,
  current: ChoiceConfigStatus,
): ChoiceConfigInput {
  if (input && 'daily_article_target' in input) return input;
  if (current.choice.enabled) return choiceConfigFromModule(current.choice);
  if (current.practice?.enabled) return choiceConfigFromModule(current.practice);
  if (current.review?.enabled) return choiceConfigFromModule(current.review);
  return DEFAULT_CHOICE_CONFIG;
}

export async function saveEventChoiceConfig(input: SaveEventChoiceConfigInput): Promise<ChoiceConfigStatus> {
  const current = await fetchChoiceConfigStatus(input.eventId);
  const choiceConfig = input.choice ?? input.practice;
  const choice = normalizeChoiceConfig(choiceConfig, current);
  const reviewConfig: ReviewConfigInput = input.review ?? {
    review_scope: 'due',
    daily_question_target: 10,
    default_focus_duration: choice.default_focus_duration,
    add_to_today_plan: choice.add_to_today_plan,
  };
  const payload: ChoiceConfigSavePayload = {
    event_id: input.eventId,
    practice_enabled: Boolean(choiceConfig),
    review_enabled: Boolean(input.review),
    practice: {
      daily_article_target: choice.daily_article_target,
      default_focus_duration: choice.default_focus_duration,
      add_to_today_plan: choice.add_to_today_plan,
      set_id: choice.set_id ?? null,
    },
    review: {
      review_scope: reviewConfig.review_scope,
      daily_question_target: reviewConfig.daily_question_target,
      default_focus_duration: reviewConfig.default_focus_duration,
      add_to_today_plan: reviewConfig.add_to_today_plan,
      set_id: reviewConfig.set_id ?? null,
    },
  };
  return saveChoiceConfig(payload);
}
