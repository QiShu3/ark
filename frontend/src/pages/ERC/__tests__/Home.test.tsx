import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '../Home';
import type { ERCConfigStatus, ERCModuleStatus } from '../../../lib/erc/types';

const {
  apiJson,
  fetchERCConfigStatus,
  fetchERCOverview,
  saveERCConfig,
} = vi.hoisted(() => ({
  apiJson: vi.fn(),
  fetchERCConfigStatus: vi.fn(),
  fetchERCOverview: vi.fn(),
  saveERCConfig: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  apiJson,
}));

vi.mock('../../../lib/erc/api', () => ({
  fetchERCConfigStatus,
  fetchERCOverview,
  saveERCConfig,
}));

type ERCConfigStatusOverrides = Partial<Omit<ERCConfigStatus, 'practice' | 'review'>> & {
  practice?: Partial<ERCModuleStatus>;
  review?: Partial<ERCModuleStatus>;
};

function buildERCConfigStatus(overrides: ERCConfigStatusOverrides = {}): ERCConfigStatus {
  const base: ERCConfigStatus = {
    event_id: 'event-1',
    event_name: '考研英语',
    practice: {
      enabled: true,
      state: 'ready',
      task_id: 'task-erc-practice',
      config_id: 'config-erc-practice',
      completion_state: null,
      blocked_reason: null,
      confirmation_needed: false,
      config: {
        daily_article_target: 1,
        default_focus_duration: 1500,
        add_to_today_plan: true,
      },
    },
    review: {
      enabled: true,
      state: 'ready',
      task_id: 'task-erc-review',
      config_id: 'config-erc-review',
      completion_state: null,
      blocked_reason: null,
      confirmation_needed: false,
      config: {
        review_scope: 'due',
        daily_question_target: 10,
        default_focus_duration: 1500,
        add_to_today_plan: true,
      },
    },
  };

  return {
    ...base,
    ...overrides,
    practice: {
      ...base.practice,
      ...overrides.practice,
      config: {
        ...base.practice.config,
        ...overrides.practice?.config,
      },
    },
    review: {
      ...base.review,
      ...overrides.review,
      config: {
        ...base.review.config,
        ...overrides.review?.config,
      },
    },
  };
}

