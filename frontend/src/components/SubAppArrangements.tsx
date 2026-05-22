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
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 backdrop-blur-md">
      <div className="text-sm uppercase tracking-[0.32em] text-white/45 mb-6">Arrangements & Settings</div>
      <h2 className="text-2xl font-semibold tracking-tight text-white mb-6">子应用安排</h2>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Column: 任务 (Tasks) */}
        <div className="rounded-2xl border border-white/10 bg-black/20 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 mb-4">
              <ClipboardList className="h-5 w-5" />
              <span className="text-base font-medium text-white/80">任务</span>
            </div>

            {tasks.length === 0 ? (
              <div className="text-sm text-white/40 py-4 text-center">暂无可用任务</div>
            ) : (
              <div className="space-y-4">
                {tasks.map((task) => {
                  const isTaskBusy = togglingTaskId === task.id || isBusy;
                  return (
                    <div
                      key={task.id}
                      className="rounded-xl border border-white/5 bg-white/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition hover:border-white/10 hover:bg-white/8"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base font-semibold text-white">{task.name}</span>
                          {!task.isInitialized && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300 border border-amber-500/20">
                              <AlertCircle className="h-3.5 w-3.5" />
                              未配置
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/45">
                          绑定专注工作：<span className="text-indigo-300">{task.focusWorkName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        {isTaskBusy && <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />}
                        <span className="text-xs text-white/50">同步到今日安排</span>
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
            <div className="mt-4 text-xs text-white/40 flex items-start gap-1.5 leading-relaxed bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>提示：部分任务处于“未配置”状态，无法开启同步。请使用页面上方的配置按钮先初始化任务。</span>
            </div>
          )}
        </div>

        {/* Right Column: 日程 (Schedules) */}
        <div className="rounded-2xl border border-white/10 bg-black/20 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sky-400 mb-4">
              <Calendar className="h-5 w-5" />
              <span className="text-base font-medium text-white/80">日程</span>
            </div>
            
            <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-6 flex flex-col items-center justify-center text-center h-[120px] transition hover:border-white/20">
              <Calendar className="h-8 w-8 text-white/20 mb-2" />
              <div className="text-sm font-medium text-white/60">暂无日程安排</div>
              <div className="text-xs text-white/35 mt-1">本子应用日程配置功能正在规划中，敬请期待</div>
            </div>
          </div>
          
          <div className="mt-4 text-xs text-white/35 text-center leading-relaxed">
            日程功能将在下个版本上线，届时可直接同步子应用周期性日程。
          </div>
        </div>
      </div>
    </div>
  );
}
