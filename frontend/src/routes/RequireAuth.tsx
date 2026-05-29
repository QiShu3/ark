import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import BeianFooter from '../components/BeianFooter';
import { useAuthStore } from '../lib/auth';
import Navigation from '../components/Navigation';
import FocusWorkProvider from '../components/focus-work/FocusWorkProvider';
import { useCustomizationStore } from '../lib/customization';
import { useTheme } from '../hooks/useTheme';
import ToastContainer from '../components/ToastContainer';
import '../lib/toast';

export default function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const clear = useAuthStore((s) => s.clear);
  const location = useLocation();

  const backgroundUrl = useCustomizationStore((s) => s.backgroundUrl);
  const backgroundBlur = useCustomizationStore((s) => s.backgroundBlur);
  const backgroundOpacity = useCustomizationStore((s) => s.backgroundOpacity);
  useTheme();

  useEffect(() => {
    if (token && expiresAt && Date.now() >= expiresAt) clear();
  }, [token, expiresAt, clear]);

  if (!token || !expiresAt) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <div
      data-testid="authenticated-shell"
      className="ark-shell relative h-screen w-screen overflow-hidden font-sans"
    >
      {/* 背景图片 */}
      <div className="fixed inset-0 z-0">
        <img 
          src={backgroundUrl} 
          alt="Background" 
          style={{
            filter: `blur(${backgroundBlur}px)`,
            opacity: backgroundOpacity,
          }}
          className="w-full h-full object-cover transition-all duration-300"
        />
        {/* 叠加一层渐变，增强文字可读性 */}
        <div data-testid="background-overlay" className="ark-background-overlay absolute inset-0"></div>
      </div>

      {/* 顶部导航 */}
      <Navigation />

      {/* 主体内容区域 */}
      <FocusWorkProvider>
        <Outlet />
      </FocusWorkProvider>

      <ToastContainer />
      <BeianFooter />
    </div>
  );
}
