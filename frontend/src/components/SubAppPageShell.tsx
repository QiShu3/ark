import type React from 'react';

type SubAppPageShellProps = {
  children: React.ReactNode;
  maxWidth?: '4xl' | '5xl' | '6xl' | '7xl';
  overflow?: 'y-auto' | 'hidden';
  paddingX?: '6' | '8';
};

const CLIP_PATH = "inset(10px round 28px)" as const;

export default function SubAppPageShell({
  children,
  maxWidth = '5xl',
  overflow = 'y-auto',
  paddingX = '8',
}: SubAppPageShellProps) {
  return (
    <div
      className={`fixed inset-x-1 bottom-1 top-[7.5rem] z-10 overflow-${overflow} rounded-[28px] px-${paddingX} pb-10 pt-6`}
      style={{ clipPath: CLIP_PATH }}
    >
      <div className={`mx-auto max-w-${maxWidth}`}>
        {children}
      </div>
    </div>
  );
}
