import ERCReviewFocusWork from '../../components/ERC/ERCReviewFocusWork';
import type { FocusWorkRunSummary } from '../../components/focus-work/focusWorkTypes';
import SubAppPageShell from '../../components/SubAppPageShell';

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
    <SubAppPageShell overflow="hidden" paddingX="6">
      <ERCReviewFocusWork run={standaloneRun} disabled={false} onContentCompleted={() => undefined} />
    </SubAppPageShell>
  );
}
