import React, { useMemo, useState } from 'react';

import WorkflowProgressBar from './WorkflowProgressBar';

const phases = [
  { phase_type: 'focus' as const, duration: 300 },
  { phase_type: 'break' as const, duration: 120 },
  { phase_type: 'focus' as const, duration: 300 },
  { phase_type: 'break' as const, duration: 120 },
];

const meta = {
  title: 'Components/WorkflowProgressBar',
  component: WorkflowProgressBar,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

export const Interactive = () => {
  const [elapsed, setElapsed] = useState(0);
  const total = useMemo(() => phases.reduce((sum, phase) => sum + phase.duration, 0), []);
  const progressElapsed = Math.min(elapsed, total);

  let remaining = total - progressElapsed;
  let currentPhaseIndex = 0;
  for (let i = 0; i < phases.length; i++) {
    const duration = phases[i].duration;
    if (remaining > duration) {
      remaining -= duration;
      currentPhaseIndex = i + 1;
    } else {
      currentPhaseIndex = i;
      remaining = duration - Math.max(0, progressElapsed - phases.slice(0, i).reduce((sum, p) => sum + p.duration, 0));
      break;
    }
  }

  return (
    <div className="w-[720px] max-w-[92vw] p-5 bg-[#151515] rounded-xl border border-white/10 flex flex-col gap-3">
      <WorkflowProgressBar
        workflow={{
          state: 'focus',
          phases,
          current_phase_index: Math.min(currentPhaseIndex, phases.length - 1),
          pending_confirmation: false,
          remaining_seconds: Math.round(remaining),
        }}
      />
      <div className="flex items-center gap-3">
        <button
          className="px-3 py-1.5 rounded bg-blue-500/80 hover:bg-blue-500 text-white text-sm"
          onClick={() => setElapsed((v) => Math.min(v + 30, total))}
        >
          推进 30s
        </button>
        <button
          className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white text-sm"
          onClick={() => setElapsed(0)}
        >
          重置
        </button>
      </div>
    </div>
  );
};
