import React, { useEffect, useState } from 'react';
import Navigation from './components/Navigation';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';

const HOME_RIGHT_PANEL_STORAGE_KEY = 'ark-home-right-panel-collapsed';

function App() {
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(HOME_RIGHT_PANEL_STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem(HOME_RIGHT_PANEL_STORAGE_KEY, String(rightPanelCollapsed));
  }, [rightPanelCollapsed]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans">
      {/* 背景图片 */}
      <div className="fixed inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/background.jpg`} 
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
        <LeftPanel collapsed={rightPanelCollapsed} />
        <RightPanel collapsed={rightPanelCollapsed} onToggle={() => setRightPanelCollapsed((prev) => !prev)} />
      </div>
    </div>
  );
}

export default App;
