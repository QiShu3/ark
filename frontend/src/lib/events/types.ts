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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
};
