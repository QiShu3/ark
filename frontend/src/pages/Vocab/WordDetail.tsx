import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import SubAppPageShell from '../../components/SubAppPageShell';
import WordMetaPanel from '../../components/Vocab/WordMetaPanel';
import { fetchVocabWordDetail } from '../../lib/vocab/api';
import type { VocabWordDetail as VocabWordDetailType } from '../../lib/vocab/types';

export default function VocabWordDetail() {
  const { wordId } = useParams();
  const [detail, setDetail] = useState<VocabWordDetailType | null>(null);
  const [loadedWordId, setLoadedWordId] = useState<string | null>(null);
  const [error, setError] = useState<{ wordId: string; message: string } | null>(null);
  const isLoading = Boolean(wordId) && loadedWordId !== wordId && error?.wordId !== wordId;

  useEffect(() => {
    let cancelled = false;

    if (!wordId) return;
    fetchVocabWordDetail(wordId)
      .then((payload) => {
        if (cancelled) return;
        setDetail(payload);
        setLoadedWordId(wordId);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError({
          wordId,
          message: err instanceof Error ? err.message : '单词详情加载失败',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [wordId]);

  return (
    <SubAppPageShell maxWidth="4xl">
      <a href="#/vocab" className="text-sm text-ark-text-muted transition hover:text-ark-text">
        返回词书首页
      </a>

      {isLoading ? <p className="mt-8 text-sm text-ark-text-muted">详情加载中…</p> : null}
      {error?.wordId === wordId ? <p className="mt-8 text-sm text-rose-200">{error.message}</p> : null}

      {detail ? (
        <div className="mt-6 rounded-[2rem] border border-ark-border bg-ark-surface-subtle p-8 backdrop-blur-md">
          <h1 className="text-4xl font-semibold tracking-tight">{detail.word}</h1>
          <div className="mt-3 flex gap-4 text-sm text-ark-text-muted">
            {detail.us_pronunciation ? <span>US /{detail.us_pronunciation}/</span> : null}
            {detail.uk_pronunciation ? <span>UK /{detail.uk_pronunciation}/</span> : null}
          </div>
          <div className="mt-8">
            <WordMetaPanel detail={detail} />
          </div>
        </div>
      ) : null}
    </SubAppPageShell>
  );
}
