import type { VocabReviewSubmitResult } from '../../lib/vocab/types';

export default function ReviewResultPanel({ result }: { result: VocabReviewSubmitResult }) {
  return (
    <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm text-ark-text">
      <div className="font-medium">本次结果：{result.result}</div>
      <div className="mt-2 text-ark-text-muted">
        掌握度 {result.mastery_score}，下次复习间隔 {result.interval_days} 天。
      </div>
    </div>
  );
}
