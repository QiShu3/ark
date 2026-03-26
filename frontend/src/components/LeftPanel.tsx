import React from 'react';
import CharacterDisplay from './CharacterDisplay';
import CharaAgentOverlay from './CharaAgentOverlay';
import EventCountdownCard from './EventCountdownCard';

/**
 * 左侧面板组件
 * 包含人物展示
 */
const LeftPanel: React.FC = () => {
  return (
    <div className="w-[65%] h-full relative border-r border-white/10">
      <EventCountdownCard />

      {/* 人物展示区域，占据全屏空间 */}
      <div className="w-full h-full absolute top-0 left-0 pt-16 z-0 flex items-center justify-center">
        <CharacterDisplay />
      </div>
      <CharaAgentOverlay />
    </div>
  );
};

export default LeftPanel;
