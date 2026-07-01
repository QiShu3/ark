export type CanonicalAppType = 'flash_card' | 'choice' | 'input';
export type ChoiceAppMode = 'practice' | 'review';

export function normalizeAppType(value: unknown): CanonicalAppType | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text === 'flash_card' || text === 'flashcard' || text === 'vocab_today') return 'flash_card';
  if (text === 'choice' || text === 'choice_question' || text === 'practice' || text === 'review' || text === 'erc_practice' || text === 'erc_review') return 'choice';
  if (text === 'input') return 'input';
  return null;
}

export function inferChoiceMode(rawAppType: unknown, config: Record<string, unknown> = {}): ChoiceAppMode {
  const text = String(rawAppType ?? '').trim().toLowerCase();
  if (text === 'review' || text === 'erc_review' || text === 'practice') {
    if (config.reviewScope !== undefined || config.dailyQuestionTarget !== undefined) return 'review';
    return 'practice';
  }
  if (config.reviewScope !== undefined || config.dailyQuestionTarget !== undefined) return 'review';
  return 'practice';
}

export function getAppTypeLabel(appType: CanonicalAppType, config?: Record<string, unknown>): string {
  if (appType === 'flash_card') return '今日单词';
  if (appType === 'choice') {
    const mode = config?.choiceMode as ChoiceAppMode | undefined;
    if (mode === 'review') return '错题复习';
    return '真题练习';
  }
  return '输入练习';
}

export function getChoiceModeLabel(mode: ChoiceAppMode): string {
  return mode === 'review' ? '错题复习' : '真题练习';
}
