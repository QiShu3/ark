import type { FocusWorkDefinition, FocusWorkType } from './focusWorkTypes';
import { subAppList, type SubAppDeclaration } from '../../lib/subAppRegistry';
import VocabTodayFocusWork from '../Vocab/VocabTodayFocusWork';
import ReviewFocusWork from '../ERC/ReviewFocusWork';
import PracticeFocusWork from '../ERC/PracticeFocusWork';
import TaskFocusWork from './TaskFocusWork';
import InputFocusWork from '../Input/InputFocusWork';

// 组件映射：专注工作类型 → render 函数（新增子应用时在这里注册组件）
const RENDER_MAP: Record<string, (props: Parameters<FocusWorkDefinition['render']>[0]) => React.ReactNode> = {
  vocab_today: (props) => <VocabTodayFocusWork {...props} />,
  review: (props) => <ReviewFocusWork {...props} />,
  practice: (props) => <PracticeFocusWork {...props} />,
  task_focus: (props) => <TaskFocusWork {...props} />,
  input: (props) => <InputFocusWork {...props} />,
};

function buildRegistryEntry(fwDecl: { type: string; label: string }, app: SubAppDeclaration): FocusWorkDefinition {
  return {
    type: fwDecl.type as FocusWorkType,
    title: fwDecl.label,
    subtitle: app.name,
    render: RENDER_MAP[fwDecl.type] ?? (() => null),
  };
}

function buildRegistry(): Record<string, FocusWorkDefinition> {
  const entries: Record<string, FocusWorkDefinition> = {};
  for (const app of subAppList) {
    for (const fw of app.focusWorks) {
      entries[fw.type] = buildRegistryEntry(fw, app);
    }
  }
  // built-in: task_focus (不属于任何子应用)
  entries['task_focus'] = {
    type: 'task_focus',
    title: '任务专注',
    subtitle: '自定义任务',
    render: RENDER_MAP['task_focus'],
  };
  // built-in: input (暂无独立子应用入口)
  if (!entries['input']) {
    entries['input'] = {
      type: 'input',
      title: '输入练习',
      subtitle: '手动输入作答',
      render: RENDER_MAP['input'],
    };
  }
  return entries;
}

export const focusWorkRegistry = buildRegistry() as Record<FocusWorkType, FocusWorkDefinition>;

export const FOCUS_WORK_LABELS: Record<string, string> = {};
for (const app of subAppList) {
  FOCUS_WORK_LABELS[app.id] = app.name;
  for (const fw of app.focusWorks) {
    FOCUS_WORK_LABELS[fw.type] = `${app.name} · ${fw.label}`;
  }
}
FOCUS_WORK_LABELS['task_focus'] = '任务专注';

export function getFocusWorkDefinition(type: FocusWorkType | null | undefined): FocusWorkDefinition | null {
  if (!type) return null;
  return (focusWorkRegistry as Record<string, FocusWorkDefinition>)[type] ?? null;
}
