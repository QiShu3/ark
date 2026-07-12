import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GuestOnboarding from '../GuestOnboarding';
import { apiJson } from '../../lib/api';
import { GUEST_ONBOARDING_RESTART_EVENT, ONBOARDING_EVENTS } from '../../lib/onboardingEvents';

const mockUser = { id: 1, is_guest: true };

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

  it('guides the guest to close the event workbench after the highlighted event opens', async () => {
    (apiJson as ReturnType<typeof vi.fn>).mockResolvedValue({ event_id: 'event-1' });
    render(
      <>
        <button data-onboarding-anchor="primary-event">主事件</button>
        <button data-onboarding-anchor="event-workbench-close">关闭</button>
        <button data-onboarding-anchor="guest-learning-entry">开始学习</button>
        <GuestOnboarding />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: /408 计算机学科专业基础/ }));
    expect(await screen.findByText('这是你的事件')).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new CustomEvent(ONBOARDING_EVENTS.primaryEventOpened));
    });

    expect(await screen.findByText('先关闭事件工作台')).toBeInTheDocument();
  });

  it('guides every learning action and completes only after the workflow starts', async () => {
    (apiJson as ReturnType<typeof vi.fn>).mockResolvedValue({ event_id: 'event-1' });
    render(
      <>
        <button data-onboarding-anchor="primary-event">主事件</button>
        <button data-onboarding-anchor="event-workbench-close">关闭</button>
        <button data-onboarding-anchor="guest-learning-entry">开始学习</button>
        <button data-onboarding-anchor="workflow-sub-app">408 学习</button>
        <button data-onboarding-anchor="workflow-start-button">启动工作流</button>
        <GuestOnboarding />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: /408 计算机学科专业基础/ }));
    await screen.findByText('这是你的事件');

    fireEvent.click(screen.getByRole('button', { name: '主事件' }));
    await screen.findByText('先关闭事件工作台');
    await act(async () => {
      window.dispatchEvent(new CustomEvent(ONBOARDING_EVENTS.eventOverviewClosed));
    });

    expect(await screen.findByText('请点击高亮按钮继续')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '知道了' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('ark-guest-onboarding-v1:1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '开始学习' }));
    expect(window.localStorage.getItem('ark-guest-onboarding-v1:1')).toBeNull();
    expect(await screen.findByText('选择学习应用')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '408 学习' }));
    expect(await screen.findByText('启动第一轮学习')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '启动工作流' }));
    expect(screen.queryByText('启动第一轮学习')).not.toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new CustomEvent(ONBOARDING_EVENTS.workflowStarted));
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('ark-guest-onboarding-v1:1')).toBe('done');
    });
    expect(screen.queryByText('请点击高亮按钮继续')).not.toBeInTheDocument();
  });

  it('offers only the available 408 experience and initializes that path directly', async () => {
    (apiJson as ReturnType<typeof vi.fn>).mockResolvedValue({ event_id: 'event-1' });
    render(<GuestOnboarding />);

    expect(screen.getByRole('heading', { name: '开始 408 考研体验' })).toBeInTheDocument();
    expect(screen.getByText('游客体验目前提供计算机 408 学习路径')).toBeInTheDocument();
    expect(screen.queryByText('考公')).not.toBeInTheDocument();
    expect(screen.queryByText('法学')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /408 计算机学科专业基础/ }));

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/auth/guest/setup-event', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ event_type: 'kaoyan', major: '22408' }),
      }));
    });
  });

  it('lets a guest skip the onboarding without ending the session', async () => {
    render(<GuestOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: '跳过引导' }));

    expect(window.localStorage.getItem('ark-guest-onboarding-v1:1')).toBe('done');
    expect(screen.queryByRole('heading', { name: '开始 408 考研体验' })).not.toBeInTheDocument();
  });

  it('opens the guest experience again when the navigation requests a restart', async () => {
    window.localStorage.setItem('ark-guest-onboarding-v1:1', 'done');
    render(<GuestOnboarding />);

    expect(screen.queryByRole('heading', { name: '开始 408 考研体验' })).not.toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new CustomEvent(GUEST_ONBOARDING_RESTART_EVENT));
    });

    expect(screen.getByRole('heading', { name: '开始 408 考研体验' })).toBeInTheDocument();
  });
});
