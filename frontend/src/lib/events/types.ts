import type { Appointment, Task } from '../../components/taskTypes';

export type EventItem = {
  id: string;
  user_id: number;
  name: string;
  start_date: string;
  due_at: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type EventPlanDraftItem = {
  id: string;
  draft_id: string;
  kind: 'task' | 'appointment';
  title: string;
  content: string | null;
  scheduled_for: string | null;
  starts_at: string | null;
  ends_at: string | null;
  payload: Record<string, unknown>;
  sort_order: number;
  created_subject_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EventPlanDraft = {
  id: string;
  event_id: string;
  user_id: number;
  source_template_id: string | null;
  items: EventPlanDraftItem[];
  created_at: string;
  updated_at: string;
};

export type EventWorkbench = {
  event: EventItem;
  plan_draft: EventPlanDraft | null;
  created_tasks: Task[];
  created_appointments: Appointment[];
};

export type EventPlanTemplateItem = {
  id: string;
  template_id: string;
  kind: 'task' | 'appointment';
  title: string;
  content: string | null;
  offset_days: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type EventPlanTemplate = {
  id: string;
  user_id: number;
  name: string;
  description: string | null;
  schedule_mode: 'from_start' | 'before_due';
  items: EventPlanTemplateItem[];
  created_at: string;
  updated_at: string;
};
