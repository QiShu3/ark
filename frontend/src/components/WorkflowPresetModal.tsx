import React from 'react';
import AppModalFrame from './AppModalFrame';
import WorkflowPhaseChips from './WorkflowPhaseChips';
import {
  FileText,
  Coffee,
  BookOpen,
  Headphones,
  Plus,
  Trash2,
  ChevronRight,
  GripVertical,
  Pencil,
  MoreVertical,
  Check,
  RotateCcw,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { Task } from './taskTypes';
import {
  buildWorkflowPreview,
  getWorkflowPresetPhases,
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

const BADGE_COLORS = [
  'bg-blue-600 text-white',
  'bg-emerald-600 text-white',
  'bg-purple-600 text-white',
  'bg-orange-500 text-white',
  'bg-amber-500 text-white',
  'bg-cyan-500 text-white',
  'bg-indigo-600 text-white',
  'bg-slate-500 text-white',
];

const PRESET_ICONS: Record<string, React.FC<any>> = {
  file: FileText,
  coffee: Coffee,
  book: BookOpen,
  headphones: Headphones,
};

const ICON_STYLES: Record<string, string> = {
  file: 'text-blue-400 bg-blue-500/10 border border-blue-500/20',
  coffee: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20',
  book: 'text-purple-400 bg-purple-500/10 border border-purple-500/20',
  headphones: 'text-rose-400 bg-rose-500/10 border border-rose-500/20',
};

// Sortable item wrapper for stages
const SortableStageNode: React.FC<{
  pair: {
    id: string;
    focusIndex: number;
    breakIndex: number;
    focusPhase: WorkflowFormPhase;
    breakPhase: WorkflowFormPhase;
  };
  index: number;
  isActive: boolean;
  onClick: () => void;
  getTaskTitle: (taskId: string) => string | null | undefined;
  tasks: Task[];
}> = ({ pair, index, isActive, onClick, getTaskTitle, tasks }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pair.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const focusMins = Math.round(pair.focusPhase.duration / 60);
  const breakMins = Math.round(pair.breakPhase.duration / 60);

  const matchedTask = tasks.find(t => t.id === pair.focusPhase.task_id);
  const taskTitle = pair.focusPhase.task_id
    ? matchedTask?.title || '未知任务'
    : '运行时选择任务';

  const badgeColor = BADGE_COLORS[index % BADGE_COLORS.length] || 'bg-slate-500 text-white';

  // Get App icon or fallback
  let TaskIcon = FileText;
  if (matchedTask?.app_task_type === 'vocab_today') {
    TaskIcon = BookOpen;
  } else if (matchedTask?.app_task_type === 'erc_review') {
    TaskIcon = RotateCcw;
  } else if (matchedTask?.app_task_type === 'erc_practice') {
    TaskIcon = FileText;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`relative min-w-[150px] flex-1 max-w-[210px] rounded-xl border p-3.5 cursor-pointer transition-all duration-200 select-none bg-ark-surface-subtle hover:bg-ark-surface-strong flex flex-col justify-between ${
        isActive
          ? 'border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.25)] bg-ark-surface-strong'
          : 'border-ark-border hover:border-ark-border-strong'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-5 h-5 shrink-0 flex items-center justify-center rounded-full text-xs font-bold ${badgeColor}`}>
            {index + 1}
          </span>
          <span className="text-xs font-semibold text-ark-text truncate" title={taskTitle}>
            {taskTitle}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 text-[11px] text-ark-text-muted">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            {...attributes}
            {...listeners}
            className="p-1 hover:bg-ark-surface-subtle rounded cursor-grab active:cursor-grabbing text-ark-text-faint hover:text-ark-text-muted shrink-0"
            title="按住拖拽排序"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <span className="truncate">{focusMins}min · 休息 {breakMins}min</span>
        </div>
      </div>
    </div>
  );
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
  title = '工作流',
  description = '这里管理的是可复用的专注流程模板，运行控制仍在主面板中完成。',
  savedListLabel = '我的工作流',
  emptyText = '暂无工作流',
  showDefaultControls = true,
  zIndexClass = 'z-[60]',
  readOnlyPresetIds = [],
}) => {
  const availableTasks = React.useMemo(
    () => getWorkflowTaskOptions(tasks, isTaskHiddenFromActionList),
    [tasks, isTaskHiddenFromActionList],
  );
  const readOnlyPresetIdSet = React.useMemo(() => new Set(readOnlyPresetIds), [readOnlyPresetIds]);

  const [activeEditingIndex, setActiveEditingIndex] = React.useState<number>(0);
  const [openMenuPresetId, setOpenMenuPresetId] = React.useState<string | null>(null);

  // Group phases into Focus-Break stage pairs
  const stagePairs = React.useMemo(() => {
    const pairs: Array<{
      id: string;
      focusIndex: number;
      breakIndex: number;
      focusPhase: WorkflowFormPhase;
      breakPhase: WorkflowFormPhase;
    }> = [];
    for (let index = 0; index < workflowForm.phases.length; index += 2) {
      const focusPhase = workflowForm.phases[index];
      const breakPhase = workflowForm.phases[index + 1];
      if (focusPhase && breakPhase) {
        pairs.push({
          id: `stage-${index / 2}`,
          focusIndex: index,
          breakIndex: index + 1,
          focusPhase,
          breakPhase,
        });
      }
    }
    return pairs;
  }, [workflowForm.phases]);

  // Keep track of stages count and ensure proper selection
  const prevPairsCountRef = React.useRef(stagePairs.length);
  React.useEffect(() => {
    if (stagePairs.length > prevPairsCountRef.current) {
      setActiveEditingIndex(stagePairs.length - 1);
    } else if (activeEditingIndex >= stagePairs.length) {
      setActiveEditingIndex(Math.max(0, stagePairs.length - 1));
    }
    prevPairsCountRef.current = stagePairs.length;
  }, [stagePairs.length, activeEditingIndex]);

  // Drag Sensors configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = parseInt(active.id.toString().split('-')[1], 10);
      const newIndex = parseInt(over.id.toString().split('-')[1], 10);

      onUpdateForm((state) => {
        const nextPhases = [...state.phases];
        const oldFocusIdx = oldIndex * 2;
        const newFocusIdx = newIndex * 2;

        const [movedFocus, movedBreak] = nextPhases.splice(oldFocusIdx, 2);
        nextPhases.splice(newFocusIdx, 0, movedFocus, movedBreak);

        return {
          ...state,
          phases: nextPhases,
        };
      });

      // Update active selection index
      if (activeEditingIndex === oldIndex) {
        setActiveEditingIndex(newIndex);
      } else if (activeEditingIndex > oldIndex && activeEditingIndex <= newIndex) {
        setActiveEditingIndex(activeEditingIndex - 1);
      } else if (activeEditingIndex < oldIndex && activeEditingIndex >= newIndex) {
        setActiveEditingIndex(activeEditingIndex + 1);
      }
    }
  };

  const currentPair = stagePairs[activeEditingIndex];

  return (
    <AppModalFrame
      open={true}
      onClose={onClose}
      zIndexClassName={zIndexClass}
      ariaLabelledBy="workflow-preset-modal-title"
      panelClassName="w-[1000px] max-w-[96vw] bg-ark-surface-strong border border-ark-border rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="border-b border-ark-border px-5 py-4 bg-ark-surface-subtle">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="workflow-preset-modal-title" className="text-lg font-bold text-ark-text">{title}</h3>
            {description ? <p className="text-sm text-ark-text-muted mt-1">{description}</p> : null}
          </div>
          <button
            aria-label="关闭工作流预设弹窗"
            data-onboarding-anchor="workflow-settings-close"
            onClick={onClose}
            className="p-2 hover:bg-ark-surface-subtle rounded-full transition-colors text-ark-text-muted hover:text-ark-text"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[320px_1fr] gap-0 h-[calc(82vh-88px)]">
        {/* Left Sidebar */}
        <div className="border-r border-ark-border p-4 overflow-y-auto flex flex-col justify-between bg-ark-surface-strong">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider uppercase text-ark-text-muted">{savedListLabel}</span>
              <button
                onClick={onCreateNew}
                className="text-xs px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 font-medium text-white flex items-center gap-1 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                新建工作流
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {presets.map((preset) => {
                const isEditing = editingWorkflowId === preset.id;
                const isReadOnly = readOnlyPresetIdSet.has(preset.id);
                const presetPhases = getWorkflowPresetPhases(preset);
                const focusMinsTotal = Math.round(
                  presetPhases
                    .filter((p) => p.phase_type === 'focus')
                    .reduce((total, p) => total + p.duration, 0) / 60
                );
                const breakMinsTotal = Math.round(
                  presetPhases
                    .filter((p) => p.phase_type === 'break')
                    .reduce((total, p) => total + p.duration, 0) / 60
                );

                const IconComponent = PRESET_ICONS[preset.icon || 'file'] || FileText;
                const iconStyle = ICON_STYLES[preset.icon || 'file'] || '';

                return (
                  <div
                    key={preset.id}
                    className={`relative rounded-xl border p-4 transition-all duration-200 ${
                      isEditing
                        ? 'border-blue-500 bg-blue-500/5'
                        : 'border-ark-border bg-ark-surface-subtle hover:bg-ark-surface-strong hover:border-ark-border-strong'
                    }`}
                  >
                    <div
                      className="cursor-pointer"
                      onClick={() => {
                        if (!isReadOnly) {
                          onSelectPreset(preset);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 flex items-center justify-center rounded-xl shrink-0 ${iconStyle}`}>
                            <IconComponent className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-ark-text text-sm truncate flex items-center gap-1.5">
                              {preset.name}
                              {isEditing && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-500/15 text-blue-300 border border-blue-500/20 shrink-0">
                                  编辑中
                                </span>
                              )}
                              {showDefaultControls && preset.is_default && !isReadOnly && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-500/15 text-blue-300 border border-blue-500/20 shrink-0">
                                  默认
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-ark-text-muted mt-1">
                              {presetPhases.filter(p => p.phase_type === 'focus').length} 个阶段 · 总时长 {focusMinsTotal + breakMinsTotal} 分钟
                            </div>
                            {preset.event_name && (
                              <div className="text-[11px] text-[var(--ark-text-muted)] mt-1">
                                事件：{preset.event_name}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Dropdown Menu Button */}
                        <div className="relative shrink-0">
                          <button
                            aria-label={`工作流 ${preset.name} 更多操作`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuPresetId(openMenuPresetId === preset.id ? null : preset.id);
                            }}
                            className="p-1.5 hover:bg-ark-surface-subtle rounded-lg text-ark-text-faint hover:text-ark-text transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Float Dropdown Options */}
                          {openMenuPresetId === preset.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenMenuPresetId(null)} />
                              <div className="absolute right-0 top-8 z-50 w-32 rounded-lg border border-ark-border bg-ark-surface-strong py-1 shadow-xl animate-fadeIn">
                                {showDefaultControls && !preset.is_default && !isReadOnly && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSetDefault(preset.id);
                                      setOpenMenuPresetId(null);
                                    }}
                                    className="w-full px-3 py-1.5 text-left text-xs text-ark-text hover:bg-ark-surface-subtle transition-colors"
                                  >
                                    设为默认
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCopyPreset(preset);
                                    setOpenMenuPresetId(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-xs text-ark-text hover:bg-ark-surface-subtle transition-colors"
                                >
                                  复制
                                </button>
                                {!isReadOnly && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeletePreset(preset.id);
                                      setOpenMenuPresetId(null);
                                    }}
                                    className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-ark-surface-subtle transition-colors font-medium border-t border-ark-border mt-1 pt-1"
                                  >
                                    删除
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Small phases preview list */}
                      <div className="mt-3 text-[11px] text-ark-text-faint truncate leading-relaxed">
                        {presetPhases
                          .filter((p) => p.phase_type === 'focus')
                          .map((p) => {
                            if (p.task_id) {
                              return tasks.find((t) => t.id === p.task_id)?.title || '未知任务';
                            }
                            if (p.focus_work_type) {
                              return p.focus_work_type === 'vocab_today' ? '今日单词' : '应用任务';
                            }
                            return '任务专注';
                          })
                          .join(' / ')}
                      </div>
                    </div>
                  </div>
                );
              })}
              {presets.length === 0 && (
                <div className="text-center text-ark-text-faint py-8 text-sm">
                  {emptyText}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Tip */}
          <div className="mt-4 pt-3 border-t border-ark-border text-center text-xs text-ark-text-faint flex items-center justify-center gap-1.5 leading-relaxed bg-ark-surface-subtle p-3.5 rounded-xl">
            💡 点击工作流卡片可进行编辑
          </div>
        </div>

        {/* Right Editor Area */}
        <div className="flex flex-col h-full bg-ark-surface bg-opacity-40 overflow-hidden">
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            <h4 className="text-sm font-bold text-ark-text uppercase tracking-wider">
              {editingWorkflowId ? '编辑工作流' : '创建工作流'}
            </h4>

            {/* Workflow Name Input */}
            <div className="flex flex-col gap-2">
              <label htmlFor="workflow-name" className="text-xs font-semibold text-ark-text-muted">工作流名称</label>
              <div className="relative flex items-center bg-ark-surface-subtle border border-ark-border rounded-xl focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
                <Pencil className="w-4 h-4 text-ark-text-faint ml-3 shrink-0" />
                <input
                  id="workflow-name"
                  aria-label="工作流名称"
                  maxLength={20}
                  value={workflowForm.name}
                  onChange={(e) => onUpdateForm((state) => ({ ...state, name: e.target.value.slice(0, 20) }))}
                  className="w-full px-3 py-2.5 text-sm bg-transparent border-none text-ark-text focus:outline-none placeholder:text-ark-text-faint"
                  placeholder="例如：考研英语"
                />
                <span className="text-xs font-medium text-ark-text-faint mr-4 select-none">
                  {workflowForm.name.length}/20
                </span>
              </div>
            </div>

            {/* Icon Picker */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-ark-text-muted">工作流图标</label>
              <div className="flex items-center gap-3">
                {(['file', 'coffee', 'book', 'headphones'] as const).map((iconName) => {
                  const IconComp = PRESET_ICONS[iconName] || FileText;
                  const isSelected = workflowForm.icon === iconName;
                  const iconStyle = ICON_STYLES[iconName] || '';
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => onUpdateForm((state) => ({ ...state, icon: iconName }))}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                        isSelected
                          ? `${iconStyle} ring-2 ring-blue-500`
                          : 'border-ark-border bg-ark-surface-subtle hover:bg-ark-surface-strong hover:border-ark-border-strong text-ark-text-muted'
                      }`}
                    >
                      <IconComp className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Horizontal Step sequence */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ark-text-muted">
                  流程编辑 <span className="text-[11px] font-normal text-ark-text-faint">(共 {stagePairs.length} 个阶段)</span>
                </span>
                <button
                  onClick={onAddPhase}
                  className="text-xs font-semibold px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-400 flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加学习阶段
                </button>
              </div>

              {/* Drag n drop horizontal container */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={stagePairs.map((p) => p.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="flex flex-wrap items-center gap-y-4 gap-x-2.5 p-3 rounded-xl border border-ark-border bg-ark-surface-subtle bg-opacity-30">
                    {stagePairs.map((pair, index) => (
                      <React.Fragment key={pair.id}>
                        {index > 0 && <ChevronRight className="w-4 h-4 text-ark-text-faint shrink-0" />}
                        <SortableStageNode
                          pair={pair}
                          index={index}
                          isActive={activeEditingIndex === index}
                          onClick={() => setActiveEditingIndex(index)}
                          getTaskTitle={(taskId) => tasks.find((t) => t.id === taskId)?.title}
                          tasks={tasks}
                        />
                      </React.Fragment>
                    ))}
                    {stagePairs.length === 0 && (
                      <div className="text-center text-xs text-ark-text-faint py-4 w-full">
                        暂无学习阶段，请点击上方按钮添加。
                      </div>
                    )}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Legend & hints */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-ark-text-faint">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    专注时长
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    休息时长
                  </span>
                </div>
                <span>👆 拖拽手柄可调整顺序</span>
              </div>
            </div>

            {/* Stage details editor */}
            {currentPair && (
              <div className="rounded-xl border border-ark-border bg-ark-surface-subtle p-4.5 flex flex-col gap-4 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-ark-border border-opacity-40 pb-2.5">
                  <span className="text-xs font-bold text-blue-400">
                    正在编辑：阶段 {activeEditingIndex + 1} · {
                      currentPair.focusPhase.task_id
                        ? tasks.find((t) => t.id === currentPair.focusPhase.task_id)?.title || '未知任务'
                        : '运行时选择任务'
                    }
                  </span>
                  <button
                    onClick={() => {
                      if (stagePairs.length <= 1) return;
                      onRemovePhase(currentPair.focusIndex);
                    }}
                    disabled={stagePairs.length <= 1}
                    className="text-xs font-semibold px-2 py-1 rounded bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    删除阶段
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Task type selector */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-ark-text-muted">任务类型</label>
                    <select
                      aria-label="绑定任务"
                      value={currentPair.focusPhase.task_id ?? ''}
                      onChange={(e) => updatePhase(currentPair.focusIndex, { task_id: e.target.value || null })}
                      className="px-3 py-2 text-sm rounded-lg bg-ark-surface-strong border border-ark-border text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="">运行时选择任务</option>
                      {availableTasks.map((task) => (
                        <option key={task.id} value={task.id}>{task.title}</option>
                      ))}
                    </select>
                  </div>

                  {/* Timer Mode selector */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-ark-text-muted">计时方式</label>
                    <select
                      aria-label="计时方式"
                      value={currentPair.focusPhase.timer_mode}
                      onChange={(e) => updatePhase(currentPair.focusIndex, { timer_mode: e.target.value as 'countdown' | 'countup' })}
                      className="px-3 py-2 text-sm rounded-lg bg-ark-surface-strong border border-ark-border text-ark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="countdown">倒计时</option>
                      <option value="countup">正计时</option>
                    </select>
                  </div>

                  {/* Focus duration counter */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-ark-text-muted">专注时长 (分钟)</label>
                    {currentPair.focusPhase.timer_mode === 'countup' ? (
                      <div className="px-3 py-2 text-sm rounded-lg bg-ark-surface-strong border border-ark-border text-ark-text-faint flex items-center h-10 select-none">
                        正计时阶段不需要单独设置时长
                      </div>
                    ) : (
                      <div className="flex items-center h-10 rounded-lg border border-ark-border bg-ark-surface-strong overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/50">
                        <button
                          type="button"
                          onClick={() => {
                            const curMin = Math.round(currentPair.focusPhase.duration / 60);
                            const nextMin = Math.max(5, curMin - 5);
                            updatePhase(currentPair.focusIndex, { duration: nextMin * 60 });
                          }}
                          className="w-10 h-full hover:bg-ark-surface-subtle text-ark-text border-r border-ark-border font-bold text-sm select-none transition-colors"
                        >
                          -
                        </button>
                        <input
                          aria-label="专注时长"
                          type="number"
                          min={1}
                          value={Math.round(currentPair.focusPhase.duration / 60)}
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value || 1));
                            updatePhase(currentPair.focusIndex, { duration: val * 60 });
                          }}
                          className="flex-1 h-full text-center text-sm text-ark-text bg-transparent border-none focus:outline-none font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const curMin = Math.round(currentPair.focusPhase.duration / 60);
                            const nextMin = curMin + 5;
                            updatePhase(currentPair.focusIndex, { duration: nextMin * 60 });
                          }}
                          className="w-10 h-full hover:bg-ark-surface-subtle text-ark-text border-l border-ark-border font-bold text-sm select-none transition-colors"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Break duration counter */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-ark-text-muted">结束后休息 (分钟)</label>
                    <div className="flex items-center h-10 rounded-lg border border-ark-border bg-ark-surface-strong overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/50">
                      <button
                        type="button"
                        onClick={() => {
                          const curMin = Math.round(currentPair.breakPhase.duration / 60);
                          const nextMin = Math.max(5, curMin - 5); // Enforce minimum 5 minutes break to pass validation
                          updatePhase(currentPair.breakIndex, { duration: nextMin * 60 });
                        }}
                        className="w-10 h-full hover:bg-ark-surface-subtle text-ark-text border-r border-ark-border font-bold text-sm select-none transition-colors"
                      >
                        -
                      </button>
                      <input
                        aria-label="休息时长"
                        type="number"
                        min={1}
                        value={Math.round(currentPair.breakPhase.duration / 60)}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value || 1));
                          updatePhase(currentPair.breakIndex, { duration: val * 60 });
                        }}
                        className="flex-1 h-full text-center text-sm text-ark-text bg-transparent border-none focus:outline-none font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const curMin = Math.round(currentPair.breakPhase.duration / 60);
                          const nextMin = curMin + 5;
                          updatePhase(currentPair.breakIndex, { duration: nextMin * 60 });
                        }}
                        className="w-10 h-full hover:bg-ark-surface-subtle text-ark-text border-l border-ark-border font-bold text-sm select-none transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Explanatory instruction */}
                <div className="text-xs text-ark-text-muted flex items-start gap-2 bg-ark-surface-strong bg-opacity-40 p-3 rounded-lg border border-ark-border/50">
                  <span className="text-blue-400 font-bold shrink-0">ⓘ</span>
                  <span>
                    该阶段将先专注 {
                      currentPair.focusPhase.timer_mode === 'countup'
                        ? '正计时'
                        : `${Math.round(currentPair.focusPhase.duration / 60)} 分钟`
                    }，结束后休息 {Math.round(currentPair.breakPhase.duration / 60)} 分钟，然后进入下一阶段。
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom section with controls & default check - Fixed Footer */}
          <div className="p-5 border-t border-ark-border bg-ark-surface-strong flex flex-col gap-3.5 shrink-0">
            {showDefaultControls && (
              <label className="inline-flex items-center gap-2.5 text-xs text-ark-text select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={workflowForm.isDefault}
                  onChange={(e) => onUpdateForm((state) => ({ ...state, isDefault: e.target.checked }))}
                  className="h-4 w-4 rounded border-ark-border bg-ark-surface-subtle text-blue-600 focus:ring-blue-500/50"
                />
                设为默认工作流
              </label>
            )}

            {workflowError && <div className="text-xs text-red-400 font-medium">{workflowError}</div>}

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={onReset}
                className="px-4 py-2.5 rounded-xl bg-ark-surface-subtle hover:bg-ark-surface-strong border border-ark-border text-xs font-semibold transition-colors disabled:opacity-50"
                disabled={workflowSubmitting}
              >
                重置
              </button>
              <button
                onClick={onSubmit}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-500/10 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={workflowSubmitting}
              >
                {workflowSubmitting ? '保存中...' : (editingWorkflowId ? '保存工作流' : '创建工作流')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppModalFrame>
  );
};

export default WorkflowPresetModal;
