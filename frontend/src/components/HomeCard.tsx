import { forwardRef, type ElementType, type HTMLAttributes } from 'react';

import { cn } from '../lib/utils';

type HomeCardVariant = 'standard' | 'hero' | 'shortcut';
type HomeCardElement = 'section' | 'div' | 'button';

type HomeCardProps = HTMLAttributes<HTMLElement> & {
  as?: HomeCardElement;
  variant?: HomeCardVariant;
  type?: 'button' | 'submit' | 'reset';
};

const variantClassNames: Record<HomeCardVariant, string> = {
  standard: 'ark-home-card rounded-[24px]',
  hero: 'ark-home-card ark-home-timer-card relative overflow-hidden rounded-[24px]',
  shortcut: 'ark-home-card ark-home-shortcut-card rounded-[20px]',
};

const HomeCard = forwardRef<HTMLElement, HomeCardProps>(
  (
    {
      as = 'section',
      variant = 'standard',
      className,
      type,
      ...props
    },
    ref,
  ) => {
    const Component = as as ElementType;
    const elementProps = as === 'button' ? { type: type ?? 'button' } : {};

    return (
      <Component
        ref={ref}
        className={cn(variantClassNames[variant], className)}
        {...elementProps}
        {...props}
      />
    );
  },
);

HomeCard.displayName = 'HomeCard';

export default HomeCard;
