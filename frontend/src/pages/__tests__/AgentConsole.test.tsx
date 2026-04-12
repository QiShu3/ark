import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import AgentConsole from '../AgentConsole';
import { useAuthStore } from '../../lib/auth';
import { apiJson } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

vi.mock('../../components/Navigation', () => ({
  default: () => <div data-testid="navigation">Navigation</div>,
}));

class MockAudio {
  static instances: MockAudio[] = [];

  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  currentTime = 0;
  src: string;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();

  constructor(src: string) {
    this.src = src;
    MockAudio.instances.push(this);
  }
}

class MockSourceBuffer {
  updating = false;
  mode = 'segments';
  appendBuffer = vi.fn((chunk: Uint8Array) => {
    void chunk;
    this.updateendHandler?.();
  });

  private updateendHandler: (() => void) | null = null;

  addEventListener(event: string, handler: () => void) {
    if (event === 'updateend') {
      this.updateendHandler = handler;
    }
  }
}

class MockMediaSource {
  static instances: MockMediaSource[] = [];
  static isTypeSupported = vi.fn(() => true);

  readyState = 'closed';
  sourceBuffers: MockSourceBuffer[] = [];

  private sourceopenHandler: (() => void) | null = null;

  constructor() {
    MockMediaSource.instances.push(this);
  }

  addEventListener(event: string, handler: () => void) {
    if (event === 'sourceopen') {
      this.sourceopenHandler = handler;
    }
  }

  addSourceBuffer() {
    const buffer = new MockSourceBuffer();
    this.sourceBuffers.push(buffer);
    return buffer;
  }

  endOfStream = vi.fn(() => {
    this.readyState = 'ended';
  });

  emitSourceOpen() {
    this.readyState = 'open';
    this.sourceopenHandler?.();
  }
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

describe('AgentConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockAudio.instances = [];
    MockMediaSource.instances = [];
    MockWebSocket.instances = [];

    useAuthStore.setState({
      token: 'token-123',
      expiresAt: Date.now() + 60_000,
      user: null,
    });

    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/api/pages/agent-console/session') {
        return {
          id: 'session-1',
          user_id: 1,
          profile_id: 'profile-1',
          name: 'Agent Console',
          workspace_path: '/tmp/session-1',
          status: 'idle',
          created_at: '2026-04-12T08:00:00Z',
          updated_at: '2026-04-12T08:00:00Z',
        };
      }

      if (url === '/api/sessions/session-1/messages') {
        return [];
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
    Object.defineProperty(window, 'Audio', {
      writable: true,
      value: MockAudio,
    });
    Object.defineProperty(globalThis, 'Audio', {
      writable: true,
      value: MockAudio,
    });
    Object.defineProperty(window, 'MediaSource', {
      writable: true,
      value: MockMediaSource,
    });
    Object.defineProperty(globalThis, 'MediaSource', {
      writable: true,
      value: MockMediaSource,
    });
    Object.defineProperty(window.URL, 'createObjectURL', {
      writable: true,
      value: vi.fn((value?: unknown) => {
        if (value instanceof MockMediaSource) {
          queueMicrotask(() => {
            value.emitSourceOpen();
          });
          return 'blob:tts-stream';
        }
        return 'blob:tts-audio';
      }),
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      writable: true,
      value: vi.fn(),
    });
  });

  it('plays streamed tts audio when the session enables auto play', async () => {
    render(<AgentConsole />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.open();
      socket.emit({
        type: 'connected',
        session_id: 'session-1',
        status: 'idle',
      });
      socket.emit({
        type: 'tts_state',
        session_id: 'session-1',
        tts: {
          enabled: true,
          provider: 'edge',
          voice: 'zh-CN-XiaoxiaoNeural',
          audio_format: 'mp3',
          auto_play: true,
          streaming_mode: 'buffered_chunk',
        },
      });
    });

    expect(await screen.findByText('tts: edge')).toBeInTheDocument();

    act(() => {
      socket.emit({
        type: 'tts_chunk_start',
        session_id: 'session-1',
        tts: {
          sequence_no: 1,
          text: '你好，世界',
          audio_format: 'mp3',
        },
      });
      socket.emit({
        type: 'tts_chunk_data',
        session_id: 'session-1',
        tts: {
          sequence_no: 1,
          audio_format: 'mp3',
          audio_b64: 'aGk=',
          is_final: true,
        },
      });
      socket.emit({
        type: 'tts_chunk_end',
        session_id: 'session-1',
        tts: {
          sequence_no: 1,
        },
      });
    });

    await waitFor(() => {
      expect(MockAudio.instances).toHaveLength(1);
      expect(MockAudio.instances[0].play).toHaveBeenCalledTimes(1);
    });
  });

  it('starts low-latency playback through MediaSource before the stream ends', async () => {
    render(<AgentConsole />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.open();
      socket.emit({
        type: 'connected',
        session_id: 'session-1',
        status: 'idle',
      });
      socket.emit({
        type: 'tts_state',
        session_id: 'session-1',
        tts: {
          enabled: true,
          provider: 'minimax',
          voice: 'voice-a',
          audio_format: 'aac',
          auto_play: true,
          streaming_mode: 'audio_stream',
        },
      });
      socket.emit({
        type: 'tts_chunk_start',
        session_id: 'session-1',
        tts: {
          sequence_no: 2,
          text: '流式音频',
          audio_format: 'aac',
        },
      });
      socket.emit({
        type: 'tts_chunk_data',
        session_id: 'session-1',
        tts: {
          sequence_no: 2,
          audio_format: 'aac',
          audio_b64: 'aGk=',
        },
      });
    });

    await waitFor(() => {
      expect(MockMediaSource.instances).toHaveLength(1);
      expect(MockAudio.instances).toHaveLength(1);
      expect(MockAudio.instances[0].play).toHaveBeenCalledTimes(1);
      expect(MockMediaSource.instances[0].sourceBuffers[0].appendBuffer).toHaveBeenCalledTimes(1);
    });
  });
});
