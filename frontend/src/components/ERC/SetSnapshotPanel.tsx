import { useEffect, useState } from 'react';
import { History, TrendingUp, Target, Clock } from 'lucide-react';
import { fetchSetSnapshots } from '../../lib/choice/api';
import type { SetSnapshot } from '../../lib/choice/types';

type Props = {
  bankId: string;
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}分钟`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}小时${mins % 60}分钟`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SetSnapshotPanel({ bankId }: Props) {
  const [snapshots, setSnapshots] = useState<SetSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchSetSnapshots(bankId, { limit: 10 });
        if (!cancelled) setSnapshots(data);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bankId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-[var(--ark-text-muted)]">加载存档记录…</div>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <History className="mb-2 h-8 w-8 text-[var(--ark-text-faint)]" />
        <p className="text-sm text-[var(--ark-text-muted)]">暂无存档记录</p>
        <p className="mt-1 text-xs text-[var(--ark-text-faint)]">完成专注学习阶段后自动生成</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {snapshots.map((snap) => {
        const d = snap.data;
        const focus = d.focus_stats;
        return (
          <div
            key={snap.id}
            className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--ark-text)]">
                <History className="h-4 w-4 text-[var(--ark-text-muted)]" />
                {formatDate(snap.created_at)}
              </div>
              {snap.trigger_reason && (
                <span className="inline-flex items-center rounded-full border border-ark-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--ark-text-faint)]">
                  {snap.trigger_reason === 'phase_end' ? '阶段结束' : snap.trigger_reason}
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {d.accuracy != null && (
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-[var(--ark-text-faint)]" />
                  <div>
                    <div className="text-xs text-[var(--ark-text-muted)]">正确率</div>
                    <div className="text-sm font-semibold text-[var(--ark-text)]">{Math.round(d.accuracy * 100)}%</div>
                  </div>
                </div>
              )}
              {d.due_count != null && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[var(--ark-text-faint)]" />
                  <div>
                    <div className="text-xs text-[var(--ark-text-muted)]">待复习</div>
                    <div className="text-sm font-semibold text-[var(--ark-text)]">{d.due_count}</div>
                  </div>
                </div>
              )}
              {d.mastered_count != null && (
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-emerald-500" />
                  <div>
                    <div className="text-xs text-[var(--ark-text-muted)]">已掌握</div>
                    <div className="text-sm font-semibold text-[var(--ark-text)]">{d.mastered_count}</div>
                  </div>
                </div>
              )}
              {focus?.total_runs != null && focus.total_runs > 0 && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[var(--ark-text-faint)]" />
                  <div>
                    <div className="text-xs text-[var(--ark-text-muted)]">累计练习</div>
                    <div className="text-sm font-semibold text-[var(--ark-text)]">
                      {focus.total_runs}次 · {formatDuration(focus.total_duration_seconds ?? 0)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {d.total_count != null && (
              <div className="mt-3 flex gap-2 text-[10px] uppercase tracking-wider text-[var(--ark-text-faint)]">
                <span>共{d.total_count}题</span>
                {d.new_count != null && d.new_count > 0 && <span>新{d.new_count}</span>}
                {d.learning_count != null && d.learning_count > 0 && <span>学习中{d.learning_count}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
