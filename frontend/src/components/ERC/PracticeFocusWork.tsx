import { useCallback, useEffect, useState } from 'react';

import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import ChoiceQuestionFocusTemplate from '../focus-work/templates/ChoiceQuestionFocusTemplate';
import type { ChoiceQuestionItem, ChoiceQuestionSubmitResult } from '../focus-work/templates/choiceQuestionTypes';
import { fetchChoiceItems, submitChoiceAnswer } from '../../lib/choice/api';
import { getChoiceCompletion, getChoiceScope } from '../../lib/choice/configExtractors';
import type { ChoiceItem as ChoiceItemDTO } from '../../lib/choice/types';

type PracticeFocusWorkProps = FocusWorkRendererProps;

function choiceTargetQuestionCount(run: FocusWorkRendererProps['run'], totalQuestionCount: number) {
  const completion = getChoiceCompletion(run);
  if (completion?.mode === 'question_count' && completion.question_count) {
    return Math.max(1, Math.min(totalQuestionCount, Math.floor(completion.question_count)));
  }
  return totalQuestionCount;
}

function computeGlobalQuestionIndex(items: ChoiceItemDTO[], itemIndex: number, questionIndex: number): number {
  let offset = 0;
  for (let i = 0; i < itemIndex && i < items.length; i++) {
    offset += items[i].question_count;
  }
  return offset + questionIndex;
}

function choiceItemToChoiceQuestion(
  item: ChoiceItemDTO,
  questionIndex: number,
  globalIndex?: number,
  globalTotal?: number,
): ChoiceQuestionItem | null {
  const q = item.questions[questionIndex];
  if (!q) return null;

  const hasSharedMaterial = item.group_type !== 'single' && item.material_blocks.length > 0;
  const titleText = (item.title || '').trim();
  const itemMaterialBlocks = item.material_blocks.filter((block) => {
    const blockText = typeof block.text === 'string' ? block.text.trim() : '';
    return blockText && blockText !== titleText;
  });
  const standaloneMaterialBlocks = [...itemMaterialBlocks, ...q.stem_blocks];
  const material = hasSharedMaterial
    ? { title: item.title || '阅读材料', paragraphs: [{ id: 'main', text: '' }] }
    : undefined;
  const stemPlacement = hasSharedMaterial ? 'question' : 'material';

  const stemText = q.stem_blocks.map((b) => b.text || '').join('\n');

  const meta: { label: string; tone?: 'blue' | 'amber' | 'emerald' }[] = [];
  if (globalIndex != null && globalTotal != null) {
    meta.push({ label: `题目 ${globalIndex + 1} / ${globalTotal}` });
  } else {
    meta.push({ label: `题目 ${questionIndex + 1} / ${item.question_count}` });
  }

  return {
    id: q.id,
    numberLabel: item.group_type === 'passage' ? `Q${questionIndex + 1}` : `#${item.sort_order || questionIndex + 1}`,
    stem: stemText,
    stemBlocks: q.stem_blocks.length > 0 ? q.stem_blocks : undefined,
    stemPlacement,
    options: q.options,
    material: (material ?? { title: item.title || '题目', paragraphs: [] }) as ChoiceQuestionItem['material'],
    materialBlocks: hasSharedMaterial ? item.material_blocks : standaloneMaterialBlocks,
    explanationBlocks: q.explanation_blocks.length > 0 ? q.explanation_blocks : undefined,
    meta,
  };
}

