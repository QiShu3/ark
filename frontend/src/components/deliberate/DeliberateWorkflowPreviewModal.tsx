import { ChevronDown, ChevronRight, Clock, FolderOpen, ListChecks, Play, Settings2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppModalFrame from '../AppModalFrame';
import Button from '../Button';
import { listDeliberateWorkflows, type DeliberateWorkflowConfig } from '../../lib/deliberate/api';
import type { AppDeclaration } from '../../lib/appRegistry';
import {
  getDeliberateWorkflowConfigIds,
  getDeliberateWorkflowConfigNames,
  type WorkflowPreset,
} from '../workflowPresetForm';

type Props = {
  open: boolean;
  preset: WorkflowPreset | null;
  presets?: WorkflowPreset[];
  subApps?: AppDeclaration[];
  onClose: () => void;
  onStart: (configIds: string[]) => void;
  onEdit: () => void;
  onPresetChange?: (presetId: string) => void;
};

type Step = 'event' | 'preset' | 'preview';

type SubAppGroup = {
  appId: string | null;
  appName: string;
  presets: WorkflowPreset[];
};

function kindLabel(kind: string): string {
  switch (kind) {
    case 'flash_card':
      return '闪卡';
    case 'choice':
      return '选择题';
    case 'input':
      return '输入题';
    default:
      return kind;
  }
}

/** 计算预设的摘要信息 */
function getPresetSummary(preset: WorkflowPreset): { taskCount: number; estimatedMinutes: number } {
  const configIds = getDeliberateWorkflowConfigIds(preset);
  const taskCount = configIds.length;

  const deliberatePhase = preset.phases.find((p) => p.phase_type === 'deliberate_group');
  const totalFocusMinutes = deliberatePhase?.duration
    ? Math.round(deliberatePhase.duration / 60)
    : Math.round(preset.focus_duration / 60);
  const breakMinutes = Math.round(preset.break_duration / 60);
  const estimatedMinutes = taskCount > 0
    ? totalFocusMinutes + (taskCount - 1) * breakMinutes
    : 0;

  return { taskCount, estimatedMinutes };
}

/** 按子应用分组；未传入子应用时保留原有的事件分组行为。 */
function groupPresetsBySubApp(presets: WorkflowPreset[], subApps?: AppDeclaration[]): SubAppGroup[] {
  if (!subApps) {
    const groups = new Map<string, SubAppGroup>();
    for (const preset of presets) {
      const appId = preset.event_id ?? null;
      const key = appId ?? '__no_event__';
      if (!groups.has(key)) {
        groups.set(key, {
          appId,
          appName: preset.event_name ?? '未分类',
          presets: [],
        });
      }
      groups.get(key)!.presets.push(preset);
    }
    return Array.from(groups.values());
  }

  const presetsByAppId = new Map<string, WorkflowPreset[]>();
  for (const preset of presets) {
    if (!preset.app_id) continue;
    const appPresets = presetsByAppId.get(preset.app_id) ?? [];
    appPresets.push(preset);
    presetsByAppId.set(preset.app_id, appPresets);
  }

  return subApps.map((app) => ({
    appId: app.id,
    appName: app.name,
    presets: presetsByAppId.get(app.id) ?? [],
  }));
}

export default function DeliberateWorkflowPreviewModal({
  open,
  preset,
  presets,
  subApps,
  onClose,
  onStart,
  onEdit,
  onPresetChange,
}: Props) {
  const [step, setStep] = useState<Step>('event');
  const [activeAppId, setActiveAppId] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [configsMap, setConfigsMap] = useState<Record<string, DeliberateWorkflowConfig>>({});
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const prevOpenRef = useRef(false);
  const loadingRef = useRef(false);

  const hasMultiplePresets = Array.isArray(presets) && presets.length > 0;
  const availablePresets = useMemo(
    () => (Array.isArray(presets) ? presets.filter((p) => getDeliberateWorkflowConfigIds(p).length > 0) : []),
    [presets],
  );

  const subAppGroups = useMemo(
    () => groupPresetsBySubApp(availablePresets, subApps),
    [availablePresets, subApps],
  );
  const hasSubAppSelection = (subApps?.length ?? 0) > 0;
  const hasMultipleSubApps = subAppGroups.length > 1;

  const activeSubAppGroup = useMemo(
    () => subAppGroups.find((g) => g.appId === activeAppId) ?? subAppGroups[0] ?? null,
    [activeAppId, subAppGroups],
  );

  const activePreset = useMemo(() => {
    if (hasSubAppSelection || hasMultiplePresets) {
      const presetsInApp = activeSubAppGroup?.presets ?? availablePresets;
      return presetsInApp.find((p) => p.id === activePresetId) ?? presetsInApp[0] ?? null;
    }
    return preset;
  }, [activePresetId, activeSubAppGroup, availablePresets, hasMultiplePresets, hasSubAppSelection, preset]);

  const configIds = useMemo(() => getDeliberateWorkflowConfigIds(activePreset), [activePreset]);
  const configNames = useMemo(() => getDeliberateWorkflowConfigNames(activePreset), [activePreset]);
  const totalCount = configIds.length;
  const canStart = totalCount > 0;

  const totalFocusMinutes = useMemo(() => {
    if (!activePreset) return 0;
    const deliberatePhase = activePreset.phases.find((p) => p.phase_type === 'deliberate_group');
    if (deliberatePhase?.duration) return Math.round(deliberatePhase.duration / 60);
    return Math.round(activePreset.focus_duration / 60);
  }, [activePreset]);

  const breakMinutes = useMemo(() => {
    if (!activePreset) return 5;
    return Math.round(activePreset.break_duration / 60);
  }, [activePreset]);

  const totalChildren = useMemo(() => {
    return configIds.reduce((sum, id) => {
      const cfg = configsMap[id];
      return sum + (cfg?.children?.length ?? 0);
    }, 0);
  }, [configIds, configsMap]);

  const estimatedMinutes = useMemo(() => {
    if (totalCount === 0 || totalFocusMinutes === 0) return 0;
    return totalFocusMinutes + (totalCount - 1) * breakMinutes;
  }, [totalCount, totalFocusMinutes, breakMinutes]);

  // 弹窗打开时重置状态
  const resetState = useCallback(() => {
    setActiveAppId(null);
    setActivePresetId(null);
    setExpandedIndex(null);
    setConfigsMap({});

    if (hasSubAppSelection) {
      setStep('event');
    } else if (!hasMultiplePresets) {
      setStep('preview');
    } else if (hasMultipleSubApps) {
      setStep('event');
    } else {
      setStep('preset');
    }
  }, [hasMultiplePresets, hasMultipleSubApps, hasSubAppSelection]);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      resetState();
    }
    prevOpenRef.current = open;
  }, [open, resetState]);

  // 进入预览步骤时加载 config 详情
  const loadConfigs = useCallback(async (ids: string[]) => {
    if (loadingRef.current) return;

    const allLoaded = ids.every((id) => configsMap[id]);
    if (allLoaded) return;

    loadingRef.current = true;
    setLoadingConfigs(true);

    try {
      const allConfigs = await listDeliberateWorkflows(activePreset?.app_id);
      const map: Record<string, DeliberateWorkflowConfig> = {};
      for (const cfg of allConfigs) {
        if (ids.includes(cfg.id)) {
          map[cfg.id] = cfg;
        }
      }
      setConfigsMap((prev) => ({ ...prev, ...map }));
    } catch {
      // 静默失败，退化为只显示名称
    } finally {
      loadingRef.current = false;
      setLoadingConfigs(false);
    }
  }, [activePreset?.app_id, configsMap]);

  useEffect(() => {
    if (step !== 'preview' || !activePreset) return;
    const ids = getDeliberateWorkflowConfigIds(activePreset);
    if (ids.length === 0) return;
    void loadConfigs(ids);
  }, [step, activePreset, loadConfigs]);

  function handleSelectSubApp(appId: string | null) {
    setActiveAppId(appId);
    const group = subAppGroups.find((item) => item.appId === appId);
    const [onlyPreset] = group?.presets ?? [];
    if (onlyPreset && group?.presets.length === 1) {
      setActivePresetId(onlyPreset.id);
      setExpandedIndex(null);
      setStep('preview');
      onPresetChange?.(onlyPreset.id);
      return;
    }
    setActivePresetId(null);
    setStep('preset');
  }

  function handleSelectPreset(presetId: string) {
    setActivePresetId(presetId);
    setExpandedIndex(null);
    setStep('preview');
    onPresetChange?.(presetId);
  }

  function handleBackToEvent() {
    if (hasSubAppSelection) {
      setStep('event');
    } else {
      onClose();
    }
  }

  function handleBackToPreset() {
    if (hasMultiplePresets) {
      setStep('preset');
    } else if (hasSubAppSelection) {
      setStep('event');
    }
  }

  function handleStart() {
    onStart(configIds);
  }

  if (!open) return null;

  const ariaLabel = step === 'event' ? '选择子应用' : step === 'preset' ? '选择工作流' : '工作流预览';

  return (
    <AppModalFrame open={open} onClose={onClose} ariaLabel={ariaLabel}>
      <div className="w-[560px] max-w-[92vw] rounded-xl border border-ark-border bg-ark-surface shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-ark-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ark-accent/10">
              <Settings2 className="h-5 w-5 text-ark-accent" aria-hidden="true" />
            </div>
            <div>
              <div className="text-base font-semibold text-ark-text">
                {step === 'event'
                  ? '选择子应用'
                  : step === 'preset'
                    ? '选择工作流'
                    : activePreset?.name ?? '工作流预览'}
              </div>
              {step === 'preview' && activePreset && (
                <div className="mt-0.5 text-xs text-ark-text-muted">
                  {totalCount} 个主任务{totalChildren > 0 ? ` · ${totalChildren} 个可扩展方向` : ''}{estimatedMinutes > 0 ? ` · 约 ${estimatedMinutes} 分钟` : ''}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ark-text-muted transition hover:bg-ark-surface-strong hover:text-ark-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {step === 'event' ? (
            <EventStep
              groups={subAppGroups}
              onSelect={handleSelectSubApp}
            />
          ) : step === 'preset' ? (
            <PresetStep
              presets={activeSubAppGroup?.presets ?? availablePresets}
              onSelect={handleSelectPreset}
              onEdit={onEdit}
            />
          ) : (
            <PreviewStep
              configIds={configIds}
              configNames={configNames}
              totalCount={totalCount}
              breakMinutes={breakMinutes}
              configsMap={configsMap}
              loadingConfigs={loadingConfigs}
              expandedIndex={expandedIndex}
              onExpandToggle={setExpandedIndex}
              totalChildren={totalChildren}
              canStart={canStart}
            />
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between border-t border-ark-border px-5 py-3">
          {step === 'event' ? (
            <>
              <div />
              <Button variant="secondary" onClick={onClose}>
                取消
              </Button>
            </>
          ) : step === 'preset' ? (
            <>
              {hasSubAppSelection ? (
                <Button variant="secondary" onClick={handleBackToEvent}>
                  返回选择
                </Button>
              ) : (
                <div />
              )}
              <Button variant="secondary" onClick={onClose}>
                取消
              </Button>
            </>
          ) : (
            <>
              {hasMultiplePresets || hasSubAppSelection ? (
                <Button variant="secondary" onClick={handleBackToPreset}>
                  返回选择
                </Button>
              ) : (
                <div />
              )}
              <Button
                variant="primary"
                leftIcon={<Play className="h-4 w-4" />}
                disabled={!canStart}
                onClick={handleStart}
                data-onboarding-anchor="workflow-start-button"
              >
                启动工作流
              </Button>
            </>
          )}
        </div>
      </div>
    </AppModalFrame>
  );
}

/** 第一步：选择子应用 */
function EventStep({
  groups,
  onSelect,
}: {
  groups: SubAppGroup[];
  onSelect: (appId: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const presetCount = group.presets.length;
        return (
          <button
            key={group.appId ?? '__no_app__'}
            type="button"
            onClick={() => onSelect(group.appId)}
            data-onboarding-anchor={group.appName === '408' ? 'workflow-sub-app' : undefined}
            className="flex w-full items-center gap-4 rounded-lg border border-ark-border bg-ark-surface-subtle px-4 py-3.5 text-left transition hover:bg-ark-surface-strong hover:border-ark-accent/30"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ark-accent/10">
              <FolderOpen className="h-5 w-5 text-ark-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="truncate text-sm font-semibold text-ark-text">{group.appName}</span>
              <div className="mt-1 text-xs text-ark-text-muted">
                {presetCount} 个工作流
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-ark-text-faint" />
          </button>
        );
      })}
    </div>
  );
}

/** 第二步：选择工作流 */
function PresetStep({
  presets,
  onSelect,
  onEdit,
}: {
  presets: WorkflowPreset[];
  onSelect: (presetId: string) => void;
  onEdit: () => void;
}) {
  if (presets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle px-4 py-8 text-center">
        <div className="text-sm font-medium text-ark-text">还没有工作流</div>
        <div className="mt-1 text-xs text-ark-text-muted">请先创建至少一个工作流后再启动。</div>
        <Button variant="secondary" className="mt-4" onClick={onEdit}>
          去创建工作流
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {presets.map((preset) => {
        const { taskCount, estimatedMinutes } = getPresetSummary(preset);
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.id)}
            className="flex w-full items-center gap-4 rounded-lg border border-ark-border bg-ark-surface-subtle px-4 py-3.5 text-left transition hover:bg-ark-surface-strong hover:border-ark-accent/30"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ark-accent/10">
              <ListChecks className="h-5 w-5 text-ark-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-ark-text">{preset.name}</span>
                {preset.is_default && (
                  <span className="shrink-0 rounded-full bg-ark-accent/10 px-2 py-0.5 text-[10px] font-medium text-ark-accent">
                    默认
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-ark-text-muted">
                <span className="flex items-center gap-1">
                  <ListChecks className="h-3 w-3" />
                  {taskCount} 个任务
                </span>
                {estimatedMinutes > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    约 {estimatedMinutes} 分钟
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-ark-text-faint" />
          </button>
        );
      })}
    </div>
  );
}

/** 第三步：预览工作流内容 */
function PreviewStep({
  configIds,
  configNames,
  totalCount,
  breakMinutes,
  configsMap,
  loadingConfigs,
  expandedIndex,
  onExpandToggle,
  totalChildren,
  canStart,
}: {
  configIds: string[];
  configNames: string[];
  totalCount: number;
  breakMinutes: number;
  configsMap: Record<string, DeliberateWorkflowConfig>;
  loadingConfigs: boolean;
  expandedIndex: number | null;
  onExpandToggle: (index: number | null) => void;
  totalChildren: number;
  canStart: boolean;
}) {
  if (!canStart) {
    return (
      <div className="rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle px-4 py-8 text-center">
        <div className="text-sm font-medium text-ark-text">还没有专注工作</div>
        <div className="mt-1 text-xs text-ark-text-muted">请先编辑编排，添加至少一个专注工作后再启动。</div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-0">
        {configIds.map((configId, index) => {
          const name = configNames[index] ?? `专注工作 ${index + 1}`;
          const cfg = configsMap[configId];
          const childrenCount = cfg?.children?.length ?? 0;
          const isExpanded = expandedIndex === index;
          const hasChildren = childrenCount > 0;

          return (
            <div key={configId}>
              {/* 主任务卡片 */}
              <div
                className={`rounded-lg border border-ark-border bg-ark-surface-subtle ${
                  hasChildren ? 'cursor-pointer transition hover:bg-ark-surface-strong' : ''
                }`}
                onClick={() => hasChildren && onExpandToggle(isExpanded ? null : index)}
                role={hasChildren ? 'button' : undefined}
                tabIndex={hasChildren ? 0 : undefined}
                onKeyDown={(e) => {
                  if (!hasChildren) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onExpandToggle(isExpanded ? null : index);
                  }
                }}
              >
                <div className="flex items-center gap-3 px-3 py-3">
                  {/* 序号 */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ark-accent/15 text-xs font-semibold text-ark-accent">
                    {index + 1}
                  </div>

                  {/* 主信息 */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ark-text">
                      {name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ark-text-muted">
                      {cfg ? (
                        <>
                          <span>{kindLabel(cfg.kind)}</span>
                          <span className="text-ark-text-faint">·</span>
                          <span>{cfg.target_count} 题</span>
                        </>
                      ) : loadingConfigs ? (
                        <span className="text-ark-text-faint">加载中...</span>
                      ) : null}
                    </div>
                  </div>

                  {/* 右侧：展开箭头 + 子任务数 */}
                  <div className="flex shrink-0 items-center gap-2">
                    {hasChildren && (
                      <div className="flex items-center gap-1">
                        <span className="rounded-full bg-ark-accent/10 px-2 py-0.5 text-[10px] font-medium text-ark-accent">
                          {childrenCount} 个扩展
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-ark-text-muted transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    )}
                    {!hasChildren && cfg && (
                      <span className="text-[10px] text-ark-text-faint">无扩展</span>
                    )}
                  </div>
                </div>

                {/* 展开的子任务列表 */}
                {isExpanded && hasChildren && cfg?.children && (
                  <div className="border-t border-ark-border/60 bg-ark-surface/50 px-3 py-2.5">
                    <div className="mb-2 text-[11px] font-medium text-ark-text-muted">
                      可扩展学习方向
                    </div>
                    <div className="space-y-1.5 pl-4">
                      {cfg.children.map((child) => (
                        <div
                          key={child.config_id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <ChevronRight className="h-3 w-3 shrink-0 text-ark-text-faint" />
                          <span className="truncate text-ark-text-muted">
                            {child.label}
                          </span>
                          {child.is_recommended && (
                            <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-500">
                              推荐
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 pl-4 text-[10px] text-ark-text-faint">
                      检测未达标时可进入子任务针对性练习
                    </div>
                  </div>
                )}
              </div>

              {/* 休息间隔（最后一个后面不加） */}
              {index < totalCount - 1 && (
                <div className="flex items-center justify-center py-2">
                  <div className="flex items-center gap-2 text-[11px] text-ark-text-muted">
                    <div className="h-px w-8 bg-ark-border" />
                    <span>休息 {breakMinutes} 分钟</span>
                    <div className="h-px w-8 bg-ark-border" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部提示 */}
      {totalChildren > 0 && (
        <div className="mt-4 rounded-lg border border-ark-border/60 bg-ark-surface-subtle/50 px-3 py-2.5">
          <div className="flex items-start gap-2 text-xs text-ark-text-muted">
            <span className="mt-0.5">💡</span>
            <div>
              带 <span className="font-medium text-ark-accent">扩展</span> 标记的专注工作，
              在检测未达标时可进入子任务针对性练习，完成后回到原任务继续。
            </div>
          </div>
        </div>
      )}
    </>
  );
}
