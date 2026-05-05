import { useEffect, useState } from 'react';

import type { VocabReviewItem } from '../../lib/vocab/types';
import WordMetaPanel from './WordMetaPanel';

export default function StudyCard({ item }: { item: VocabReviewItem }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [item.id]);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-black/30 p-6 backdrop-blur-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-4xl font-semibold tracking-tight">{item.word}</div>
          <div className="mt-2 flex gap-4 text-sm text-white/55">
            {item.us_pronunciation ? <span>US /{item.us_pronunciation}/</span> : null}
            {item.uk_pronunciation ? <span>UK /{item.uk_pronunciation}/</span> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30"
        >
          {revealed ? '收起释义' : '显示释义'}
        </button>
      </div>

      {revealed ? <div className="mt-6"><WordMetaPanel detail={item} /></div> : null}
    </section>
  );
}
