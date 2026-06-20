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
