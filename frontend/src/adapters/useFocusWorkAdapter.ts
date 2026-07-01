import type { FocusWorkDeclaration } from '../lib/appRegistry';
import type { FocusWorkAdapter } from './types';
import { useChoiceQuestionAdapter } from './useChoiceQuestionAdapter';
import { useFlashcardAdapter } from './useFlashcardAdapter';

export function useFocusWorkAdapter(
  fw: FocusWorkDeclaration,
  appId: string,
): FocusWorkAdapter {
  const choice = useChoiceQuestionAdapter(fw, appId);
  const flashcard = useFlashcardAdapter(fw, appId);
  return fw.template === 'flash_card' ? flashcard : choice;
}
