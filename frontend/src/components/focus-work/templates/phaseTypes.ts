import type React from 'react';

export type FocusWorkPhaseType = 'flashcard' | 'choice_question';

export type FocusWorkPhaseConfig = {
  type: FocusWorkPhaseType;
  label: string;
};

export type FocusWorkPhaseTemplateProps = {
  phases: FocusWorkPhaseConfig[];
  currentPhaseIndex: number;
  disabled: boolean;
  children: React.ReactNode;
  onPhaseComplete: (phaseIndex: number) => void;
  onSkipped?: (phaseIndex: number) => void;
};

export type FocusWorkPhaseManagerProps = {
  phases: FocusWorkPhaseConfig[];
  disabled: boolean;
  phaseRenderers: Array<{
    type: FocusWorkPhaseType;
    render: () => React.ReactNode;
  }>;
  onAllPhasesCompleted: () => void;
};
