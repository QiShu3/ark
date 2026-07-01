export interface ChoiceModuleStatus {
  enabled: boolean;
  state: string;
  task_id: string | null;
  config_id: string | null;
  completion_state: string | null;
  blocked_reason: string | null;
  config: Record<string, unknown>;
  confirmation_needed: boolean;
}

export interface ChoiceConfigStatus {
  event_id: string | null;
  event_name: string | null;
  choice: ChoiceModuleStatus;
  practice?: ChoiceModuleStatus;
  review?: ChoiceModuleStatus;
}

export interface ChoiceConfigSavePayload {
  event_id?: string | null;
  practice_enabled: boolean;
  review_enabled: boolean;
  practice: Record<string, unknown>;
  review: Record<string, unknown>;
}
