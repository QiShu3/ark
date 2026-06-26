import React from 'react';

import { cn } from '../../lib/utils';
import FormFieldLabel from './FormFieldLabel';

interface FormTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minRows?: number;
  className?: string;
}

export default function FormTextarea({
  label,
  value,
  onChange,
  minRows = 3,
  className,
}: FormTextareaProps) {
  return (
    <FormFieldLabel label={label} className={className}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={minRows}
        aria-label={label}
        className={cn(
          'min-h-16 rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        )}
      />
    </FormFieldLabel>
  );
}
