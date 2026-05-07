type Props = {
  deckName: string;
  inheritableWordCount: number;
  submitting: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
};

export default function DeckInheritanceModal({ deckName, inheritableWordCount, submitting, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/72 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="继承已掌握单词">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#101218] p-7 text-white shadow-2xl shadow-black/40">
        <div className="text-sm uppercase tracking-[0.28em] text-white/40">Inheritance</div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">继承已掌握单词</h2>
        <p className="mt-3 text-sm leading-6 text-white/65">
          {`当前切换到 ${deckName}，这本词书的已掌握单词数还是 0。检测到它和你的累计掌握单词里有 ${inheritableWordCount} 个重合词，是否直接继承为已掌握？`}
        </p>
        <p className="mt-3 text-sm leading-6 text-white/45">继承后，这些重合单词会直接写入这本词书的 Review / 已掌握状态。</p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/70 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            暂不继承
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={submitting}
            className="rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '继承中…' : '立即继承'}
          </button>
        </div>
      </div>
    </div>
  );
}
