import { useMemo } from 'react';

import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import { getChoiceScope } from '../../lib/choice/configExtractors';
import PracticeFocusWork from './PracticeFocusWork';
import ReviewFocusWork from './ReviewFocusWork';

type ChoiceFocusWorkProps = FocusWorkRendererProps;

export default function ChoiceFocusWork(props: ChoiceFocusWorkProps) {
  const choiceScope = getChoiceScope(props.run);
  const mode = useMemo(() => choiceScope?.mode ?? 'sequential', [choiceScope?.mode]);

  if (mode === 'review') {
    return <ReviewFocusWork {...props} />;
  }

  return <PracticeFocusWork {...props} />;
}
