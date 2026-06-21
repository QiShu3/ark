export type ChoiceBank = {
  id: string;
  name: string;
  source: string;
  item_type: string;
  item_count: number;
  question_count: number;
};

export type ContentBlockData = {
  type: 'paragraph' | 'table' | 'image' | 'math' | 'html';
  text?: string;
  content?: unknown;
  src?: string;
  alt?: string;
};

export type ChoiceQuestion = {
  id: string;
  question_no: number;
  stem_blocks: ContentBlockData[];
  options: { key: string; text: string }[];
  answer: string;
  explanation_blocks: ContentBlockData[];
  tags: string[];
  sort_order: number;
};

export type ChoiceItem = {
  id: string;
  bank_id: string;
  paper_id?: string;
  title: string;
  material_blocks: ContentBlockData[];
  group_type: 'single' | 'passage' | 'case' | 'composite';
  subject_area?: string;
  tags: string[];
  sort_order: number;
  question_count: number;
  questions: ChoiceQuestion[];
};

export type ChoiceFilters = {
  years: number[];
  subjects: string[];
  tags: string[];
  total_items: number;
  total_questions: number;
};

export type ChoiceScope = {
  bank_id: string;
  paper_id?: string;
  years?: number[];
  subjects?: string[];
  tags?: string[];
  status?: string;
  mode?: string;
};

export type ChoiceCompletion = {
  mode: string;
  question_count?: number;
  duration_seconds?: number;
};

export type ChoiceAnswerSubmitResult = {
  question_id: string;
  chosen_option: string;
  correct_option: string;
  is_correct: boolean;
  rating: 'again' | 'hard' | 'good' | 'easy';
  next_review_at?: string | null;
};

export type ChoiceOverviewRecommendedArticle = {
  article_id: string;
  year: number;
  text_no: number;
  title: string;
};

export type ChoiceOverview = {
  due_review_count: number;
  practiced_article_count: number;
  practiced_question_count: number;
  accuracy: number;
  mistake_count: number;
  recommended_article: ChoiceOverviewRecommendedArticle | null;
};

export type ChoiceReviewNextParagraph = {
  paragraph_no: number;
  text: string;
};

export type ChoiceReviewNextQuestion = {
  question_id: string;
  question_no: number;
  stem: string;
  options: Record<string, string>;
  answer?: string | null;
};

export type ChoiceReviewNextArticle = {
  article_id: string;
  year: number;
  text_no: number;
  title: string;
};

export type ChoiceReviewNext = {
  has_item: boolean;
  next_due_at?: string | null;
  article?: ChoiceReviewNextArticle | null;
  paragraphs: ChoiceReviewNextParagraph[];
  question?: ChoiceReviewNextQuestion | null;
};

export type ChoiceMistakeItem = {
  article_id: string;
  year: number;
  text_no: number;
  question_id: string;
  question_no: number;
  stem: string;
  correct_option: string;
  last_chosen_option?: string | null;
  wrong_count: number;
  last_wrong_at?: string | null;
  is_due: boolean;
};

export type SetSnapshot = {
  id: string;
  set_id: string;
  total_questions: number;
  total_articles: number;
  by_state: Record<string, number>;
  mastery: Record<string, number>;
  fsrs_stats: Record<string, number>;
  due_status: Record<string, number>;
  focus_stats: Record<string, number>;
  trigger_reason: string;
  focus_run_id?: string | null;
  created_at: string;
};
