import { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, TrendingUp, Target, Clock, AlertTriangle, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchChoiceBanks, fetchSetSnapshots } from '../lib/choice/api';
import type { ChoiceBank, SetSnapshot } from '../lib/choice/types';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const hrs = Math.floor(minutes / 60);
  return `${hrs}小时${minutes % 60}分钟`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function BarChart({ data, max }: { data: { label: string; value: number; color: string }[]; max: number }) {
  return (
    <div className="flex items-end gap-2" style={{ height: 120 }}>
      {data.map((d) => {
        const pct = max > 0 ? (d.value / max) * 100 : 0;
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-medium text-[var(--ark-text-muted)]">{d.value}</span>
            <div className="w-full rounded-t" style={{ height: `${Math.max(pct, 2)}%`, background: d.color, minHeight: 4 }} />
            <span className="text-[10px] text-[var(--ark-text-faint)]">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function TrendLine({ values, color }: { values: { label: string; value: number }[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values.map((v) => v.value), 1);
  const min = Math.min(...values.map((v) => v.value), 0);
  const range = max - min || 1;
  const w = 280;
  const h = 80;
  const pad = 8;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - (v.value - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });
  const areaPoints = [`${pad},${h - pad}`, ...points, `${w - pad},${h - pad}`].join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 100 }}>
      <polygon points={areaPoints} fill={color} opacity={0.15} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.split(',')[0]} cy={p.split(',')[1]} r={3} fill={color} />
      ))}
    </svg>
  );
}

