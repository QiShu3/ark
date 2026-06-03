import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

type HomeSectionHeaderProps = {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  titleClassName?: string;
};

export default function HomeSectionHeader({
  title,
  action,
  className,
  titleClassName,
}: HomeSectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className={cn('text-base font-semibold text-[var(--ark-text)]', titleClassName)}>{title}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
