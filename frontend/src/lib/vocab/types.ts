export type VocabDeck = {
  id: string;
  key: string;
  name: string;
  description: string;
  word_count: number;
  created_at: string;
  updated_at: string;
};

export type VocabTodaySummary = {
  learning_count: number;
  new_count: number;
  review_count: number;
  mistake_count: number;
  total_count: number;
  pending_count: number;
  completed_count: number;
  daily_target_count: number;
  memorized_count: number;
};

export type VocabOverview = {
  completed_deck_count: number;
  total_deck_count: number;
  mastered_word_count: number;
  current_deck: {
    deck_id: string;
    deck_name: string;
    total_word_count: number;
    mastered_word_count: number;
    learning_word_count: number;
    unstarted_word_count: number;
  };
};

export type VocabTranslation = {
  pos: string | null;
  translation: string;
};

export type VocabPhrase = {
  phrase: string;
  translation: string;
};

export type VocabSentence = {
  sentence: string;
  translation: string;
};

export type VocabWordDetail = {
  id: string;
  deck_id: string;
  word: string;
  us_pronunciation: string | null;
  uk_pronunciation: string | null;
  translations: VocabTranslation[];
  phrases: VocabPhrase[];
  sentences: VocabSentence[];
};

export type VocabReviewItem = VocabWordDetail & {
  prompt_type: 'en_to_zh' | 'zh_to_en';
  review_mode: 'study' | 'review' | 'learning' | 'mistake';
  mastery_score: number;
};

export type VocabTodaySettingsPayload = {
  total_target_count: number;
};

export type VocabMistakeItem = VocabWordDetail & {
  last_wrong_at: string | null;
  wrong_count: number;
};

export type VocabReviewSubmitPayload = {
  deck_id: string;
  word_id: string;
  result: 'again' | 'hard' | 'good' | 'easy';
  review_mode: string;
  prompt_type: string;
  response_ms?: number;
};

export type VocabReviewSubmitResult = {
  mastery_score: number;
  next_review_at: string;
  wrong_count: number;
  correct_count: number;
  interval_days: number;
  result: string;
  should_repeat_today: boolean;
};
