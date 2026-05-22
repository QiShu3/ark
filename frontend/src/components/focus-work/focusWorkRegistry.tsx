import type { FocusWorkDefinition, FocusWorkType } from './focusWorkTypes';
import VocabTodayFocusWork from '../Vocab/VocabTodayFocusWork';
import ERCReviewFocusWork from '../ERC/ERCReviewFocusWork';
import ERCPracticeFocusWork from '../ERC/ERCPracticeFocusWork';
import TaskFocusWork from './TaskFocusWork';

export const focusWorkRegistry: Record<FocusWorkType, FocusWorkDefinition> = {
  vocab_today: {
    type: 'vocab_today',
    title: '今日单词',
    subtitle: '背单词',
    render: (props) => <VocabTodayFocusWork {...props} />,
  },
  erc_review: {
    type: 'erc_review',
    title: '开始复习',
    subtitle: 'ERC 阅读理解',
    render: (props) => <ERCReviewFocusWork {...props} />,
  },
  erc_practice: {
    type: 'erc_practice',
    title: '真题练习',
    subtitle: 'ERC 阅读理解',
    render: (props) => <ERCPracticeFocusWork {...props} />,
  },
  task_focus: {
    type: 'task_focus',
    title: '任务专注',
    subtitle: '自定义任务',
    render: (props) => <TaskFocusWork {...props} />,
  },
};

export function getFocusWorkDefinition(type: FocusWorkType | null | undefined): FocusWorkDefinition | null {
  if (!type) return null;
  return focusWorkRegistry[type] ?? null;
}
