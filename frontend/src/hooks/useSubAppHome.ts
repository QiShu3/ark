import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseSubAppHomeConfig<TOverview, TConfig> {
  fetchOverview: () => Promise<TOverview>;
  fetchConfig: () => Promise<TConfig>;
  saveConfig: () => Promise<TConfig>;
  initTask?: () => Promise<TConfig>;
}

export interface UseSubAppHomeResult<TOverview, TConfig> {
  overview: TOverview | null;
  config: TConfig | null;
  error: string | null;
  busy: boolean;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  isSaving: boolean;
  save: () => Promise<void>;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSubAppHome<TOverview, TConfig>(
  cfg: UseSubAppHomeConfig<TOverview, TConfig>,
): UseSubAppHomeResult<TOverview, TConfig> {
  const [overview, setOverview] = useState<TOverview | null>(null);
  const [config, setConfig] = useState<TConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [ov, cfgData] = await Promise.all([cfg.fetchOverview(), cfg.fetchConfig()]);
      if (!mountedRef.current) return;
      setOverview(ov);
      setConfig(cfgData);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, [cfg.fetchOverview, cfg.fetchConfig]);

  // mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      const cfgData = await cfg.saveConfig();
      if (!mountedRef.current) return;
      setConfig(cfgData);
      setError(null);
      setSettingsOpen(false);
      // re-fetch overview after save
      const ov = await cfg.fetchOverview();
      if (!mountedRef.current) return;
      setOverview(ov);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  }, [cfg.saveConfig, cfg.fetchOverview]);

  const init = useCallback(async () => {
    if (!cfg.initTask) return;
    setBusy(true);
    try {
      const cfgData = await cfg.initTask();
      if (!mountedRef.current) return;
      setConfig(cfgData);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : '初始化失败');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [cfg.initTask]);

  return {
    overview,
    config,
    error,
    busy,
    settingsOpen,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    isSaving,
    save,
    init,
    refresh,
  };
}
