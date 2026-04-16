import { useCallback, useEffect, useRef, useState } from 'react';

export type TtsStatePayload = {
  enabled?: boolean;
  provider?: string | null;
  voice?: string | null;
  audio_format?: string | null;
  auto_play?: boolean;
  streaming_mode?: string | null;
  status?: string | null;
  error?: string | null;
};

export type TtsChunkPayload = {
  sequence_no?: number | null;
  text?: string;
  provider?: string | null;
  voice?: string | null;
  audio_format?: string | null;
  audio_b64?: string;
  reason?: string | null;
};

export type TtsPlaybackItem = {
  sequenceNo: number;
  text: string;
  audioFormat: string;
  useMediaSource: boolean;
  chunks: Uint8Array[];
  latestChunk: Uint8Array | null;
  appendQueue: Uint8Array[];
  ended: boolean;
  mediaSource: MediaSource | null;
  sourceBuffer: SourceBuffer | null;
  mediaSourceEnded: boolean;
};

export type TtsState = {
  enabled: boolean;
  provider: string | null;
  voice: string | null;
  audioFormat: string;
  autoPlay: boolean;
  streamingMode: string;
  status: string;
  error: string | null;
};

export const defaultTtsState: TtsState = {
  enabled: false,
  provider: null,
  voice: null,
  audioFormat: 'mp3',
  autoPlay: false,
  streamingMode: 'buffered_chunk',
  status: 'off',
  error: null,
};

