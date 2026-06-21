import { BookOpen, ScrollText, BarChart3, type LucideIcon } from 'lucide-react';

// ---- 基础类型 ----

export type ContentBankType = 'word_deck' | 'article_set';

export type FocusTemplate = 'flashcard' | 'choice_question';

export type TemplateSection = 'hero' | 'asset' | 'arrangements' | 'feedback' | 'modals';

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
  contentSelector: string;
  contentFields: ContentConfigField[];
}

export interface SubAppDeclaration {
  id: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  adminOnly?: boolean;
  focusWorks: FocusWorkDeclaration[];
  sections: TemplateSection[];
}

// ---- 专注工作类型（从 registry 推导） ----

export type RegisteredFocusWorkType = 'vocab_today' | 'review' | 'practice' | 'task_focus';

// ---- 图标查找 ----

const ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  'scroll-text': ScrollText,
  'bar-chart': BarChart3,
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
  sections: ['hero', 'asset', 'arrangements', 'feedback', 'modals'],
  focusWorks: [
    {
      type: 'vocab_today',
      label: '今日单词',
      template: 'flashcard',
      contentBankType: 'word_deck',
      contentSelector: 'fsrs_mixed',
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
  sections: ['hero', 'asset', 'arrangements', 'feedback', 'modals'],
  focusWorks: [
    {
      type: 'practice',
      label: '真题练习',
      template: 'choice_question',
      contentBankType: 'article_set',
      contentSelector: 'sequential',
      contentFields: [
        { key: 'set_id', label: '题库', type: 'set_switcher', defaultValue: null },
        { key: 'daily_article_target', label: '每日目标', type: 'number', defaultValue: 1, min: 1, max: 50 },
      ],
    },
    {
      type: 'review',
      label: '错题复习',
      template: 'choice_question',
      contentBankType: 'article_set',
      contentSelector: 'weighted_mistake',
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

const snapshotDeclaration: SubAppDeclaration = {
  id: 'snapshot',
  name: '存档分析',
  description: '查看题库存档与掌握度趋势',
  icon: 'bar-chart',
  route: '/snapshot',
  adminOnly: true,
  sections: ['hero', 'asset'],
  focusWorks: [],
};

// ---- Registry ----

export const subAppRegistry: Record<string, SubAppDeclaration> = {
  vocab: vocabDeclaration,
  erc: ercDeclaration,
  snapshot: snapshotDeclaration,
};

/** All registered sub-apps as an array (for iteration) */
export const subAppList: SubAppDeclaration[] = Object.values(subAppRegistry);

/** Collect all focus work types from all registered sub-apps */
export function getRegisteredFocusWorkTypes(): RegisteredFocusWorkType[] {
  return subAppList.flatMap((app) => app.focusWorks.map((fw) => fw.type as RegisteredFocusWorkType));
}

// ---- Dynamic loading from backend ----

let _dynamicApps: SubAppDeclaration[] | null = null;

/** Convert backend snake_case to frontend camelCase. */
function mapFromApi(raw: Record<string, unknown>): SubAppDeclaration {
  return {
    id: raw.id as string,
    name: raw.name as string,
    description: raw.description as string,
    icon: raw.icon as string,
    route: raw.route as string,
    adminOnly: raw.admin_only as boolean | undefined,
    sections: (raw.sections as TemplateSection[] | undefined) ?? ['hero', 'asset', 'arrangements'],
    focusWorks: ((raw.focus_works || []) as Record<string, unknown>[]).map((fw) => ({
      type: fw.type as string,
      label: fw.label as string,
      template: (fw.template || 'choice_question') as FocusTemplate,
      contentBankType: (fw.content_bank_type || 'article_set') as ContentBankType,
      contentSelector: (fw.content_selector as string) || 'sequential',
      contentFields: ((fw.content_fields || []) as Record<string, unknown>[]).map((cf) => ({
        key: cf.key as string,
        label: cf.label as string,
        type: (cf.type || 'number') as ContentConfigField['type'],
        defaultValue: cf.default_value,
        options: cf.options as { value: string; label: string }[] | undefined,
        min: cf.min_val as number | undefined,
        max: cf.max_val as number | undefined,
      })),
    })),
  } as SubAppDeclaration;
}

/** Fetch registered sub-apps from the backend API, merge with built-in defaults. */
export async function loadDynamicRegistry(): Promise<SubAppDeclaration[]> {
  if (_dynamicApps) return _dynamicApps;
  try {
    const resp = await fetch('/api/app-registry');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const rawList: Record<string, unknown>[] = await resp.json();
    const data = rawList.map(mapFromApi);
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
