import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, RefreshCw } from 'lucide-react';
import { apiJson } from '../lib/api';
import type { FocusWorkDeclaration } from '../lib/subAppRegistry';
import type { FocusWorkAdapter } from './types';

interface Overview {
  practiced_count: number; correct_count: number;
  accuracy: number; due_count: number; mistake_count: number;
}

export function useChoiceQuestionAdapter(
  fw: FocusWorkDeclaration,
  appId: string,
): FocusWorkAdapter {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [sets, setSets] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    apiJson<{ id: string; name: string }[]>(`/api/${appId}/sets`)
      .then((list) => {
        setSets(list);
        if (list.length > 0) setActiveSetId((prev) => prev ?? list[0].id);
      })
      .catch(() => {});
  }, [appId]);

  const fetchOverview = useCallback(() => {
    const params = activeSetId ? `?set_id=${activeSetId}` : '';
    return apiJson<Overview>(`/api/${appId}/overview${params}`);
  }, [appId, activeSetId]);

  useEffect(() => {
    fetchOverview().then(setOverview).catch(() => {});
  }, [fetchOverview]);

  const accuracy = overview ? Math.round(overview.accuracy * 100) : 0;

  const metrics = [
    { label: '待复习', value: overview ? String(overview.due_count) : '--', detail: 'due' },
    { label: '已练习', value: overview ? String(overview.practiced_count) : '--', detail: 'articles' },
    { label: '正确率', value: overview ? `${accuracy}%` : '--', detail: 'accuracy' },
    { label: '错题', value: overview ? String(overview.mistake_count) : '--', detail: 'mistakes' },
  ];

  const assetContent = overview ? (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Link to={`/${appId}/practice`}
          className="ark-subapp-asset-card rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-[var(--ark-text-muted)]">题库进度</div>
              <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.practiced_count} 题</div>
            </div>
            <BookOpen className="ark-subapp-asset-accent h-5 w-5" />
          </div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">正确 {overview.correct_count} 题</div>
          <div className="ark-subapp-asset-accent mt-4 text-sm font-medium">进入练习</div>
        </Link>
        <Link to={`/${appId}/mistakes`}
          className="ark-subapp-asset-card rounded-lg p-5 text-left transition hover:border-[var(--ark-learning-border)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-[var(--ark-text-muted)]">错题资产</div>
              <div className="mt-3 text-3xl font-semibold text-[var(--ark-text)]">{overview.mistake_count} 题</div>
            </div>
            <RefreshCw className="ark-subapp-asset-accent h-5 w-5" />
          </div>
          <div className="mt-2 text-sm text-[var(--ark-text-muted)]">今日到期 {overview.due_count} 题</div>
          <div className="ark-subapp-asset-accent mt-4 text-sm font-medium">查看错题</div>
        </Link>
      </div>
      <div className="ark-subapp-asset-soft rounded-lg border border-dashed p-5">
        <div className="text-sm text-[var(--ark-text-muted)]">今日推荐练习</div>
        <div className="mt-2 text-sm text-[var(--ark-text-faint)]">
          {overview.due_count > 0 ? `有 ${overview.due_count} 道题目等待复习` : '暂无待复习题目，开始新的练习吧'}
        </div>
      </div>
    </div>
  ) : null;

  return {
    contentBank: { type: 'article_set', selected: activeSetId, options: sets, onChange: setActiveSetId },
    metrics,
    assetContent,
  };
}
