import type { FocusWorkDefinition, FocusWorkType } from './focusWorkTypes';
import VocabTodayFocusWork from '../Vocab/VocabTodayFocusWork';
import ChoiceFocusWork from '../ERC/ChoiceFocusWork';
import TaskFocusWork from './TaskFocusWork';
import InputFocusWork from '../Input/InputFocusWork';
import { normalizeFocusWorkType } from './focusWorkTypes';

// 组件映射：专注工作类型 → render 函数
const RENDER_MAP: Record<string, (props: Parameters<FocusWorkDefinition['render']>[0]) => React.ReactNode> = {
  flash_card: (props) => <VocabTodayFocusWork {...props} />,
  choice: (props) => <ChoiceFocusWork {...props} />,
  task_focus: (props) => <TaskFocusWork {...props} />,
  input: (props) => <InputFocusWork {...props} />,
};

function buildRegistryEntry(fwDecl: { type: string; label: string }, subtitle: string): FocusWorkDefinition {
  return {
    type: (normalizeFocusWorkType(fwDecl.type) ?? fwDecl.type) as FocusWorkType,
    title: fwDecl.label,
    subtitle,
    render: RENDER_MAP[normalizeFocusWorkType(fwDecl.type) ?? fwDecl.type] ?? (() => null),
  };
}

function buildRegistry(): Record<string, FocusWorkDefinition> {
  const entries: Record<string, FocusWorkDefinition> = {};
  entries.flash_card = buildRegistryEntry({ type: 'flash_card', label: '今日单词' }, '背单词');
  entries.choice = buildRegistryEntry({ type: 'choice', label: '选择练习' }, '阅读训练');
  entries['task_focus'] = {
    type: 'task_focus',
    title: '任务专注',
    subtitle: '自定义任务',
    render: RENDER_MAP['task_focus'],
  };
  entries['input'] = {
    type: 'input',
    title: '输入练习',
    subtitle: '手动输入作答',
    render: RENDER_MAP['input'],
  };
  return entries;
}

export const focusWorkRegistry = buildRegistry() as Record<FocusWorkType, FocusWorkDefinition>;

export const FOCUS_WORK_LABELS: Record<string, string> = {};
FOCUS_WORK_LABELS.flash_card = '背单词 · 今日单词';
FOCUS_WORK_LABELS.choice = '阅读训练 · 选择练习';
FOCUS_WORK_LABELS.input = '输入练习';
FOCUS_WORK_LABELS['task_focus'] = '任务专注';

export function getFocusWorkDefinition(type: FocusWorkType | null | undefined): FocusWorkDefinition | null {
  if (!type) return null;
  return (focusWorkRegistry as Record<string, FocusWorkDefinition>)[type] ?? null;
}
