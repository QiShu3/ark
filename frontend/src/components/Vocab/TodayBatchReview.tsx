type ReviewResult = 'again' | 'hard' | 'good' | 'easy';

type ReviewGroup = {
  key: ReviewResult;
  title: string;
  items: Array<{
    id: string;
    word: string;
    translations: Array<{ pos: string | null; translation: string }>;
  }>;
};

type Props = {
  count: number;
  groups: ReviewGroup[];
  actionLabel: string;
  onContinue: () => void;
};

function translationText(translations: Array<{ pos: string | null; translation: string }>) {
  return translations
    .slice(0, 2)
    .map((item) => (item.pos ? `${item.pos} ${item.translation}` : item.translation))
    .join('；');
}

export default function TodayBatchReview({ count, groups, actionLabel, onContinue }: Props) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-black/20 p-8">
      <div className="text-sm uppercase tracking-[0.28em] text-white/40">Batch Review</div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">上一批回顾</h2>
      <p className="mt-3 text-sm leading-6 text-white/65">{`本批完成 ${count} 个单词。先回顾一下这 10 个词的掌握情况，再进入下一批。`}</p>

      <div className="mt-8 grid gap-5">
        {groups.map((group) => (
          <section key={group.key} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-medium text-white">{group.title}</h3>
              <div className="text-sm text-white/45">{group.items.length} 个</div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {group.items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-base font-medium text-white">{item.word}</div>
                  <div className="mt-2 text-sm leading-6 text-white/60">{translationText(item.translations)}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90"
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}
