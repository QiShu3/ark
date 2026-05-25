import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import HomeOnboarding from '../HomeOnboarding';
import { FIRST_GUIDE_EVENTS, FIRST_GUIDE_STORAGE_KEY } from '../../lib/onboardingEvents';

function dispatchGuideEvent(name: string) {
  act(() => {
    window.dispatchEvent(new CustomEvent(name));
  });
}

function renderAnchors() {
  return (
    <>
      <button data-onboarding-anchor="primary-event">主事件</button>
      <button data-onboarding-anchor="event-add-button">添加事件</button>
      <button data-onboarding-anchor="event-store-button">事件商店</button>
      <button data-onboarding-anchor="event-store-template-kaoyan">考研英语</button>
      <button data-onboarding-anchor="event-store-save-selected">保存</button>
      <button data-onboarding-anchor="event-template-apply-button">套用模板</button>
      <button data-onboarding-anchor="event-create-button">创建事件</button>
      <button data-onboarding-anchor="event-overview-close">关闭事件总览</button>
      <button data-onboarding-anchor="home-arrangements">安排</button>
      <button data-onboarding-anchor="arrangements-close">关闭安排管理</button>
      <button data-onboarding-anchor="workflow-settings-button">工作流设置</button>
      <button data-onboarding-anchor="workflow-settings-close">关闭工作流预设</button>
      <button data-onboarding-anchor="workflow-start-button">开始工作流</button>
      <button data-onboarding-anchor="focus-work-complete-round">结束本轮专注</button>
      <button data-onboarding-anchor="workflow-stop-button">结束工作流</button>
    </>
  );
}

describe('HomeOnboarding', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('portals the guide to the document body so app stacking contexts cannot cover it', () => {
    render(
      <div data-testid="stacking-host" className="relative z-10">
        <button data-onboarding-anchor="primary-event">主事件</button>
        <HomeOnboarding />
      </div>,
    );

    const host = screen.getByTestId('stacking-host');
    const dialog = screen.getByRole('dialog', { name: '首次引导' });
    expect(host).not.toContainElement(dialog);
    expect(document.body).toContainElement(dialog);
  });

  it('does not let the guide bubble intercept clicks meant for the highlighted target', () => {
    render(
      <>
        <button data-onboarding-anchor="primary-event">主事件</button>
        <HomeOnboarding />
      </>,
    );

    act(() => {
      screen.getByRole('button', { name: '开始体验' }).click();
    });

    const dialog = screen.getByRole('dialog', { name: '首次体验引导' });
    expect(dialog).toHaveClass('pointer-events-none');
    expect(screen.getByRole('button', { name: '稍后再说' })).toHaveClass('pointer-events-auto');
  });

  it('starts with a greeting, progresses through the guided click path, and stores completion after the ending', async () => {
    render(
      <>
        {renderAnchors()}
        <HomeOnboarding />
      </>,
    );

    expect(screen.getByRole('dialog', { name: '首次引导' })).toHaveTextContent('欢迎来到 Ark');
    expect(window.localStorage.getItem(FIRST_GUIDE_STORAGE_KEY)).toBeNull();

    await screen.getByRole('button', { name: '开始体验' }).click();
    expect(screen.getByRole('dialog', { name: '首次体验引导' })).toHaveTextContent('先从主事件开始');

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.primaryEventOpened);
    expect(await screen.findByText('创建你的第一个事件')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.addEventOpened);
    expect(await screen.findByText('从事件商店选择模板')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.eventStoreOpened);
    expect(await screen.findByText('查看考研英语模板')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.storeTemplateSelected);
    expect(await screen.findByText('保存到我的模板')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.storeTemplateSaved);
    expect(await screen.findByText('套用刚保存的模板')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.templateApplied);
    expect(await screen.findByText('确认并创建事件')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.eventCreated);
    expect(await screen.findByText('回到首页查看结果')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.eventOverviewClosed);
    expect(await screen.findByText('模板已经生成安排')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.arrangementsOpened);
    expect(await screen.findByText('先回到首页')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.arrangementsClosed);
    expect(await screen.findByText('模板也生成了工作流')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.workflowSettingsOpened);
    expect(await screen.findByText('回到首页启动它')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.workflowSettingsClosed);
    expect(await screen.findByText('从一次专注开始推进')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.workflowStarted);
    expect(await screen.findByText('完成本轮专注')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.workflowPhaseEnded);
    expect(await screen.findByText('随时可以结束工作流')).toBeInTheDocument();

    dispatchGuideEvent(FIRST_GUIDE_EVENTS.workflowStopped);
    expect(await screen.findByText('体验完成')).toBeInTheDocument();
    expect(window.localStorage.getItem(FIRST_GUIDE_STORAGE_KEY)).toBeNull();

    await screen.getByRole('button', { name: '知道了' }).click();

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '首次引导' })).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem(FIRST_GUIDE_STORAGE_KEY)).toBe('done');
  });
});
