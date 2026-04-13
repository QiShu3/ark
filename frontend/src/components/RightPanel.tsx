import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PlaceholderCard from './PlaceholderCard';
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
  // 将面板容器的 ref 传给最後一张卡片，用于 PhoneSimulator 的覆盖定位
  const panelRef = useRef<HTMLDivElement>(null);

  // 配置每个占位卡片的拆分数量
  // Index 0: 不拆分
  // Index 1: 拆分为 2 部分
  // Index 2: 拆分为 2 部分
  // Index 3: 拆分为 3 部分
  const configs = [
    { split: 1 },
    { split: 2 },
    { split: 2 },
    { split: 3 },
  ];

  return (
    <aside
      className={cn(
        'relative mt-16 h-[calc(100%-4rem)] overflow-visible transition-[width,padding] duration-300 ease-out',
        collapsed ? 'w-[35%] p-4 lg:w-4 lg:px-0 lg:py-4' : 'w-[35%] p-4 lg:w-[35%]',
      )}
    >
      <button
        type="button"
        aria-label={collapsed ? 'Expand right panel' : 'Collapse right panel'}
        onClick={onToggle}
        className={cn(
          'absolute top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/80 backdrop-blur-md transition-all duration-200 hover:bg-black/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 lg:flex',
          collapsed ? 'right-0 h-24 w-4' : 'right-1 h-16 w-6',
        )}
      >
        {collapsed ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      <div
        ref={panelRef}
        data-testid="right-panel-content"
        aria-hidden={collapsed}
        className={cn(
          'flex h-full flex-col gap-4 overflow-hidden transition-opacity duration-200',
          collapsed ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      >
        {configs.map((config, i) => (
          <PlaceholderCard
            key={i}
            index={i}
            split={config.split}
            anchorRef={i === 3 ? panelRef : undefined}
          />
        ))}
      </div>
    </aside>
  );
};

export default RightPanel;
