import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import SubAppPageShell from '../../components/SubAppPageShell';
import SubAppPageHeader from '../../components/SubAppPageHeader';
import { fetchERCMistakes } from '../../lib/erc/api';
import type { ERCMistakeItem } from '../../lib/erc/types';

export default function ERCMistakes() {
  const [items, setItems] = useState<ERCMistakeItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchERCMistakes()
      .then((payload) => {
        if (cancelled) return;
        setItems(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '错题加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SubAppPageShell>
      <SubAppPageHeader
        breadcrumb="Mistakes"
        title="错题本"
        backTo="/erc"
        backLabel="返回首页"
        borderBottom
      />

        {error ? <p className="mt-6 text-sm text-rose-200">{error}</p> : null}
        {!error && items.length === 0 ? <p className="mt-6 text-sm text-ark-text-muted">暂无错题。</p> : null}

        <div className="mt-6 space-y-3">
          {items.map((item) => (
            <div key={item.question_id} className="rounded-2xl border border-ark-border bg-ark-surface-subtle p-5">
              <div className="text-sm text-ark-text-muted">
                {item.year} Text {item.text_no} · {item.question_no}
              </div>
              <div className="mt-3 text-base font-medium text-ark-text">{item.stem}</div>
              <div className="mt-3 text-sm text-ark-text-muted">
                正确答案 {item.correct_option}
                {item.last_chosen_option ? ` · 最近选择 ${item.last_chosen_option}` : ''}
                {' · '}
                错误 {item.wrong_count} 次
              </div>
              <Link
                to={`/erc/articles/${item.article_id}/practice`}
                className="mt-4 inline-flex rounded-full border border-ark-border px-4 py-2 text-sm text-ark-text"
              >
                回到原文
              </Link>
            </div>
          ))}
        </div>
    </SubAppPageShell>
  );
}
