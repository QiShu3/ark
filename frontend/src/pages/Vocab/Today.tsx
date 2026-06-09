import VocabTodayFocusWork from '../../components/Vocab/VocabTodayFocusWork';
import type { FocusWorkRunSummary } from '../../components/focus-work/focusWorkTypes';

const standaloneRun: FocusWorkRunSummary = {
  id: 'standalone-vocab-today',
  workflow_id: 'standalone',
  phase_index: 0,
  focus_work_type: 'vocab_today',
  counts_for_task_completion: true,
  status: 'running',
  config_snapshot: {},
};

export default function VocabToday() {
  return (
    <div className="fixed inset-x-1 bottom-1 top-[7.5rem] z-10 overflow-y-auto rounded-[28px] px-8 pb-10 pt-6" style={{ clipPath: "inset(10px round 28px)" }}>
      <VocabTodayFocusWork run={standaloneRun} disabled={false} onContentCompleted={() => undefined} />
    </div>
  );
}
