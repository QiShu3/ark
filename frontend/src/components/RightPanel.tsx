import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import HomeRightDashboard from './HomeRightDashboard';
import { cn } from '../lib/utils';

interface RightPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * 右侧面板组件
 * 包含4个等高的占位块
 */
const RightPanel: React.FC<RightPanelProps> = ({ collapsed, onToggle }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <aside
      className={cn(
        'relative min-h-[430px] min-w-0 overflow-visible transition-[flex,width] duration-300 ease-out lg:h-full lg:min-h-0',
        collapsed ? 'lg:w-4 lg:flex-none lg:px-0' : 'lg:flex-[1.07_1_0%]',
      )}
    >
      <button
        type="button"
        aria-label={collapsed ? 'Expand right panel' : 'Collapse right panel'}
        onClick={onToggle}
        className={cn(
          'ark-surface ark-focus-ring absolute top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full text-[var(--ark-text-muted)] opacity-0 backdrop-blur-md transition-all duration-200 hover:text-[var(--ark-text)] hover:opacity-100 focus-visible:opacity-100 lg:flex',
          collapsed ? 'right-0 h-24 w-4' : '-right-3 h-16 w-6',
        )}
      >
        {collapsed ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      <div
        ref={panelRef}
        data-testid="right-panel-content"
        aria-hidden={collapsed}
        className={cn(
          'h-full overflow-hidden rounded-[28px] transition-opacity duration-200',
          collapsed ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      >
        <HomeRightDashboard />
      </div>
    </aside>
  );
};

export default RightPanel;
