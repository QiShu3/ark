import { Outlet } from 'react-router-dom';

import { useAuthStore } from '../lib/auth';

export default function RequireAdmin() {
  const user = useAuthStore((state) => state.user);

  if (!user?.is_admin) {
    return (
      <main aria-label="管理员权限不足" className="ark-page relative z-10 flex h-full w-full items-center justify-center px-6 pt-32">
        <section className="ark-home-card max-w-md rounded-[24px] px-6 py-5 text-center">
          <h1 className="text-xl font-semibold text-ark-text">需要管理员权限</h1>
          <p className="mt-2 text-sm text-ark-text-muted">UI 组件库仅对管理员开放。</p>
        </section>
      </main>
    );
  }

  return <Outlet />;
}
