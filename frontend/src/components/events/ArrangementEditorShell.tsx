import React from 'react';

type ArrangementEditorShellProps = {
  kind: 'task' | 'appointment';
  isEditing: boolean;
  isSaving?: boolean;
  previewTime?: string;
  onDelete?: () => void;
  onCancel: () => void;
  onSave: () => void;
  children: React.ReactNode;
};

export default function ArrangementEditorShell({
  kind,
  isEditing,
  isSaving,
  previewTime,
  onDelete,
  onCancel,
  onSave,
  children,
}: ArrangementEditorShellProps) {
  const label = kind === 'appointment' ? '日程' : '任务';
  return (
    <div className="grid gap-3 rounded-lg border border-blue-300/20 bg-blue-400/10 p-3">
      {children}
      {previewTime ? <div className="text-xs text-ark-text-faint">时间预览 {previewTime}</div> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {isEditing && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20"
          >
            删除{label}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-ark-border px-3 py-2 text-sm text-ark-text hover:bg-ark-surface-subtle"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          保存{label}
        </button>
      </div>
    </div>
  );
}
