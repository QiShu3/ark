import { useCallback, useEffect, useRef, useState } from 'react';

import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import ChoiceQuestionFocusTemplate from '../focus-work/templates/ChoiceQuestionFocusTemplate';
import type { ChoiceQuestionItem } from '../focus-work/templates/choiceQuestionTypes';
import { fetchChoiceItems, fetchChoiceReviewNext, submitChoiceAnswer } from '../../lib/choice/api';
import type { ChoiceItem as ChoiceItemDTO, ChoiceScope, ChoiceReviewNext } from '../../lib/choice/types';

type OptionKey = 'A' | 'B' | 'C' | 'D';
type ERCReviewFocusWorkProps = FocusWorkRendererProps;

function getChoiceScope(run: FocusWorkRendererProps['run']): ChoiceScope | null {
  const raw = run.config_snapshot?.choice_scope;
  if (raw && typeof raw === 'object' && 'bank_id' in raw) return raw as ChoiceScope;
  return null;
}

function questionTargetCountFromRun(run: FocusWorkRendererProps['run']) {
  const rawTarget = Number(run.config_snapshot?.target_question_count ?? run.config_snapshot?.daily_question_target ?? 10);
  if (!Number.isFinite(rawTarget)) return 10;
  return Math.max(1, Math.min(200, Math.floor(rawTarget)));
}

function reviewNextToChoiceQuestion(
  payload: ChoiceReviewNext,
  allItems: ChoiceItemDTO[],
): ChoiceQuestionItem | null {
  if (!payload.has_item || !payload.question) return null;
  const question = payload.question;

  const articleItem = allItems.find((item) => item.id === payload.article?.article_id);
  const hasSharedMaterial = articleItem && articleItem.group_type !== 'single' && articleItem.material_blocks.length > 0;
  const materialBlocks = payload.paragraphs.map((p) => ({
    type: 'paragraph' as const,
    text: p.text,
  }));

  const optionKeys = Object.keys(question.options) as OptionKey[];
  const options = optionKeys.map((key) => ({ key, text: question.options[key] }));

  return {
    id: question.question_id,
    numberLabel: `Q${question.question_no}`,
    stem: question.stem,
    stemBlocks: [{ type: 'paragraph' as const, text: question.stem }],
    stemPlacement: hasSharedMaterial ? 'question' : 'material',
    options,
    material: {
      title: payload.article?.title || 'Reading Passage',
      paragraphs: payload.paragraphs.map((p) => ({
        id: String(p.paragraph_no),
        label: String(p.paragraph_no),
        text: p.text,
      })),
    },
    materialBlocks: hasSharedMaterial && articleItem ? articleItem.material_blocks : materialBlocks,
    meta: [
      { label: '预计用时：自适应' },
      { label: '错题复习' },
    ],
  };
}

function reviewNextSubtitle(payload: ChoiceReviewNext): string | undefined {
  if (!payload.article) return undefined;
  return `${payload.article.year} 年 Text ${payload.article.text_no} · ${payload.article.title || 'Untitled Article'}`;
}

export default function ERCReviewFocusWork({
  run,
  disabled,
  onContentCompleted,
}: ERCReviewFocusWorkProps) {
  const choiceScope = getChoiceScope(run);
  const bankId = choiceScope?.bank_id;
  const targetQuestionCount = questionTargetCountFromRun(run);

  const [item, setItem] = useState<ChoiceQuestionItem | null>(null);
  const [subtitle, setSubtitle] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const answeredQuestionIdsRef = useRef<Set<string>>(new Set());
  const [answeredCount, setAnsweredCount] = useState(0);
  const [allItems, setAllItems] = useState<ChoiceItemDTO[]>([]);

  const loadNextReviewItem = useCallback(async () => {
    if (!bankId) {
      setError('未配置题库');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await fetchChoiceReviewNext(bankId);
      const nextItem = reviewNextToChoiceQuestion(payload, allItems);
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
  }, [bankId, allItems]);

  useEffect(() => {
    if (!bankId) {
      setError('未配置题库');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchChoiceReviewNext(bankId),
      fetchChoiceItems(bankId, { limit: 1000 }),
    ])
      .then(([payload, items]) => {
        if (cancelled) return;
        setAllItems(items);
        setItem(reviewNextToChoiceQuestion(payload, items));
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
  }, [bankId]);

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
        const result = await submitChoiceAnswer(choiceItem.id, optionKey);
        answeredQuestionIdsRef.current.add(choiceItem.id);
        setAnsweredCount((count) => count + 1);
        setError(null);
        return {
          correctOptionKey: result.is_correct ? optionKey : result.correct_option,
          progressSnapshot: {
            answered_count: answeredCount + 1,
            target_question_count: targetQuestionCount,
          },
        };
      }}
    />
  );
}
