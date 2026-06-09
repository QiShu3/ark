import ERCReviewFocusWork from '../../components/ERC/ERCReviewFocusWork';
import type { FocusWorkRunSummary } from '../../components/focus-work/focusWorkTypes';

const standaloneRun: FocusWorkRunSummary = {
  id: 'standalone-erc-review',
  workflow_id: 'standalone',
  phase_index: 0,
  focus_work_type: 'erc_review',
  counts_for_task_completion: false,
  status: 'running',
  config_snapshot: {},
};

export default function ERCReview() {
  return (
    <div className="fixed inset-x-1 bottom-1 top-[7.5rem] z-10 overflow-hidden rounded-[28px] px-6 pb-10 pt-6" style={{ clipPath: "inset(10px round 28px)" }}>
      <ERCReviewFocusWork run={standaloneRun} disabled={false} onContentCompleted={() => undefined} />
    </div>
  );
}
