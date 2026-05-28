import React from 'react';
import { useCustomizationStore } from '../lib/customization';

/**
 * 人物展示组件
 * 展示自定义立绘或默认 public/images/chara.png
 */
const CharacterDisplay: React.FC = () => {
  const showCharacter = useCustomizationStore((s) => s.showCharacter);
  const characterUrl = useCustomizationStore((s) => s.characterUrl);
  const characterScale = useCustomizationStore((s) => s.characterScale);

  if (!showCharacter) return null;

  return (
    <div className="w-full h-full flex items-center justify-center relative transition-all duration-300">
      <img 
        src={characterUrl} 
        alt="Character" 
        style={{
          transform: `scale(${characterScale})`,
        }}
        className="max-h-[90%] max-w-[90%] object-contain drop-shadow-2xl transition-all duration-300"
      />
    </div>
  );
};

export default CharacterDisplay;
