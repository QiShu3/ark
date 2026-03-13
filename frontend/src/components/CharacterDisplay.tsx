import React from 'react';

/**
 * 人物展示组件
 * 展示 public/images/chara.png
 */
const CharacterDisplay: React.FC = () => {
  return (
    <div className="w-full h-full flex items-center justify-center relative">
      <img 
        src="/images/chara.png" 
        alt="Character" 
        className="max-h-[90%] max-w-[90%] object-contain drop-shadow-2xl"
      />
    </div>
  );
};

export default CharacterDisplay;
