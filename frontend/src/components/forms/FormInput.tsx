import React from 'react';

import { cn } from '../../lib/utils';
import FormFieldLabel from './FormFieldLabel';

interface FormInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  min,
  max,
  placeholder,
  disabled,
  className,
}: FormInputProps) {
  return (
    <FormFieldLabel label={label} className={className}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        className={cn(
          'rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        )}
      />
    </FormFieldLabel>
  );
}
