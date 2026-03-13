import React from 'react';
import PlaceholderCard from './PlaceholderCard';

/**
 * 右侧面板组件
 * 包含4个等高的占位块
 */
const RightPanel: React.FC = () => {
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
    <div className="w-[35%] h-full p-4 pt-20 flex flex-col gap-4">
      {configs.map((config, i) => (
        <PlaceholderCard key={i} index={i} split={config.split} />
      ))}
    </div>
  );
};

export default RightPanel;
