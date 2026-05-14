import type { FocusWorkDefinition, FocusWorkType } from './focusWorkTypes';
import VocabTodayFocusWork from '../Vocab/VocabTodayFocusWork';
import ERCReviewFocusWork from '../ERC/ERCReviewFocusWork';

function PlaceholderFocusWork() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-black/30 p-10 text-center">
      <div className="text-sm uppercase tracking-[0.28em] text-white/35">Focus Work</div>
      <h2 className="mt-4 text-2xl font-semibold text-white">专注工作内容准备中</h2>
      <p className="mt-3 max-w-lg text-sm leading-6 text-white/55">
        当前页面级专注工作已经进入专注状态，具体业务内容会由对应子应用注册。
      </p>
    </div>
  );
}

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
};

export function getFocusWorkDefinition(type: FocusWorkType | null | undefined): FocusWorkDefinition | null {
  if (!type) return null;
  return focusWorkRegistry[type] ?? null;
}
