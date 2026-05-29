import React, { useEffect, useState } from 'react';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import HomeOnboarding from './components/HomeOnboarding';

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
    <div className="ark-page relative z-10 flex w-full h-full pt-0">
      <LeftPanel collapsed={rightPanelCollapsed} />
      <RightPanel collapsed={rightPanelCollapsed} onToggle={() => setRightPanelCollapsed((prev) => !prev)} />
      <HomeOnboarding />
    </div>
  );
}

export default App;
