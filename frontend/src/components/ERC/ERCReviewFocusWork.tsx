import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchERCArticle, fetchERCArticles, fetchERCMistakes, fetchERCReviewNext, submitERCReview } from '../../lib/erc/api';
import type { ERCArticleDetail, ERCArticleListItem, ERCQuestion, ERCReviewNext } from '../../lib/erc/types';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import ChoiceQuestionFocusTemplate from '../focus-work/templates/ChoiceQuestionFocusTemplate';
import type { ChoiceQuestionItem } from '../focus-work/templates/choiceQuestionTypes';

type OptionKey = 'A' | 'B' | 'C' | 'D';
type ERCReviewFocusWorkProps = FocusWorkRendererProps;

export default function ERCReviewFocusWork({
  run,
  disabled,
  onContentCompleted,
}: ERCReviewFocusWorkProps) {
  const targetQuestionCount = questionTargetCountFromRun(run);
  const [item, setItem] = useState<ChoiceQuestionItem | null>(null);
  const [subtitle, setSubtitle] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const answeredQuestionIdsRef = useRef<Set<string>>(new Set());
  const [answeredCount, setAnsweredCount] = useState(0);

  const loadNextReviewItem = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await resolveReviewItem(run, answeredQuestionIdsRef.current);
      const nextItem = reviewNextToChoiceQuestion(payload);
      setItem(nextItem);
      setSubtitle(reviewNextSubtitle(payload));
      setError(null);
      return nextItem;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '复习题加载失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void resolveReviewItem(run, answeredQuestionIdsRef.current)
      .then((payload) => {
        if (cancelled) return;
        setItem(reviewNextToChoiceQuestion(payload));
        setSubtitle(reviewNextSubtitle(payload));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '复习题加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [run]);

  return (
    <ChoiceQuestionFocusTemplate
      title="ERC REVIEW"
      subtitle={subtitle}
      statusLabel="复习题"
      item={item}
      loading={loading}
      error={error}
      emptyTitle="暂无可复习内容"
      emptyDescription="当前没有可用的 ERC 复习内容。"
      answeredCount={answeredCount}
      targetCount={targetQuestionCount}
      disabled={disabled}
      onLoadNext={loadNextReviewItem}
      onContentCompleted={onContentCompleted}
      onSubmitAnswer={async (choiceItem, optionKey) => {
        const result = await submitERCReview(choiceItem.id, optionKey as OptionKey);
        answeredQuestionIdsRef.current.add(choiceItem.id);
        setAnsweredCount((count) => count + 1);
        setError(null);
        return {
          correctOptionKey: result.correct_option,
          progressSnapshot: {
            answered_count: answeredCount + 1,
            target_question_count: targetQuestionCount,
          },
        };
      }}
    />
  );
}

function reviewNextToChoiceQuestion(payload: ERCReviewNext): ChoiceQuestionItem | null {
  if (!payload.has_item || !payload.question) return null;
  const question = payload.question;
  return {
    id: question.question_id,
    numberLabel: `Q${question.question_no}`,
    stem: question.stem,
    options: (Object.keys(question.options) as OptionKey[]).map((key) => ({
      key,
      text: question.options[key],
    })),
    material: {
      title: 'Reading Passage',
      paragraphs: payload.paragraphs.map((paragraph) => ({
        id: String(paragraph.paragraph_no),
        label: String(paragraph.paragraph_no),
        text: paragraph.text,
      })),
    },
    meta: [
      { label: '预计用时：自适应' },
      { label: '错题复习' },
    ],
  };
}

function reviewNextSubtitle(payload: ERCReviewNext): string | undefined {
  if (!payload.article) return undefined;
  return `${payload.article.year} 年 Text ${payload.article.text_no} · ${payload.article.title || 'Untitled Article'}`;
}

function questionTargetCountFromRun(run: FocusWorkRendererProps['run']) {
  const rawTarget = Number(run.config_snapshot?.target_question_count ?? run.config_snapshot?.daily_question_target ?? 10);
  if (!Number.isFinite(rawTarget)) return 10;
  return Math.max(1, Math.min(200, Math.floor(rawTarget)));
}

async function resolveReviewItem(run: FocusWorkRendererProps['run'], answeredQuestionIds: Set<string>): Promise<ERCReviewNext> {
  const dueItem = await fetchERCReviewNext();
  if (run.counts_for_task_completion || dueItem.has_item) {
    if (!dueItem.question || !answeredQuestionIds.has(dueItem.question.question_id)) return dueItem;
  }
  return resolveExtraReviewItem(run, answeredQuestionIds);
}

async function resolveExtraReviewItem(run: FocusWorkRendererProps['run'], answeredQuestionIds: Set<string>): Promise<ERCReviewNext> {
  const mistakeItem = await resolveMistakeReviewItem(answeredQuestionIds);
  if (mistakeItem) return mistakeItem;

  const articles = sortReviewArticles(await fetchERCArticles(articleFiltersFromRun(run)));
  for (const article of articles) {
    const detail = await fetchERCArticle(article.article_id);
    const question = selectQuestion(detail.questions, answeredQuestionIds);
    if (question) return reviewItemFromArticle(detail, question);
  }

  return emptyReviewItem();
}

async function resolveMistakeReviewItem(answeredQuestionIds: Set<string>) {
  const mistakes = await fetchERCMistakes();
  const mistake = mistakes.find((item) => !answeredQuestionIds.has(item.question_id)) ?? mistakes[0];
  if (!mistake) return null;
  const detail = await fetchERCArticle(mistake.article_id);
  const question = detail.questions.find((item) => item.question_id === mistake.question_id) ?? selectQuestion(detail.questions, answeredQuestionIds);
  return question ? reviewItemFromArticle(detail, question) : null;
}

function sortReviewArticles(articles: ERCArticleListItem[]) {
  const rank: Record<ERCArticleListItem['status'], number> = {
    has_due_review: 0,
    practiced: 1,
    unstarted: 2,
  };
  return [...articles].sort((a, b) => rank[a.status] - rank[b.status]);
}

function selectQuestion(questions: ERCQuestion[], answeredQuestionIds: Set<string>) {
  return questions.find((question) => !answeredQuestionIds.has(question.question_id)) ?? questions[0] ?? null;
}

function reviewItemFromArticle(article: ERCArticleDetail, question: ERCQuestion): ERCReviewNext {
  return {
    has_item: true,
    next_due_at: null,
    article: {
      article_id: article.article_id,
      year: article.year,
      text_no: article.text_no,
      title: article.title,
    },
    paragraphs: article.paragraphs,
    question,
  };
}

function emptyReviewItem(): ERCReviewNext {
  return {
    has_item: false,
    next_due_at: null,
    article: null,
    paragraphs: [],
    question: null,
  };
}

function articleFiltersFromRun(run: FocusWorkRendererProps['run']) {
  const setId = stringConfig(run.config_snapshot?.set_id ?? run.config_snapshot?.article_set_id);
  const exam = stringConfig(run.config_snapshot?.exam);
  return {
    ...(setId ? { setId } : {}),
    ...(exam ? { exam } : {}),
  };
}

function stringConfig(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
