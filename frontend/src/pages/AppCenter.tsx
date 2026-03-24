import React from 'react';
import Navigation from '../components/Navigation';
import { useNavigate } from 'react-router-dom';

const AppCenter: React.FC = () => {
  const navigate = useNavigate();

  // 模拟一些应用数据，用于生成应用卡片
  const apps = [
    { id: 0, name: 'Agent', description: '对话式任务助手', icon: '◉', route: '/agent' },
    { id: 1, name: 'Arxiv', description: '阅读文献', icon: '∑', route: '/arxiv' },
    { id: 2, name: '应用 2', description: '这是一个待开发的应用', icon: '⚡' },
    { id: 3, name: '应用 3', description: '这是一个待开发的应用', icon: '🎨' },
    { id: 4, name: '应用 4', description: '这是一个待开发的应用', icon: '🔧' },
    { id: 5, name: '应用 5', description: '这是一个待开发的应用', icon: '📊' },
    { id: 6, name: '应用 6', description: '这是一个待开发的应用', icon: '🎮' },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans">
      {/* 背景图片 - 与主页保持一致 */}
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
      <div className="relative z-10 w-full h-full pt-20 px-8 overflow-y-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">应用中心</h1>
        
        {/* 应用卡片网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto pb-10">
          {apps.map((app) => (
            <div 
              key={app.id}
              className="group relative p-6 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 hover:bg-white/20 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-4 hover:scale-105 shadow-lg hover:shadow-xl"
              onClick={() => app.route && navigate(app.route)}
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-3xl mb-2 group-hover:from-blue-500/40 group-hover:to-purple-500/40 transition-colors">
                {app.icon}
              </div>
              <h3 className="text-xl font-semibold">{app.name}</h3>
              <p className="text-white/60 text-sm text-center">{app.description}</p>
              
              {/* 装饰性光效 */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl opacity-0 group-hover:opacity-20 blur transition duration-500"></div>
            </div>
          ))}
          
          {/* 添加新应用的占位卡片 */}
          <div className="group relative p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-dashed border-white/20 hover:border-white/40 hover:bg-white/10 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-2 min-h-[200px]">
            <div className="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center text-2xl text-white/40 group-hover:border-white/60 group-hover:text-white/80 transition-colors">
              +
            </div>
            <p className="text-white/40 group-hover:text-white/80 transition-colors">添加应用</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppCenter;
