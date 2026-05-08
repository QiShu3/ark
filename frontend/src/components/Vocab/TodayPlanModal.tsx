import { useEffect, useMemo, useState } from 'react';

type Props = {
  initialTargetCount: number;
  isCompleted: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (totalTargetCount: number) => Promise<void> | void;
};

function ratioBreakdown(totalTargetCount: number) {
  const learning = Math.round(totalTargetCount * 0.3);
  const review = Math.round(totalTargetCount * 0.1);
  const newCount = Math.max(totalTargetCount - learning - review, 0);
  return { learning, review, newCount };
}

export default function TodayPlanModal({ initialTargetCount, isCompleted, isSaving, onClose, onSave }: Props) {
  const [targetCountValue, setTargetCountValue] = useState(String(initialTargetCount));

  useEffect(() => {
    setTargetCountValue(String(initialTargetCount));
  }, [initialTargetCount]);

  const parsedTargetCount = Number(targetCountValue);
  const totalTargetCount = targetCountValue === '' || !Number.isFinite(parsedTargetCount) ? 0 : Math.max(1, parsedTargetCount);
  const canSave = totalTargetCount >= 1 && totalTargetCount <= 500;
  const ratio = useMemo(() => ratioBreakdown(totalTargetCount), [totalTargetCount]);
  const title = isCompleted ? '今日已完成' : '调整今日单词';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#101218] p-7 text-white shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.28em] text-white/40">Today</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-white/65">
              {isCompleted ? '今天这本词书已经完成，是否继续再来一轮？' : '你可以直接调整今天这本词书的总量，系统会按固定配比重新生成剩余任务。'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-2 text-sm text-white/70 transition hover:border-white/25 hover:text-white"
            aria-label="关闭今日单词参数弹窗"
          >
            关闭
          </button>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
          <label htmlFor="today-target-count" className="block text-sm font-medium text-white/85">
            今日总量
          </label>
          <input
            id="today-target-count"
            type="number"
            min={1}
            max={500}
            value={targetCountValue}
            onChange={(event) => setTargetCountValue(event.target.value)}
            className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition focus:border-white/30"
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">30% Learning / Relearning</div>
              <div className="mt-2 text-2xl font-semibold">{ratio.learning}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">10% Review</div>
              <div className="mt-2 text-2xl font-semibold">{ratio.review}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">60% New</div>
              <div className="mt-2 text-2xl font-semibold">{ratio.newCount}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/70 transition hover:border-white/25 hover:text-white"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isSaving || !canSave}
            onClick={() => void onSave(totalTargetCount)}
            className="rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCompleted ? '保存并继续' : '保存今日参数'}
          </button>
        </div>
      </div>
    </div>
  );
}
