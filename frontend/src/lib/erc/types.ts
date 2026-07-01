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
}

export interface ChoiceConfigSavePayload {
  event_id?: string | null;
  choice_enabled: boolean;
  choice: Record<string, unknown>;
}
