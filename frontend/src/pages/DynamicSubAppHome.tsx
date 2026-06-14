import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { loadDynamicRegistry, type SubAppDeclaration } from '../lib/subAppRegistry';

async function getBuiltInPage(appId: string): Promise<React.ComponentType | null> {
  if (appId === 'vocab') return (await import('./Vocab/Home')).default;
  if (appId === 'erc') return (await import('./ERC/Home')).default;
  return null;
}

export default function DynamicSubAppHome() {
  const { appId } = useParams<{ appId: string }>();
  const [page, setPage] = useState<React.ReactNode>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!appId) return;
      // try built-in first
      const BuiltIn = await getBuiltInPage(appId);
      if (BuiltIn && !cancelled) { setPage(<BuiltIn />); return; }
      // try dynamic registry
      const apps = await loadDynamicRegistry();
      const app = apps.find((a) => a.id === appId);
      if (!cancelled) {
        setPage(app ? <PlaceholderPage app={app} /> : null);
      }
    })();
    return () => { cancelled = true; };
  }, [appId]);

  return <>{page}</>;
}

function PlaceholderPage({ app }: { app: SubAppDeclaration }) {
  return (
    <main className="ark-page relative z-10 h-full w-full overflow-y-auto px-8 pt-32">
      <div className="mx-auto max-w-4xl pb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--ark-text)]">{app.name}</h1>
        <p className="mt-4 text-[var(--ark-text-muted)]">{app.description}</p>
        <div className="mt-8 rounded-xl border border-ark-border bg-ark-surface-subtle p-8">
          <p className="text-[var(--ark-text-muted)]">
            该子应用骨架已生成。完善以下内容即可上线：
          </p>
          <ul className="mt-4 space-y-2 text-left text-sm text-[var(--ark-text-muted)] max-w-md mx-auto">
            <li>• 实现专注工作组件（{app.focusWorks.map((fw) => fw.label).join('、')}）</li>
            <li>• 注册到 <code className="rounded bg-ark-surface px-1">focusWorkRegistry</code></li>
            <li>• 创建首页替换本占位页</li>
          </ul>
          <div className="mt-6 text-xs text-[var(--ark-text-faint)]">
            <p>专注工作类型：{app.focusWorks.map((fw) => fw.type).join(', ')}</p>
            <p>题库类型：{app.focusWorks.map((fw) => fw.contentBankType).join(', ')}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
