import { useState, type ReactNode } from 'react';
import { Check, ExternalLink, Settings, X } from 'lucide-react';

import AppModalFrame from '../components/AppModalFrame';
import Button from '../components/Button';
import HomeCard from '../components/HomeCard';
import HomeSectionHeader from '../components/HomeSectionHeader';

type ComponentEntry = {
  name: string;
  source: string;
  use: string;
  avoid: string;
  preview: ReactNode;
};

const tokenGroups = [
  {
    title: 'Text',
    tokens: ['--ark-text', '--ark-text-muted', '--ark-text-faint'],
  },
  {
    title: 'Surface',
    tokens: ['--ark-surface', '--ark-surface-strong', '--ark-surface-subtle'],
  },
  {
    title: 'Accent',
    tokens: ['--ark-accent', '--ark-accent-soft', '--ark-focus-ring'],
  },
  {
    title: 'Glass',
    tokens: ['--ark-glass-surface', '--ark-glass-border', '--ark-glass-highlight'],
  },
];

function ComponentSpecCard({ entry }: { entry: ComponentEntry }) {
  return (
    <HomeCard className="flex min-h-[220px] flex-col px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ark-text">{entry.name}</h2>
          <p className="mt-1 text-xs font-medium text-ark-text-faint">{entry.source}</p>
        </div>
        <ExternalLink className="h-4 w-4 shrink-0 text-ark-text-faint" aria-hidden="true" />
      </div>
      <div className="mt-4 flex min-h-[64px] flex-wrap items-center gap-2">{entry.preview}</div>
      <div className="mt-auto grid gap-2 pt-4 text-xs leading-relaxed">
        <p className="text-ark-text-muted"><span className="font-semibold text-ark-text">推荐：</span>{entry.use}</p>
        <p className="text-ark-text-faint"><span className="font-semibold text-ark-text-muted">避免：</span>{entry.avoid}</p>
      </div>
    </HomeCard>
  );
}

function TokenSwatch({ token }: { token: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-ark-border bg-ark-surface-subtle px-3 py-2">
      <span
        className="h-8 w-8 shrink-0 rounded-lg border border-ark-border"
        style={{ background: `var(${token})` }}
        aria-hidden="true"
      />
      <span className="min-w-0 truncate text-xs font-medium text-ark-text-muted">{token}</span>
    </div>
  );
}

export default function AdminUiLibraryPage() {
  const [modalOpen, setModalOpen] = useState(false);

  const componentEntries: ComponentEntry[] = [
    {
      name: 'Button',
      source: 'frontend/src/components/Button.tsx',
      use: '普通动作、表单提交、加载态、左右图标按钮。',
      avoid: '为普通文本按钮重新手写独立 `<button>` 风格。',
      preview: (
        <>
          <Button variant="primary" leftIcon={<Check className="h-4 w-4" />}>Primary</Button>
          <Button variant="secondary" size="sm">Secondary</Button>
          <Button variant="ghost" size="sm">Ghost</Button>
          <Button variant="danger" size="sm">Danger</Button>
          <Button variant="secondary" size="sm" loading loadingText="Loading" />
          <Button variant="secondary" size="sm" disabled>Disabled</Button>
        </>
      ),
    },
    {
      name: 'HomeCard',
      source: 'frontend/src/components/HomeCard.tsx',
      use: '首页右栏卡片外壳、hero 卡片和 shortcut 卡片。',
      avoid: '在首页新板块中继续散落 `ark-home-card`、圆角和 padding 决策。',
      preview: (
        <>
          <span className="rounded-xl border border-ark-border bg-ark-surface-subtle px-3 py-2 text-sm text-ark-text">Standard</span>
          <span className="rounded-xl bg-ark-accent-soft px-3 py-2 text-sm font-semibold text-ark-accent">Hero</span>
          <span className="rounded-xl border border-ark-border bg-ark-surface-subtle px-3 py-2 text-sm text-ark-text-muted">Shortcut</span>
        </>
      ),
    },
    {
      name: 'HomeSectionHeader',
      source: 'frontend/src/components/HomeSectionHeader.tsx',
      use: '首页卡片标题与右侧轻量操作位。',
      avoid: '重复手写标题字号、字重、颜色和 action 对齐。',
      preview: (
        <div className="w-full">
          <HomeSectionHeader
            title="板块标题"
            action={<Button variant="secondary" size="xs">操作</Button>}
          />
        </div>
      ),
    },
    {
      name: 'AppModalFrame',
      source: 'frontend/src/components/AppModalFrame.tsx',
      use: '业务弹窗外壳、遮罩、安全区和 dialog 语义。',
      avoid: '为普通业务弹窗重新实现 backdrop、z-index 和安全区。',
      preview: (
        <Button variant="secondary" leftIcon={<Settings className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
          预览弹窗
        </Button>
      ),
    },
  ];

  return (
    <main aria-label="UI 组件库" className="ark-page relative z-10 h-full w-full overflow-y-auto px-8 pt-32">
      <div className="mx-auto max-w-6xl pb-12">
        <header className="mb-8">
          <p className="text-sm font-semibold text-ark-accent">Admin</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ark-text">UI 组件库</h1>
          <p className="mt-2 max-w-2xl text-sm text-ark-text-muted">
            统一记录可复用组件、主题 token 和首页右栏 UI 治理入口。
          </p>
        </header>

        <section className="mb-8">
          <HomeSectionHeader title="组件资产" className="mb-3" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {componentEntries.map((entry) => (
              <ComponentSpecCard key={entry.name} entry={entry} />
            ))}
          </div>
        </section>

        <section>
          <HomeSectionHeader title="Theme Tokens" className="mb-3" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {tokenGroups.map((group) => (
              <HomeCard key={group.title} className="px-5 py-4">
                <h2 className="text-base font-semibold text-ark-text">{group.title}</h2>
                <div className="mt-4 grid gap-2">
                  {group.tokens.map((token) => (
                    <TokenSwatch key={token} token={token} />
                  ))}
                </div>
              </HomeCard>
            ))}
          </div>
        </section>
      </div>

      <AppModalFrame
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        ariaLabel="AppModalFrame 预览"
        panelClassName="w-[420px] max-w-[92vw] rounded-2xl border border-ark-border bg-ark-surface-strong p-5 text-ark-text shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">AppModalFrame</h2>
            <p className="mt-2 text-sm text-ark-text-muted">统一业务弹窗外层布局和遮罩。</p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-ark-text-muted transition hover:bg-ark-surface-subtle hover:text-ark-text"
            onClick={() => setModalOpen(false)}
            aria-label="关闭弹窗预览"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="primary" onClick={() => setModalOpen(false)}>
            知道了
          </Button>
        </div>
      </AppModalFrame>
    </main>
  );
}
