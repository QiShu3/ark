import { ChevronDown, ChevronRight, Play, Settings2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppModalFrame from '../AppModalFrame';
import Button from '../Button';
import { listDeliberateWorkflows, type DeliberateWorkflowConfig } from '../../lib/deliberate/api';
import {
  getDeliberateWorkflowConfigIds,
  getDeliberateWorkflowConfigNames,
  type WorkflowPreset,
} from '../workflowPresetForm';

type Props = {
  open: boolean;
  preset: WorkflowPreset | null;
  presets?: WorkflowPreset[];
  onClose: () => void;
  onStart: (configIds: string[]) => void;
  onEdit: () => void;
  onPresetChange?: (presetId: string) => void;
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

export default function DeliberateWorkflowPreviewModal({
  open,
  preset,
  presets,
  onClose,
  onStart,
  onEdit,
  onPresetChange,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [configsMap, setConfigsMap] = useState<Record<string, DeliberateWorkflowConfig>>({});
  const [loadingConfigs, setLoadingConfigs] = useState(false);

  const configIds = useMemo(() => getDeliberateWorkflowConfigIds(preset), [preset]);
  const configNames = useMemo(() => getDeliberateWorkflowConfigNames(preset), [preset]);
  const totalCount = configIds.length;
  const canStart = totalCount > 0;

  const showPresetPicker =
    Array.isArray(presets) && presets.length > 1 && typeof onPresetChange === 'function';

  // 总专注时长（deliberate_group 阶段总时长，或 focus_duration）
  const totalFocusMinutes = useMemo(() => {
    if (!preset) return 0;
    const deliberatePhase = preset.phases.find((p) => p.phase_type === 'deliberate_group');
    if (deliberatePhase?.duration) return Math.round(deliberatePhase.duration / 60);
    return Math.round(preset.focus_duration / 60);
  }, [preset]);

  const breakMinutes = useMemo(() => {
    if (!preset) return 5;
    return Math.round(preset.break_duration / 60);
  }, [preset]);

  // 总可扩展子任务数
  const totalChildren = useMemo(() => {
    return configIds.reduce((sum, id) => {
      const cfg = configsMap[id];
      return sum + (cfg?.children?.length ?? 0);
    }, 0);
  }, [configIds, configsMap]);

  // 预计总时长（总专注时长 + 间隔休息）
  const estimatedMinutes = useMemo(() => {
    if (totalCount === 0 || totalFocusMinutes === 0) return 0;
    return totalFocusMinutes + (totalCount - 1) * breakMinutes;
  }, [totalCount, totalFocusMinutes, breakMinutes]);

  // 弹窗打开时加载 config 详情
  useEffect(() => {
    if (!open || !preset) return;
    const ids = getDeliberateWorkflowConfigIds(preset);
    if (ids.length === 0) return;

    // 检查是否已经有缓存
    const allLoaded = ids.every((id) => configsMap[id]);
    if (allLoaded) return;

    let cancelled = false;
    setLoadingConfigs(true);

    listDeliberateWorkflows()
      .then((allConfigs) => {
        if (cancelled) return;
        const map: Record<string, DeliberateWorkflowConfig> = {};
        for (const cfg of allConfigs) {
          if (ids.includes(cfg.id)) {
            map[cfg.id] = cfg;
          }
        }
        setConfigsMap((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {
        // 静默失败，退化为只显示名称
      })
      .finally(() => {
        if (!cancelled) setLoadingConfigs(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, preset, configsMap]);

  // 切换预设时重置展开状态
  useEffect(() => {
    setExpandedIndex(null);
  }, [preset?.id]);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!pickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pickerOpen]);

  // 弹窗关闭时重置下拉状态
  useEffect(() => {
    if (!open) setPickerOpen(false);
  }, [open]);

  if (!preset) return null;

  return (
    <AppModalFrame open={open} onClose={onClose} ariaLabel="编排预览">
      <div className="w-[560px] max-w-[92vw] rounded-xl border border-ark-border bg-ark-surface shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-ark-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ark-accent/10">
              <Settings2 className="h-5 w-5 text-ark-accent" aria-hidden="true" />
            </div>
            <div ref={pickerRef} className="relative">
              {showPresetPicker ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPickerOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-left transition hover:opacity-80"
                    aria-haspopup="listbox"
                    aria-expanded={pickerOpen}
                    aria-label="切换工作流预设"
                  >
                    <div className="text-base font-semibold text-ark-text">
                      {preset.name}
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-ark-text-muted transition-transform ${
                        pickerOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <div className="mt-0.5 text-xs text-ark-text-muted">
                    {totalCount} 个主任务 · {totalChildren > 0 ? `${totalChildren} 个可扩展方向 · ` : ''}
                    约 {estimatedMinutes} 分钟
                  </div>
                  {pickerOpen && (
                    <div
                      role="listbox"
                      className="absolute left-0 top-full z-50 mt-1 w-[280px] max-h-[50vh] overflow-y-auto rounded-lg border border-ark-border bg-ark-surface-strong py-1 shadow-xl animate-fadeIn"
                    >
                      {presets!.map((p) => {
                        const selected = p.id === preset.id;
                        const count = getDeliberateWorkflowConfigIds(p).length;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              onPresetChange(p.id);
                              setPickerOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                              selected
                                ? 'bg-ark-accent/10 text-ark-text'
                                : 'text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text'
                            }`}
                          >
                            <span className="truncate font-medium">{p.name}</span>
                            <span className="shrink-0 text-[11px] text-ark-text-faint">
                              {count} 个专注工作
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <div className="text-base font-semibold text-ark-text">
                    {preset.name}
                  </div>
                  <div className="mt-0.5 text-xs text-ark-text-muted">
                    {totalCount} 个主任务
                    {totalChildren > 0 ? ` · ${totalChildren} 个可扩展方向` : ''}
                    {estimatedMinutes > 0 ? ` · 约 ${estimatedMinutes} 分钟` : ''}
                  </div>
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

        {/* 工作流列表 */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {canStart ? (
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
                      onClick={() => hasChildren && setExpandedIndex(isExpanded ? null : index)}
                      role={hasChildren ? 'button' : undefined}
                      tabIndex={hasChildren ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (!hasChildren) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedIndex(isExpanded ? null : index);
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
          ) : (
            <div className="rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle px-4 py-8 text-center">
              <div className="text-sm font-medium text-ark-text">还没有专注工作</div>
              <div className="mt-1 text-xs text-ark-text-muted">请先编辑编排，添加至少一个专注工作后再启动。</div>
            </div>
          )}

          {/* 底部提示 */}
          {totalCount > 0 && totalChildren > 0 && (
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
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between border-t border-ark-border px-5 py-3">
          <Button variant="secondary" onClick={onEdit}>
            编辑编排
          </Button>
          <Button
            variant="primary"
            leftIcon={<Play className="h-4 w-4" />}
            disabled={!canStart}
            onClick={() => onStart(configIds)}
          >
            启动工作流
          </Button>
        </div>
      </div>
    </AppModalFrame>
  );
}