describe('ERC home page', () => {
  beforeEach(() => {
    apiJson.mockReset();
    apiJson.mockResolvedValue({ id: 'log-erc' });
    fetchERCConfigStatus.mockReset();
    fetchERCConfigStatus.mockResolvedValue(buildERCConfigStatus());
    fetchERCOverview.mockReset();
    fetchERCOverview.mockResolvedValue({
      due_review_count: 3,
      practiced_article_count: 8,
      practiced_question_count: 40,
      accuracy: 0.75,
      mistake_count: 5,
      recommended_article: { article_id: 'kaoyan2_2025_text1', year: 2025, text_no: 1, title: '' },
    });
    saveERCConfig.mockReset();
    saveERCConfig.mockResolvedValue(buildERCConfigStatus());
  });

  it('renders the unified sub-app template and starts review focus work from managed arrangements', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText('阅读训练')).toBeInTheDocument();
    expect(await screen.findByText('该配置会同步到当前主事件「考研英语」。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '配置' })).toBeInTheDocument();
    expect(screen.getByText('总览')).toBeInTheDocument();
    expect(screen.getByText('业务数据')).toBeInTheDocument();
    expect(screen.getByText('托管安排')).toBeInTheDocument();
    expect(screen.getByText('今日待复习')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('进入题库').closest('a')).toHaveAttribute('href', '/erc/library');
    expect(screen.getByText('查看错题').closest('a')).toHaveAttribute('href', '/erc/mistakes');
    expect(screen.queryByRole('button', { name: '安排管理与设置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始复习' })).not.toBeInTheDocument();

    const reloadFocusSpy = vi.fn();
    window.addEventListener('ark:reload-focus', reloadFocusSpy);
    const arrangements = screen.getByText('托管安排').closest('section')!;
    const reviewButton = within(arrangements).getAllByRole('button', { name: '开始' })[1];
    fireEvent.click(reviewButton);
    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/tasks/task-erc-review/focus/start', { method: 'POST' });
    });
    expect(reloadFocusSpy).toHaveBeenCalledTimes(1);
    expect(reviewButton).toHaveClass('bg-white');
    window.removeEventListener('ark:reload-focus', reloadFocusSpy);
  });

  it('keeps disabled ERC modules visible as configurable managed tasks', async () => {
    fetchERCConfigStatus.mockResolvedValue(
      buildERCConfigStatus({
        practice: { enabled: false, state: 'event_not_configured', task_id: null, config_id: null },
        review: { enabled: false, state: 'event_not_configured', task_id: null, config_id: null },
      }),
    );

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText('当前主事件「考研英语」尚未配置阅读训练，请通过右上角“配置”完成初始化。')).toBeInTheDocument();
    expect(screen.getAllByText('未启用')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '配置' }).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole('button', { name: '开始真题练习' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始复习' })).not.toBeInTheDocument();
  });

  it('saves one ERC config that derives both module tasks', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: '配置' }));
    const dialog = await screen.findByRole('dialog', { name: 'ERC 配置' });
    fireEvent.change(within(dialog).getByLabelText('每日目标 (文章篇数)'), { target: { value: '2' } });
    fireEvent.change(within(dialog).getByLabelText('每日目标 (复习题数)'), { target: { value: '12' } });
    await user.click(within(dialog).getByRole('button', { name: '全部做错题目 随机挑选所有做错题目' }));
    await user.click(within(dialog).getByRole('button', { name: '保存配置' }));

    expect(saveERCConfig).toHaveBeenCalledWith({
      event_id: 'event-1',
      practice_enabled: true,
      review_enabled: true,
      practice: {
        daily_article_target: 2,
        default_focus_duration: 1500,
        add_to_today_plan: true,
      },
      review: {
        review_scope: 'all',
        daily_question_target: 12,
        default_focus_duration: 1500,
        add_to_today_plan: true,
      },
    });
  });

  it('marks a disabled module as not enabled but keeps the other module start action available', async () => {
    fetchERCConfigStatus.mockResolvedValue(
      buildERCConfigStatus({
        practice: { enabled: false, state: 'event_not_configured', task_id: null, config_id: null },
      }),
    );

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText('未启用')).toBeInTheDocument();
    const arrangements = screen.getByText('托管安排').closest('section')!;
    expect(within(arrangements).getByRole('button', { name: '开始' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始真题练习' })).not.toBeInTheDocument();
    expect(screen.getAllByText('真题练习', { selector: 'span' }).length).toBeGreaterThan(0);
  });

  it('updates sync through the shared ERC config and surfaces manual-arrangement confirmation', async () => {
    const user = userEvent.setup();
    saveERCConfig.mockResolvedValue(
      buildERCConfigStatus({
        practice: {
          confirmation_needed: true,
          config: {
            daily_article_target: 1,
            default_focus_duration: 1500,
            add_to_today_plan: false,
          },
        },
      }),
    );

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await screen.findByText('托管安排');
    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);

    await waitFor(() => {
      expect(saveERCConfig).toHaveBeenCalledWith({
        event_id: 'event-1',
        practice_enabled: true,
        review_enabled: true,
        practice: {
          daily_article_target: 1,
          default_focus_duration: 1500,
          add_to_today_plan: false,
        },
        review: {
          review_scope: 'due',
          daily_question_target: 10,
          default_focus_duration: 1500,
          add_to_today_plan: true,
        },
      });
    });
    expect(await screen.findByText('检测到真题练习已有手动今日安排，系统已保留该安排。')).toBeInTheDocument();
  });
});
