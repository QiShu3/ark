import React from 'react';
import { ChevronRight, SkipForward } from 'lucide-react';

import type { FocusWorkPhaseConfig, FocusWorkPhaseTemplateProps } from './phaseTypes';

function PhaseProgress({ phases, currentIndex }: { phases: FocusWorkPhaseConfig[]; currentIndex: number }) {
  if (phases.length <= 1) return null;

  return (
    <div className="mb-4 flex items-center justify-center gap-2">
      {phases.map((phase, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <React.Fragment key={phase.type}>
            {index > 0 && (
              <ChevronRight className="h-4 w-4 text-[var(--focus-work-text-faint)]" />
            )}
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition ${
                isCurrent
                  ? 'border border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] text-[var(--focus-work-blue-text)]'
                  : isCompleted
                    ? 'border border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)]'
                    : 'border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] text-[var(--focus-work-text-faint)]'
              }`}
            >
              <span>{phase.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function FocusWorkPhaseTemplate({
  phases,
  currentPhaseIndex,
  disabled,
  children,
  onPhaseComplete,
  onSkipped,
}: FocusWorkPhaseTemplateProps) {
  void onPhaseComplete;
  const isLastPhase = currentPhaseIndex === phases.length - 1;

  const handleSkip = () => {
    if (disabled || !onSkipped) return;
    onSkipped(currentPhaseIndex);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PhaseProgress phases={phases} currentIndex={currentPhaseIndex} />

      <div className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>

      {!isLastPhase && (
        <div className="flex justify-center border-t border-[var(--focus-work-border)] pt-3">
          <button
            type="button"
            disabled={disabled}
            onClick={handleSkip}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-3 py-1.5 text-xs text-[var(--focus-work-text-muted)] transition hover:bg-[var(--focus-work-surface-soft)] disabled:opacity-50"
          >
            <SkipForward className="h-3.5 w-3.5" />
            跳过本阶段
          </button>
        </div>
      )}
    </div>
  );
}

export function usePhaseManager(
  phases: FocusWorkPhaseConfig[],
  onAllCompleted: () => void,
) {
  const [currentPhaseIndex, setCurrentPhaseIndex] = React.useState(0);
  const completedPhasesRef = React.useRef(new Set<number>());

  const handlePhaseComplete = React.useCallback((phaseIndex: number) => {
    completedPhasesRef.current.add(phaseIndex);

    const nextIndex = phaseIndex + 1;
    if (nextIndex < phases.length) {
      setCurrentPhaseIndex(nextIndex);
    } else {
      onAllCompleted();
    }
  }, [phases.length, onAllCompleted]);

  const handleSkip = React.useCallback((phaseIndex: number) => {
    const nextIndex = phaseIndex + 1;
    if (nextIndex < phases.length) {
      setCurrentPhaseIndex(nextIndex);
    } else {
      onAllCompleted();
    }
  }, [phases.length, onAllCompleted]);

  const reset = React.useCallback(() => {
    setCurrentPhaseIndex(0);
    completedPhasesRef.current.clear();
  }, []);

  return {
    currentPhaseIndex,
    handlePhaseComplete,
    handleSkip,
    reset,
  };
}
