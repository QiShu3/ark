import React from 'react';
import CharacterDisplay from './CharacterDisplay';
import EventCountdownCard from './EventCountdownCard';
import DialogueInteraction from './DialogueInteraction';
import { cn } from '../lib/utils';

type LeftPanelProps = {
  collapsed: boolean;
};

/**
 * 左侧面板组件
 * 包含人物展示和底部的对话交互区域
 */
const LeftPanel: React.FC<LeftPanelProps> = ({ collapsed }) => {
  return (
    <div
      className={cn(
        'h-full relative border-r border-white/10 transition-all duration-300 ease-out overflow-hidden',
        collapsed ? 'w-[65%] lg:w-[calc(100%-1rem)]' : 'w-[65%] lg:w-[65%]',
      )}
    >
      <EventCountdownCard />

      {/* 人物展示区域，占据全屏空间 */}
      <div className="w-full h-full absolute top-0 left-0 pt-16 z-0 flex items-center justify-center">
        <CharacterDisplay />
      </div>

      {/* 底部字幕对话框与交互菜单 */}
      <DialogueInteraction />
    </div>
  );
};

export default LeftPanel;
