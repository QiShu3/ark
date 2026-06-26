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
