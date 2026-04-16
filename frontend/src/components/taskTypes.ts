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
  task_type: 'focus' | 'checkin';
  tags: string[];
  actual_duration: number;
  start_date: string | null;
  due_date: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}
