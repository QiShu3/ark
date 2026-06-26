import { useCallback, useEffect, useRef, useState } from 'react';
import { getPrimaryEvent } from '../lib/events/api';
import type { EventItem } from '../lib/events/types';

export function usePrimaryEvent(): {
  primaryEvent: EventItem | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [primaryEvent, setPrimaryEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const event = await getPrimaryEvent();
      if (!mountedRef.current) return;
      setPrimaryEvent(event);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      // 404 is expected when no primary event exists — not an error
      if (message === '主事件不存在' || message === 'HTTP 404') {
        setPrimaryEvent(null);
        setError(null);
      } else {
        setPrimaryEvent(null);
        setError(message);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { primaryEvent, loading, error, refetch };
}
