import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import SubAppHomeTemplate from '../components/SubAppHomeTemplate';
import { useAuthStore } from '../lib/auth';
import { loadAppRegistry, type AppDeclaration } from '../lib/appRegistry';
import { useSubAppHomePage } from '../hooks/useSubAppHomePage';
import DeliberateWorkflow from './DeliberateWorkflow';

function SubAppHomePage({ app }: { app: AppDeclaration }) {
  const page = useSubAppHomePage(app);
  return <SubAppHomeTemplate {...page} />;
}

export default function DynamicSubAppHome() {
  const { appId } = useParams<{ appId: string }>();
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false);
  const [app, setApp] = useState<AppDeclaration | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!appId) return;
      const apps = await loadAppRegistry();
      const found = apps.find((a) => a.id === appId);
      if (cancelled) return;
      if (!found || (found.adminOnly && !isAdmin)) { setApp(null); return; }
      setApp(found);
    })();
    return () => { cancelled = true; };
  }, [appId, isAdmin]);

  if (!app) return null;

  if (app.type === 'deliberate-workflow') {
    return <DeliberateWorkflow appId={app.id} />;
  }

  return <SubAppHomePage app={app} />;
}
