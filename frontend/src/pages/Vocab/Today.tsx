import SubAppPageShell from '../../components/SubAppPageShell';
import VocabTodayFocusWork from '../../components/Vocab/VocabTodayFocusWork';
import type { FocusWorkRunSummary } from '../../components/focus-work/focusWorkTypes';
import { normalizeFocusWorkType } from '../../components/focus-work/focusWorkTypes';

const standaloneRun: FocusWorkRunSummary = {
  id: 'standalone-vocab-today',
  workflow_id: 'standalone',
  phase_index: 0,
  focus_work_type: normalizeFocusWorkType('vocab_today') ?? 'flash_card',
  counts_for_task_completion: true,
  status: 'running',
  config_snapshot: {},
};

export default function VocabToday() {
  return (
    <SubAppPageShell>
      <VocabTodayFocusWork run={standaloneRun} disabled={false} onContentCompleted={() => undefined} />
    </SubAppPageShell>
  );
}
