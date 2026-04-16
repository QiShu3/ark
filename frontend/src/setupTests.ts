import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock API
vi.mock('./lib/api', () => ({
  apiJson: vi.fn().mockImplementation(async (url) => {
    if (url === '/api/arxiv/daily/config') return null;
    if (url === '/api/arxiv/daily/candidates') return [];
    if (url === '/api/arxiv/papers?limit=200') return [];
    if (typeof url === 'string' && url.startsWith('/todo/tasks/calendar')) return [];
    return [];
  }),
  checkIn: vi.fn().mockResolvedValue(undefined),
  getCheckInStatus: vi.fn().mockResolvedValue({
    is_checked_in_today: true,
    current_streak: 1,
    total_days: 1,
    checked_dates: [],
  }),
}));

// Mock localStorage
const localStorageMock = (function () {
  let store: Record<string, string> = {};
  return {
    getItem: function (key: string) {
      return store[key] || null;
    },
    setItem: function (key: string, value: string) {
      store[key] = value.toString();
    },
    clear: function () {
      store = {};
    },
    removeItem: function (key: string) {
      delete store[key];
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
