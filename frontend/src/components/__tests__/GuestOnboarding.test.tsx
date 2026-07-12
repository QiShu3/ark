import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GuestOnboarding from '../GuestOnboarding';
import { apiJson } from '../../lib/api';
import { ONBOARDING_EVENTS } from '../../lib/onboardingEvents';

const mockUser = { is_guest: true };

vi.mock('../../lib/auth', () => ({
  useAuthStore: (selector: (state: { user: typeof mockUser }) => unknown) => selector({ user: mockUser }),
}));

vi.mock('../../lib/api', () => ({ apiJson: vi.fn() }));
vi.mock('../../lib/appRegistry', () => ({ clearAppRegistryCache: vi.fn() }));

describe('GuestOnboarding', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
  });

  it('hides the event bubble when the highlighted event opens', async () => {
    (apiJson as ReturnType<typeof vi.fn>).mockResolvedValue({ event_id: 'event-1' });
    render(
      <>
        <button data-onboarding-anchor="primary-event">主事件</button>
        <button data-onboarding-anchor="workflow-start-button">开始学习</button>
        <GuestOnboarding />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: '考研全国硕士研究生统一招生考试' }));
    fireEvent.click(screen.getByRole('button', { name: '408计算机学科专业基础' }));
    expect(await screen.findByText('这是你的事件')).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new CustomEvent(ONBOARDING_EVENTS.primaryEventOpened));
    });

    expect(screen.queryByText('这是你的事件')).not.toBeInTheDocument();
  });
});
