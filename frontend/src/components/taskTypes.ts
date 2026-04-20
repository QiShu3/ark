export type CompletionPeriodType = 'once' | 'daily' | 'weekly' | 'monthly' | 'custom_days';

export interface CompletionState {
  completion_state: 'permanent' | 'available' | 'period_complete' | 'blocked';
  is_completable_now: boolean;
  completed_count_in_period: number;
  remaining_completions_in_period: number;
  current_period_start: string | null;
  current_period_end: string | null;
  blocked_reason: 'period_limit_reached' | 'not_workday' | 'already_completed_once' | null;
  hidden_from_action_list: boolean;
}

export interface Task {
  id: string;
  user_id: number;
  title: string;
  content: string | null;
  status: 'todo' | 'done';
  priority: number;
  target_duration: number;
  current_cycle_count: number;
  target_cycle_count: number;
  cycle_period: 'daily' | 'weekly' | 'monthly' | 'custom';
  cycle_every_days: number | null;
  event: string;
  event_ids: string[];
  event_id?: string | null;
  is_recurring?: boolean;
  period_type?: CompletionPeriodType;
  custom_period_days?: number | null;
  max_completions_per_period?: number;
  weekday_only?: boolean;
  time_inherits_from_event?: boolean;
  time_overridden?: boolean;
  task_type: 'focus' | 'checkin';
  tags: string[];
  actual_duration: number;
  start_date: string | null;
  due_date: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  completion_state?: CompletionState | null;
}

export type AppointmentStoredStatus = 'pending' | 'attended' | 'missed' | 'cancelled';
export type AppointmentStatus = AppointmentStoredStatus | 'needs_confirmation';

export interface Appointment {
  id: string;
  user_id: number;
  title: string;
  content: string | null;
  status: AppointmentStatus;
  starts_at: string | null;
  ends_at: string;
  repeat_rule: string | null;
  linked_task_id: string | null;
  event_id?: string | null;
  is_recurring?: boolean;
  period_type?: CompletionPeriodType;
  custom_period_days?: number | null;
  max_completions_per_period?: number;
  weekday_only?: boolean;
  time_inherits_from_event?: boolean;
  time_overridden?: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  completion_state?: CompletionState | null;
}
