import { useNavigate } from 'react-router-dom';

export default function AppCenter() {
  const navigate = useNavigate();

  const apps = [
    { id: 'vocab', name: '背单词', description: '切换词书并开始今日学习', icon: '✦', route: '/vocab' },
    { id: 'erc', name: '阅读训练', description: '整篇练习并进入 FSRS 复习池', icon: 'R', route: '/erc' },
  ];

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-8 pt-20">
      <div className="mx-auto max-w-4xl pb-10">
        <h1 className="mb-8 text-center text-3xl font-bold">应用中心</h1>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {apps.map((app) => (
            <button
              key={app.id}
              type="button"
              className="group relative flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-white/10 p-6 text-center shadow-lg transition duration-300 hover:bg-white/20 hover:shadow-xl"
              onClick={() => navigate(app.route)}
            >
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-3xl transition-colors group-hover:from-blue-500/40 group-hover:to-purple-500/40">
                {app.icon}
              </div>
              <h3 className="text-xl font-semibold">{app.name}</h3>
              <p className="text-sm text-white/60">{app.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
