import React from 'react';

import type { EventItem } from '../../lib/events/types';
import type { AppointmentStoredStatus, CompletionPeriodType } from '../taskTypes';
import {
  FormCheckbox,
  FormDateTimeInput,
  FormInput,
  FormSelect,
  FormTextarea,
} from '../forms';

type AppointmentArrangementFormState = {
  title: string;
  content: string;
  status: AppointmentStoredStatus;
  startsAt: string;
  endsAt: string;
  repeatRule: string;
  eventId: string;
  periodType: CompletionPeriodType;
  customPeriodDays: number;
  maxCompletionsPerPeriod: number;
  weekdayOnly: boolean;
  timeInheritsFromEvent: boolean;
  timeOverridden: boolean;
};

type AppointmentArrangementFormProps = {
  form: AppointmentArrangementFormState;
  eventOptions: EventItem[];
  onChange: (patch: Partial<AppointmentArrangementFormState>) => void;
  onEventSelect: (eventId: string) => void;
};

const STATUS_OPTIONS = [
  { value: 'pending', label: '待出席' },
  { value: 'attended', label: '已出席' },
  { value: 'missed', label: '已错过' },
  { value: 'cancelled', label: '已取消' },
];

const PERIOD_TYPE_OPTIONS = [
  { value: 'once', label: '一次性' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'custom_days', label: '自定义天数' },
];

export default function AppointmentArrangementForm({
  form,
  eventOptions,
  onChange,
  onEventSelect,
}: AppointmentArrangementFormProps) {
  const eventSelectOptions = [
    { value: '', label: '不绑定事件' },
    ...eventOptions.map((option) => ({
      value: option.id,
      label: option.is_primary ? `当前事件：${option.name}` : option.name,
    })),
  ];

  return (
    <>
      <FormInput
        label="标题"
        value={form.title}
        onChange={(value) => onChange({ title: value })}
      />
      <FormSelect
        label="状态"
        value={form.status}
        onChange={(value) => onChange({ status: value as AppointmentStoredStatus })}
        options={STATUS_OPTIONS}
      />
      <FormTextarea
        label="备注"
        value={form.content}
        onChange={(value) => onChange({ content: value })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <FormDateTimeInput
          label="开始时间"
          value={form.startsAt}
          onChange={(value) => onChange({ startsAt: value })}
        />
        <FormDateTimeInput
          label="结束时间"
          value={form.endsAt}
          onChange={(value) => onChange({ endsAt: value })}
        />
      </div>
      <FormSelect
        label="关联事件"
        value={form.eventId}
        onChange={(value) => onEventSelect(value)}
        options={eventSelectOptions}
      />
      <FormInput
        label="重复规则"
        value={form.repeatRule}
        onChange={(value) => onChange({ repeatRule: value })}
        placeholder="例如：weekly"
      />
      <div className="grid gap-3 md:grid-cols-2">
        <FormSelect
          label="完成周期"
          value={form.periodType}
          onChange={(value) => onChange({ periodType: value as CompletionPeriodType })}
          options={PERIOD_TYPE_OPTIONS}
        />
        <FormInput
          label="单周期最多完成次数"
          value={String(form.maxCompletionsPerPeriod)}
          onChange={(value) => onChange({ maxCompletionsPerPeriod: Number(value) })}
          type="number"
          min={1}
        />
      </div>
      {form.periodType === 'custom_days' ? (
        <FormInput
          label="自定义完成周期（天）"
          value={String(form.customPeriodDays)}
          onChange={(value) => onChange({ customPeriodDays: Number(value) })}
          type="number"
          min={1}
        />
      ) : null}
      <FormCheckbox
        label="仅工作日可完成"
        checked={form.weekdayOnly}
        onChange={(checked) => onChange({ weekdayOnly: checked })}
      />
    </>
  );
}
