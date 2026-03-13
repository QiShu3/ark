import React from 'react';

type AIAssistantShellProps = {
  className?: string;
  children: React.ReactNode;
};

const AIAssistantShell: React.FC<AIAssistantShellProps> = ({ className, children }) => {
  const shellClassName = [
    'rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-4 shadow-lg flex flex-col min-h-0',
    className || '',
  ]
    .join(' ')
    .trim();

  return <div className={shellClassName}>{children}</div>;
};

export default AIAssistantShell;
