import '@testing-library/jest-dom';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChoiceQuestionAdapter } from '../../../adapters/useChoiceQuestionAdapter';

const { apiJson } = vi.hoisted(() => ({
  apiJson: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({ apiJson }));

const mockFw = {
  type: 'erc_practice', label: '真题练习', template: 'choice_question' as const,
  contentBankType: 'article_set' as const, contentSelector: 'sequential', contentFields: [],
};

describe('useChoiceQuestionAdapter (ERC)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiJson.mockImplementation((url: string) => {
      if (url.includes('/sets')) return Promise.resolve([{ id: 's1', name: '考研英语' }]);
      return Promise.resolve({
        practiced_count: 40, correct_count: 30, accuracy: 0.75,
        due_count: 3, mistake_count: 5,
      });
    });
  });

  it('fetches sets and derives metrics from overview', async () => {
    const { result } = renderHook(() => useChoiceQuestionAdapter(mockFw, 'erc'));

    await waitFor(() => {
      expect(result.current.metrics[0].value).toBe('3');
      expect(result.current.metrics[2].value).toBe('75%');
    });

    expect(result.current.contentBank.type).toBe('article_set');
    expect(result.current.contentBank.selected).toBe('s1');
  });

  it('handles empty sets gracefully', async () => {
    apiJson.mockImplementation((url: string) => {
      if (url.includes('/sets')) return Promise.resolve([]);
      return Promise.resolve({ practiced_count: 0, correct_count: 0, accuracy: 0, due_count: 0, mistake_count: 0 });
    });

    const { result } = renderHook(() => useChoiceQuestionAdapter(mockFw, 'erc'));

    await waitFor(() => {
      expect(result.current.contentBank.options).toEqual([]);
      expect(result.current.contentBank.selected).toBeNull();
    });
  });

  it('returns null assetContent when overview not loaded', () => {
    apiJson.mockImplementation(() => new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useChoiceQuestionAdapter(mockFw, 'erc'));
    expect(result.current.assetContent).toBeNull();
  });
});

// TODO: App-level config modal, arrangements, and multi-focusWork tests
// will be re-enabled when useSubAppHomePage gains full config/arrangements support.
// These were previously tested via the now-deleted ERCHome component.
describe('ERC Home — config and arrangements (TODO)', () => {
  it.skip('renders with dual focus works and starts review from arrangements', () => {});
  it.skip('keeps disabled modules visible as configurable tasks', () => {});
  it.skip('saves config that derives both module tasks', () => {});
  it.skip('updates sync toggle and surfaces confirmation', () => {});
});
