import { ChevronDown, Play, Settings2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AppModalFrame from '../AppModalFrame';
import Button from '../Button';
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

  const configIds = getDeliberateWorkflowConfigIds(preset);
  const configNames = getDeliberateWorkflowConfigNames(preset);
  const totalCount = configIds.length;
  const canStart = totalCount > 0;

  const showPresetPicker =
    Array.isArray(presets) && presets.length > 1 && typeof onPresetChange === 'function';

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
                    共 {totalCount} 个专注工作
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
                    共 {totalCount} 个专注工作
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
            <div className="space-y-2">
              {configNames.map((name, index) => (
                <div
                  key={`${configIds[index] ?? index}-${name}`}
                  className="flex items-center gap-3 rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2.5"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ark-accent/15 text-xs font-semibold text-ark-accent">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ark-text">
                      {name}
                    </div>
                  </div>
                  {index < totalCount - 1 && (
                    <div className="hidden" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-ark-border bg-ark-surface-subtle px-4 py-8 text-center">
              <div className="text-sm font-medium text-ark-text">还没有专注工作</div>
              <div className="mt-1 text-xs text-ark-text-muted">请先编辑编排，添加至少一个专注工作后再启动。</div>
            </div>
          )}

          {/* 流程连接线效果 */}
          {totalCount > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-ark-text-muted">
              <span>按顺序执行</span>
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