export default function PracticeFocusWork({
  run,
  disabled,
  onContentCompleted,
}: PracticeFocusWorkProps) {
  const choiceScope = getChoiceScope(run);
  const bankId = choiceScope?.bank_id;

  const [choiceItems, setChoiceItems] = useState<ChoiceItemDTO[]>([]);
  const [currentChoiceItemIndex, setCurrentChoiceItemIndex] = useState(0);
  const [currentChoiceQuestionIndex, setCurrentChoiceQuestionIndex] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [completedCorrectCount, setCompletedCorrectCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const totalChoiceQuestionCount = choiceItems.reduce((sum, item) => sum + item.question_count, 0);
  const targetQuestionCount = choiceTargetQuestionCount(run, totalChoiceQuestionCount);

  const completePractice = useCallback(() => {
    onContentCompleted({
      article_count: choiceItems.length,
      target_article_count: targetQuestionCount,
      correct_count: completedCorrectCount,
      question_count: answeredCount,
    });
  }, [answeredCount, completedCorrectCount, choiceItems.length, onContentCompleted, targetQuestionCount]);

  const loadItems = useCallback(async () => {
    if (!bankId) {
      setError('未配置题库');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const year = choiceScope?.years?.[0];
      const subject = choiceScope?.subjects?.[0];
      const items = await fetchChoiceItems(bankId, {
        year: year != null ? Number(year) : undefined,
        subject: subject || undefined,
        limit: 1000,
      });
      setChoiceItems(items);
      setCurrentChoiceItemIndex(0);
      setCurrentChoiceQuestionIndex(0);
      setAnsweredCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : '真题练习加载失败');
    } finally {
      setLoading(false);
    }
  }, [bankId, choiceScope]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleSubmit = useCallback(async (item: ChoiceQuestionItem, optionKey: string): Promise<ChoiceQuestionSubmitResult> => {
    const currentItem = choiceItems[currentChoiceItemIndex];
    if (!currentItem) return { correctOptionKey: undefined };
    const q = currentItem.questions.find((question) => question.id === item.id);
    if (!q) return { correctOptionKey: undefined };
    const result = await submitChoiceAnswer(q.id, optionKey, 'practice');
    setAnsweredCount((prev) => prev + 1);
    if (result.is_correct) setCompletedCorrectCount((prev) => prev + 1);
    return {
      correctOptionKey: result.is_correct ? optionKey : result.correct_option,
      explanationBlocks: q.explanation_blocks.length > 0 ? q.explanation_blocks : undefined,
    };
  }, [choiceItems, currentChoiceItemIndex]);

  const handleLoadNext = useCallback(async (): Promise<ChoiceQuestionItem | null> => {
    const currentItem = choiceItems[currentChoiceItemIndex];
    if (!currentItem) return null;
    const nextQIndex = currentChoiceQuestionIndex + 1;
    if (nextQIndex < currentItem.questions.length) {
      setCurrentChoiceQuestionIndex(nextQIndex);
      return choiceItemToChoiceQuestion(
        currentItem,
        nextQIndex,
        computeGlobalQuestionIndex(choiceItems, currentChoiceItemIndex, nextQIndex),
        totalChoiceQuestionCount,
      );
    }
    const nextItemIndex = currentChoiceItemIndex + 1;
    if (nextItemIndex < choiceItems.length) {
      setCurrentChoiceItemIndex(nextItemIndex);
      setCurrentChoiceQuestionIndex(0);
      return choiceItemToChoiceQuestion(
        choiceItems[nextItemIndex],
        0,
        computeGlobalQuestionIndex(choiceItems, nextItemIndex, 0),
        totalChoiceQuestionCount,
      );
    }
    return null;
  }, [choiceItems, currentChoiceItemIndex, currentChoiceQuestionIndex, totalChoiceQuestionCount]);

  const handleComplete = useCallback((progressSnapshot?: Record<string, unknown>) => {
    if (progressSnapshot?.no_available_content === true) {
      onContentCompleted({
        article_count: choiceItems.length,
        target_article_count: targetQuestionCount,
        correct_count: completedCorrectCount,
        question_count: answeredCount,
        no_available_content: true,
      });
      return;
    }
    completePractice();
  }, [answeredCount, completedCorrectCount, choiceItems.length, completePractice, onContentCompleted, targetQuestionCount]);

  let choiceQuestionItem: ChoiceQuestionItem | null = null;
  const currentItem = choiceItems[currentChoiceItemIndex];
  if (currentItem) {
    choiceQuestionItem = choiceItemToChoiceQuestion(
      currentItem,
      currentChoiceQuestionIndex,
      computeGlobalQuestionIndex(choiceItems, currentChoiceItemIndex, currentChoiceQuestionIndex),
      totalChoiceQuestionCount,
    );
  }

  return (
    <ChoiceQuestionFocusTemplate
      title="真题练习"
      subtitle={choiceScope?.subjects?.[0] || choiceScope?.years?.[0]
        ? `${choiceScope.years?.[0] ?? ''} ${choiceScope.subjects?.[0] ?? ''}`.trim()
        : undefined
      }
      statusLabel="真题练习"
      item={choiceQuestionItem}
      loading={loading}
      error={error}
      emptyTitle="暂无真题"
      emptyDescription="当前没有可用的真题练习。"
      answeredCount={answeredCount}
      targetCount={targetQuestionCount}
      disabled={disabled}
      onSubmitAnswer={handleSubmit}
      onLoadNext={handleLoadNext}
      onContentCompleted={handleComplete}
    />
  );
}
