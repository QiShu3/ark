import type { FocusWorkRunSummary } from './focusWorkTypes';

/**
 * Returns the Tailwind border/bg/text class triple for a given focus-work tone.
 *
 * Supported tones:
 * - `"blue"` – primary accent
 * - `"amber"` – secondary/warning accent
 * - `"emerald"` – success accent
 * - `undefined` – default neutral palette
 */
export function metaClass(tone: string | undefined): string {
  if (tone === 'blue') return 'border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] text-[var(--focus-work-blue-text)]';
  if (tone === 'amber') return 'border-[var(--focus-work-amber-border)] bg-[var(--focus-work-amber-bg)] text-[var(--focus-work-amber-text)]';
  if (tone === 'emerald') return 'border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)]';
  return 'border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] text-[var(--focus-work-text)]';
}

/**
 * Extracts a numeric configuration value from a FocusWorkRunSummary's config_snapshot.
 *
 * Iterates through the provided `keys` in order, returning the first valid numeric value found.
 * Each candidate value is parsed via `Number()`, validated for finiteness, clamped to `[1, max]`,
 * and floored to an integer. If no valid value is found among the keys, returns `fallback`.
 *
 * @param run - The focus-work run whose `config_snapshot` is inspected.
 * @param keys - Ordered list of config_snapshot keys to try (first match wins).
 * @param fallback - Default value returned when no key yields a valid number.
 * @param max - Upper bound for the returned value (inclusive). The minimum is always 1.
 * @returns A clamped, floored integer in the range `[1, max]`, or `fallback` if no valid key is found.
 */
export function extractRunConfigNumber(
  run: FocusWorkRunSummary,
  keys: string[],
  fallback: number,
  max: number,
): number {
  for (const key of keys) {
    const rawValue = run.config_snapshot?.[key];
    if (rawValue !== undefined && rawValue !== null) {
      const numValue = Number(rawValue);
      if (Number.isFinite(numValue)) {
        return Math.max(1, Math.min(max, Math.floor(numValue)));
      }
    }
  }
  return fallback;
}

/**
 * Safely extracts a human-readable error message from an unknown thrown value.
 *
 * Checks for `Error` instances first (returns `.message`), then plain strings,
 * and falls back to the provided default. This replaces repeated try/catch
 * patterns that manually narrow `unknown` error types.
 *
 * @param err - The caught value, typically from a `catch` block.
 * @param fallback - Default message returned when `err` cannot be narrowed.
 * @returns A non-empty string suitable for display to the user.
 */
export function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return fallback;
}

/**
 * Builds a progress snapshot object with named count and target fields.
 *
 * Replaces duplicated snapshot-building patterns across templates by
 * assembling a consistent record keyed by the provided label strings.
 *
 * @param countLabel - The key name for the current count value.
 * @param targetLabel - The key name for the target value.
 * @param count - The current count/progress value.
 * @param target - The target/total value.
 * @param noContent - Optional flag indicating no content is available.
 * @returns A `Record<string, unknown>` containing the count, target, and optionally `no_available_content`.
 */
export function buildProgressSnapshot(
  countLabel: string,
  targetLabel: string,
  count: number,
  target: number,
  noContent?: boolean,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    [countLabel]: count,
    [targetLabel]: target,
  };
  if (noContent !== undefined) {
    snapshot.no_available_content = noContent;
  }
  return snapshot;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Formats a human-readable label for the next review time of an FSRS card.
 *
 * Returns an empty string when `nextReviewAt` is null/undefined.
 * Otherwise computes the difference from now and returns:
 * - `'即将复习'` when due within 1 hour (including past-due)
 * - `'今日到期'` when due on the same calendar day as now
 * - `'X 小时后'` when due within 24 hours but on a later day
 * - `'X 天后'` when due beyond 24 hours (X = rounded day count)
 *
 * @param nextReviewAt - ISO string or null/undefined.
 * @returns A display label, or empty string when no due date is provided.
 */
export function formatDueLabel(nextReviewAt: string | null | undefined): string {
  if (!nextReviewAt) return '';
  const due = new Date(nextReviewAt);
  if (Number.isNaN(due.getTime())) return '';
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  if (diffMs < HOUR_MS) return '即将复习';
  if (diffMs < DAY_MS) {
    if (due.toDateString() === now.toDateString()) return '今日到期';
    const hours = Math.max(1, Math.round(diffMs / HOUR_MS));
    return `${hours} 小时后`;
  }
  const days = Math.round(diffMs / DAY_MS);
  return `${days} 天后`;
}

/**
 * Determines the FSRS stage of a card based on its serialized state and due time.
 *
 * - `'new'` — `fsrsCardJson` is null/undefined (never reviewed)
 * - `'learning'` — `fsrsCardJson` exists and `nextReviewAt` is within 24h (learning steps still active today)
 * - `'review'` — `fsrsCardJson` exists and `nextReviewAt` is beyond 24h (long-term review)
 *
 * @param fsrsCardJson - Serialized FSRS Card JSON string, or null/undefined.
 * @param nextReviewAt - ISO string of next due time, or null/undefined.
 * @returns The FSRS stage, defaulting to `'new'` when no card state exists.
 */
export function computeFsrsStage(
  fsrsCardJson: string | null | undefined,
  nextReviewAt: string | null | undefined,
): 'new' | 'learning' | 'review' {
  if (!fsrsCardJson) return 'new';
  if (!nextReviewAt) return 'learning';
  const due = new Date(nextReviewAt);
  if (Number.isNaN(due.getTime())) return 'learning';
  const diffMs = due.getTime() - Date.now();
  if (diffMs < DAY_MS) return 'learning';
  return 'review';
}
