import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import SubAppHomeTemplate from '../components/SubAppHomeTemplate';
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
      const BuiltIn = await getBuiltInPage(appId);
      if (BuiltIn && !cancelled) { setPage(<BuiltIn />); return; }
      const apps = await loadDynamicRegistry();
      const app = apps.find((a) => a.id === appId);
      if (!cancelled) setPage(app ? <DynamicAppHome app={app} /> : null);
    })();
    return () => { cancelled = true; };
  }, [appId]);

  return <>{page}</>;
}

function DynamicAppHome({ app }: { app: SubAppDeclaration }) {
  const fw = app.focusWorks[0];
  const templateLabel = fw?.template === 'flashcard' ? '闪卡' : '选择题';

  return (
    <SubAppHomeTemplate
      eyebrow={app.id.toUpperCase()}
      title={app.name}
      statusLabel="骨架已就绪"
      metaItems={[`专注模板: ${templateLabel}`, `题库: ${fw?.contentBankType === 'word_deck' ? '词书' : '文章题库'}`]}
      configureAction={{ label: '配置', disabled: true }}
      heroLabel={fw?.label ?? '专注工作'}
      heroValue="—"
      heroDetail={app.description}
      heroProgressPercent={0}
      heroProgressLabel="等待接入"
      primaryAction={{ label: '后端接入后可用', disabled: true }}
      metrics={[
        { label: '专注工作', value: fw?.label ?? '—', detail: fw?.type ?? '—' },
        { label: '模板', value: templateLabel, detail: fw?.template ?? '—' },
        { label: '题库类型', value: fw?.contentBankType === 'word_deck' ? '词书' : '题库', detail: fw?.contentBankType ?? '—' },
      ]}
      assetEyebrow="待完善"
      assetTitle="接入清单"
      assetDescription="该子应用骨架已生成。完成以下步骤即可上线使用。"
      arrangements={null}
      feedback={null}
      modals={null}
      assetContent={(
        <div className="space-y-3 rounded-lg border border-ark-border bg-ark-surface-subtle p-6">
          <CheckItem done label="注册声明 + 后端 API + DB 建表 + 题库导入" />
          <CheckItem label="生成用户进度表与 FSRS 复习端点" />
          <CheckItem label="实现专注工作组件并注册到 focusWorkRegistry" />
          <CheckItem label="创建首页组件替换本占位页（参考 Vocab/ERC Home）" />
        </div>
      )}
    />
  );
}

function CheckItem({ label, done }: { label: string; done?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-ark-surface-strong text-ark-text-faint'}`}>
        {done ? '✓' : '·'}
      </span>
      <span className={`text-sm ${done ? 'text-ark-text' : 'text-ark-text-faint'}`}>{label}</span>
    </div>
  );
}
