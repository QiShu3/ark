import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../lib/auth';
import Navigation from '../components/Navigation';

export default function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const clear = useAuthStore((s) => s.clear);
  const location = useLocation();

  useEffect(() => {
    if (token && expiresAt && Date.now() >= expiresAt) clear();
  }, [token, expiresAt, clear]);

  if (!token || !expiresAt) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

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
      <Outlet />
    </div>
  );
}
