import type { FocusWorkRunSummary } from '../../components/focus-work/focusWorkTypes';
import type { ChoiceCompletion, ChoiceScope } from './types';

/**
 * Extracts ChoiceScope from a FocusWorkRunSummary config snapshot.
 *
 * @param run - The focus work run summary containing config_snapshot
 * @returns The parsed ChoiceScope if present and valid, null otherwise
 */
export function getChoiceScope(run: FocusWorkRunSummary): ChoiceScope | null {
  const raw = run.config_snapshot?.choice_scope;
  if (raw && typeof raw === 'object' && 'bank_id' in raw) return raw as ChoiceScope;
  return null;
}

/**
 * Extracts ChoiceCompletion from a FocusWorkRunSummary config snapshot.
 *
 * @param run - The focus work run summary containing config_snapshot
 * @returns The parsed ChoiceCompletion if present and valid, null otherwise
 */
export function getChoiceCompletion(run: FocusWorkRunSummary): ChoiceCompletion | null {
  const raw = run.config_snapshot?.choice_completion;
  if (raw && typeof raw === 'object' && 'mode' in raw) return raw as ChoiceCompletion;
  return null;
}
