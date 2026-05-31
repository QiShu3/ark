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

  it('renders reading training summary and starts the review focus work from the event-bound config', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText('阅读训练')).toBeInTheDocument();
    expect(await screen.findByText('这份 ERC 配置会绑定在当前主事件「考研英语」。')).toBeInTheDocument();
    expect(screen.getByText('今日待复习')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入题库' })).toHaveAttribute('href', '/erc/library');

    const reloadFocusSpy = vi.fn();
    window.addEventListener('ark:reload-focus', reloadFocusSpy);
    const reviewButton = screen.getByRole('button', { name: '开始复习' });
    fireEvent.click(reviewButton);
    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/tasks/task-erc-review/focus/start', { method: 'POST' });
    });
    expect(reloadFocusSpy).toHaveBeenCalledTimes(1);
    expect(reviewButton).toHaveClass('bg-white');
    window.removeEventListener('ark:reload-focus', reloadFocusSpy);
    expect(screen.getByRole('link', { name: '查看错题' })).toHaveAttribute('href', '/erc/mistakes');
    expect(screen.getByRole('link', { name: '查看错题' })).toHaveClass('backdrop-blur-xl');
  });

  it('shows a single app configuration prompt when both ERC modules are disabled', async () => {
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

    expect(await screen.findByText('阅读训练尚未启用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '配置阅读训练' })).toBeInTheDocument();
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

    await user.click(await screen.findByRole('button', { name: '安排管理与设置' }));
    const dialog = await screen.findByRole('dialog', { name: 'ERC 安排与设置' });
    fireEvent.change(within(dialog).getByLabelText('每日目标 (文章篇数)'), { target: { value: '2' } });
    fireEvent.change(within(dialog).getByLabelText('每日目标 (复习题数)'), { target: { value: '12' } });
    await user.click(within(dialog).getByRole('button', { name: '全部做错题目 随机挑选所有做错题目' }));
    await user.click(within(dialog).getByRole('button', { name: '保存 ERC 配置' }));

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

  it('hides disabled module entry points but keeps the other module available', async () => {
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

    expect(await screen.findByRole('button', { name: '开始复习' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始真题练习' })).not.toBeInTheDocument();
    expect(screen.queryByText('真题练习', { selector: 'span' })).not.toBeInTheDocument();
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
