import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY, useTheme, type ThemePreference } from './useTheme';

type MediaListener = (event: MediaQueryListEvent) => void;

function installMatchMedia(matches: boolean) {
  const listeners = new Set<MediaListener>();
  const media = {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((event: string, listener: MediaListener) => {
      if (event === 'change') listeners.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: MediaListener) => {
      if (event === 'change') listeners.delete(listener);
    }),
    addListener: vi.fn((listener: MediaListener) => listeners.add(listener)),
    removeListener: vi.fn((listener: MediaListener) => listeners.delete(listener)),
    dispatch(nextMatches: boolean) {
      this.matches = nextMatches;
      const event = { matches: nextMatches } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => media),
  });
  return media;
}

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it('defaults to system and resolves against the system color scheme', () => {
    installMatchMedia(false);

    const { result } = renderHook(() => useTheme());

    expect(result.current.themePreference).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('falls back to system when localStorage contains an invalid value', () => {
    installMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');

    const { result } = renderHook(() => useTheme());

    expect(result.current.themePreference).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('tracks system changes only while preference is system', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => media.dispatch(true));
    expect(result.current.resolvedTheme).toBe('dark');

    act(() => result.current.setThemePreference('light'));
    expect(result.current.themePreference).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');

    act(() => media.dispatch(true));
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('quick toggles the resolved theme into a manual preference', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useTheme());

    expect(result.current.themePreference).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');

    act(() => result.current.toggleResolvedTheme());

    expect(result.current.themePreference).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('accepts only valid preference values', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setThemePreference('dark' satisfies ThemePreference));

    expect(result.current.themePreference).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('keeps multiple hook consumers synchronized', () => {
    installMatchMedia(false);

    const first = renderHook(() => useTheme());
    const second = renderHook(() => useTheme());

    act(() => first.result.current.setThemePreference('dark'));

    expect(first.result.current.themePreference).toBe('dark');
    expect(second.result.current.themePreference).toBe('dark');
    expect(second.result.current.resolvedTheme).toBe('dark');
  });
});
