import { StrictMode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { useAgentChat } from './useAgentChat';
import { useAuthStore } from '../lib/auth';
import { apiJson } from '../lib/api';

vi.mock('../lib/api', () => ({
  apiJson: vi.fn(),
}));

vi.mock('./useTts', () => ({
  useTts: () => ({
    ttsState: {
      enabled: false,
      provider: null,
      voice: null,
      audioFormat: 'mp3',
      autoPlay: false,
      streamingMode: 'buffered_chunk',
      status: 'off',
      error: null,
    },
    ttsPlaybackEnabled: false,
    ttsPendingCount: 0,
    toggleTtsPlayback: vi.fn(),
    stopTtsPlayback: vi.fn(),
    handleTtsMessage: vi.fn(),
    resetTts: vi.fn(),
  }),
}));

type HarnessProps = {
  profileKey?: string;
};

function Harness({ profileKey = 'MainAgent' }: HarnessProps) {
  useAgentChat(profileKey);
  return <div data-testid="harness">ready</div>;
}

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emit(packet: unknown) {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify(packet),
      }),
    );
  }
}

describe('useAgentChat auto open', () => {
  const AUTO_OPEN_STORAGE_KEY = 'ark:auto-open:MainAgent:last-run-started-at';
  let currentSessionStatus = 'idle';
  let currentHistory: Array<{
    id: string | null;
    session_id: string;
    role: string;
    content: string;
    event_type?: string | null;
    created_at: string;
  }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.location.hash = '#/';
    currentSessionStatus = 'idle';
    currentHistory = [];
    MockWebSocket.instances = [];

    useAuthStore.setState({
      token: 'token-123',
      expiresAt: Date.now() + 60_000,
      user: null,
    });

    (apiJson as Mock).mockImplementation(async (url: string) => {
      const profileSessionMatch = url.match(/^\/api\/pages\/([^/]+)\/session$/);
      if (profileSessionMatch) {
        const profileKey = profileSessionMatch[1];
        return {
          id: profileKey === 'MainAgent' ? 'session-main' : `session-${profileKey}`,
          user_id: 1,
          profile_id: `profile-${profileKey}`,
          name: `${profileKey} Session`,
          workspace_path: `/tmp/${profileKey}`,
          status: currentSessionStatus,
          created_at: '2026-04-12T08:00:00Z',
          updated_at: '2026-04-12T08:00:00Z',
        };
      }

      if (url.startsWith('/api/sessions/') && url.endsWith('/messages')) {
        return currentHistory;
      }

      throw new Error(`Unexpected apiJson call: ${url}`);
    });

    Object.defineProperty(window, 'WebSocket', {
      writable: true,
      value: MockWebSocket,
    });
    Object.defineProperty(globalThis, 'WebSocket', {
      writable: true,
      value: MockWebSocket,
    });
  });

  it('auto opens MainAgent on the home page even with history and persists cooldown after run start', async () => {
    currentHistory = [
      {
        id: 'msg-1',
        session_id: 'session-main',
        role: 'assistant_message',
        content: '旧消息',
        event_type: 'assistant_message',
        created_at: '2026-04-12T08:00:00Z',
      },
    ];

    render(<Harness />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.open();
    });

    await waitFor(() => {
      expect(socket.sent).toHaveLength(1);
    });

    const sentPayload = JSON.parse(socket.sent[0]) as { type: string; content: string };
    expect(sentPayload.type).toBe('run');
    expect(sentPayload.content).toContain('来源：home_auto_open');
    expect(sentPayload.content).toContain('不要把这次开场说成第一次见面');

    act(() => {
      socket.emit({
        type: 'run_started',
        session_id: 'session-main',
      });
    });

    await waitFor(() => {
      const persisted = window.localStorage.getItem(AUTO_OPEN_STORAGE_KEY);
      expect(persisted).not.toBeNull();
      expect(JSON.parse(persisted || '{}')).toMatchObject({
        source: 'home_auto_open',
        profileKey: 'MainAgent',
      });
    });
  });

  it('does not auto open when the cooldown window is still active', async () => {
    window.localStorage.setItem(
      AUTO_OPEN_STORAGE_KEY,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: 'home_auto_open',
        profileKey: 'MainAgent',
      }),
    );

    render(<Harness />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    act(() => {
      MockWebSocket.instances[0].open();
    });

    await waitFor(() => {
      expect(MockWebSocket.instances[0].readyState).toBe(MockWebSocket.OPEN);
    });

    expect(MockWebSocket.instances[0].sent).toHaveLength(0);
  });

  it('waits for a restored running session to finish before auto opening', async () => {
    currentSessionStatus = 'running';

    render(<Harness />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.open();
    });

    await waitFor(() => {
      expect(socket.readyState).toBe(MockWebSocket.OPEN);
    });

    expect(socket.sent).toHaveLength(0);

    act(() => {
      socket.emit({
        type: 'run_completed',
        session_id: 'session-main',
      });
    });

    await waitFor(() => {
      expect(socket.sent).toHaveLength(1);
    });
  });

  it('does not auto open for MainAgent consumers outside the home route', async () => {
    window.location.hash = '#/apps';

    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    const activeSocket = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      activeSocket?.open();
    });

    await waitFor(() => {
      expect(activeSocket?.readyState).toBe(MockWebSocket.OPEN);
    });

    const sentCount = MockWebSocket.instances.reduce((sum, socket) => sum + socket.sent.length, 0);
    expect(sentCount).toBe(0);
  });
});
