import React from 'react';

import { cn } from '../../lib/utils';
import FormFieldLabel from './FormFieldLabel';

interface FormDateTimeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'date' | 'datetime-local';
  className?: string;
}

export default function FormDateTimeInput({
  label,
  value,
  onChange,
  type = 'datetime-local',
  className,
}: FormDateTimeInputProps) {
  return (
    <FormFieldLabel label={label} className={className}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={cn(
          'rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        )}
      />
    </FormFieldLabel>
  );
}
