import { type ReactNode } from 'react';
import AppModalFrame from './AppModalFrame';
import Button from './Button';

export interface FocusWorkConfigFields {
  id: string;
  label: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  showEnableToggle?: boolean; // 默认 true，Vocab 单模块场景可设为 false
  showSyncToggle?: boolean;   // 默认 true，Vocab 强制同步场景可设为 false
  contentConfig: ReactNode;
  defaultFocusDuration: number; // 分钟
  onFocusDurationChange: (v: number) => void;
  addToTodayPlan: boolean;
  onAddToTodayPlanChange: (v: boolean) => void;
}

export interface SubAppConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => Promise<void> | void;
  isSaving: boolean;
  appName: string;
  focusWorks: FocusWorkConfigFields[];
  eventName?: string | null;
  description?: string;
  saveError?: string | null;
  saveLabel?: string;
}

export default function SubAppConfigModal({
  open,
  onClose,
  onSave,
  isSaving,
  appName,
  focusWorks,
  eventName,
  description,
  saveError,
  saveLabel,
}: SubAppConfigModalProps) {
  const eventLine = eventName ? `计划事件：${eventName}` : '未绑定计划事件';

  return (
    <AppModalFrame
      open={open}
      onClose={onClose}
      zIndexClassName="z-[80]"
      ariaLabel={`配置${appName}`}
      panelClassName="w-full max-w-2xl overflow-y-auto rounded-lg border border-ark-border bg-ark-surface-strong p-6 text-ark-text shadow-2xl shadow-black/40"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-ark-border pb-5">
        <div>
          <div className="text-sm uppercase tracking-[0.28em] text-[var(--ark-text-faint)] font-semibold">
            Configuration
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">配置{appName}</h2>
          <p className="mt-2 text-xs text-ark-text-muted">{eventLine}</p>
          {description ? (
            <p className="mt-2 text-xs text-ark-text-muted">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-ark-border px-4 py-2 text-sm text-ark-text transition hover:border-ark-border hover:text-ark-text"
          aria-label={`关闭配置${appName}弹窗`}
        >
          关闭
        </button>
      </div>

      {/* Body */}
      <div className="mt-6 space-y-5">
        {focusWorks.map((fw) => (
          <FocusWorkSection key={fw.id} fw={fw} />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 flex flex-col gap-3 border-t border-ark-border pt-5">
        {saveError ? (
          <p className="text-sm text-rose-200">{saveError}</p>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="cta" loading={isSaving} loadingText="保存中..." onClick={() => void onSave()}>
            {saveLabel ?? '保存配置'}
          </Button>
        </div>
      </div>
    </AppModalFrame>
  );
}

function FocusWorkSection({ fw }: { fw: FocusWorkConfigFields }) {
  return (
    <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-5 space-y-4">
      {/* Header: label + enable toggle */}
      <div className="flex items-center justify-between gap-4 border-b border-ark-border pb-3">
        <h3 className="text-base font-semibold text-ark-text">{fw.label}</h3>
        {fw.showEnableToggle !== false ? (
          <label className="flex items-center gap-2 text-xs text-ark-text-muted">
            <input
              type="checkbox"
              checked={fw.enabled}
              onChange={(e) => fw.onEnabledChange(e.target.checked)}
            />
            启用
          </label>
        ) : null}
      </div>

      {/* Content config (sub-app slot) */}
      {fw.enabled ? (
        <>
          <div>{fw.contentConfig}</div>

          {/* Task config */}
          <div className={`grid gap-4 ${fw.showSyncToggle !== false ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
            <div>
              <label className="mb-2 block text-xs text-ark-text-muted">
                默认专注时长 (分钟)
              </label>
              <input
                type="number"
                min={5}
                max={120}
                value={fw.defaultFocusDuration}
                onChange={(e) => fw.onFocusDurationChange(Math.max(5, Math.min(120, Number(e.target.value) || 5)))}
                className="w-full rounded-lg border border-ark-border bg-[var(--ark-surface)] px-4 py-3 text-sm text-ark-text outline-none transition focus:border-[var(--ark-border-strong)]"
              />
            </div>
            {fw.showSyncToggle !== false ? (
              <label className="flex items-center gap-2 text-xs text-ark-text-muted sm:col-span-1 self-end pb-1">
                <input
                  type="checkbox"
                  checked={fw.addToTodayPlan}
                  onChange={(e) => fw.onAddToTodayPlanChange(e.target.checked)}
                />
                同步到今日安排
              </label>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
