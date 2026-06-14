import type React from 'react';
import { Link } from 'react-router-dom';

type SubAppPageHeaderProps = {
  title: string;
  description?: string;
  breadcrumb?: string;
  backTo?: string;
  backLabel?: string;
  borderBottom?: boolean;
  tracking?: 'tight' | 'normal';
};

export default function SubAppPageHeader({
  title,
  description,
  breadcrumb,
  backTo,
  backLabel,
  borderBottom = false,
  tracking = 'tight',
}: SubAppPageHeaderProps) {
  return (
    <div className={`flex items-end justify-between gap-4 ${borderBottom ? 'border-b border-ark-border pb-6' : ''}`}>
      <div>
        {breadcrumb ? (
          <div className="text-sm uppercase tracking-[0.28em] text-ark-text-faint">{breadcrumb}</div>
        ) : null}
        <h1 className={`${breadcrumb ? 'mt-3' : ''} text-3xl font-semibold tracking-${tracking} text-ark-text`}>
          {title}
        </h1>
        {description ? (
          <p className={`${breadcrumb ? 'mt-1' : 'mt-3'} text-ark-text-muted`}>{description}</p>
        ) : null}
      </div>
      {backTo ? (
        <Link to={backTo} className="text-sm text-ark-text-muted hover:text-ark-text shrink-0">
          {backLabel ?? '返回'}
        </Link>
      ) : null}
    </div>
  );
}
