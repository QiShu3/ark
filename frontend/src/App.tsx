import React, { useEffect, useState } from 'react';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import HomeOnboarding from './components/HomeOnboarding';
import GuestOnboarding from './components/GuestOnboarding';
import PlaceholderCard from './components/PlaceholderCard';
import { useAuthStore } from './lib/auth';

const HOME_RIGHT_PANEL_STORAGE_KEY = 'ark-home-right-panel-collapsed';

function App() {
  const isGuest = useAuthStore((s) => s.user?.is_guest ?? false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(HOME_RIGHT_PANEL_STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem(HOME_RIGHT_PANEL_STORAGE_KEY, String(rightPanelCollapsed));
  }, [rightPanelCollapsed]);

  return (
    <div className="ark-page relative z-10 flex h-screen w-full flex-col gap-3 p-3 pt-32">
      <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden lg:flex-row">
        <LeftPanel collapsed={rightPanelCollapsed} />
        <RightPanel collapsed={rightPanelCollapsed} onToggle={() => setRightPanelCollapsed((prev) => !prev)} />
      </main>
      <div className="fixed -left-[10000px] top-0 h-px w-px overflow-visible">
        <PlaceholderCard index={0} />
      </div>
      {isGuest ? <GuestOnboarding /> : <HomeOnboarding />}
    </div>
  );
}

export default App;
