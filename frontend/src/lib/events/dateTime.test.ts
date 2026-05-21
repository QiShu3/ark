import { describe, expect, it } from 'vitest';

import {
  formatEventDateTime,
  fromDateTimeLocalValue,
  getCountdownDisplay,
  getCountdownTone,
  toDateTimeLocalValue,
} from './dateTime';

describe('event date time utilities', () => {
  it('converts ISO timestamps to datetime-local values and back', () => {
    const iso = '2026-03-20T08:30:00.000Z';
    const localValue = toDateTimeLocalValue(iso);

    expect(localValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromDateTimeLocalValue(localValue)).toBe(iso);
  });

  it('returns empty or null values for missing or invalid timestamps', () => {
    expect(toDateTimeLocalValue(null)).toBe('');
    expect(toDateTimeLocalValue('not-a-date')).toBe('');
    expect(fromDateTimeLocalValue('')).toBeNull();
    expect(fromDateTimeLocalValue('not-a-date')).toBeNull();
  });

  it('formats event date time values for display', () => {
    expect(formatEventDateTime('not-a-date')).toBe('--');
    expect(formatEventDateTime('2026-03-20T08:30:00.000Z')).toMatch(/2026/);
  });

  it('shows countdowns in minute, hour, and day precision', () => {
    const nowMs = new Date('2026-03-20T08:00:00.000Z').getTime();

    expect(getCountdownDisplay('2026-03-20T08:05:09.000Z', nowMs)).toBe('5m 09s');
    expect(getCountdownDisplay('2026-03-20T10:10:00.000Z', nowMs)).toBe('2h 10m');
    expect(getCountdownDisplay('2026-03-23T11:00:00.000Z', nowMs)).toBe('3d 03h');
    expect(getCountdownDisplay('not-a-date', nowMs)).toBe('--');
  });

  it('detects countdown tone from the due time', () => {
    const nowMs = new Date('2026-03-20T08:00:00.000Z').getTime();

    expect(getCountdownTone('2026-03-20T08:00:30.000Z', nowMs)).toBe('due');
    expect(getCountdownTone('2026-03-20T08:05:00.000Z', nowMs)).toBe('upcoming');
    expect(getCountdownTone('2026-03-20T07:55:00.000Z', nowMs)).toBe('expired');
    expect(getCountdownTone('not-a-date', nowMs)).toBe('upcoming');
  });
});
