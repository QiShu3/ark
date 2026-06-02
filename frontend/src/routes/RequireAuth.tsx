import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import BeianFooter from '../components/BeianFooter';
import { useAuthStore } from '../lib/auth';
import Navigation from '../components/Navigation';
import FocusWorkProvider from '../components/focus-work/FocusWorkProvider';
import { useTheme } from '../hooks/useTheme';
import ToastContainer from '../components/ToastContainer';
import '../lib/toast';

export default function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const clear = useAuthStore((s) => s.clear);
  const location = useLocation();

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
      {/* 全局低信息背景，主视觉图片由首页左栏接管。 */}
      <div className="ark-shell-frame fixed inset-x-1 bottom-1 top-[7.5rem] z-0 overflow-hidden">
        <div className="ark-shell-backdrop absolute inset-0" />
        <div data-testid="background-overlay" className="ark-background-overlay absolute inset-0 opacity-50"></div>
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
