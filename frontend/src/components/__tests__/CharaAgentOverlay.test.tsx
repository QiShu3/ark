import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CharaAgentOverlay from '../CharaAgentOverlay';

const listAgentProfiles = vi.fn();
const executeAgentAction = vi.fn();
const apiSSE = vi.fn();

vi.mock('../../lib/agent', () => ({
  listAgentProfiles: (...args: unknown[]) => listAgentProfiles(...args),
  executeAgentAction: (...args: unknown[]) => executeAgentAction(...args),
}));

vi.mock('../../lib/api', () => ({
  apiSSE: (...args: unknown[]) => apiSSE(...args),
}));

describe('CharaAgentOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAgentProfiles.mockResolvedValue([
      {
        id: 'apf_dashboard',
        user_id: 7,
        name: 'Ark Agent',
        description: 'Default dashboard profile',
        primary_app_id: 'dashboard',
        avatar_url: null,
        context_prompt: '',
        allowed_skills: [],
        temperature: 0.2,
        max_tool_loops: 4,
        is_default: true,
        created_at: '2026-03-26T00:00:00Z',
        updated_at: '2026-03-26T00:00:00Z',
      },
    ]);
  });

  it('streams a single-round subtitle and shows three suggestions after completion', async () => {
    apiSSE
      .mockImplementationOnce(async (_path, body, onEvent) => {
        expect(body).toMatchObject({
          profile_id: 'apf_dashboard',
          history: [],
          scope: 'dashboard_chara',
        });
        onEvent({
          type: 'done',
          reply: '你好，今天我可以陪你把事情理顺。',
          approval: null,
          suggestions: ['看看今天待办', '帮我排优先级', '给我一个开始动作'],
        });
      })
      .mockImplementationOnce(async (_path, body, onEvent) => {
      expect(body).toMatchObject({
        profile_id: 'apf_dashboard',
        message: '今天我先做什么？',
        history: [],
        scope: 'dashboard_chara',
      });
      onEvent({ type: 'message_delta', delta: '先把最重要的事情' });
      onEvent({
        type: 'done',
        reply: '先把最重要的事情做完。',
        approval: null,
        suggestions: ['帮我拆一下', '列出前三件事', '换个角度建议'],
      });
      });

    render(<CharaAgentOverlay />);

    await waitFor(() => expect(screen.getByText('你好，今天我可以陪你把事情理顺。')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('想让我现在帮你什么？'), {
      target: { value: '今天我先做什么？' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '发送给 Dashboard Agent' }).closest('form')!);

    await waitFor(() => expect(apiSSE).toHaveBeenCalled());
    expect(screen.getByText('先把最重要的事情做完。')).toBeInTheDocument();
    expect(screen.queryByText('今天我先做什么？')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '帮我拆一下' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '列出前三件事' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '换个角度建议' })).toBeInTheDocument();
  });

  it('auto greets the user after the dashboard profile is loaded', async () => {
    apiSSE.mockImplementation(async (_path, body, onEvent) => {
      expect(body).toMatchObject({
        profile_id: 'apf_dashboard',
        history: [],
        scope: 'dashboard_chara',
      });
      expect(typeof body.message).toBe('string');
      onEvent({
        type: 'done',
        reply: '欢迎回来，今天想先推进哪件事？',
        approval: null,
        suggestions: ['看看今天待办', '帮我选最重要的一件', '我有点没状态'],
      });
    });

    render(<CharaAgentOverlay />);

    await waitFor(() => expect(apiSSE).toHaveBeenCalledTimes(1));
    expect(screen.getByText('欢迎回来，今天想先推进哪件事？')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '看看今天待办' })).toBeInTheDocument();
  });

  it('replaces the previous subtitle and suggestions when clicking a generated suggestion', async () => {
    apiSSE
      .mockImplementationOnce(async (_path, _body, onEvent) => {
        onEvent({
          type: 'done',
          reply: '你好，我们来把事情理清楚。',
          approval: null,
          suggestions: ['先看今天待办', '帮我抓重点', '我有点乱'],
        });
      })
      .mockImplementationOnce(async (_path, _body, onEvent) => {
        onEvent({
          type: 'done',
          reply: '先做一件最重要的事。',
          approval: null,
          suggestions: ['帮我拆成步骤', '给我一个 30 分钟版本', '再简短一点'],
        });
      })
      .mockImplementationOnce(async (_path, body, onEvent) => {
        expect(body).toMatchObject({ message: '帮我拆成步骤' });
        onEvent({
          type: 'done',
          reply: '第一步先确定目标，第二步马上开做。',
          approval: null,
          suggestions: ['帮我安排时间', '生成待办', '继续压缩到一句话'],
        });
      });

    render(<CharaAgentOverlay />);

    await waitFor(() => expect(screen.getByText('你好，我们来把事情理清楚。')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('想让我现在帮你什么？'), {
      target: { value: '我现在该做什么' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '发送给 Dashboard Agent' }).closest('form')!);

    await waitFor(() => expect(screen.getByText('先做一件最重要的事。')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '帮我拆成步骤' }));

    await waitFor(() => expect(screen.getByText('第一步先确定目标，第二步马上开做。')).toBeInTheDocument());
    expect(screen.queryByText('先做一件最重要的事。')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '帮我拆成步骤' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '帮我安排时间' })).toBeInTheDocument();
  });

  it('shows approval card and confirms actions inline', async () => {
    apiSSE
      .mockImplementationOnce(async (_path, _body, onEvent) => {
        onEvent({
          type: 'done',
          reply: '你好，我已经在这里了。',
          approval: null,
          suggestions: ['删掉那个任务', '看一下今天安排', '帮我排序'],
        });
      })
      .mockImplementationOnce(async (_path, _body, onEvent) => {
        onEvent({ type: 'message_delta', delta: '我可以帮你删掉这个任务。' });
        onEvent({
          type: 'approval_required',
          approval: {
            type: 'approval_required',
            action_id: 'task.delete.prepare',
            data: { task_id: 'task-1' },
            title: '删除任务',
            message: '该操作需要你确认。',
            commit_action: 'task.delete.commit',
          },
        });
        onEvent({
          type: 'done',
          reply: '我已经为你准备好了确认。',
          approval: {
            type: 'approval_required',
            action_id: 'task.delete.prepare',
            data: { task_id: 'task-1' },
            title: '删除任务',
            message: '该操作需要你确认。',
            commit_action: 'task.delete.commit',
          },
          suggestions: ['继续别的事', '换个建议', '回到当前任务'],
        });
      });
    executeAgentAction.mockResolvedValue({ type: 'result', action_id: 'task.delete.commit', data: { ok: true } });

    render(<CharaAgentOverlay />);

    await waitFor(() => expect(screen.getByText('你好，我已经在这里了。')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('想让我现在帮你什么？'), {
      target: { value: '删掉那个任务' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '发送给 Dashboard Agent' }).closest('form')!);

    await waitFor(() => expect(screen.getByText('删除任务')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() =>
      expect(executeAgentAction).toHaveBeenCalledWith(
        'task.delete.commit',
        { task_id: 'task-1' },
        expect.objectContaining({ primaryAppId: 'dashboard' }),
      ),
    );
    expect(screen.getByText('确认已收到，操作已经执行完成。')).toBeInTheDocument();
    expect(screen.queryByText('该操作需要你确认。')).not.toBeInTheDocument();
  });
});
