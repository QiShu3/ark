import React from 'react';
import CharacterDisplay from './CharacterDisplay';
import ChatBox from './ChatBox';
import AIAssistantShell from './AIAssistantShell';

/**
 * 左侧面板组件
 * 包含人物展示和聊天框
 */
const LeftPanel: React.FC = () => {
  return (
    <div className="w-[65%] h-full relative border-r border-white/10">
      {/* 装饰圆圈 */}
      <div className="absolute left-12 top-24 z-20 w-40 h-40 rounded-full border-[6px] border-white/30 flex flex-col items-center justify-center text-white/90 shadow-[0_0_15px_rgba(255,255,255,0.2)] backdrop-blur-sm">
        <span className="text-5xl font-bold leading-none">01</span>
        <span className="text-base tracking-widest opacity-80 mt-1 uppercase">coming</span>
      </div>

      {/* 人物展示区域，占据全屏空间 */}
      <div className="w-full h-full absolute top-0 left-0 pt-16 z-0 flex items-center justify-center">
        <CharacterDisplay />
      </div>
      
      <AIAssistantShell className="absolute bottom-6 left-6 right-6 h-[30%]">
        <ChatBox />
      </AIAssistantShell>
    </div>
  );
};

export default LeftPanel;
