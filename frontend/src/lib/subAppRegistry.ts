import { BookOpen, ScrollText, type LucideIcon } from 'lucide-react';

// ---- 基础类型 ----

export type ContentBankType = 'word_deck' | 'article_set';

export type FocusTemplate = 'flashcard' | 'choice_question';

export interface ContentConfigField {
  key: string;
  label: string;
  type: 'number' | 'select' | 'deck_switcher' | 'set_switcher';
  defaultValue: unknown;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

export interface FocusWorkDeclaration {
  type: string;
  label: string;
  template: FocusTemplate;
  contentBankType: ContentBankType;
  contentFields: ContentConfigField[];
}

export interface SubAppDeclaration {
  id: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  focusWorks: FocusWorkDeclaration[];
}

// ---- 专注工作类型（从 registry 推导） ----

export type RegisteredFocusWorkType = 'vocab_today' | 'erc_review' | 'erc_practice' | 'task_focus';

// ---- 图标查找 ----

const ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  'scroll-text': ScrollText,
};

export function getSubAppIcon(iconName: string): LucideIcon {
  return ICONS[iconName] ?? BookOpen;
}

// ---- 声明 ----

const vocabDeclaration: SubAppDeclaration = {
  id: 'vocab',
  name: '背单词',
  description: '切换词书并开始今日学习',
  icon: 'book-open',
  route: '/vocab',
  focusWorks: [
    {
      type: 'vocab_today',
      label: '今日单词',
      template: 'flashcard',
      contentBankType: 'word_deck',
      contentFields: [
        { key: 'deck_id', label: '词书', type: 'deck_switcher', defaultValue: null },
        { key: 'daily_target_count', label: '每日目标', type: 'number', defaultValue: 20, min: 1, max: 500 },
      ],
    },
  ],
};

const ercDeclaration: SubAppDeclaration = {
  id: 'erc',
  name: '阅读训练',
  description: '整篇练习并进入 FSRS 复习池',
  icon: 'scroll-text',
  route: '/erc',
  focusWorks: [
    {
      type: 'erc_practice',
      label: '真题练习',
      template: 'choice_question',
      contentBankType: 'article_set',
      contentFields: [
        { key: 'set_id', label: '题库', type: 'set_switcher', defaultValue: null },
        { key: 'daily_article_target', label: '每日目标', type: 'number', defaultValue: 1, min: 1, max: 50 },
      ],
    },
    {
      type: 'erc_review',
      label: '错题复习',
      template: 'choice_question',
      contentBankType: 'article_set',
      contentFields: [
        { key: 'daily_question_target', label: '每日目标', type: 'number', defaultValue: 10, min: 1, max: 200 },
        { key: 'review_scope', label: '复习范围', type: 'select', defaultValue: 'due',
          options: [
            { value: 'due', label: '仅到期错题' },
            { value: 'mistakes', label: '未掌握错题' },
            { value: 'all', label: '全部错题' },
          ],
        },
      ],
    },
  ],
};

// ---- Registry ----

export const subAppRegistry: Record<string, SubAppDeclaration> = {
  vocab: vocabDeclaration,
  erc: ercDeclaration,
};

/** All registered sub-apps as an array (for iteration) */
export const subAppList: SubAppDeclaration[] = Object.values(subAppRegistry);

/** Collect all focus work types from all registered sub-apps */
export function getRegisteredFocusWorkTypes(): RegisteredFocusWorkType[] {
  return subAppList.flatMap((app) => app.focusWorks.map((fw) => fw.type as RegisteredFocusWorkType));
}

// ---- Dynamic loading from backend ----

let _dynamicApps: SubAppDeclaration[] | null = null;

/** Fetch registered sub-apps from the backend API, merge with built-in defaults. */
export async function loadDynamicRegistry(): Promise<SubAppDeclaration[]> {
  if (_dynamicApps) return _dynamicApps;
  try {
    const resp = await fetch('/api/app-registry');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data: SubAppDeclaration[] = await resp.json();
    // merge: backend entries that don't shadow built-in ids
    const builtInIds = new Set(Object.keys(subAppRegistry));
    const merged = [
      ...Object.values(subAppRegistry),
      ...data.filter((d) => !builtInIds.has(d.id)),
    ];
    _dynamicApps = merged;
    return merged;
  } catch {
    _dynamicApps = subAppList;
    return subAppList;
  }
}
