import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Beaker } from 'lucide-react';
import { useAuthStore } from '../lib/auth';
import { subAppList, getSubAppIcon, loadDynamicRegistry, type SubAppDeclaration } from '../lib/subAppRegistry';

/** 应用中心页面，从 subAppRegistry + 后端 API 渲染子应用入口 */
export default function AppCenter() {
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false);
  const [apps, setApps] = useState<SubAppDeclaration[]>(subAppList);

  useEffect(() => {
    loadDynamicRegistry().then((all) => setApps(all.filter((a) => !a.adminOnly || isAdmin)));
  }, [isAdmin]);

  return (
    <main aria-label="应用中心" className="ark-page relative z-10 h-full w-full overflow-y-auto px-8 pt-32">
      <div className="mx-auto max-w-4xl pb-10">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--ark-text)]">应用中心</h1>
          <p className="mt-2 text-sm text-[var(--ark-text-faint)]">选择一个学习工具开始</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => {
            const Icon = getSubAppIcon(app.icon);
            return (
              <button
                key={app.id}
                type="button"
                className="ark-home-card ark-home-shortcut-card ark-focus-ring flex min-h-[180px] flex-col justify-center rounded-[20px] px-6 py-8 text-left"
                onClick={() => navigate(app.route)}
              >
                <span className="ark-home-shortcut-icon mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] text-[var(--ark-accent)]">
                  <Icon className="h-7 w-7" aria-hidden="true" />
                </span>
                <span className="text-lg font-semibold text-[var(--ark-text)]">{app.name}</span>
                <span className="mt-1.5 text-sm font-medium text-[var(--ark-text-faint)]">{app.description}</span>
              </button>
            );
          })}
          {isAdmin && (
            <button
              type="button"
              className="ark-home-card ark-home-shortcut-card ark-focus-ring flex min-h-[180px] flex-col justify-center rounded-[20px] px-6 py-8 text-left"
              onClick={() => navigate('/test-focus')}
            >
              <span className="ark-home-shortcut-icon mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] text-[var(--ark-accent)]">
                <Beaker className="h-7 w-7" aria-hidden="true" />
              </span>
              <span className="text-lg font-semibold text-[var(--ark-text)]">测试专注工作</span>
              <span className="mt-1.5 text-sm font-medium text-[var(--ark-text-faint)]">管理员专用测试工具</span>
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
