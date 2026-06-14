import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import OverviewDetailModal, { type OverviewDetailTab } from '../../components/Vocab/OverviewDetailModal';
import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import SubAppConfigModal from '../../components/SubAppConfigModal';
import type { FocusWorkConfigFields } from '../../components/SubAppConfigModal';
import SubAppArrangements, { type SubAppTaskItemState } from '../../components/SubAppArrangements';
import SubAppHomeTemplate from '../../components/SubAppHomeTemplate';
import type { AppTaskRuntimeState, AppTaskStatus } from '../../components/taskTypes';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { apiJson } from '../../lib/api';
import { fetchVocabAppTaskStatus, fetchVocabOverview, fetchVocabToday, initializeVocabAppTask, updateVocabTodaySettings } from '../../lib/vocab/api';
import type { VocabOverview, VocabTodaySummary } from '../../lib/vocab/types';
import { BookOpen, Clock } from 'lucide-react';

function stateToArrangementState(state: AppTaskRuntimeState | undefined, isTodayComplete: boolean): SubAppTaskItemState {
  if (state === 'completed_today' || isTodayComplete) return 'completed';
  if (state === 'ready') return 'ready';
  if (state === 'uninitialized') return 'uninitialized';
  if (state === 'event_not_configured') return 'unconfigured';
  if (state === 'config_invalid') return 'config_invalid';
  return 'blocked';
}

function stateToStatusLabel(state: AppTaskRuntimeState | undefined, isTodayComplete: boolean) {
  if (state === 'completed_today' || isTodayComplete) return 'completed';
  if (state === 'ready') return 'ready';
  if (state === 'uninitialized') return '未初始化';
  if (state === 'event_not_configured') return '未配置';
  if (state === 'config_invalid') return '配置异常';
  if (state === 'no_primary_event') return '需要主事件';
  return 'blocked';
}

function eventStatusLabel(status: AppTaskStatus | null, hasEventAppConfig: boolean) {
  if (!status) return '读取配置中';
  if (status.state === 'no_primary_event') return '未绑定计划事件';
  if (status.state === 'event_not_configured') return '待配置计划事件';
  if (hasEventAppConfig) return '已绑定计划事件';
  return '待初始化计划事件';
}

