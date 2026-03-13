import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, User } from '../lib/auth';
import { apiJson } from '../lib/api';

/**
 * 顶部导航栏组件
 * 仅作占位，固定在顶部
 */
const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    if (token && !user) {
      apiJson<User>('/auth/me')
        .then(setUser)
        .catch((err) => {
            console.error('Failed to fetch user info:', err);
            // Consider clearing token if 401, but apiJson handles 401 by redirecting to login
        });
    }
  }, [token, user, setUser]);

  return (
    <nav className="fixed top-0 left-0 w-full h-16 bg-black/50 backdrop-blur-md text-white flex items-center px-6 z-50 border-b border-white/10">
      <div 
        className="text-xl font-bold cursor-pointer hover:text-blue-400 transition-colors"
        onClick={() => navigate('/')}
      >
        Ark Project
      </div>
      <div className="ml-auto flex items-center gap-6">
        <div className="flex gap-4">
          <button 
            className="hover:text-blue-400 transition-colors"
            onClick={() => navigate('/')}
          >
            Home
          </button>
          <button 
            className="hover:text-blue-400 transition-colors"
            onClick={() => navigate('/apps')}
          >
            Apps
          </button>
          <button className="hover:text-gray-300 cursor-not-allowed opacity-70">About</button>
        </div>

        {/* 用户头像区域 */}
        {user ? (
          <div className="relative group cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold shadow-lg border border-white/20">
              {user.username.charAt(0).toUpperCase()}
            </div>
            
            {/* 悬停显示的用户名 */}
            <div className="absolute right-0 top-full mt-2 px-3 py-1.5 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
              {user.username}
            </div>
          </div>
        ) : (
          <button 
            onClick={() => navigate('/login')}
            className="text-sm bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-full transition-colors"
          >
            Login
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
