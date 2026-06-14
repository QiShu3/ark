import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import GenericChoiceQuestionHome from '../components/GenericChoiceQuestionHome';
import { useAuthStore } from '../lib/auth';
import { loadDynamicRegistry, type SubAppDeclaration } from '../lib/subAppRegistry';

async function getBuiltInPage(appId: string): Promise<React.ComponentType | null> {
  if (appId === 'vocab') return (await import('./Vocab/Home')).default;
  if (appId === 'erc') return (await import('./ERC/Home')).default;
  return null;
}

export default function DynamicSubAppHome() {
  const { appId } = useParams<{ appId: string }>();
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false);
  const [page, setPage] = useState<React.ReactNode>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!appId) return;
      const BuiltIn = await getBuiltInPage(appId);
      if (BuiltIn && !cancelled) { setPage(<BuiltIn />); return; }
      const apps = await loadDynamicRegistry();
      const app = apps.find((a) => a.id === appId);
      if (cancelled) return;
      if (!app || (app.adminOnly && !isAdmin)) { setPage(null); return; }
      // route by template type
      const tpl = app.focusWorks[0]?.template;
      if (tpl === 'choice_question') setPage(<GenericChoiceQuestionHome app={app} />);
      else if (tpl === 'flashcard') setPage(<GenericChoiceQuestionHome app={app} />);
      else setPage(<GenericChoiceQuestionHome app={app} />);
    })();
    return () => { cancelled = true; };
  }, [appId, isAdmin]);

  return <>{page}</>;
}