export default function VocabHome() {
  const navigate = useNavigate();
  const {
    decks,
    activeDeck,
    activeDeckVersion,
    inheritancePrompt,
    setActiveDeck,
    confirmInheritance,
    dismissInheritance,
    loading,
    error,
  } = useVocabDeck();
  const [summary, setSummary] = useState<VocabTodaySummary | null>(null);
  const [overview, setOverview] = useState<VocabOverview | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [appTaskStatus, setAppTaskStatus] = useState<AppTaskStatus | null>(null);
  const [appTaskBusy, setAppTaskBusy] = useState(false);
  const [appTaskError, setAppTaskError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [overviewDetailOpen, setOverviewDetailOpen] = useState(false);
  const [overviewDetailTab, setOverviewDetailTab] = useState<OverviewDetailTab>('completed');
  const [overviewDetailDeckId, setOverviewDetailDeckId] = useState<string | null>(null);

  // config modal local state (was in TodayPlanModal)
  const [targetCountValue, setTargetCountValue] = useState('');
  const [vocabFocusDuration, setVocabFocusDuration] = useState(25); // minutes
  const [vocabAddToTodayPlan, setVocabAddToTodayPlan] = useState(true);
  const isTodayComplete = !!summary && summary.total_count > 0 && summary.pending_count === 0;
  const modalInitialTarget = summary ? (isTodayComplete ? summary.total_count + summary.daily_target_count : summary.daily_target_count) : 20;
  const hasEventAppConfig = appTaskStatus
    ? !['no_primary_event', 'event_not_configured', 'uninitialized', 'config_invalid'].includes(appTaskStatus.state)
    : false;
  const currentEventName = appTaskStatus?.event_name ?? null;
  const appConfigNotice = currentEventName ? `该配置会同步到当前主事件「${currentEventName}」。` : null;
  const todayProgressPercent = summary && summary.total_count > 0
    ? Math.round((summary.completed_count / summary.total_count) * 100)
    : 0;
  const currentDeckMasteryPercent = overview && overview.current_deck.total_word_count > 0
    ? Math.round((overview.current_deck.mastered_word_count / overview.current_deck.total_word_count) * 100)
    : 0;
  const currentDeckSegmentPercent = (count: number) => {
    const total = overview?.current_deck.total_word_count ?? 0;
    return total > 0 ? `${(count / total) * 100}%` : '0%';
  };

  useEffect(() => {
    let cancelled = false;

    if (!activeDeck) {
      setSummary(null);
      setOverview(null);
      return;
    }

    Promise.all([fetchVocabToday(activeDeck.id), fetchVocabOverview(activeDeck.id)])
      .then(([todayPayload, overviewPayload]) => {
        if (cancelled) return;
        setSummary(todayPayload);
        setOverview(overviewPayload);
        setSummaryError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSummaryError(err instanceof Error ? err.message : '今日概览加载失败');
      });

    return () => {
      cancelled = true;
    };
  }, [activeDeck, activeDeckVersion]);

  useEffect(() => {
    let cancelled = false;
    fetchVocabAppTaskStatus()
      .then((payload) => {
        if (cancelled) return;
        setAppTaskStatus(payload);
        setAppTaskError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAppTaskError(err instanceof Error ? err.message : '应用任务状态加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // sync config modal state from backend
  useEffect(() => {
    if (appTaskStatus?.config) {
      const cfg = appTaskStatus.config as Record<string, unknown>;
      if (typeof cfg.default_focus_duration === 'number') {
        setVocabFocusDuration(Math.round(cfg.default_focus_duration / 60));
      }
      if (typeof cfg.add_to_today_plan === 'boolean') {
        setVocabAddToTodayPlan(cfg.add_to_today_plan);
      }
    }
    const target = summary ? (isTodayComplete ? summary.total_count + summary.daily_target_count : summary.daily_target_count) : 20;
    setTargetCountValue(String(target));
  }, [appTaskStatus?.config, summary?.daily_target_count, isTodayComplete]);

  const vocabTotalTargetCount = (() => {
    const parsed = Number(targetCountValue);
    return targetCountValue === '' || !Number.isFinite(parsed) ? 0 : Math.max(1, parsed);
  })();

  const handleSaveSettings = async () => {
    const totalTargetCount = vocabTotalTargetCount || 20;
    const focusDuration = vocabFocusDuration * 60;
    if (!activeDeck) return;
    setSettingsSaving(true);
    try {
      const payload = await updateVocabTodaySettings(activeDeck.id, { total_target_count: totalTargetCount });
      setSummary(payload);
      setSummaryError(null);

      const initPayload = await initializeVocabAppTask({
        deck_id: activeDeck.id,
        daily_target_count: totalTargetCount,
        default_focus_duration: focusDuration,
        add_to_today_plan: true,
      });
      setAppTaskStatus(initPayload);
      setAppTaskError(null);

      setSettingsOpen(false);
      const overviewPayload = await fetchVocabOverview(activeDeck.id);
      setOverview(overviewPayload);
      if (payload.pending_count > 0 && isTodayComplete) {
        navigate('/vocab/today');
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : '今日单词配置保存失败');
    } finally {
      setSettingsSaving(false);
    }
  };

  const openOverviewDetail = (tab: OverviewDetailTab, targetDeckId?: string | null) => {
    if (!activeDeck) return;
    setOverviewDetailTab(tab);
    setOverviewDetailDeckId(targetDeckId ?? activeDeck.id);
    setOverviewDetailOpen(true);
  };

  const initializeTodayWords = async () => {
    if (!activeDeck) return;
    setAppTaskBusy(true);
    try {
      const payload = await initializeVocabAppTask({
        deck_id: activeDeck.id,
        daily_target_count: summary?.daily_target_count || 20,
        default_focus_duration: 1500,
        add_to_today_plan: true,
      });
      setAppTaskStatus(payload);
      setAppTaskError(null);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '初始化今日单词失败');
    } finally {
      setAppTaskBusy(false);
    }
  };

  const startTodayFocusWork = async () => {
    if (!appTaskStatus?.task_id) return;
    setAppTaskBusy(true);
    try {
      await apiJson(`/todo/tasks/${appTaskStatus.task_id}/focus/start`, { method: 'POST' });
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      setAppTaskError(null);
    } catch (err) {
      setAppTaskError(err instanceof Error ? err.message : '开始今日单词失败');
    } finally {
      setAppTaskBusy(false);
    }
  };

  const vocabTaskState = stateToArrangementState(appTaskStatus?.state, isTodayComplete);
  const vocabTaskStatusLabel = stateToStatusLabel(appTaskStatus?.state, isTodayComplete);
  const completedOrDone = appTaskStatus?.state === 'completed_today' || isTodayComplete;
  const appTaskAction =
    appTaskStatus?.state === 'event_not_configured' || appTaskStatus?.state === 'config_invalid' || completedOrDone
      ? {
          label: '配置',
          disabled: !activeDeck || appTaskBusy,
          action: () => setSettingsOpen(true),
        }
      : appTaskStatus?.state === 'uninitialized'
        ? {
            label: '初始化',
            disabled: !activeDeck || appTaskBusy,
            action: initializeTodayWords,
          }
        : appTaskStatus?.state === 'ready'
          ? {
              label: summary && summary.completed_count > 0 ? '继续' : '开始',
              disabled: !appTaskStatus.task_id || appTaskBusy,
              action: startTodayFocusWork,
            }
          : {
              label: '不可用',
              disabled: true,
              action: undefined,
            };
  const appTaskDisabledReason = appTaskStatus?.state === 'no_primary_event'
    ? '请先创建或设置主事件。'
    : appTaskStatus?.blocked_reason ?? null;
  const vocabTasks = [
    {
      id: 'vocab_today',
      name: '今日单词',
      focusWorkName: '今日单词',
      isInitialized: hasEventAppConfig,
      isSynced: true,
      showSyncToggle: false,
      state: vocabTaskState,
      statusLabel: vocabTaskStatusLabel,
      primaryActionLabel: appTaskAction.label,
      primaryActionDisabled: appTaskAction.disabled,
      onPrimaryAction: appTaskAction.action,
      disabledReason: appTaskDisabledReason,
    },
  ];
  const eventLabel = appTaskStatus?.state === 'no_primary_event'
    ? '计划事件：未绑定'
    : currentEventName ? `计划事件：${currentEventName}` : '计划事件：当前主事件';
  const eventNotConfiguredMessage = appTaskStatus?.event_name
    ? `当前主事件「${appTaskStatus.event_name}」尚未配置今日单词，请通过右上角“配置”完成初始化。`
    : '当前主事件尚未配置今日单词，请通过右上角“配置”完成初始化。';
  const overviewMetrics = [
    { label: '今日进度', value: summary ? `${summary.completed_count} / ${summary.total_count}` : '--', detail: `${todayProgressPercent}%` },
    { label: '待完成', value: summary ? summary.pending_count : '--', detail: 'remaining' },
    { label: '新词', value: summary ? summary.new_count : '--', detail: 'new' },
    { label: '复习', value: summary ? summary.review_count : '--', detail: 'review' },
  ];
  const vocabPrimaryActionLabel =
    appTaskAction.label === '开始'
      ? '开始今日单词'
      : appTaskAction.label === '继续'
        ? '继续今日单词'
        : appTaskAction.label === '初始化'
          ? '初始化今日单词'
          : appTaskAction.label === '配置'
            ? '调整今日单词'
            : appTaskAction.label;
  const vocabAssetContent = overview ? (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => openOverviewDetail('completed')}
          className="ark-subapp-asset-card rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]"
        >
          <div className="text-sm text-[var(--ark-text-muted)]">已完成词书</div>
          <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.completed_deck_count} / {overview.total_deck_count} 本</div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">全部单词都已进入 Review 状态的词书数量。</div>
        </button>
        <button
          type="button"
          onClick={() => openOverviewDetail('mastered')}
          className="ark-subapp-asset-card rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]"
        >
          <div className="text-sm text-[var(--ark-text-muted)]">累计掌握单词</div>
          <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.mastered_word_count}</div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">按 FSRS Review 口径统计的全局已掌握单词总数。</div>
        </button>
      </div>

      <button
        type="button"
        onClick={() => openOverviewDetail('current', activeDeck?.id)}
        className="ark-subapp-asset-card w-full rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm text-[var(--ark-text-muted)]">当前词书掌握度</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">{overview.current_deck.deck_name}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-sm text-[var(--ark-text-muted)]">已掌握</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">
              {overview.current_deck.mastered_word_count} / {overview.current_deck.total_word_count}
            </div>
          </div>
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-ark-surface-subtle">
          <div
            className="ark-subapp-asset-progress h-full rounded-full transition-[width] duration-300"
            style={{ width: `${currentDeckMasteryPercent}%` }}
          />
        </div>

        <div className="ark-subapp-asset-soft mt-5 rounded-lg border p-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-ark-surface-subtle" aria-hidden="true">
            <div className="ark-subapp-asset-segment-unstarted" style={{ width: currentDeckSegmentPercent(overview.current_deck.unstarted_word_count) }} />
            <div className="ark-subapp-asset-segment-learning" style={{ width: currentDeckSegmentPercent(overview.current_deck.learning_word_count) }} />
            <div className="ark-subapp-asset-segment-mastered" style={{ width: currentDeckSegmentPercent(overview.current_deck.mastered_word_count) }} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--ark-surface)] px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-[var(--ark-text-muted)]">
                <span className="ark-subapp-asset-segment-unstarted h-2.5 w-2.5 rounded-full" />
                未开始
              </div>
              <div className="text-lg font-semibold text-[var(--ark-text)]">{overview.current_deck.unstarted_word_count}</div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--ark-surface)] px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-[var(--ark-text-muted)]">
                <span className="ark-subapp-asset-segment-learning h-2.5 w-2.5 rounded-full" />
                学习中
              </div>
              <div className="text-lg font-semibold text-[var(--ark-text)]">{overview.current_deck.learning_word_count}</div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--ark-surface)] px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-[var(--ark-text-muted)]">
                <span className="ark-subapp-asset-segment-mastered h-2.5 w-2.5 rounded-full" />
                已掌握
              </div>
              <div className="text-lg font-semibold text-[var(--ark-text)]">{overview.current_deck.mastered_word_count}</div>
            </div>
          </div>
        </div>
      </button>
    </div>
  ) : (
    <p className="text-sm text-[var(--ark-text-muted)]">学习资产加载中…</p>
  );

  return (
    <SubAppHomeTemplate
      eyebrow="Vocabulary"
      title="背单词"
      statusLabel={eventStatusLabel(appTaskStatus, hasEventAppConfig)}
      metaItems={[eventLabel, `当前词书：${activeDeck?.name ?? '未选择词书'}`]}
      configureAction={{ label: '配置', onClick: () => setSettingsOpen(true), disabled: !activeDeck }}
      heroLabel="今日单词任务"
      heroValue={summary ? `${summary.completed_count} / ${summary.total_count}` : '--'}
      heroDetail={activeDeck ? '复习与新词会按今日计划自动衔接。' : '请选择词书后开始今日学习'}
      heroProgressPercent={todayProgressPercent}
      heroProgressLabel="今日完成度"
      primaryAction={{
        label: vocabPrimaryActionLabel,
        disabled: appTaskAction.disabled,
        onClick: appTaskAction.action,
      }}
      metrics={overviewMetrics}
      assetEyebrow="Learning Assets"
      assetTitle="长期积累"
      assetDescription="词书完成度、全局掌握量与当前词书阶段都收束在这里。"
      assetContent={vocabAssetContent}
      arrangements={<SubAppArrangements tasks={vocabTasks} isBusy={appTaskBusy} />}
      feedback={(
        <>
          {loading ? <p className="text-sm text-[var(--ark-text-muted)]">词书加载中…</p> : null}
          {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          {appTaskError ? <p className="text-sm text-rose-200">{appTaskError}</p> : null}
          {appTaskStatus?.state === 'event_not_configured' ? (
            <p className="ark-annotation rounded-lg px-3 py-2">{eventNotConfiguredMessage}</p>
          ) : appTaskStatus?.state === 'no_primary_event' ? (
            <p className="ark-annotation rounded-lg px-3 py-2">请先创建或设置主事件，再配置今日单词。</p>
          ) : null}
          {summaryError ? <p className="text-sm text-rose-200">{summaryError}</p> : null}
        </>
      )}
      modals={(
        <>
          <SubAppConfigModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            onSave={handleSaveSettings}
            isSaving={settingsSaving}
            appName="背单词"
            eventName={currentEventName}
            description={isTodayComplete ? '今天这本词书已经完成，可调整目标继续再来一轮。' : '配置词书上下文、今日目标和默认专注时长。'}
            saveError={summaryError}
            saveLabel={isTodayComplete ? '保存并继续' : undefined}
            focusWorks={[
              {
                id: 'vocab_today',
                label: '今日单词',
                enabled: true,
                onEnabledChange: () => {},
                showEnableToggle: false,
                contentConfig: (
                  <div className="space-y-4">
                    {decks && activeDeck ? (
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <BookOpen className="h-5 w-5 text-[var(--ark-accent)]" />
                          <span className="text-sm font-medium text-ark-text">词书上下文</span>
                        </div>
                        <DeckSwitcher
                          decks={decks}
                          activeDeck={activeDeck}
                          onChange={setActiveDeck}
                          inheritancePrompt={inheritancePrompt}
                          onConfirmInheritance={confirmInheritance}
                          onDismissInheritance={dismissInheritance}
                        />
                      </div>
                    ) : null}
                    <div>
                      <label htmlFor="vocab-today-target" className="mb-2 block text-xs text-ark-text-muted">
                        今日总量
                      </label>
                      <input
                        id="vocab-today-target"
                        type="number"
                        min={1}
                        max={500}
                        value={targetCountValue}
                        onChange={(e) => setTargetCountValue(e.target.value)}
                        className="w-full rounded-lg border border-ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-ark-text outline-none transition focus:border-[var(--ark-border-strong)]"
                      />
                    </div>
                  </div>
                ),
                defaultFocusDuration: vocabFocusDuration,
                onFocusDurationChange: setVocabFocusDuration,
                addToTodayPlan: vocabAddToTodayPlan,
                onAddToTodayPlanChange: setVocabAddToTodayPlan,
                showSyncToggle: false,
              } as FocusWorkConfigFields,
            ]}
          />
          {activeDeck ? (
            <OverviewDetailModal
              isOpen={overviewDetailOpen}
              baseDeckId={activeDeck.id}
              initialTab={overviewDetailTab}
              initialTargetDeckId={overviewDetailDeckId}
              onClose={() => setOverviewDetailOpen(false)}
            />
          ) : null}
        </>
      )}
    />
  );
}
