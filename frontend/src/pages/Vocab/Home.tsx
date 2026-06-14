import { useEffect, useRef, useState } from 'react';

import OverviewDetailModal, { type OverviewDetailTab } from '../../components/Vocab/OverviewDetailModal';
import DeckSwitcher from '../../components/Vocab/DeckSwitcher';
import SubAppConfigModal from '../../components/SubAppConfigModal';
import type { FocusWorkConfigFields } from '../../components/SubAppConfigModal';
import SubAppArrangements, { type SubAppTaskItemState } from '../../components/SubAppArrangements';
import SubAppHomeTemplate from '../../components/SubAppHomeTemplate';
import type { AppTaskRuntimeState, AppTaskStatus } from '../../components/taskTypes';
import { useSubAppHome } from '../../hooks/useSubAppHome';
import { useVocabDeck } from '../../hooks/vocab/useVocabDeck';
import { apiJson } from '../../lib/api';
import { fetchVocabAppTaskStatus, fetchVocabOverview, fetchVocabToday, initializeVocabAppTask, updateVocabTodaySettings } from '../../lib/vocab/api';
import type { VocabOverview, VocabTodaySummary } from '../../lib/vocab/types';
import { BookOpen } from 'lucide-react';

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
  const {
    decks,
    activeDeck,
    activeDeckVersion,
    inheritancePrompt,
    setActiveDeck,
    confirmInheritance,
    dismissInheritance,
    loading: deckLoading,
    error: deckError,
  } = useVocabDeck();

  // long-term overview (asset section only)
  const [ltOverview, setLtOverview] = useState<VocabOverview | null>(null);

  // config modal form state (before hook so refs are available)
  const [targetCountValue, setTargetCountValue] = useState('');
  const [vocabFocusDuration, setVocabFocusDuration] = useState(25);
  const [vocabAddToTodayPlan, setVocabAddToTodayPlan] = useState(true);

  // refs for values needed in hook callbacks (avoids circular dep)
  const targetRef = useRef(20);
  const focusDurationRef = useRef(1500);

  const getTotalTarget = () => {
    const parsed = Number(targetCountValue);
    return targetCountValue === '' || !Number.isFinite(parsed) ? 0 : Math.max(1, parsed);
  };

  // shared home state via hook
  const home = useSubAppHome<VocabTodaySummary, AppTaskStatus>({
    fetchOverview: () => (activeDeck ? fetchVocabToday(activeDeck.id) : Promise.reject(new Error('no deck'))),
    fetchConfig: fetchVocabAppTaskStatus,
    saveConfig: async () => {
      if (!activeDeck) throw new Error('no deck');
      await updateVocabTodaySettings(activeDeck.id, { total_target_count: targetRef.current || 20 });
      return initializeVocabAppTask({
        deck_id: activeDeck.id,
        daily_target_count: targetRef.current || 20,
        default_focus_duration: focusDurationRef.current,
        add_to_today_plan: true,
      });
    },
    initTask: async () => {
      if (!activeDeck) throw new Error('no deck');
      return initializeVocabAppTask({
        deck_id: activeDeck.id,
        daily_target_count: targetRef.current || 20,
        default_focus_duration: 1500,
        add_to_today_plan: true,
      });
    },
  });

  // keep refs in sync
  targetRef.current = getTotalTarget() || Number(targetCountValue) || 20;
  focusDurationRef.current = vocabFocusDuration * 60;

  // fetch long-term overview
  useEffect(() => {
    if (!activeDeck) { setLtOverview(null); return; }
    let cancelled = false;
    fetchVocabOverview(activeDeck.id).then((o) => { if (!cancelled) setLtOverview(o); }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeDeck, activeDeckVersion, home.config]);

  // overview detail modal
  const [overviewDetailOpen, setOverviewDetailOpen] = useState(false);
  const [overviewDetailTab, setOverviewDetailTab] = useState<OverviewDetailTab>('completed');
  const [overviewDetailDeckId, setOverviewDetailDeckId] = useState<string | null>(null);

  const summary = home.overview;
  const appTaskStatus = home.config;
  const isTodayComplete = !!summary && summary.total_count > 0 && summary.pending_count === 0;

  // sync config form state
  useEffect(() => {
    if (appTaskStatus?.config) {
      const cfg = appTaskStatus.config as Record<string, unknown>;
      if (typeof cfg.default_focus_duration === 'number') setVocabFocusDuration(Math.round(cfg.default_focus_duration / 60));
      if (typeof cfg.add_to_today_plan === 'boolean') setVocabAddToTodayPlan(cfg.add_to_today_plan);
    }
    const target = summary ? (isTodayComplete ? summary.total_count + summary.daily_target_count : summary.daily_target_count) : 20;
    setTargetCountValue(String(target));
  }, [appTaskStatus?.config, summary?.daily_target_count, isTodayComplete]);

  const vocabTotalTargetCount = (() => {
    const parsed = Number(targetCountValue);
    return targetCountValue === '' || !Number.isFinite(parsed) ? 0 : Math.max(1, parsed);
  })();

  const hasEventAppConfig = appTaskStatus
    ? !['no_primary_event', 'event_not_configured', 'uninitialized', 'config_invalid'].includes(appTaskStatus.state)
    : false;
  const currentEventName = appTaskStatus?.event_name ?? null;
  const todayProgressPercent = summary && summary.total_count > 0
    ? Math.round((summary.completed_count / summary.total_count) * 100)
    : 0;
  const currentDeckMasteryPercent = ltOverview && ltOverview.current_deck.total_word_count > 0
    ? Math.round((ltOverview.current_deck.mastered_word_count / ltOverview.current_deck.total_word_count) * 100)
    : 0;
  const currentDeckSegmentPercent = (count: number) => {
    const total = ltOverview?.current_deck.total_word_count ?? 0;
    return total > 0 ? `${(count / total) * 100}%` : '0%';
  };

  const doStartFocus = async () => {
    if (!appTaskStatus?.task_id) return;
    try {
      await apiJson(`/todo/tasks/${appTaskStatus.task_id}/focus/start`, { method: 'POST' });
      window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    } catch { /* error shown in feedback */ }
  };

  const vocabTaskState = stateToArrangementState(appTaskStatus?.state, isTodayComplete);
  const verb = summary && summary.completed_count > 0 ? '继续' : '开始';
  const appTaskAction =
    appTaskStatus?.state === 'event_not_configured' || appTaskStatus?.state === 'config_invalid' || appTaskStatus?.state === 'completed_today' || isTodayComplete
      ? { label: '配置', disabled: !activeDeck || home.busy, action: home.openSettings }
      : appTaskStatus?.state === 'uninitialized'
        ? { label: '初始化', disabled: !activeDeck || home.busy, action: home.init }
        : appTaskStatus?.state === 'ready'
          ? { label: verb, disabled: !appTaskStatus.task_id || home.busy, action: doStartFocus }
          : { label: '不可用', disabled: true, action: undefined };
  const appTaskDisabledReason = appTaskStatus?.state === 'no_primary_event'
    ? '请先创建或设置主事件。'
    : appTaskStatus?.blocked_reason ?? null;
  const vocabTasks = [{
    id: 'vocab_today', name: '今日单词', focusWorkName: '今日单词',
    isInitialized: hasEventAppConfig, isSynced: true, showSyncToggle: false,
    state: vocabTaskState,
    statusLabel: stateToStatusLabel(appTaskStatus?.state, isTodayComplete),
    primaryActionLabel: appTaskAction.label,
    primaryActionDisabled: appTaskAction.disabled,
    onPrimaryAction: appTaskAction.action,
    disabledReason: appTaskDisabledReason,
  }];
  const eventLabel = appTaskStatus?.state === 'no_primary_event'
    ? '计划事件：未绑定' : currentEventName ? `计划事件：${currentEventName}` : '计划事件：当前主事件';
  const eventNotConfiguredMessage = appTaskStatus?.event_name
    ? `当前主事件「${appTaskStatus.event_name}」尚未配置今日单词，请通过右上角“配置”完成初始化。`
    : '当前主事件尚未配置今日单词，请通过右上角“配置”完成初始化。';
  const overviewMetrics = [
    { label: '今日进度', value: summary ? `${summary.completed_count} / ${summary.total_count}` : '--', detail: `${todayProgressPercent}%` },
    { label: '待完成', value: summary ? summary.pending_count : '--', detail: 'remaining' },
    { label: '新词', value: summary ? summary.new_count : '--', detail: 'new' },
    { label: '复习', value: summary ? summary.review_count : '--', detail: 'review' },
  ];
  const primaryActionLabel =
    appTaskAction.label === '开始' ? '开始今日单词' : appTaskAction.label === '继续' ? '继续今日单词'
      : appTaskAction.label === '初始化' ? '初始化今日单词' : appTaskAction.label === '配置' ? '调整今日单词' : appTaskAction.label;

  const openOverviewDetail = (tab: OverviewDetailTab, targetDeckId?: string | null) => {
    if (!activeDeck) return;
    setOverviewDetailTab(tab);
    setOverviewDetailDeckId(targetDeckId ?? activeDeck.id);
    setOverviewDetailOpen(true);
  };

  const vocabAssetContent = ltOverview ? (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <button type="button" onClick={() => openOverviewDetail('completed')} className="ark-subapp-asset-card rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]">
          <div className="text-sm text-[var(--ark-text-muted)]">已完成词书</div>
          <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{ltOverview.completed_deck_count} / {ltOverview.total_deck_count} 本</div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">全部单词都已进入 Review 状态的词书数量。</div>
        </button>
        <button type="button" onClick={() => openOverviewDetail('mastered')} className="ark-subapp-asset-card rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]">
          <div className="text-sm text-[var(--ark-text-muted)]">累计掌握单词</div>
          <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{ltOverview.mastered_word_count}</div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">按 FSRS Review 口径统计的全局已掌握单词总数。</div>
        </button>
      </div>
      <button type="button" onClick={() => openOverviewDetail('current', activeDeck?.id)} className="ark-subapp-asset-card w-full rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="text-sm text-[var(--ark-text-muted)]">当前词书掌握度</div><div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">{ltOverview.current_deck.deck_name}</div></div>
          <div className="sm:text-right"><div className="text-sm text-[var(--ark-text-muted)]">已掌握</div><div className="mt-2 text-2xl font-semibold text-[var(--ark-text)]">{ltOverview.current_deck.mastered_word_count} / {ltOverview.current_deck.total_word_count}</div></div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-ark-surface-subtle"><div className="ark-subapp-asset-progress h-full rounded-full transition-[width] duration-300" style={{ width: `${currentDeckMasteryPercent}%` }} /></div>
        <div className="ark-subapp-asset-soft mt-5 rounded-lg border p-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-ark-surface-subtle" aria-hidden="true">
            <div className="ark-subapp-asset-segment-unstarted" style={{ width: currentDeckSegmentPercent(ltOverview.current_deck.unstarted_word_count) }} />
            <div className="ark-subapp-asset-segment-learning" style={{ width: currentDeckSegmentPercent(ltOverview.current_deck.learning_word_count) }} />
            <div className="ark-subapp-asset-segment-mastered" style={{ width: currentDeckSegmentPercent(ltOverview.current_deck.mastered_word_count) }} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--ark-surface)] px-3 py-2"><div className="flex items-center gap-2 text-sm text-[var(--ark-text-muted)]"><span className="ark-subapp-asset-segment-unstarted h-2.5 w-2.5 rounded-full" />未开始</div><div className="text-lg font-semibold text-[var(--ark-text)]">{ltOverview.current_deck.unstarted_word_count}</div></div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--ark-surface)] px-3 py-2"><div className="flex items-center gap-2 text-sm text-[var(--ark-text-muted)]"><span className="ark-subapp-asset-segment-learning h-2.5 w-2.5 rounded-full" />学习中</div><div className="text-lg font-semibold text-[var(--ark-text)]">{ltOverview.current_deck.learning_word_count}</div></div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--ark-surface)] px-3 py-2"><div className="flex items-center gap-2 text-sm text-[var(--ark-text-muted)]"><span className="ark-subapp-asset-segment-mastered h-2.5 w-2.5 rounded-full" />已掌握</div><div className="text-lg font-semibold text-[var(--ark-text)]">{ltOverview.current_deck.mastered_word_count}</div></div>
          </div>
        </div>
      </button>
    </div>
  ) : (<p className="text-sm text-[var(--ark-text-muted)]">学习资产加载中…</p>);

  return (
    <SubAppHomeTemplate
      eyebrow="Vocabulary"
      title="背单词"
      statusLabel={eventStatusLabel(appTaskStatus, hasEventAppConfig)}
      metaItems={[eventLabel, `当前词书：${activeDeck?.name ?? '未选择词书'}`]}
      configureAction={{ label: '配置', onClick: home.openSettings, disabled: !activeDeck }}
      heroLabel="今日单词任务"
      heroValue={summary ? `${summary.completed_count} / ${summary.total_count}` : '--'}
      heroDetail={activeDeck ? '复习与新词会按今日计划自动衔接。' : '请选择词书后开始今日学习'}
      heroProgressPercent={todayProgressPercent}
      heroProgressLabel="今日完成度"
      primaryAction={{ label: primaryActionLabel, disabled: appTaskAction.disabled, onClick: appTaskAction.action }}
      metrics={overviewMetrics}
      assetEyebrow="Learning Assets"
      assetTitle="长期积累"
      assetDescription="词书完成度、全局掌握量与当前词书阶段都收束在这里。"
      assetContent={vocabAssetContent}
      arrangements={<SubAppArrangements tasks={vocabTasks} isBusy={home.busy} />}
      feedback={(
        <>
          {deckLoading ? <p className="text-sm text-[var(--ark-text-muted)]">词书加载中…</p> : null}
          {deckError ? <p className="text-sm text-rose-200">{deckError}</p> : null}
          {home.error ? <p className="text-sm text-rose-200">{home.error}</p> : null}
          {appTaskStatus?.state === 'event_not_configured' ? (<p className="ark-annotation rounded-lg px-3 py-2">{eventNotConfiguredMessage}</p>)
            : appTaskStatus?.state === 'no_primary_event' ? (<p className="ark-annotation rounded-lg px-3 py-2">请先创建或设置主事件，再配置今日单词。</p>) : null}
        </>
      )}
      modals={(
        <>
          <SubAppConfigModal
            open={home.settingsOpen}
            onClose={home.closeSettings}
            onSave={home.save}
            isSaving={home.isSaving}
            appName="背单词"
            eventName={currentEventName}
            description={isTodayComplete ? '今天这本词书已经完成，可调整目标继续再来一轮。' : '配置词书上下文、今日目标和默认专注时长。'}
            saveError={home.error}
            saveLabel={isTodayComplete ? '保存并继续' : undefined}
            focusWorks={[{
              id: 'vocab_today', label: '今日单词', enabled: true,
              onEnabledChange: () => {}, showEnableToggle: false,
              contentConfig: (
                <div className="space-y-4">
                  {decks && activeDeck ? (
                    <div>
                      <div className="mb-2 flex items-center gap-2"><BookOpen className="h-5 w-5 text-[var(--ark-accent)]" /><span className="text-sm font-medium text-ark-text">词书上下文</span></div>
                      <DeckSwitcher decks={decks} activeDeck={activeDeck} onChange={setActiveDeck} inheritancePrompt={inheritancePrompt} onConfirmInheritance={confirmInheritance} onDismissInheritance={dismissInheritance} />
                    </div>
                  ) : null}
                  <div>
                    <label htmlFor="vocab-today-target" className="mb-2 block text-xs text-ark-text-muted">今日总量</label>
                    <input id="vocab-today-target" type="number" min={1} max={500} value={targetCountValue} onChange={(e) => setTargetCountValue(e.target.value)} className="w-full rounded-lg border border-ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-ark-text outline-none transition focus:border-[var(--ark-border-strong)]" />
                  </div>
                </div>
              ),
              defaultFocusDuration: vocabFocusDuration,
              onFocusDurationChange: setVocabFocusDuration,
              addToTodayPlan: vocabAddToTodayPlan,
              onAddToTodayPlanChange: setVocabAddToTodayPlan,
              showSyncToggle: false,
            } as FocusWorkConfigFields]}
          />
          {activeDeck ? (<OverviewDetailModal isOpen={overviewDetailOpen} baseDeckId={activeDeck.id} initialTab={overviewDetailTab} initialTargetDeckId={overviewDetailDeckId} onClose={() => setOverviewDetailOpen(false)} />) : null}
        </>
      )}
    />
  );
}
