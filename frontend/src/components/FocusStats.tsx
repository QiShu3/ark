import React, { useState, useEffect } from 'react';
import { apiJson } from '../lib/api';

interface FocusStatsProps {
  onTaskClick: (taskId: string) => void;
}

interface TaskStat {
  id: string;
  title: string;
  duration: number; // seconds
}

interface FocusStatsData {
  total_duration: number; // seconds
  tasks: TaskStat[];
}

type TimeRange = 'today' | 'week' | 'month';

/**
 * 专注统计组件
 * 展示指定时间范围内的专注时长统计及任务分布
 */
const FocusStats: React.FC<FocusStatsProps> = ({ onTaskClick }) => {
  const [range, setRange] = useState<TimeRange>('today');
  const [data, setData] = useState<FocusStatsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [range]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await apiJson(`/todo/focus/stats?range=${range}`);
      setData(res as FocusStatsData);
    } catch (e) {
      console.error('Failed to load focus stats', e);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center text-white/30 animate-pulse">
          加载中...
        </div>
      );
    }

    if (!data || data.tasks.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center text-white/30">
          暂无数据
        </div>
      );
    }

    const maxDuration = Math.max(...data.tasks.map(t => t.duration));

    return (
      <div className="flex flex-col h-full gap-6 overflow-hidden">
        {/* Top: Total Duration (flex ratio 1) */}
        <div className="flex flex-col items-center justify-center py-4 flex-[1]">
          <span className="text-sm text-white/50 uppercase tracking-wider mb-1">
            总专注时长
          </span>
          <span className="text-4xl font-bold text-white">
            {formatDuration(data.total_duration)}
          </span>
        </div>

        {/* Bottom: Horizontal Bar Chart (flex ratio 5) */}
        <div className="flex-[5] overflow-y-auto pr-2 custom-scrollbar">
          <div className="flex flex-col gap-3">
            {data.tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => onTaskClick(task.id)}
                className="group cursor-pointer"
              >
                <div className="flex justify-between text-xs text-white/70 mb-1 px-1">
                  <span className="truncate max-w-[70%] font-medium group-hover:text-blue-400 transition-colors">
                    {task.title}
                  </span>
                  <span className="font-mono text-white/50">
                    {formatDuration(task.duration)}
                  </span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500/60 group-hover:bg-blue-500 transition-colors rounded-full"
                    style={{
                      width: `${(task.duration / maxDuration) * 100}%`,
                      minWidth: '4px'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full p-4">
      {/* Navigation Bar */}
      <div className="flex p-1 bg-white/5 rounded-lg mb-4">
        {(['today', 'week', 'month'] as TimeRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              range === r
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/40 hover:text-white/60 hover:bg-white/5'
            }`}
          >
            {r === 'today' ? '今日' : r === 'week' ? '本周' : '本月'}
          </button>
        ))}
      </div>

      {/* Content Area */}
      {renderContent()}
    </div>
  );
};

export default FocusStats;
