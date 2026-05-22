import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock } from 'lucide-react';

type Props = {
  initialTargetCount: number;
  initialAddToTodayPlan: boolean;
  initialFocusDuration: number; // in seconds
  isCompleted: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (totalTargetCount: number, addToTodayPlan: boolean, focusDuration: number) => Promise<void> | void;
};

function ratioBreakdown(totalTargetCount: number) {
  const learning = Math.round(totalTargetCount * 0.3);
  const review = Math.round(totalTargetCount * 0.1);
  const newCount = Math.max(totalTargetCount - learning - review, 0);
  return { learning, review, newCount };
}

export default function TodayPlanModal({
  initialTargetCount,
  initialAddToTodayPlan,
  initialFocusDuration,
  isCompleted,
  isSaving,
  onClose,
  onSave,
}: Props) {
  const [targetCountValue, setTargetCountValue] = useState(String(initialTargetCount));
  const [addToTodayPlan, setAddToTodayPlan] = useState(initialAddToTodayPlan);
  const [focusDurationValue, setFocusDurationValue] = useState(String(Math.round(initialFocusDuration / 60)));

  useEffect(() => {
    setTargetCountValue(String(initialTargetCount));
  }, [initialTargetCount]);

  useEffect(() => {
    setAddToTodayPlan(initialAddToTodayPlan);
  }, [initialAddToTodayPlan]);

  useEffect(() => {
    setFocusDurationValue(String(Math.round(initialFocusDuration / 60)));
  }, [initialFocusDuration]);

  const parsedTargetCount = Number(targetCountValue);
  const totalTargetCount = targetCountValue === '' || !Number.isFinite(parsedTargetCount) ? 0 : Math.max(1, parsedTargetCount);
  const canSave = totalTargetCount >= 1 && totalTargetCount <= 500;

  const parsedFocusDuration = Number(focusDurationValue);
  const focusDurationSeconds = (focusDurationValue === '' || !Number.isFinite(parsedFocusDuration) ? 25 : Math.max(5, Math.min(120, parsedFocusDuration))) * 60;

  const ratio = useMemo(() => ratioBreakdown(totalTargetCount), [totalTargetCount]);
  const title = isCompleted ? '今日已完成' : '调整今日单词';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-2xl rounded-[2.5rem] border border-white/10 bg-[#101218] p-8 text-white shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="text-sm uppercase tracking-[0.28em] text-emerald-400 font-semibold">Settings</div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2>
            <p className="mt-2 text-xs text-white/50">
              {isCompleted ? '今天这本词书已经完成，是否继续再来一轮？' : '配置背单词任务参数，系统将根据您的设定自动添加并同步至主页今日计划。'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/25 hover:text-white"
            aria-label="关闭今日单词参数弹窗"
          >
            关闭
          </button>
        </div>

        <div className="mt-6 space-y-6">
          <div className="rounded-3xl border border-white/6 bg-white/2 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/6 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-semibold text-white">背单词任务配置</h3>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="today-target-count" className="block text-xs text-white/50 mb-2">
                  今日总量
                </label>
                <input
                  id="today-target-count"
                  type="number"
                  min={1}
                  max={500}
                  value={targetCountValue}
                  onChange={(event) => setTargetCountValue(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30"
                />
              </div>
              <div>
                <label htmlFor="focus-duration" className="block text-xs text-white/50 mb-2">
                  默认专注时长 (分钟)
                </label>
                <div className="relative">
                  <input
                    id="focus-duration"
                    type="number"
                    min={5}
                    max={120}
                    value={focusDurationValue}
                    onChange={(event) => setFocusDurationValue(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 pl-4 pr-12 py-3 text-sm text-white outline-none transition focus:border-white/30"
                  />
                  <Clock className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-white/50">单词黄金配比方案</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/6 bg-white/3 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 leading-normal">30% Learning / Relearning</div>
                  <div className="mt-2 text-2xl font-semibold">{ratio.learning}</div>
                </div>
                <div className="rounded-2xl border border-white/6 bg-white/3 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 leading-normal">10% Review</div>
                  <div className="mt-2 text-2xl font-semibold">{ratio.review}</div>
                </div>
                <div className="rounded-2xl border border-white/6 bg-white/3 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 leading-normal">60% New</div>
                  <div className="mt-2 text-2xl font-semibold">{ratio.newCount}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3 border-t border-white/10 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/70 transition hover:border-white/25 hover:text-white"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isSaving || (addToTodayPlan && !canSave)}
            onClick={() => void onSave(totalTargetCount, addToTodayPlan, focusDurationSeconds)}
            className="rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCompleted ? '保存并继续' : '保存今日参数'}
          </button>
        </div>
      </div>
    </div>
  );
}

