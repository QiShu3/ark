import { useState } from 'react';
import { ClipboardList, Calendar, AlertCircle, Loader2 } from 'lucide-react';

export interface SubAppTaskItem {
  id: string;
  name: string;
  focusWorkName: string;
  isInitialized: boolean;
  isSynced: boolean;
  onSyncToggle: (nextSynced: boolean) => Promise<void>;
}

export interface SubAppArrangementsProps {
  tasks: SubAppTaskItem[];
  isBusy?: boolean;
}

export default function SubAppArrangements({ tasks, isBusy = false }: SubAppArrangementsProps) {
  // Store loading state per task ID during sync toggles
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

  const handleToggle = async (task: SubAppTaskItem) => {
    if (isBusy || togglingTaskId || !task.isInitialized) return;
    setTogglingTaskId(task.id);
    try {
      await task.onSyncToggle(!task.isSynced);
    } catch (err) {
      console.error(`Failed to toggle sync for task ${task.id}:`, err);
    } finally {
      setTogglingTaskId(null);
    }
  };

  return (
    <div className="ark-panel-card rounded-[2rem] p-8">
      <div className="mb-6 text-sm uppercase tracking-[0.32em] text-[var(--ark-text-faint)]">Arrangements & Settings</div>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight text-[var(--ark-text)]">子应用安排</h2>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Column: 任务 (Tasks) */}
        <div className="ark-surface-subtle flex flex-col justify-between rounded-2xl border p-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 mb-4">
              <ClipboardList className="h-5 w-5" />
              <span className="text-base font-medium text-[var(--ark-text)]">任务</span>
            </div>

            {tasks.length === 0 ? (
              <div className="py-4 text-center text-sm text-[var(--ark-text-faint)]">暂无可用任务</div>
            ) : (
              <div className="space-y-4">
                {tasks.map((task) => {
                  const isTaskBusy = togglingTaskId === task.id || isBusy;
                  return (
                    <div
                      key={task.id}
                      className="ark-surface-subtle flex flex-col gap-4 rounded-xl border p-4 transition hover:border-[var(--ark-border-strong)] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base font-semibold text-[var(--ark-text)]">{task.name}</span>
                          {!task.isInitialized && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300 border border-amber-500/20">
                              <AlertCircle className="h-3.5 w-3.5" />
                              未配置
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--ark-text-faint)]">
                          绑定专注工作：<span className="text-indigo-300">{task.focusWorkName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        {isTaskBusy && <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />}
                        <span className="text-xs text-[var(--ark-text-muted)]">同步到今日安排</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={task.isSynced}
                          disabled={!task.isInitialized || isTaskBusy}
                          onClick={() => handleToggle(task)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed ${
                            task.isSynced ? 'bg-indigo-500' : 'bg-white/10'
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {tasks.some((t) => !t.isInitialized) && (
            <div className="mt-4 flex items-start gap-1.5 rounded-xl border border-amber-500/10 bg-amber-500/5 p-3 text-xs leading-relaxed text-[var(--ark-text-faint)]">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>提示：部分任务处于“未配置”状态，无法开启同步。请使用页面上方的配置按钮先初始化任务。</span>
            </div>
          )}
        </div>

        {/* Right Column: 日程 (Schedules) */}
        <div className="ark-surface-subtle flex flex-col justify-between rounded-2xl border p-6">
          <div>
            <div className="flex items-center gap-2 text-sky-400 mb-4">
              <Calendar className="h-5 w-5" />
              <span className="text-base font-medium text-[var(--ark-text)]">日程</span>
            </div>
            
            <div className="ark-surface-subtle flex h-[120px] flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition hover:border-[var(--ark-border-strong)]">
              <Calendar className="mb-2 h-8 w-8 text-[var(--ark-text-faint)]" />
              <div className="text-sm font-medium text-[var(--ark-text-muted)]">暂无日程安排</div>
              <div className="mt-1 text-xs text-[var(--ark-text-faint)]">本子应用日程配置功能正在规划中，敬请期待</div>
            </div>
          </div>
          
          <div className="mt-4 text-center text-xs leading-relaxed text-[var(--ark-text-faint)]">
            日程功能将在下个版本上线，届时可直接同步子应用周期性日程。
          </div>
        </div>
      </div>
    </div>
  );
}