function DonutChart({ segments, size = 100 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        {segments.map((seg) => {
          const pct = seg.value / total;
          const dash = pct * circ;
          const el = (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={8}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-semibold text-[var(--ark-text)]">{total}</span>
      </div>
    </div>
  );
}

export default function SnapshotSubApp() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<ChoiceBank[]>([]);
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [snapshots, setSnapshots] = useState<SetSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChoiceBanks().then((list) => {
      // Deduplicate by name, prefer choice_sets (source='erc') over content_banks
      const byName = new Map<string, ChoiceBank>();
      for (const b of list) {
        const existing = byName.get(b.name);
        if (!existing || b.source === 'erc') {
          byName.set(b.name, b);
        }
      }
      const deduped = Array.from(byName.values());
      setBanks(deduped);
      if (deduped.length > 0) setSelectedBank(deduped[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedBank) return;
    setLoading(true);
    fetchSetSnapshots(selectedBank, { limit: 50 })
      .then(setSnapshots)
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, [selectedBank]);

  const latest = snapshots[0] ?? null;

  const accuracyTrend = [...snapshots].reverse().map((s) => ({
    label: formatDateShort(s.created_at),
    value: Math.round(((s.focus_stats as Record<string, number>)?.accuracy ?? 0) * 100),
  }));

  const masterySegments = (() => {
    if (!latest) return [];
    const m = latest.mastery as Record<string, number>;
    return [
      { label: '已掌握', value: m.mastered ?? 0, color: '#34d399' },
      { label: '熟悉', value: m.familiar ?? 0, color: '#60a5fa' },
      { label: '薄弱', value: m.weak ?? 0, color: '#fbbf24' },
      { label: '错题', value: m.mistake ?? 0, color: '#f87171' },
    ];
  })();

  const stateBarData = (() => {
    if (!latest) return [];
    const bs = latest.by_state ?? {};
    return [
      { label: '新', value: bs['0'] ?? bs['new'] ?? 0, color: '#94a3b8' },
      { label: '学习中', value: bs['1'] ?? bs['learning'] ?? 0, color: '#60a5fa' },
      { label: '复习', value: bs['2'] ?? bs['review'] ?? 0, color: '#34d399' },
      { label: '重学', value: bs['3'] ?? bs['relearning'] ?? 0, color: '#f87171' },
    ];
  })();

  return (
    <div className="ark-page fixed inset-x-1 bottom-1 top-[7.5rem] z-10 overflow-y-auto rounded-[28px] px-6 pb-10 pt-6 md:px-8" style={{ clipPath: 'inset(10px round 28px)' }}>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/apps')}
            className="inline-flex items-center justify-center rounded-lg border border-ark-border bg-ark-surface-subtle p-2 text-[var(--ark-text-muted)] hover:text-[var(--ark-text)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ark-text)]">存档分析</h1>
            <p className="mt-1 text-sm text-[var(--ark-text-muted)]">查看各题库的学习掌握度快照与趋势</p>
          </div>
        </div>

        {/* Bank selector */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-[var(--ark-text-muted)]">选择题库</label>
          <select
            value={selectedBank}
            onChange={(e) => setSelectedBank(e.target.value)}
            className="rounded-lg border border-ark-border bg-ark-surface px-4 py-2.5 text-sm text-[var(--ark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]"
          >
            {banks.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.question_count}题)</option>
            ))}
          </select>
          <span className="text-xs text-[var(--ark-text-faint)]">{snapshots.length} 条存档</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-sm text-[var(--ark-text-muted)]">加载中…</div>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="mb-3 h-12 w-12 text-[var(--ark-text-faint)]" />
            <p className="text-sm text-[var(--ark-text-muted)]">该题库暂无存档记录</p>
            <p className="mt-1 text-xs text-[var(--ark-text-faint)]">完成专注学习阶段后会自动生成存档</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            {latest && (() => {
              const m = latest.mastery as Record<string, number>;
              const f = latest.focus_stats as Record<string, number>;
              return (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
                  <div className="flex items-center gap-2 text-sm text-[var(--ark-text-muted)]">
                    <Layers className="h-4 w-4" /> 总题数
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-[var(--ark-text)]">{latest.total_questions}</div>
                  <div className="mt-1 text-xs text-[var(--ark-text-faint)]">{latest.total_articles} 篇文章</div>
                </div>
                <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
                  <div className="flex items-center gap-2 text-sm text-[var(--ark-text-muted)]">
                    <Target className="h-4 w-4" /> 已掌握
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-emerald-400">{m.mastered ?? 0}</div>
                  <div className="mt-1 text-xs text-[var(--ark-text-faint)]">
                    {latest.total_questions > 0 ? Math.round(((m.mastered ?? 0) / latest.total_questions) * 100) : 0}% 掌握率
                  </div>
                </div>
                <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
                  <div className="flex items-center gap-2 text-sm text-[var(--ark-text-muted)]">
                    <TrendingUp className="h-4 w-4" /> 正确率
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-[var(--ark-text)]">
                    {Math.round((f.accuracy ?? 0) * 100)}%
                  </div>
                  <div className="mt-1 text-xs text-[var(--ark-text-faint)]">
                    {f.total_answers ?? 0} 次答题
                  </div>
                </div>
                <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
                  <div className="flex items-center gap-2 text-sm text-[var(--ark-text-muted)]">
                    <Clock className="h-4 w-4" /> 累计练习
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-[var(--ark-text)]">
                    {formatDuration(f.total_minutes ?? 0)}
                  </div>
                  <div className="mt-1 text-xs text-[var(--ark-text-faint)]">
                    {f.total_sessions ?? 0} 次专注
                  </div>
                </div>
              </div>
              );
            })()}

            {/* Charts row */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-5">
                <h3 className="mb-4 text-sm font-medium text-[var(--ark-text-muted)]">掌握度分布</h3>
                <div className="flex items-center gap-6">
                  <DonutChart segments={masterySegments} size={110} />
                  <div className="flex-1 space-y-2">
                    {masterySegments.map((seg) => (
                      <div key={seg.label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ background: seg.color }} />
                          <span className="text-[var(--ark-text-muted)]">{seg.label}</span>
                        </div>
                        <span className="font-medium text-[var(--ark-text)]">{seg.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-5">
                <h3 className="mb-4 text-sm font-medium text-[var(--ark-text-muted)]">FSRS 状态分布</h3>
                <BarChart data={stateBarData} max={Math.max(...stateBarData.map((d) => d.value), 1)} />
              </div>
            </div>

            {accuracyTrend.length >= 2 && (
              <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-5">
                <h3 className="mb-4 text-sm font-medium text-[var(--ark-text-muted)]">正确率趋势</h3>
                <TrendLine values={accuracyTrend} color="#60a5fa" />
                <div className="mt-2 flex justify-between text-[10px] text-[var(--ark-text-faint)]">
                  <span>{accuracyTrend[0].label}</span>
                  <span>{accuracyTrend[accuracyTrend.length - 1].label}</span>
                </div>
              </div>
            )}

            {latest && (() => {
              const fs = latest.fsrs_stats as Record<string, number>;
              return (
              <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-5">
                <h3 className="mb-4 text-sm font-medium text-[var(--ark-text-muted)]">FSRS 算法指标</h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-[var(--ark-text-faint)]">平均稳定性</div>
                    <div className="mt-1 text-lg font-semibold text-[var(--ark-text)]">{fs.avg_stability ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--ark-text-faint)]">平均难度</div>
                    <div className="mt-1 text-lg font-semibold text-[var(--ark-text)]">{fs.avg_difficulty ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--ark-text-faint)]">总遗忘次数</div>
                    <div className="mt-1 text-lg font-semibold text-amber-400">{fs.total_lapses ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--ark-text-faint)]">平均复习次数</div>
                    <div className="mt-1 text-lg font-semibold text-[var(--ark-text)]">{fs.avg_reps ?? 0}</div>
                  </div>
                </div>
              </div>
              );
            })()}

            {latest && ((latest.due_status as Record<string, number>)?.due_now ?? 0) > 0 && (() => {
              const ds = latest.due_status as Record<string, number>;
              return (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 text-sm text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  当前有 <span className="font-semibold">{ds.due_now}</span> 道题目待复习
                  {(ds.overdue ?? 0) > 0 && (
                    <span className="text-amber-300">（其中 {ds.overdue} 道已逾期）</span>
                  )}
                </div>
              </div>
              );
            })()}

            <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-5">
              <h3 className="mb-4 text-sm font-medium text-[var(--ark-text-muted)]">存档历史</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ark-border text-left text-xs text-[var(--ark-text-faint)]">
                      <th className="pb-2 pr-4">时间</th>
                      <th className="pb-2 pr-4">总题数</th>
                      <th className="pb-2 pr-4">已掌握</th>
                      <th className="pb-2 pr-4">正确率</th>
                      <th className="pb-2 pr-4">待复习</th>
                      <th className="pb-2 pr-4">稳定性</th>
                      <th className="pb-2">触发</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((s) => {
                      const sm = s.mastery as Record<string, number>;
                      const sf = s.focus_stats as Record<string, number>;
                      const sd = s.due_status as Record<string, number>;
                      const ss = s.fsrs_stats as Record<string, number>;
                      return (
                      <tr key={s.id} className="border-b border-ark-border/50">
                        <td className="py-2.5 pr-4 text-[var(--ark-text-muted)]">{formatDate(s.created_at)}</td>
                        <td className="py-2.5 pr-4 text-[var(--ark-text)]">{s.total_questions}</td>
                        <td className="py-2.5 pr-4 text-emerald-400">{sm.mastered ?? 0}</td>
                        <td className="py-2.5 pr-4 text-[var(--ark-text)]">{Math.round((sf.accuracy ?? 0) * 100)}%</td>
                        <td className="py-2.5 pr-4 text-[var(--ark-text)]">{sd.due_now ?? 0}</td>
                        <td className="py-2.5 pr-4 text-[var(--ark-text)]">{ss.avg_stability ?? 0}</td>
                        <td className="py-2.5 text-[var(--ark-text-faint)]">
                          {s.trigger_reason === 'phase_end' ? '阶段结束' : s.trigger_reason}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
