import React from 'react';

import { cn } from '../../lib/utils';

interface FormFieldLabelProps {
  label: string;
  className?: string;
  children: React.ReactNode;
}

export default function FormFieldLabel({ label, className, children }: FormFieldLabelProps) {
  return (
    <label className={cn('grid gap-1 text-xs text-ark-text-muted', className)}>
      {label}
      {children}
    </label>
  );
}
