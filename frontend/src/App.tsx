import React from 'react';
import Navigation from './components/Navigation';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';

function App() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans">
      {/* 背景图片 */}
      <div className="fixed inset-0 z-0">
        <img 
          src="/images/background.jpg" 
          alt="Background" 
          className="w-full h-full object-cover opacity-60"
        />
        {/* 叠加一层渐变，增强文字可读性 */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60"></div>
      </div>

      {/* 顶部导航 */}
      <Navigation />

      {/* 主体内容区域 */}
      <div className="relative z-10 flex w-full h-full pt-0">
        <LeftPanel />
        <RightPanel />
      </div>
    </div>
  );
}

export default App;
