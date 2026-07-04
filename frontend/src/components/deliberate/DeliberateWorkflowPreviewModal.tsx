import { Play, Settings2, X } from 'lucide-react';
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
  onClose: () => void;
  onStart: (configIds: string[]) => void;
  onEdit: () => void;
};

export default function DeliberateWorkflowPreviewModal({
  open,
  preset,
  onClose,
  onStart,
  onEdit,
}: Props) {
  if (!preset) return null;

  const configIds = getDeliberateWorkflowConfigIds(preset);
  const configNames = getDeliberateWorkflowConfigNames(preset);
  const totalCount = configIds.length;
  const canStart = totalCount > 0;

  return (
    <AppModalFrame open={open} onClose={onClose} ariaLabel="编排预览">
      <div className="w-[560px] max-w-[92vw] rounded-xl border border-ark-border bg-ark-surface shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-ark-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ark-accent/10">
              <Settings2 className="h-5 w-5 text-ark-accent" aria-hidden="true" />
            </div>
            <div>
              <div className="text-base font-semibold text-ark-text">
                {preset.name}
              </div>
              <div className="mt-0.5 text-xs text-ark-text-muted">
                共 {totalCount} 个专注工作
              </div>
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
