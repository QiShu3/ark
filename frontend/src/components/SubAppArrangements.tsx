import { useState } from 'react';
import { AlertCircle, Calendar, CheckCircle2, ClipboardList, Loader2, Play, Settings } from 'lucide-react';

export type SubAppTaskItemState =
  | 'ready'
  | 'completed'
  | 'blocked'
  | 'unconfigured'
  | 'uninitialized'
  | 'config_invalid';

export interface SubAppTaskItem {
  id: string;
  name: string;
  focusWorkName: string;
  isInitialized: boolean;
  isSynced: boolean;
  onSyncToggle?: (nextSynced: boolean) => Promise<void>;
  state?: SubAppTaskItemState;
  statusLabel?: string;
  primaryActionLabel?: string;
  primaryActionDisabled?: boolean;
  onPrimaryAction?: () => Promise<void> | void;
  disabledReason?: string | null;
  showSyncToggle?: boolean;
}

export interface SubAppArrangementsProps {
  tasks: SubAppTaskItem[];
  isBusy?: boolean;
}

export default function SubAppArrangements({ tasks, isBusy = false }: SubAppArrangementsProps) {
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [actingTaskId, setActingTaskId] = useState<string | null>(null);

  const handleToggle = async (task: SubAppTaskItem) => {
    if (isBusy || togglingTaskId || !task.isInitialized || !task.onSyncToggle) return;
    setTogglingTaskId(task.id);
    try {
      await task.onSyncToggle(!task.isSynced);
    } catch (err) {
      console.error(`Failed to toggle sync for task ${task.id}:`, err);
    } finally {
      setTogglingTaskId(null);
    }
  };

  const handlePrimaryAction = async (task: SubAppTaskItem) => {
    if (isBusy || actingTaskId || task.primaryActionDisabled || !task.onPrimaryAction) return;
    setActingTaskId(task.id);
    try {
      await task.onPrimaryAction();
    } catch (err) {
      console.error(`Failed to run primary action for task ${task.id}:`, err);
    } finally {
      setActingTaskId(null);
    }
  };

  const taskState = (task: SubAppTaskItem): SubAppTaskItemState => {
    if (task.state) return task.state;
    return task.isInitialized ? 'ready' : 'unconfigured';
  };

  const statusLabel = (task: SubAppTaskItem) => {
    if (task.statusLabel) return task.statusLabel;
    const state = taskState(task);
    if (state === 'completed') return 'completed';
    if (state === 'ready') return 'ready';
    if (state === 'uninitialized') return '未初始化';
    if (state === 'config_invalid') return '配置异常';
    if (state === 'blocked') return 'blocked';
    return '未配置';
  };

  const statusClassName = (state: SubAppTaskItemState) => {
    if (state === 'ready') return 'ark-subapp-status-ready';
    if (state === 'completed') return 'ark-subapp-status-completed';
    if (state === 'blocked' || state === 'config_invalid') return 'ark-subapp-status-blocked';
    return 'ark-subapp-status-pending';
  };

  const actionIcon = (label: string | undefined) => {
    if (!label) return null;
    if (label.includes('配置')) return <Settings className="h-4 w-4" />;
    if (label.includes('初始化')) return <CheckCircle2 className="h-4 w-4" />;
    return <Play className="h-4 w-4" />;
  };

  return (
    <section className="ark-panel-card ark-subapp-arrangements rounded-lg p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--ark-text-faint)]">Managed Arrangements</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ark-text)]">托管安排</h2>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="ark-subapp-arrangement-card rounded-lg border p-5">
          <div>
            <div className="ark-subapp-arrangement-accent mb-4 flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              <span className="text-base font-medium text-[var(--ark-text)]">任务</span>
            </div>

            {tasks.length === 0 ? (
              <div className="py-4 text-center text-sm text-[var(--ark-text-faint)]">暂无可用任务</div>
            ) : (
              <div className="space-y-1">
                {tasks.map((task) => {
                  const isTaskBusy = togglingTaskId === task.id || isBusy;
                  const isActing = actingTaskId === task.id || isBusy;
                  const state = taskState(task);
                  const label = statusLabel(task);
                  const actionLabel = task.primaryActionLabel;
                  const canAct = !!task.onPrimaryAction && !task.primaryActionDisabled && !isActing;
                  const showSyncToggle = task.showSyncToggle !== false;
                  return (
                    <div
                      key={task.id}
                      className="ark-subapp-timeline-rail relative flex flex-col gap-4 border-l-2 py-4 pl-5 first:pt-1 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="ark-subapp-timeline-node absolute -left-[5px] top-6 h-2 w-2 rounded-full" aria-hidden="true" />
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base font-semibold text-[var(--ark-text)]">{task.name}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClassName(state)}`}>
                            {state === 'ready' || state === 'completed' ? null : <AlertCircle className="h-3.5 w-3.5" />}
                            {label}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--ark-text-faint)]">
                          绑定专注工作：<span className="ark-subapp-arrangement-accent">{task.focusWorkName}</span>
                        </div>
                        {task.disabledReason ? <div className="text-xs text-rose-200">{task.disabledReason}</div> : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-3 self-end sm:self-center">
                        {showSyncToggle ? (
                          <div className="flex items-center gap-3">
                            {isTaskBusy && <Loader2 className="h-4 w-4 animate-spin text-[var(--ark-accent)]" />}
                            <span className="text-xs text-[var(--ark-text-muted)]">同步到今日安排</span>
                            <button
                              type="button"
                              role="switch"
                              aria-label={`同步到今日安排：${task.name}`}
                              aria-checked={task.isSynced}
                              disabled={!task.isInitialized || isTaskBusy}
                              onClick={() => handleToggle(task)}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ark-focus-ring focus:ring-offset-2 focus:ring-offset-ark-panel disabled:cursor-not-allowed ${
                                task.isSynced ? 'bg-ark-accent' : 'bg-ark-surface-subtle'
                              } ${!task.isInitialized ? 'opacity-40' : ''}`}
                            >
                              <span
                                aria-hidden="true"
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  task.isSynced ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        ) : null}

                        {actionLabel ? (
                          <button
                            type="button"
                            disabled={!canAct}
                            onClick={() => void handlePrimaryAction(task)}
                            className="inline-flex items-center gap-2 rounded-lg border border-ark-border bg-white px-3.5 py-2 text-sm font-medium text-slate-950 transition hover:bg-ark-surface-subtle disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : actionIcon(actionLabel)}
                            {actionLabel}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {tasks.some((t) => !t.isInitialized) && (
            <div className="ark-annotation mt-4 flex items-start gap-1.5 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[var(--ark-text-muted)]" />
              <span>部分任务需要先配置或初始化，完成后即可使用。</span>
            </div>
          )}
        </div>

        <div className="ark-subapp-arrangement-card rounded-lg border p-5">
          <div>
            <div className="ark-subapp-arrangement-accent mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span className="text-base font-medium text-[var(--ark-text)]">日程</span>
            </div>
            
            <div className="ark-subapp-arrangement-empty flex h-[132px] flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
              <Calendar className="mb-2 h-8 w-8 text-[var(--ark-text-faint)]" />
              <div className="text-sm font-medium text-[var(--ark-text-muted)]">暂无日程安排</div>
              <div className="mt-1 text-xs text-[var(--ark-text-faint)]">当前子应用尚未生成托管日程</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
