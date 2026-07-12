import { BarChart3, BookOpen, ScrollText, Workflow, type LucideIcon } from 'lucide-react';
import { useAuthStore } from './auth';

export type ContentBankType = 'word_deck' | 'article_set';
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
  template: 'flash_card' | 'choice' | 'input';
  contentBankType: ContentBankType;
  contentSelector: string;
  contentFields: ContentConfigField[];
}

export interface AppDeclaration {
  id: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  adminOnly?: boolean;
  guestOnly?: boolean;
  type?: 'template' | 'deliberate-workflow';
  bankIds?: string[];
  eventId?: string | null;
  focusWorks: FocusWorkDeclaration[];
  sections: TemplateSection[];
}

const ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  'scroll-text': ScrollText,
  'bar-chart': BarChart3,
  'workflow': Workflow,
};

export function getAppIcon(iconName: string): LucideIcon {
  return ICONS[iconName] ?? BookOpen;
}

export const appRegistry: Record<string, AppDeclaration> = {};
export const appList: AppDeclaration[] = [];

const LEGACY_APP_IDS = new Set(['flash', 'erc']);

function normalizeFocusWorkTemplate(value: unknown): FocusWorkDeclaration['template'] {
  if (value === 'flash_card' || value === 'flashcard') return 'flash_card';
  if (value === 'input') return 'input';
  return 'choice';
}

function mapFromApi(raw: Record<string, unknown>): AppDeclaration {
  return {
    id: raw.id as string,
    name: raw.name as string,
    description: raw.description as string,
    icon: raw.icon as string,
    route: raw.route as string,
    adminOnly: raw.admin_only as boolean | undefined,
    guestOnly: raw.guest_only as boolean | undefined,
    type: (raw.type as string as AppDeclaration['type']) ?? 'template',
    bankIds: (raw.bank_ids as string[] | undefined) ?? [],
    eventId: raw.event_id as string | null | undefined,
    sections: (raw.sections as TemplateSection[] | undefined) ?? ['hero', 'asset', 'arrangements'],
    focusWorks: ((raw.focus_works || []) as Record<string, unknown>[]).map((fw) => ({
      type: fw.type as string,
      label: fw.label as string,
      template: normalizeFocusWorkTemplate(fw.template),
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
  };
}

let _loadedApps: AppDeclaration[] | null = null;

export function clearAppRegistryCache(): void {
  _loadedApps = null;
}

export async function loadAppRegistry(): Promise<AppDeclaration[]> {
  if (_loadedApps) return _loadedApps;
  try {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch('/api/app-registry', { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const rawList: Record<string, unknown>[] = await resp.json();
    const apps = rawList
      .map(mapFromApi)
      .filter((app) => !LEGACY_APP_IDS.has(app.id));
    _loadedApps = apps;
    return apps;
  } catch {
    _loadedApps = appList;
    return appList;
  }
}
