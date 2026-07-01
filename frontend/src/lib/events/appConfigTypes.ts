export type CanonicalAppType = 'flash_card' | 'choice' | 'input';

export function normalizeAppType(value: unknown): CanonicalAppType | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text === 'flash_card' || text === 'flashcard' || text === 'vocab_today') return 'flash_card';
  if (text === 'choice' || text === 'choice_question' || text === 'practice' || text === 'review' || text === 'erc_practice' || text === 'erc_review') return 'choice';
  if (text === 'input') return 'input';
  return null;
}

export function getAppTypeLabel(appType: CanonicalAppType): string {
  if (appType === 'flash_card') return '今日单词';
  if (appType === 'choice') return '选择练习';
  return '输入练习';
}
