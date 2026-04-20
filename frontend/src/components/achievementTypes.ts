export type AchievementStatus = 'unlocked' | 'in_progress' | 'locked';

export interface AchievementItem {
  id: string;
  title: string;
  description: string;
  status: AchievementStatus;
  current_value: number | null;
  target_value: number | null;
  progress_text: string | null;
}

export interface AchievementSection {
  title: string;
  summary_text: string | null;
  stats: {
    unlocked_count: number;
    in_progress_count: number;
    primary_metric_value: number | null;
    primary_metric_label: string | null;
  };
  latest_unlocked: AchievementItem[];
  upcoming: AchievementItem[];
}

export interface AchievementEventItem {
  id: string;
  name: string;
  due_at: string;
  is_primary: boolean;
  user_id: number;
  created_at: string;
  updated_at: string;
}

export interface AchievementSummary {
  active_event: AchievementEventItem | null;
  event_achievements: AchievementSection | null;
  global_achievements: AchievementSection;
}
