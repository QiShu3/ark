import type { VocabWordDetail } from '../../lib/vocab/types';

export default function WordMetaPanel({ detail }: { detail: VocabWordDetail }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm uppercase tracking-[0.24em] text-white/45">释义</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {detail.translations.map((item, index) => (
            <div key={`${item.translation}-${index}`} className="rounded-full bg-white/8 px-3 py-2 text-sm text-white/85">
              {item.pos ? `${item.pos}. ` : ''}
              {item.translation}
            </div>
          ))}
        </div>
      </section>

      {detail.sentences.length ? (
        <section>
          <h3 className="text-sm uppercase tracking-[0.24em] text-white/45">例句</h3>
          <div className="mt-3 space-y-2">
            {detail.sentences.map((item, index) => (
              <div key={`${item.sentence}-${index}`} className="rounded-2xl bg-white/6 px-4 py-3 text-sm">
                <div className="text-white">{item.sentence}</div>
                <div className="mt-1 text-white/60">{item.translation}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {detail.phrases.length ? (
        <section>
          <h3 className="text-sm uppercase tracking-[0.24em] text-white/45">短语</h3>
          <div className="mt-3 space-y-2">
            {detail.phrases.map((item, index) => (
              <div key={`${item.phrase}-${index}`} className="rounded-2xl bg-white/6 px-4 py-3 text-sm">
                <div className="font-medium text-white">{item.phrase}</div>
                <div className="mt-1 text-white/60">{item.translation}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
