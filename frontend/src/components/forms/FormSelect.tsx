import React from 'react';

import { cn } from '../../lib/utils';
import FormFieldLabel from './FormFieldLabel';

interface FormSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  className?: string;
}

export default function FormSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  className,
}: FormSelectProps) {
  return (
    <FormFieldLabel label={label} className={className}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
        className={cn(
          'rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FormFieldLabel>
  );
}