export function decodeAudioBase64(audioB64: string) {
  const binary = atob(audioB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function hasSpokenContent(text: string) {
  return /[A-Za-z0-9\u3400-\u9FFF]/.test(text || '');
}

export function mimeTypeForAudioFormat(audioFormat: string) {
  if (audioFormat === 'wav') return 'audio/wav';
  return 'audio/mpeg';
}

export function canUseMediaSourceForFormat(audioFormat: string) {
  if (typeof MediaSource === 'undefined') {
    return false;
  }
  if (!audioFormat || ['mp3', 'wav'].includes(audioFormat.toLowerCase())) {
    return false;
  }
  return MediaSource.isTypeSupported(mimeTypeForAudioFormat(audioFormat));
}

export function useTts() {
  const [ttsState, setTtsState] = useState<TtsState>(defaultTtsState);
  const [ttsPlaybackEnabled, setTtsPlaybackEnabled] = useState(false);
  const [ttsPendingCount, setTtsPendingCount] = useState(0);

  const ttsStateRef = useRef(defaultTtsState);
  const ttsPlaybackEnabledRef = useRef(false);
  const ttsPreferenceLockedRef = useRef(false);
  const ttsQueueRef = useRef<number[]>([]);
  const ttsItemsRef = useRef<Map<number, TtsPlaybackItem>>(new Map());
  const currentTtsItemRef = useRef<TtsPlaybackItem | null>(null);
  const currentTtsAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentTtsAudioUrlRef = useRef<string | null>(null);
  const playNextTtsChunkRef = useRef<() => void>(() => {});

  const syncTtsPendingCount = useCallback(() => {
    setTtsPendingCount(
      ttsQueueRef.current.length + (currentTtsItemRef.current || currentTtsAudioRef.current ? 1 : 0),
    );
  }, []);

  const cleanupCurrentTtsAudio = useCallback(({ preserveItem = false }: { preserveItem?: boolean } = {}) => {
    const currentAudio = currentTtsAudioRef.current;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentTtsAudioRef.current = null;
    }
    if (currentTtsAudioUrlRef.current) {
      URL.revokeObjectURL(currentTtsAudioUrlRef.current);
      currentTtsAudioUrlRef.current = null;
    }
    if (!preserveItem) {
      currentTtsItemRef.current = null;
    }
  }, []);

  const finishCurrentTtsChunk = useCallback(() => {
    const finishedItem = currentTtsItemRef.current;
    cleanupCurrentTtsAudio();
    if (finishedItem) {
      ttsItemsRef.current.delete(finishedItem.sequenceNo);
    }
    syncTtsPendingCount();
    if (ttsPlaybackEnabledRef.current) {
      playNextTtsChunkRef.current();
    }
  }, [cleanupCurrentTtsAudio, syncTtsPendingCount]);

  const startBufferedTtsPlayback = useCallback(
    (item: TtsPlaybackItem) => {
      if (!hasSpokenContent(item.text)) {
        finishCurrentTtsChunk();
        return;
      }

      const playbackChunks =
        ttsStateRef.current.streamingMode === 'audio_stream' && item.latestChunk ? [item.latestChunk] : item.chunks;
      if (playbackChunks.length === 0) {
        syncTtsPendingCount();
        return;
      }

      const blob = new Blob(playbackChunks.map((chunk) => Uint8Array.from(chunk)), {
        type: mimeTypeForAudioFormat(item.audioFormat),
      });
      const audioUrl = URL.createObjectURL(blob);
      currentTtsAudioUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      currentTtsAudioRef.current = audio;
      audio.onended = () => {
        finishCurrentTtsChunk();
      };
      audio.onerror = () => {
        setTtsState((current) => ({ ...current, error: '音频播放失败，请检查浏览器音频输出。' }));
        finishCurrentTtsChunk();
      };
      void audio.play().catch((error) => {
        setTtsState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : '自动播放失败',
        }));
        finishCurrentTtsChunk();
      });
    },
    [finishCurrentTtsChunk, syncTtsPendingCount],
  );

  const finalizeCurrentMediaSourceIfReady = useCallback((item: TtsPlaybackItem) => {
    if (
      currentTtsItemRef.current !== item ||
      !item.useMediaSource ||
      !item.ended ||
      !item.mediaSource ||
      item.mediaSource.readyState !== 'open' ||
      !item.sourceBuffer ||
      item.sourceBuffer.updating ||
      item.appendQueue.length > 0 ||
      item.mediaSourceEnded
    ) {
      return;
    }
    try {
      item.mediaSource.endOfStream();
      item.mediaSourceEnded = true;
    } catch {
      // Ignore endOfStream failures and let the browser finish naturally.
    }
  }, []);

  const flushCurrentTtsAppendQueue = useCallback(
    (item: TtsPlaybackItem) => {
      if (currentTtsItemRef.current !== item || !item.sourceBuffer || item.sourceBuffer.updating) {
        return;
      }
      if (item.appendQueue.length === 0) {
        finalizeCurrentMediaSourceIfReady(item);
        return;
      }

      const nextChunk = item.appendQueue.shift();
      if (!nextChunk) {
        finalizeCurrentMediaSourceIfReady(item);
        return;
      }

      try {
        item.sourceBuffer.appendBuffer(Uint8Array.from(nextChunk));
      } catch {
        item.useMediaSource = false;
        cleanupCurrentTtsAudio({ preserveItem: true });
        startBufferedTtsPlayback(item);
      }
    },
    [cleanupCurrentTtsAudio, finalizeCurrentMediaSourceIfReady, startBufferedTtsPlayback],
  );

  const startStreamingTtsPlayback = useCallback(
    (item: TtsPlaybackItem) => {
      const mediaSource = new MediaSource();
      item.mediaSource = mediaSource;
      item.mediaSourceEnded = false;

      const audioUrl = URL.createObjectURL(mediaSource);
      currentTtsAudioUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      currentTtsAudioRef.current = audio;

      audio.onended = () => {
        finishCurrentTtsChunk();
      };
      audio.onerror = () => {
        setTtsState((current) => ({ ...current, error: '流式音频播放失败，已停止当前朗读。' }));
        finishCurrentTtsChunk();
      };

      mediaSource.addEventListener(
        'sourceopen',
        () => {
          if (currentTtsItemRef.current !== item || item.sourceBuffer) {
            return;
          }
          try {
            item.sourceBuffer = mediaSource.addSourceBuffer(mimeTypeForAudioFormat(item.audioFormat));
            item.sourceBuffer.mode = 'sequence';
            item.sourceBuffer.addEventListener('updateend', () => {
              flushCurrentTtsAppendQueue(item);
            });
            item.appendQueue.push(...item.chunks);
            flushCurrentTtsAppendQueue(item);
            finalizeCurrentMediaSourceIfReady(item);
          } catch {
            item.useMediaSource = false;
            cleanupCurrentTtsAudio({ preserveItem: true });
            startBufferedTtsPlayback(item);
          }
        },
        { once: true },
      );

      void audio.play().catch((error) => {
        setTtsState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : '自动播放失败',
        }));
        finishCurrentTtsChunk();
      });
    },
    [cleanupCurrentTtsAudio, finalizeCurrentMediaSourceIfReady, finishCurrentTtsChunk, flushCurrentTtsAppendQueue, startBufferedTtsPlayback],
  );

  const playNextTtsChunk = useCallback(() => {
    if (!ttsPlaybackEnabledRef.current || currentTtsAudioRef.current || currentTtsItemRef.current) {
      syncTtsPendingCount();
      return;
    }

    while (ttsQueueRef.current.length > 0) {
      const nextSequence = ttsQueueRef.current[0];
      const item = ttsItemsRef.current.get(nextSequence);
      if (!item) {
        ttsQueueRef.current.shift();
        continue;
      }

      ttsQueueRef.current.shift();
      currentTtsItemRef.current = item;
      syncTtsPendingCount();

      if (item.useMediaSource) {
        startStreamingTtsPlayback(item);
        return;
      }

      if (!hasSpokenContent(item.text)) {
        ttsItemsRef.current.delete(item.sequenceNo);
        currentTtsItemRef.current = null;
        continue;
      }

      if (!item.ended) {
        syncTtsPendingCount();
        return;
      }

      startBufferedTtsPlayback(item);
      return;
    }

    syncTtsPendingCount();
  }, [startBufferedTtsPlayback, startStreamingTtsPlayback, syncTtsPendingCount]);

  useEffect(() => {
    playNextTtsChunkRef.current = playNextTtsChunk;
  }, [playNextTtsChunk]);

  const stopTtsPlayback = useCallback((reason: string) => {
    ttsQueueRef.current = [];
    ttsItemsRef.current = new Map();
    cleanupCurrentTtsAudio();
    if (reason === 'muted') {
      setTtsState((current) => ({ ...current, status: 'muted' }));
    }
    syncTtsPendingCount();
  }, [cleanupCurrentTtsAudio, syncTtsPendingCount]);

  const toggleTtsPlayback = useCallback(() => {
    if (!ttsStateRef.current.enabled) {
      return;
    }
    ttsPreferenceLockedRef.current = true;
    const nextValue = !ttsPlaybackEnabledRef.current;
    ttsPlaybackEnabledRef.current = nextValue;
    setTtsPlaybackEnabled(nextValue);
    if (!nextValue) {
      stopTtsPlayback('muted');
      return;
    }
    setTtsState((current) => ({ ...current, status: 'ready', error: null }));
    playNextTtsChunk();
  }, [playNextTtsChunk, stopTtsPlayback]);

  const ensureAutoPlayReady = useCallback(() => {
    if (!ttsStateRef.current.enabled || !ttsStateRef.current.autoPlay || ttsPreferenceLockedRef.current) {
      return false;
    }
    if (ttsPlaybackEnabledRef.current) {
      return true;
    }

    ttsPlaybackEnabledRef.current = true;
    setTtsPlaybackEnabled(true);
    setTtsState((current) => ({ ...current, status: 'ready', error: null }));
    playNextTtsChunk();
    return true;
  }, [playNextTtsChunk]);

  useEffect(() => {
    ttsStateRef.current = ttsState;
  }, [ttsState]);

  useEffect(() => {
    ttsPlaybackEnabledRef.current = ttsPlaybackEnabled;
  }, [ttsPlaybackEnabled]);

  useEffect(() => {
    return () => {
      stopTtsPlayback('unmount');
    };
  }, [stopTtsPlayback]);

  const handleTtsMessage = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => {
      if (data.type === 'tts_state') {
        const nextState: TtsState = {
          enabled: Boolean(data.tts?.enabled),
          provider: data.tts?.provider || null,
          voice: data.tts?.voice || null,
          audioFormat: data.tts?.audio_format || 'mp3',
          autoPlay: Boolean(data.tts?.auto_play),
          streamingMode: data.tts?.streaming_mode || 'buffered_chunk',
          status: data.tts?.status || 'ready',
          error: data.tts?.error || null,
        };
        ttsStateRef.current = nextState;
        setTtsState(nextState);
        if (!ttsPreferenceLockedRef.current) {
          const shouldAutoPlay = nextState.enabled && nextState.autoPlay;
          ttsPlaybackEnabledRef.current = shouldAutoPlay;
          setTtsPlaybackEnabled(shouldAutoPlay);
          if (shouldAutoPlay) {
            playNextTtsChunk();
          }
        }
        return;
      }

      if (data.type === 'tts_chunk_start') {
        const sequenceNo = data.tts?.sequence_no;
        if (sequenceNo === undefined || sequenceNo === null) {
          return;
        }
        if (!ttsItemsRef.current.has(sequenceNo)) {
          const audioFormat = data.tts?.audio_format || ttsStateRef.current.audioFormat;
          ttsItemsRef.current.set(sequenceNo, {
            sequenceNo,
            text: data.tts?.text || '',
            audioFormat,
            useMediaSource:
              ttsStateRef.current.streamingMode === 'audio_stream' && canUseMediaSourceForFormat(audioFormat),
            chunks: [],
            latestChunk: null,
            appendQueue: [],
            ended: false,
            mediaSource: null,
            sourceBuffer: null,
            mediaSourceEnded: false,
          });
          ttsQueueRef.current.push(sequenceNo);
          syncTtsPendingCount();
        }
        if (ttsPlaybackEnabledRef.current) {
          playNextTtsChunk();
        }
        return;
      }

      if (data.type === 'tts_chunk_data') {
        const sequenceNo = data.tts?.sequence_no;
        if (sequenceNo === undefined || sequenceNo === null || !data.tts?.audio_b64) {
          return;
        }
        const existingItem = ttsItemsRef.current.get(sequenceNo) || {
          sequenceNo,
          text: data.tts?.text || '',
          audioFormat: data.tts?.audio_format || ttsStateRef.current.audioFormat,
          useMediaSource: false,
          chunks: [],
          latestChunk: null,
          appendQueue: [],
          ended: false,
          mediaSource: null,
          sourceBuffer: null,
          mediaSourceEnded: false,
        };
        const decodedChunk = decodeAudioBase64(data.tts.audio_b64);
        existingItem.chunks.push(decodedChunk);
        existingItem.latestChunk = decodedChunk;
        ttsItemsRef.current.set(sequenceNo, existingItem);
        if (existingItem === currentTtsItemRef.current && existingItem.useMediaSource && existingItem.sourceBuffer) {
          existingItem.appendQueue.push(decodedChunk);
          flushCurrentTtsAppendQueue(existingItem);
        } else if (
          existingItem === currentTtsItemRef.current &&
          !existingItem.useMediaSource &&
          existingItem.ended &&
          !currentTtsAudioRef.current
        ) {
          startBufferedTtsPlayback(existingItem);
          return;
        }
        if (ttsPlaybackEnabledRef.current && !currentTtsAudioRef.current && !currentTtsItemRef.current) {
          playNextTtsChunk();
        }
        syncTtsPendingCount();
        return;
      }

      if (data.type === 'tts_chunk_end') {
        const sequenceNo = data.tts?.sequence_no;
        if (sequenceNo === undefined || sequenceNo === null) {
          return;
        }
        const item = ttsItemsRef.current.get(sequenceNo);
        if (!item) {
          return;
        }
        item.ended = true;
        if (item === currentTtsItemRef.current && item.useMediaSource) {
          finalizeCurrentMediaSourceIfReady(item);
        } else if (item === currentTtsItemRef.current && !item.useMediaSource && !currentTtsAudioRef.current) {
          startBufferedTtsPlayback(item);
          return;
        }
        if (ttsPlaybackEnabledRef.current) {
          playNextTtsChunk();
        } else {
          syncTtsPendingCount();
        }
        return;
      }

      if (data.type === 'tts_stop') {
        stopTtsPlayback(data.tts?.reason || 'server_stop');
        return;
      }
    },
    [
      finalizeCurrentMediaSourceIfReady,
      flushCurrentTtsAppendQueue,
      playNextTtsChunk,
      startBufferedTtsPlayback,
      stopTtsPlayback,
      syncTtsPendingCount,
    ],
  );

  const resetTts = useCallback(() => {
    setTtsState(defaultTtsState);
    ttsStateRef.current = defaultTtsState;
    setTtsPlaybackEnabled(false);
    ttsPlaybackEnabledRef.current = false;
    ttsPreferenceLockedRef.current = false;
    stopTtsPlayback('reset');
  }, [stopTtsPlayback]);

  return {
    ttsState,
    ttsPlaybackEnabled,
    ttsPendingCount,
    toggleTtsPlayback,
    ensureAutoPlayReady,
    stopTtsPlayback,
    handleTtsMessage,
    resetTts,
  };
}
