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

export type EventWorkbench = {
  event: EventItem;
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
  details?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EventPlanTemplateAppConfig = {
  client_id: string;
  app_type: 'flash_card' | 'choice' | 'input';
  config: Record<string, unknown>;
};

export type EventPlanTemplateWorkflow = {
  client_id: string;
  name: string;
  focus_duration: number;
  break_duration: number;
  default_focus_timer_mode: 'countdown' | 'countup';
  phases: Array<{
    phase_type: 'focus' | 'break';
    duration: number;
    timer_mode?: 'countdown' | 'countup' | null;
    task_id?: string | null;
    focus_work_type?: string | null;
    is_temporary?: boolean;
    record_focus?: boolean;
  }>;
};

export type EventPlanTemplate = {
  id: string;
  user_id: number;
  name: string;
  description: string | null;
  schedule_mode: 'from_start' | 'before_due';
  default_event_name?: string | null;
  default_start_date?: string | null;
  default_due_at?: string | null;
  default_is_primary?: boolean | null;
  items: EventPlanTemplateItem[];
  app_configs?: EventPlanTemplateAppConfig[];
  workflows?: EventPlanTemplateWorkflow[];
  created_at: string;
  updated_at: string;
};

export type EventTemplateStoreItem = Omit<EventPlanTemplateItem, 'template_id'> & {
  template_id: string;
};

export type EventTemplateStoreTemplate = Omit<EventPlanTemplate, 'user_id'> & {
  slug: string;
  category: string;
  sort_order: number;
};
