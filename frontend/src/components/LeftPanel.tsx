import React from 'react';
import CharacterDisplay from './CharacterDisplay';
import EventCountdownCard from './EventCountdownCard';
import DialogueInteraction from './DialogueInteraction';
import { cn } from '../lib/utils';
import { useCustomizationStore } from '../lib/customization';

type LeftPanelProps = {
  collapsed: boolean;
};

/**
 * 左侧面板组件
 * 包含人物展示和底部的对话交互区域
 */
const LeftPanel: React.FC<LeftPanelProps> = ({ collapsed }) => {
  const backgroundUrl = useCustomizationStore((s) => s.backgroundUrl);
  const backgroundBlur = useCustomizationStore((s) => s.backgroundBlur);
  const backgroundOpacity = useCustomizationStore((s) => s.backgroundOpacity);

  return (
    <div
      className={cn(
        'ark-left-glass-panel relative min-h-[520px] min-w-0 overflow-hidden rounded-[28px] transition-[flex] duration-300 ease-out lg:h-full lg:min-h-0',
        collapsed ? 'lg:flex-1' : 'lg:flex-[1.6_1_0%]',
      )}
    >
      <img
        src={backgroundUrl}
        alt="Background"
        style={{
          filter: `blur(${backgroundBlur}px)`,
          opacity: backgroundOpacity,
        }}
        className="absolute inset-0 h-full w-full scale-[1.03] object-cover transition-all duration-300"
      />
      <div className="ark-background-overlay absolute inset-0" />

      <EventCountdownCard />

      {/* 人物展示区域，占据全屏空间 */}
      <div className="absolute inset-0 z-0 flex items-center justify-center">
        <CharacterDisplay />
      </div>

      {/* 底部字幕对话框与交互菜单 */}
      <DialogueInteraction />
    </div>
  );
};

export default LeftPanel;
