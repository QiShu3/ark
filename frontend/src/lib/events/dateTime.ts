export type CountdownTone = 'upcoming' | 'due' | 'expired';

export function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const localTime = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 16);
}

export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function formatEventDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getCountdownDisplay(dueAt: string, nowMs: number): string {
  const dueMs = new Date(dueAt).getTime();
  if (Number.isNaN(dueMs)) return '--';
  const diff = Math.abs(dueMs - nowMs);
  if (diff <= 60 * 60 * 1000) {
    const totalSeconds = Math.floor(diff / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  if (diff <= 24 * 60 * 60 * 1000) {
    const totalMinutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  const totalHours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${String(hours).padStart(2, '0')}h`;
}

export function getCountdownTone(dueAt: string, nowMs: number): CountdownTone {
  const dueMs = new Date(dueAt).getTime();
  if (Number.isNaN(dueMs)) return 'upcoming';
  const diff = dueMs - nowMs;
  if (Math.abs(diff) <= 60 * 1000) return 'due';
  return diff > 0 ? 'upcoming' : 'expired';
}
