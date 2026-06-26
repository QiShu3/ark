import React from 'react';

import type { EventItem } from '../../lib/events/types';
import type { CompletionPeriodType } from '../taskTypes';
import {
  FormCheckbox,
  FormDateTimeInput,
  FormInput,
  FormSelect,
  FormTextarea,
} from '../forms';

type TaskArrangementFormState = {
  title: string;
  content: string;
  event: string;
  eventId: string;
  periodType: CompletionPeriodType;
  customPeriodDays: number;
  maxCompletionsPerPeriod: number;
  weekdayOnly: boolean;
  timeInheritsFromEvent: boolean;
  timeOverridden: boolean;
  taskType: 'focus' | 'checkin';
  startDate: string;
  dueDate: string;
};

type TaskArrangementFormProps = {
  form: TaskArrangementFormState;
  eventOptions: EventItem[];
  onChange: (patch: Partial<TaskArrangementFormState>) => void;
  onEventSelect: (eventId: string) => void;
};

const TASK_TYPE_OPTIONS = [
  { value: 'focus', label: '专注任务' },
  { value: 'checkin', label: '快速打卡' },
];

const PERIOD_TYPE_OPTIONS = [
  { value: 'once', label: '一次性' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'custom_days', label: '自定义天数' },
];

export default function TaskArrangementForm({
  form,
  eventOptions,
  onChange,
  onEventSelect,
}: TaskArrangementFormProps) {
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
        label="任务类型"
        value={form.taskType}
        onChange={(value) => onChange({ taskType: value as 'focus' | 'checkin' })}
        options={TASK_TYPE_OPTIONS}
      />
      <FormTextarea
        label="备注"
        value={form.content}
        onChange={(value) => onChange({ content: value })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <FormDateTimeInput
          label="开始日期"
          value={form.startDate}
          onChange={(value) => onChange({ startDate: value })}
        />
        <FormDateTimeInput
          label="截止日期"
          value={form.dueDate}
          onChange={(value) => onChange({ dueDate: value })}
        />
      </div>
      <FormSelect
        label="关联事件"
        value={form.eventId}
        onChange={(value) => onEventSelect(value)}
        options={eventSelectOptions}
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
