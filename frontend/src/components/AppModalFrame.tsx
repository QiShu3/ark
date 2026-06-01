import type { MouseEvent, ReactNode, Ref } from 'react';

type AppModalFrameProps = {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  closeOnBackdrop?: boolean;
  avoidNav?: boolean;
  zIndexClassName?: string;
  backdropClassName?: string;
  contentClassName?: string;
  panelClassName?: string;
  panelRef?: Ref<HTMLDivElement>;
  role?: 'dialog' | 'alertdialog';
  ariaLabel?: string;
  ariaLabelledBy?: string;
  disableDefaultAnimation?: boolean;
};

const NAV_SAFE_TOP = 120;
const NAV_SAFE_BOTTOM = 24;

/** 统一业务弹窗外层布局，负责安全区、居中和遮罩关闭行为。 */
export default function AppModalFrame({
  open,
  onClose,
  children,
  closeOnBackdrop = true,
  avoidNav = true,
  zIndexClassName = 'z-[60]',
  backdropClassName = '',
  contentClassName = '',
  panelClassName = '',
  panelRef,
  role = 'dialog',
  ariaLabel,
  ariaLabelledBy,
  disableDefaultAnimation = false,
}: AppModalFrameProps) {
  if (!open) return null;

  const frameClassName = [
    'ark-modal-backdrop fixed inset-0 flex',
    disableDefaultAnimation ? '' : 'animate-in fade-in duration-200',
    zIndexClassName,
    backdropClassName,
  ].join(' ').trim();

  const contentWrapClassName = [
    'flex h-full w-full items-center justify-center px-4',
    contentClassName,
  ].join(' ').trim();

  const panelClasses = ['ark-modal', panelClassName].join(' ').trim();
  const contentWrapStyle = {
    paddingTop: avoidNav ? NAV_SAFE_TOP : 24,
    paddingBottom: avoidNav ? NAV_SAFE_BOTTOM : 24,
  };
  const panelStyle = {
    maxHeight: avoidNav ? `calc(100vh - ${NAV_SAFE_TOP + NAV_SAFE_BOTTOM}px)` : 'calc(100vh - 3rem)',
  };

  const handleBackdropClick = () => {
    if (!closeOnBackdrop) return;
    onClose?.();
  };

  const handlePanelClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div className={frameClassName} onClick={handleBackdropClick}>
      <div className={contentWrapClassName} style={contentWrapStyle}>
        <div
          ref={panelRef}
          role={role}
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={panelClasses}
          style={panelStyle}
          onClick={handlePanelClick}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
