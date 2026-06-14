export interface ERCSet {
  id: string;
  key: string;
  name: string;
  description: string;
  exam: string;
  article_count: number;
  question_count: number;
}

export interface ERCOverviewArticle {
  article_id: string;
  year: number;
  text_no: number;
  title: string;
}

export interface ERCOverview {
  due_review_count: number;
  practiced_article_count: number;
  practiced_question_count: number;
  accuracy: number;
  mistake_count: number;
  recommended_article: ERCOverviewArticle | null;
}

export interface ERCArticleListItem extends ERCOverviewArticle {
  set_id: string;
  status: 'unstarted' | 'practiced' | 'has_due_review';
  question_count: number;
  mistake_count: number;
  last_attempt_at: string | null;
}

export interface ERCParagraph {
  paragraph_no: number;
  text: string;
}

export interface ERCQuestion {
  question_id: string;
  question_no: number;
  stem: string;
  options: Record<'A' | 'B' | 'C' | 'D', string>;
  answer?: string | null;
}

export interface ERCArticleVocabularyWord {
  word: string;
  state: 'mastered' | 'learning' | 'unstarted' | 'unknown';
}

export interface ERCArticleVocabularySummary {
  total_word_count: number;
  mastered_count: number;
  learning_count: number;
  unstarted_count: number;
  unknown_count: number;
  unfamiliar_count: number;
  mastery_rate: number;
  preview_words: ERCArticleVocabularyWord[];
}

export interface ERCArticleDetail extends ERCOverviewArticle {
  set_id: string;
  exam: string;
  paragraphs: ERCParagraph[];
  questions: ERCQuestion[];
  last_attempt_at: string | null;
  vocabulary_summary: ERCArticleVocabularySummary | null;
}

export interface ERCPracticeAnswer {
  question_id: string;
  chosen_option: 'A' | 'B' | 'C' | 'D';
  time_spent_ms?: number;
}

export interface ERCArticleSubmitResult {
  attempt_id: string;
  article_id: string;
  correct_count: number;
  question_count: number;
  items: Array<{
    question_id: string;
    question_no: number;
    chosen_option: string;
    correct_option: string;
    is_correct: boolean;
    rating: 'again' | 'hard' | 'good' | 'easy';
    next_review_at: string | null;
    entered_mistakes: boolean;
  }>;
}

export interface ERCReviewNext {
  has_item: boolean;
  next_due_at: string | null;
  article: ERCOverviewArticle | null;
  paragraphs: ERCParagraph[];
  question: ERCQuestion | null;
}

export interface ERCReviewSubmitResult {
  question_id: string;
  chosen_option: string;
  correct_option: string;
  is_correct: boolean;
  rating: 'again' | 'hard' | 'good' | 'easy';
  next_review_at: string | null;
}

export interface ERCAppTaskInitPayload {
  review_scope: 'due' | 'mistakes' | 'all';
  daily_question_target: number;
  default_focus_duration?: number;
  add_to_today_plan?: boolean;
  event_id?: string | null;
  set_id?: string | null;
}

export interface ERCModuleStatus {
  enabled: boolean;
  state: 'uninitialized' | 'ready' | 'completed_today' | 'blocked' | 'config_invalid' | 'no_primary_event' | 'event_not_configured';
  task_id: string | null;
  config_id: string | null;
  completion_state: import('../../components/taskTypes').CompletionState | null;
  blocked_reason: string | null;
  config: Record<string, unknown>;
  confirmation_needed: boolean;
}

export interface ERCConfigStatus {
  event_id: string | null;
  event_name: string | null;
  practice: ERCModuleStatus;
  review: ERCModuleStatus;
}

export interface ERCConfigSavePayload {
  event_id?: string | null;
  practice_enabled: boolean;
  review_enabled: boolean;
  practice: {
    daily_article_target: number;
    default_focus_duration: number;
    add_to_today_plan: boolean;
    set_id?: string | null;
  };
  review: {
    review_scope: 'due' | 'mistakes' | 'all';
    daily_question_target: number;
    default_focus_duration: number;
    add_to_today_plan: boolean;
  };
}

export interface ERCMistakeItem {
  article_id: string;
  year: number;
  text_no: number;
  question_id: string;
  question_no: number;
  stem: string;
  correct_option: string;
  last_chosen_option: string | null;
  wrong_count: number;
  last_wrong_at: string;
  is_due: boolean;
}
