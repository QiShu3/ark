import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import WordMetaPanel from '../../components/Vocab/WordMetaPanel';
import { fetchVocabWordDetail } from '../../lib/vocab/api';
import type { VocabWordDetail as VocabWordDetailType } from '../../lib/vocab/types';

export default function VocabWordDetail() {
  const { wordId } = useParams();
  const [detail, setDetail] = useState<VocabWordDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!wordId) return;
    setLoading(true);
    fetchVocabWordDetail(wordId)
      .then((payload) => {
        if (cancelled) return;
        setDetail(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '单词详情加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wordId]);

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto px-8 pb-10 pt-20">
      <div className="mx-auto max-w-4xl">
        <a href="#/vocab" className="text-sm text-white/65 transition hover:text-white">
          返回词书首页
        </a>

        {loading ? <p className="mt-8 text-sm text-white/55">详情加载中…</p> : null}
        {error ? <p className="mt-8 text-sm text-rose-200">{error}</p> : null}

        {detail ? (
          <div className="mt-6 rounded-[2rem] border border-white/10 bg-black/30 p-8 backdrop-blur-md">
            <h1 className="text-4xl font-semibold tracking-tight">{detail.word}</h1>
            <div className="mt-3 flex gap-4 text-sm text-white/55">
              {detail.us_pronunciation ? <span>US /{detail.us_pronunciation}/</span> : null}
              {detail.uk_pronunciation ? <span>UK /{detail.uk_pronunciation}/</span> : null}
            </div>
            <div className="mt-8">
              <WordMetaPanel detail={detail} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
