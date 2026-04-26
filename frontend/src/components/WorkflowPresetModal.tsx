import React from 'react';

import type { Task } from './taskTypes';
import {
  buildWorkflowPreview,
  getWorkflowTaskOptions,
  type WorkflowFormPhase,
  type WorkflowFormState,
  type WorkflowPreset,
} from './workflowPresetForm';

type WorkflowPresetModalProps = {
  open: boolean;
  presets: WorkflowPreset[];
  tasks: Task[];
  editingWorkflowId: string | null;
  workflowForm: WorkflowFormState;
  workflowError: string | null;
  workflowSubmitting: boolean;
  onClose: () => void;
  onCreateNew: () => void;
  onSelectPreset: (preset: WorkflowPreset) => void;
  onCopyPreset: (preset: WorkflowPreset) => void;
  onSetDefault: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  onUpdateForm: (updater: (state: WorkflowFormState) => WorkflowFormState) => void;
  onAddPhase: () => void;
  onMovePhase: (index: number, direction: -1 | 1) => void;
  onRemovePhase: (index: number) => void;
  onSubmit: () => void;
  onReset: () => void;
  isTaskHiddenFromActionList: (task: Task) => boolean;
};

const WorkflowPresetModal: React.FC<WorkflowPresetModalProps> = ({
  open,
  presets,
  tasks,
  editingWorkflowId,
  workflowForm,
  workflowError,
  workflowSubmitting,
  onClose,
  onCreateNew,
  onSelectPreset,
  onCopyPreset,
  onSetDefault,
  onDeletePreset,
  onUpdateForm,
  onAddPhase,
  onMovePhase,
  onRemovePhase,
  onSubmit,
  onReset,
  isTaskHiddenFromActionList,
}) => {
  const preview = React.useMemo(() => buildWorkflowPreview(workflowForm), [workflowForm]);
  const availableTasks = React.useMemo(
    () => getWorkflowTaskOptions(tasks, isTaskHiddenFromActionList),
    [tasks, isTaskHiddenFromActionList],
  );

  if (!open) {
    return null;
  }

  function updatePhase(index: number, patch: Partial<WorkflowFormPhase>) {
    onUpdateForm((state) => {
      const phases = state.phases.map((phase, phaseIndex) => {
        if (phaseIndex !== index) {
          return phase;
        }

        const updated = { ...phase, ...patch };
        if (updated.phase_type === 'break') {
          updated.timer_mode = 'countdown';
          updated.task_id = null;
        }
        return updated;
      });

      return {
        ...state,
        phases,
      };
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-preset-modal-title"
        className="w-[840px] max-w-[94vw] max-h-[82vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-4 bg-white/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="workflow-preset-modal-title" className="text-lg font-bold text-white">工作流预设</h3>
              <p className="text-sm text-white/55 mt-1">
                这里管理的是可复用的专注流程模板，运行控制仍在主面板中完成。
              </p>
            </div>
            <button
              aria-label="关闭工作流预设弹窗"
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[320px_1fr] gap-0 h-[calc(82vh-88px)]">
          <div className="border-r border-white/10 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-white/70">已保存预设</span>
              <button
                onClick={onCreateNew}
                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
              >
                新建
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {presets.map((preset) => {
                const isEditing = editingWorkflowId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                      isEditing
                        ? 'border-amber-400/60 bg-amber-500/10'
                        : preset.is_default
                          ? 'border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                    onClick={() => onSelectPreset(preset)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-white">{preset.name}</div>
                        <div className="text-xs text-white/60 mt-1">
                          {preset.phases.map((phase, index) => `${index + 1}.${phase.phase_type === 'focus' ? '专注' : '休息'} ${Math.round(phase.duration / 60)}min`).join(' · ')}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {preset.is_default && <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/30">默认</span>}
                        {isEditing && <span className="text-[10px] px-2 py-0.5 rounded bg-amber-400/20 text-amber-200">编辑中</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <button
                        aria-label={`复制工作流 ${preset.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopyPreset(preset);
                        }}
                        className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                      >
                        复制
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetDefault(preset.id);
                        }}
                        className="text-xs px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30"
                      >
                        设为默认
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePreset(preset.id);
                        }}
                        className="text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
              {presets.length === 0 && (
                <div className="text-center text-white/35 py-8">
                  暂无预设，先创建一个适合你的专注流程
                </div>
              )}
            </div>
          </div>

          <div className="p-4 overflow-y-auto">
            <h4 className="text-sm text-white/70 mb-3">{editingWorkflowId ? '编辑工作流' : '创建工作流'}</h4>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 mb-4">
              <div className="text-xs uppercase tracking-[0.14em] text-white/40">Flow Preview</div>
              <div className="text-sm text-white mt-2">{preview.summary}</div>
              <div className="text-xs text-white/60 mt-2">{preview.sequence}</div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <label htmlFor="workflow-name" className="text-xs text-white/60">名称</label>
                <input
                  id="workflow-name"
                  aria-label="工作流名称"
                  value={workflowForm.name}
                  onChange={(e) => onUpdateForm((state) => ({ ...state, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="例如：番茄默认"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="workflow-default-timer-mode" className="text-xs text-white/60">默认专注计时方式</label>
                <select
                  id="workflow-default-timer-mode"
                  aria-label="默认专注计时方式"
                  value={workflowForm.defaultFocusTimerMode}
                  onChange={(e) => {
                    const mode = e.target.value as 'countdown' | 'countup';
                    onUpdateForm((state) => ({
                      ...state,
                      defaultFocusTimerMode: mode,
                      phases: state.phases.map((phase) => (
                        phase.phase_type === 'focus' && phase.timer_mode === state.defaultFocusTimerMode
                          ? { ...phase, timer_mode: mode }
                          : phase
                      )),
                    }));
                  }}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="countdown">倒计时</option>
                  <option value="countup">正计时</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">阶段配置</span>
                <button onClick={onAddPhase} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">新增阶段</button>
              </div>

              <div className="flex flex-col gap-2">
                {workflowForm.phases.map((phase, index) => (
                  <div key={`${phase.phase_type}-${index}`} className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-white/45">阶段 {index + 1}</span>
                      <div className="flex items-center gap-1">
                        <button
                          aria-label={`上移阶段 ${index + 1}`}
                          onClick={() => onMovePhase(index, -1)}
                          disabled={index === 0}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          上移
                        </button>
                        <button
                          aria-label={`下移阶段 ${index + 1}`}
                          onClick={() => onMovePhase(index, 1)}
                          disabled={index === workflowForm.phases.length - 1}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          下移
                        </button>
                      </div>
                    </div>

                    <select
                      aria-label={`阶段 ${index + 1} 类型`}
                      value={phase.phase_type}
                      onChange={(e) => updatePhase(index, { phase_type: e.target.value as 'focus' | 'break' })}
                      className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="focus">专注</option>
                      <option value="break">休息</option>
                    </select>

                    {phase.phase_type === 'focus' && phase.timer_mode === 'countup' ? (
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/60 flex items-center">
                          正计时阶段不需要单独设置时长
                        </div>
                        <button
                          onClick={() => onRemovePhase(index)}
                          className="px-2 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs"
                          disabled={workflowForm.phases.length <= 1}
                        >
                          删除
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input
                          aria-label={`阶段 ${index + 1} 时长（分钟）`}
                          type="number"
                          min={1}
                          value={Math.round(phase.duration / 60)}
                          onChange={(e) => updatePhase(index, { duration: Math.max(60, Number(e.target.value || 1) * 60) })}
                          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <button
                          onClick={() => onRemovePhase(index)}
                          className="px-2 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs"
                          disabled={workflowForm.phases.length <= 1}
                        >
                          删除
                        </button>
                      </div>
                    )}

                    {phase.phase_type === 'focus' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          aria-label={`阶段 ${index + 1} 计时方式`}
                          value={phase.timer_mode}
                          onChange={(e) => updatePhase(index, { timer_mode: e.target.value as 'countdown' | 'countup' })}
                          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                          <option value="countdown">倒计时</option>
                          <option value="countup">正计时</option>
                        </select>
                        <select
                          aria-label={`阶段 ${index + 1} 绑定任务`}
                          value={phase.task_id ?? ''}
                          onChange={(e) => updatePhase(index, { task_id: e.target.value || null })}
                          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                          <option value="">运行时选择任务</option>
                          {availableTasks.map((task) => (
                            <option key={task.id} value={task.id}>{task.title}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="text-xs text-white/45 px-1">休息阶段不绑定任务，固定使用倒计时。</div>
                    )}
                  </div>
                ))}
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-white/75">
                <input
                  type="checkbox"
                  checked={workflowForm.isDefault}
                  onChange={(e) => onUpdateForm((state) => ({ ...state, isDefault: e.target.checked }))}
                />
                设为默认工作流
              </label>

              {workflowError && <div className="text-sm text-red-400">{workflowError}</div>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={onReset}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
                  disabled={workflowSubmitting}
                >
                  重置
                </button>
                <button
                  onClick={onSubmit}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
                  disabled={workflowSubmitting}
                >
                  {workflowSubmitting ? '保存中...' : (editingWorkflowId ? '保存修改' : '创建工作流')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowPresetModal;
