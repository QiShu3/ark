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
  onRemovePhase: (index: number) => void;
  onSubmit: () => void;
  onReset: () => void;
  isTaskHiddenFromActionList: (task: Task) => boolean;
  title?: string;
  description?: string | null;
  savedListLabel?: string;
  emptyText?: string;
  showDefaultControls?: boolean;
  zIndexClass?: string;
  readOnlyPresetIds?: string[];
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
  onRemovePhase,
  onSubmit,
  onReset,
  isTaskHiddenFromActionList,
  title = '工作流预设',
  description = '这里管理的是可复用的专注流程模板，运行控制仍在主面板中完成。',
  savedListLabel = '已保存预设',
  emptyText = '暂无预设，先创建一个适合你的专注流程',
  showDefaultControls = true,
  zIndexClass = 'z-[60]',
  readOnlyPresetIds = [],
}) => {
  const preview = React.useMemo(() => buildWorkflowPreview(workflowForm), [workflowForm]);
  const availableTasks = React.useMemo(
    () => getWorkflowTaskOptions(tasks, isTaskHiddenFromActionList),
    [tasks, isTaskHiddenFromActionList],
  );
  const readOnlyPresetIdSet = React.useMemo(() => new Set(readOnlyPresetIds), [readOnlyPresetIds]);
  const phaseGroups = React.useMemo(() => {
    const groups: Array<{
      focusPhase: WorkflowFormPhase;
      breakPhase: WorkflowFormPhase | null;
      focusIndex: number;
      breakIndex: number;
      groupIndex: number;
    }> = [];
    for (let index = 0; index < workflowForm.phases.length; index += 2) {
      const focusPhase = workflowForm.phases[index];
      if (!focusPhase) continue;
      groups.push({
        focusPhase,
        breakPhase: workflowForm.phases[index + 1] ?? null,
        focusIndex: index,
        breakIndex: index + 1,
        groupIndex: index / 2,
      });
    }
    return groups;
  }, [workflowForm.phases]);

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
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/70 backdrop-blur-sm`}
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
              <h3 id="workflow-preset-modal-title" className="text-lg font-bold text-white">{title}</h3>
              {description ? <p className="text-sm text-white/55 mt-1">{description}</p> : null}
            </div>
            <button
              aria-label="关闭工作流预设弹窗"
              data-onboarding-anchor="workflow-settings-close"
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
              <span className="text-sm text-white/70">{savedListLabel}</span>
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
                const isReadOnly = readOnlyPresetIdSet.has(preset.id);
                return (
                  <div
                    key={preset.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      isEditing
                        ? 'border-amber-400/60 bg-amber-500/10'
                        : showDefaultControls && preset.is_default && !isReadOnly
                          ? 'border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20'
                          : isReadOnly
                            ? 'cursor-default border-white/10 bg-white/[0.03]'
                            : 'cursor-pointer border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                    onClick={() => {
                      if (!isReadOnly) {
                        onSelectPreset(preset);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-white">{preset.name}</div>
                        <div className="text-xs text-white/60 mt-1">
                          {preset.phases.map((phase, index) => `${index + 1}.${phase.phase_type === 'focus' ? '专注' : '休息'} ${Math.round(phase.duration / 60)}min`).join(' · ')}
                        </div>
                        {preset.event_name ? (
                          <div className="text-xs text-white/45 mt-1">事件：{preset.event_name}</div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {showDefaultControls && preset.is_default && !isReadOnly ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/30">默认</span>
                        ) : null}
                        {isReadOnly ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white/55">事件</span>
                        ) : null}
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
                      {isReadOnly ? null : (
                        <>
                          {showDefaultControls ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSetDefault(preset.id);
                              }}
                              className="text-xs px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30"
                            >
                              设为默认
                            </button>
                          ) : null}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeletePreset(preset.id);
                            }}
                            className="text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30"
                          >
                            删除
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {presets.length === 0 && (
                <div className="text-center text-white/35 py-8">
                  {emptyText}
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

              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">阶段配置</span>
                <button onClick={onAddPhase} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">新增专注阶段</button>
              </div>

              <div className="flex flex-col gap-2">
                {phaseGroups.map(({ focusPhase, breakPhase, focusIndex, breakIndex, groupIndex }) => (
                  <div
                    key={`focus-group-${groupIndex}`}
                    className="grid grid-cols-1 gap-3 rounded-xl border border-blue-300/20 bg-blue-400/10 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-blue-100">专注阶段 {groupIndex + 1}</span>
                      <button
                        aria-label={`删除专注阶段 ${groupIndex + 1}`}
                        onClick={() => onRemovePhase(focusIndex)}
                        className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={phaseGroups.length <= 1}
                      >
                        删除
                      </button>
                    </div>

                    {focusPhase.timer_mode === 'countup' ? (
                      <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/60 flex items-center">
                        正计时阶段不需要单独设置时长
                      </div>
                    ) : (
                      <input
                        aria-label={`阶段 ${focusIndex + 1} 时长（分钟）`}
                        type="number"
                        min={1}
                        value={Math.round(focusPhase.duration / 60)}
                        onChange={(e) => updatePhase(focusIndex, { duration: Math.max(60, Number(e.target.value || 1) * 60) })}
                        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    )}

                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                      <select
                        aria-label={`阶段 ${focusIndex + 1} 计时方式`}
                        value={focusPhase.timer_mode}
                        onChange={(e) => updatePhase(focusIndex, { timer_mode: e.target.value as 'countdown' | 'countup' })}
                        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="countdown">倒计时</option>
                        <option value="countup">正计时</option>
                      </select>
                      <select
                        aria-label={`阶段 ${focusIndex + 1} 绑定任务`}
                        value={focusPhase.task_id ?? ''}
                        onChange={(e) => updatePhase(focusIndex, { task_id: e.target.value || null })}
                        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="">运行时选择任务</option>
                        {availableTasks.map((task) => (
                          <option key={task.id} value={task.id}>{task.title}</option>
                        ))}
                      </select>
                    </div>

                    {breakPhase ? (
                      <div className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                        <span className="text-xs text-white/45">配套休息 {groupIndex + 1}</span>
                        <input
                          aria-label={`配套休息 ${groupIndex + 1} 时长（分钟）`}
                          type="number"
                          min={1}
                          value={Math.round(breakPhase.duration / 60)}
                          onChange={(e) => updatePhase(breakIndex, { duration: Math.max(60, Number(e.target.value || 1) * 60) })}
                          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {showDefaultControls ? (
                <label className="inline-flex items-center gap-2 text-sm text-white/75">
                  <input
                    type="checkbox"
                    checked={workflowForm.isDefault}
                    onChange={(e) => onUpdateForm((state) => ({ ...state, isDefault: e.target.checked }))}
                  />
                  设为默认工作流
                </label>
              ) : null}

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
