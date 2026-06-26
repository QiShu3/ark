import React from 'react';

import { cn } from '../../lib/utils';

interface FormCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export default function FormCheckbox({
  label,
  checked,
  onChange,
  disabled,
  className,
}: FormCheckboxProps) {
  return (
    <label className={cn('flex items-center gap-2 text-xs text-ark-text', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={label}
        className="h-4 w-4 rounded border-ark-border bg-ark-surface-subtle text-blue-500 focus:ring-blue-500/50"
      />
      {label}
    </label>
  );
}
