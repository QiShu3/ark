import { useState } from 'react';

import type { VocabReviewItem } from '../../lib/vocab/types';
import WordMetaPanel from './WordMetaPanel';

export default function StudyCard({ item }: { item: VocabReviewItem }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <section className="rounded-[2rem] border border-ark-border bg-ark-surface-subtle p-6 backdrop-blur-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-4xl font-semibold tracking-tight">{item.word}</div>
          <div className="mt-2 flex gap-4 text-sm text-ark-text-muted">
            {item.us_pronunciation ? <span>US /{item.us_pronunciation}/</span> : null}
            {item.uk_pronunciation ? <span>UK /{item.uk_pronunciation}/</span> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          className="rounded-full border border-ark-border px-4 py-2 text-sm text-ark-text transition hover:border-ark-border"
        >
          {revealed ? '收起释义' : '显示释义'}
        </button>
      </div>

      {revealed ? <div className="mt-6"><WordMetaPanel detail={item} /></div> : null}
    </section>
  );
}
