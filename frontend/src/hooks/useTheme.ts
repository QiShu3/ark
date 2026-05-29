import { useCallback, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ark-theme-preference';

const VALID_PREFERENCES = new Set<ThemePreference>(['system', 'light', 'dark']);
const THEME_CHANGE_EVENT = 'ark:theme-preference-change';

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return VALID_PREFERENCES.has(stored as ThemePreference) ? (stored as ThemePreference) : 'system';
  } catch {
    return 'system';
  }
}

function persistPreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Keep rendering even if browser storage is unavailable.
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(preference: ThemePreference, systemTheme: ResolvedTheme): ResolvedTheme {
  return preference === 'system' ? systemTheme : preference;
}

function applyTheme(resolvedTheme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolvedTheme);
}

function notifyThemePreferenceChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
}

export function useTheme() {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => readStoredPreference());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePreferenceChange = () => {
      setThemePreferenceState(readStoredPreference());
    };
    window.addEventListener(THEME_CHANGE_EVENT, handlePreferenceChange);
    window.addEventListener('storage', handlePreferenceChange);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handlePreferenceChange);
      window.removeEventListener('storage', handlePreferenceChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  const resolvedTheme = useMemo(
    () => resolveTheme(themePreference, systemTheme),
    [themePreference, systemTheme],
  );

  useEffect(() => {
    persistPreference(themePreference);
    applyTheme(resolvedTheme);
  }, [themePreference, resolvedTheme]);

  const setThemePreference = useCallback((nextPreference: ThemePreference) => {
    const safePreference = VALID_PREFERENCES.has(nextPreference) ? nextPreference : 'system';
    persistPreference(safePreference);
    setThemePreferenceState(safePreference);
    notifyThemePreferenceChange();
  }, []);

  const toggleResolvedTheme = useCallback(() => {
    const nextPreference: ThemePreference = resolvedTheme === 'light' ? 'dark' : 'light';
    persistPreference(nextPreference);
    setThemePreferenceState(nextPreference);
    notifyThemePreferenceChange();
  }, [resolvedTheme]);

  return {
    themePreference,
    resolvedTheme,
    systemTheme,
    setThemePreference,
    toggleResolvedTheme,
    isDark: resolvedTheme === 'dark',
  };
}
