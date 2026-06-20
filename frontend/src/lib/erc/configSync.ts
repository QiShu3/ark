import { fetchChoiceConfigStatus, saveChoiceConfig } from './api';
import type { ChoiceConfigSavePayload, ChoiceConfigStatus, ChoiceModuleStatus } from './types';

export type PracticeConfigInput = {
  daily_article_target: number;
  default_focus_duration: number;
  add_to_today_plan: boolean;
};

export type ReviewConfigInput = {
  review_scope: 'due' | 'mistakes' | 'all';
  daily_question_target: number;
  default_focus_duration: number;
  add_to_today_plan: boolean;
};

const DEFAULT_PRACTICE_CONFIG: PracticeConfigInput = {
  daily_article_target: 1,
  default_focus_duration: 1500,
  add_to_today_plan: true,
};

const DEFAULT_REVIEW_CONFIG: ReviewConfigInput = {
  review_scope: 'due',
  daily_question_target: 10,
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

function reviewScopeConfig(config: Record<string, unknown> | undefined): ReviewConfigInput['review_scope'] {
  const value = config?.review_scope;
  return value === 'mistakes' || value === 'all' || value === 'due' ? value : 'due';
}

function practiceConfigFromModule(module: ChoiceModuleStatus): PracticeConfigInput {
  return {
    daily_article_target: numberConfig(
      module.config,
      'daily_article_target',
      DEFAULT_PRACTICE_CONFIG.daily_article_target,
    ),
    default_focus_duration: numberConfig(
      module.config,
      'default_focus_duration',
      DEFAULT_PRACTICE_CONFIG.default_focus_duration,
    ),
    add_to_today_plan: booleanConfig(
      module.config,
      'add_to_today_plan',
      DEFAULT_PRACTICE_CONFIG.add_to_today_plan,
    ),
  };
}

function reviewConfigFromModule(module: ChoiceModuleStatus): ReviewConfigInput {
  return {
    review_scope: reviewScopeConfig(module.config),
    daily_question_target: numberConfig(module.config, 'daily_question_target', DEFAULT_REVIEW_CONFIG.daily_question_target),
    default_focus_duration: numberConfig(module.config, 'default_focus_duration', DEFAULT_REVIEW_CONFIG.default_focus_duration),
    add_to_today_plan: booleanConfig(module.config, 'add_to_today_plan', DEFAULT_REVIEW_CONFIG.add_to_today_plan),
  };
}

export type SaveEventChoiceConfigInput = {
  eventId: string;
  practice?: PracticeConfigInput;
  review?: ReviewConfigInput;
};

export async function saveEventChoiceConfig(input: SaveEventChoiceConfigInput): Promise<ChoiceConfigStatus> {
  const current = await fetchChoiceConfigStatus(input.eventId);
  const payload: ChoiceConfigSavePayload = {
    event_id: input.eventId,
    practice_enabled: input.practice !== undefined || current.practice.enabled,
    review_enabled: input.review !== undefined || current.review.enabled,
    practice: input.practice ?? (current.practice.enabled ? practiceConfigFromModule(current.practice) : DEFAULT_PRACTICE_CONFIG),
    review: input.review ?? (current.review.enabled ? reviewConfigFromModule(current.review) : DEFAULT_REVIEW_CONFIG),
  };
  return saveChoiceConfig(payload);
}
