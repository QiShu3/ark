import React, { useRef } from 'react';
import PlaceholderCard from './PlaceholderCard';

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

  void collapsed;
  void onToggle;

  return (
    <div ref={panelRef} className="w-[35%] mt-16 h-[calc(100%-4rem)] p-4 flex flex-col gap-4">
      {configs.map((config, i) => (
        <PlaceholderCard
          key={i}
          index={i}
          split={config.split}
          anchorRef={i === 3 ? panelRef : undefined}
        />
      ))}
    </div>
  );
};

export default RightPanel;
