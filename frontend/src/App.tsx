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
    <div className="ark-page relative z-10 flex h-screen w-full flex-col gap-3 p-3 pt-32">
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
        <LeftPanel collapsed={rightPanelCollapsed} />
        <RightPanel collapsed={rightPanelCollapsed} onToggle={() => setRightPanelCollapsed((prev) => !prev)} />
      </main>
      <HomeOnboarding />
    </div>
  );
}

export default App;
