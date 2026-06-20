import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchERCArticles,
  fetchERCOverview,
  fetchERCArticle,
  fetchERCVocabularyPreheat,
  submitERCVocabularyPreheat,
  submitERCArticle,
} from '../../lib/erc/api';
import type { ERCArticleDetail, ERCArticleListItem } from '../../lib/erc/types';
import type { VocabReviewItem } from '../../lib/vocab/types';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import FlashcardFocusTemplate from '../focus-work/templates/FlashcardFocusTemplate';
import type { FlashcardItem, FlashcardRating, FlashcardSubmitResult } from '../focus-work/templates/flashcardTypes';
import FocusWorkPhaseTemplate, { usePhaseManager } from '../focus-work/templates/FocusWorkPhaseTemplate';
import type { FocusWorkPhaseConfig } from '../focus-work/templates/phaseTypes';
import ChoiceQuestionFocusTemplate from '../focus-work/templates/ChoiceQuestionFocusTemplate';
import type { ChoiceQuestionItem, ChoiceQuestionSubmitResult } from '../focus-work/templates/choiceQuestionTypes';
import WordMetaPanel from '../Vocab/WordMetaPanel';
import { fetchChoiceItems, submitChoiceAnswer } from '../../lib/choice/api';
import type { ChoiceItem as ChoiceItemDTO, ChoiceScope, ChoiceCompletion } from '../../lib/choice/types';

type OptionKey = 'A' | 'B' | 'C' | 'D';
type ERCPracticeFocusWorkProps = FocusWorkRendererProps;

const PHASES: FocusWorkPhaseConfig[] = [
  { type: 'flashcard', label: '词汇预热' },
  { type: 'choice_question', label: '真题练习' },
];

function stringConfig(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getChoiceScope(run: FocusWorkRendererProps['run']): ChoiceScope | null {
  const raw = run.config_snapshot?.choice_scope;
  if (raw && typeof raw === 'object' && 'bank_id' in raw) return raw as ChoiceScope;
  return null;
}

function getChoiceCompletion(run: FocusWorkRendererProps['run']): ChoiceCompletion | null {
  const raw = run.config_snapshot?.choice_completion;
  if (raw && typeof raw === 'object' && 'mode' in raw) return raw as ChoiceCompletion;
  return null;
}

function articleTargetCountFromRun(run: FocusWorkRendererProps['run']) {
  const completion = getChoiceCompletion(run);
  if (completion?.mode === 'exhaust_scope') return Infinity;
  if (completion?.mode === 'question_count' && completion.question_count) return completion.question_count;
  const rawTarget = Number(run.config_snapshot?.target_article_count ?? run.config_snapshot?.daily_article_target ?? 1);
  if (!Number.isFinite(rawTarget)) return 1;
  return Math.max(1, Math.min(500, Math.floor(rawTarget)));
}

function choiceTargetQuestionCount(run: FocusWorkRendererProps['run'], totalQuestionCount: number) {
  const completion = getChoiceCompletion(run);
  if (completion?.mode === 'question_count' && completion.question_count) {
    return Math.max(1, Math.min(totalQuestionCount, Math.floor(completion.question_count)));
  }
  return totalQuestionCount;
}

async function resolvePracticeArticleId(run: FocusWorkRendererProps['run'], completedArticleIds: Set<string>) {
  if (run.counts_for_task_completion) {
    const overview = await fetchERCOverview();
    return overview.recommended_article?.article_id ?? null;
  }

  const setId = stringConfig(run.config_snapshot?.set_id ?? run.config_snapshot?.article_set_id);
  const exam = stringConfig(run.config_snapshot?.exam);
  const articles = await fetchERCArticles({ ...(setId ? { setId } : {}), ...(exam ? { exam } : {}) });
  return selectExtraPracticeArticle(articles, completedArticleIds)?.article_id ?? null;
}

function selectExtraPracticeArticle(articles: ERCArticleListItem[], completedArticleIds: Set<string>) {
  const candidates = articles.filter((item) => !completedArticleIds.has(item.article_id));
  const pool = candidates.length > 0 ? candidates : articles;
  return (
    pool.find((item) => item.status === 'unstarted')
    ?? pool.find((item) => item.status === 'has_due_review')
    ?? pool.find((item) => item.status === 'practiced')
    ?? pool[0]
    ?? null
  );
}

function vocabItemToFlashcardItem(word: VocabReviewItem): FlashcardItem {
  return {
    id: word.id,
    front: word.word,
    back: (
      <div className="space-y-2">
        <div className="flex gap-4 text-sm text-[var(--focus-work-text-muted)]">
          {word.us_pronunciation ? <span>US /{word.us_pronunciation}/</span> : null}
          {word.uk_pronunciation ? <span>UK /{word.uk_pronunciation}/</span> : null}
        </div>
        <WordMetaPanel detail={word} />
      </div>
    ),
    meta: [
      { label: '词汇预热', tone: 'blue' },
    ],
  };
}

function choiceItemToChoiceQuestion(
  item: ChoiceItemDTO,
  questionIndex: number,
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
  if (item.tags.length > 0) meta.push({ label: item.tags[0], tone: 'blue' });
  meta.push({ label: `题目 ${questionIndex + 1} / ${item.question_count}` });

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

function articleToChoiceQuestionItem(
  article: ERCArticleDetail,
  currentQuestionIndex: number,
): ChoiceQuestionItem | null {
  const question = article.questions[currentQuestionIndex];
  if (!question) return null;

  return {
    id: question.question_id,
    numberLabel: `Q${currentQuestionIndex + 1}`,
    stem: question.stem,
    options: (Object.keys(question.options) as OptionKey[]).map((key) => ({
      key,
      text: question.options[key],
    })),
    material: {
      title: 'Reading Passage',
      paragraphs: article.paragraphs.map((paragraph) => ({
        id: String(paragraph.paragraph_no),
        label: String(paragraph.paragraph_no),
        text: paragraph.text,
      })),
    },
    meta: [
      { label: `${article.year} 年 Text ${article.text_no}`, tone: 'blue' },
      { label: `题目 ${currentQuestionIndex + 1} / ${article.questions.length}` },
    ],
  };
}

export default function ERCPracticeFocusWork({
  run,
  disabled,
  onContentCompleted,
}: ERCPracticeFocusWorkProps) {
  const choiceScope = getChoiceScope(run);
  const isChoiceMode = choiceScope !== null;

  const targetArticleCount = articleTargetCountFromRun(run);
  const [article, setArticle] = useState<ERCArticleDetail | null>(null);
  const [preheatWords, setPreheatWords] = useState<VocabReviewItem[]>([]);
  const [completedArticleCount, setCompletedArticleCount] = useState(0);
  const [completedCorrectCount, setCompletedCorrectCount] = useState(0);
  const [completedQuestionCount, setCompletedQuestionCount] = useState(0);
  const [currentArticleAnsweredCount, setCurrentArticleAnsweredCount] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preheatCompleted, setPreheatCompleted] = useState(false);
  const completedArticleIdsRef = useRef<Set<string>>(new Set());

  const [choiceItems, setChoiceItems] = useState<ChoiceItemDTO[]>([]);
  const [currentChoiceItemIndex, setCurrentChoiceItemIndex] = useState(0);
  const [currentChoiceQuestionIndex, setCurrentChoiceQuestionIndex] = useState(0);
  const totalChoiceQuestionCount = choiceItems.reduce((sum, item) => sum + item.question_count, 0);
  const targetChoiceQuestionCount = isChoiceMode ? choiceTargetQuestionCount(run, totalChoiceQuestionCount) : 0;

  const {
    currentPhaseIndex,
    handlePhaseComplete,
    handleSkip,
  } = usePhaseManager(PHASES, () => {
    onContentCompleted({
      article_count: completedArticleCount,
      target_article_count: targetArticleCount === Infinity ? choiceItems.length : targetArticleCount,
      correct_count: completedCorrectCount,
      question_count: completedQuestionCount,
    });
  });

  useEffect(() => {
    if (!loading && preheatWords.length === 0 && currentPhaseIndex === 0 && !preheatCompleted) {
      setPreheatCompleted(true);
      handlePhaseComplete(0);
    }
  }, [loading, preheatWords.length, currentPhaseIndex, preheatCompleted, handlePhaseComplete]);

  const loadArticle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isChoiceMode && choiceScope) {
        const year = choiceScope.years?.[0];
        const subject = choiceScope.subjects?.[0];
        const items = await fetchChoiceItems(choiceScope.bank_id, {
          year: year != null ? Number(year) : undefined,
          subject: subject || undefined,
          limit: 1000,
        });
        setChoiceItems(items);
        setCurrentChoiceItemIndex(0);
        setCurrentChoiceQuestionIndex(0);
        setCurrentArticleAnsweredCount(0);
      } else {
        const articleId = await resolvePracticeArticleId(run, completedArticleIdsRef.current);
        if (!articleId) {
          setArticle(null);
          setPreheatWords([]);
          setLoading(false);
          return;
        }
        const [articleData, preheatData] = await Promise.all([
          fetchERCArticle(articleId),
          fetchERCVocabularyPreheat(articleId),
        ]);
        setArticle(articleData);
        setPreheatWords(preheatData);
        setCurrentQuestionIndex(0);
        setCurrentArticleAnsweredCount(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '真题练习加载失败');
    } finally {
      setLoading(false);
    }
  }, [run, isChoiceMode, choiceScope]);

  useEffect(() => {
    void loadArticle();
  }, [loadArticle]);

  const handleFlashcardSubmit = useCallback(async (item: FlashcardItem, rating: FlashcardRating): Promise<FlashcardSubmitResult> => {
    if (!article) return { shouldRepeat: false };
    const word = preheatWords.find((w) => w.id === item.id);
    if (!word) return { shouldRepeat: false };
    try {
      await submitERCVocabularyPreheat(article.article_id, {
        deck_id: word.deck_id,
        word_id: word.id,
        result: rating,
        prompt_type: word.prompt_type || 'en_to_zh',
      });
    } catch (err) {
      console.error('Failed to submit preheat review', err);
    }
    return { shouldRepeat: false };
  }, [article, preheatWords]);

  const handleFlashcardLoadNext = useCallback(async (): Promise<FlashcardItem | null> => {
    const currentIndex = preheatWords.findIndex((w) => w.id === preheatWords[0]?.id);
    const nextIndex = currentIndex + 1;
    if (nextIndex < preheatWords.length) {
      return vocabItemToFlashcardItem(preheatWords[nextIndex]);
    }
    return null;
  }, [preheatWords]);

  const handleFlashcardComplete = useCallback(() => {
    handlePhaseComplete(0);
  }, [handlePhaseComplete]);

  const handleChoiceQuestionSubmit = useCallback(async (item: ChoiceQuestionItem, optionKey: string): Promise<ChoiceQuestionSubmitResult> => {
    if (isChoiceMode) {
      const currentItem = choiceItems[currentChoiceItemIndex];
      if (!currentItem) return { correctOptionKey: undefined };
      const q = currentItem.questions.find((question) => question.id === item.id);
      if (!q) return { correctOptionKey: undefined };
      const isCorrect = q.answer.toUpperCase() === optionKey.toUpperCase();
      const result = await submitChoiceAnswer(q.id, optionKey);
      setCompletedQuestionCount((prev) => prev + 1);
      if (result.is_correct) setCompletedCorrectCount((prev) => prev + 1);
      setCurrentArticleAnsweredCount((prev) => prev + 1);
      return {
        correctOptionKey: isCorrect ? optionKey : result.correct_option,
        explanationBlocks: q.explanation_blocks.length > 0 ? q.explanation_blocks : undefined,
      };
    }

    if (!article) return { correctOptionKey: undefined };
    const question = article.questions.find((q) => q.question_id === item.id);
    if (!question) return { correctOptionKey: undefined };
    const answers = [{ question_id: question.question_id, chosen_option: optionKey as OptionKey }];
    try {
      const result = await submitERCArticle(article.article_id, answers);
      completedArticleIdsRef.current.add(article.article_id);
      setCompletedArticleCount((prev) => prev + 1);
      setCompletedCorrectCount((prev) => prev + result.items.filter((i) => i.is_correct).length);
      setCompletedQuestionCount((prev) => prev + result.items.length);
      setCurrentArticleAnsweredCount((prev) => prev + result.items.length);
      const isCorrect = result.items.find((i) => i.question_id === item.id)?.is_correct ?? false;
      return {
        correctOptionKey: isCorrect ? optionKey : result.items.find((i) => i.question_id === item.id)?.correct_option,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交答案失败');
      return { correctOptionKey: undefined };
    }
  }, [article, isChoiceMode, choiceItems, currentChoiceItemIndex]);

  const handleChoiceQuestionLoadNext = useCallback(async (): Promise<ChoiceQuestionItem | null> => {
    if (isChoiceMode) {
      const currentItem = choiceItems[currentChoiceItemIndex];
      if (!currentItem) return null;
      const nextQIndex = currentChoiceQuestionIndex + 1;
      if (nextQIndex < currentItem.questions.length) {
        setCurrentChoiceQuestionIndex(nextQIndex);
        return choiceItemToChoiceQuestion(currentItem, nextQIndex);
      }
      const nextItemIndex = currentChoiceItemIndex + 1;
      if (nextItemIndex < choiceItems.length) {
        setCurrentChoiceItemIndex(nextItemIndex);
        setCurrentChoiceQuestionIndex(0);
        return choiceItemToChoiceQuestion(choiceItems[nextItemIndex], 0);
      }
      return null;
    }

    if (!article) return null;
    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < article.questions.length) {
      setCurrentQuestionIndex(nextIndex);
      return articleToChoiceQuestionItem(article, nextIndex);
    }
    return null;
  }, [article, currentQuestionIndex, isChoiceMode, choiceItems, currentChoiceItemIndex, currentChoiceQuestionIndex]);

  const handleChoiceQuestionComplete = useCallback((progressSnapshot?: Record<string, unknown>) => {
    if (progressSnapshot?.no_available_content === true) {
      onContentCompleted({
        article_count: completedArticleCount,
        target_article_count: targetArticleCount === Infinity ? choiceItems.length : targetArticleCount,
        correct_count: completedCorrectCount,
        question_count: completedQuestionCount,
        no_available_content: true,
      });
      return;
    }
    if (isChoiceMode) {
      handlePhaseComplete(1);
      return;
    }
    if (completedArticleCount < targetArticleCount) {
      void loadArticle();
      return;
    }
    handlePhaseComplete(1);
  }, [
    completedArticleCount,
    completedCorrectCount,
    completedQuestionCount,
    handlePhaseComplete,
    loadArticle,
    onContentCompleted,
    targetArticleCount,
    choiceItems.length,
    isChoiceMode,
  ]);

  const flashcardItem = preheatWords.length > 0 ? vocabItemToFlashcardItem(preheatWords[0]) : null;

  let choiceQuestionItem: ChoiceQuestionItem | null = null;
  if (isChoiceMode) {
    const currentItem = choiceItems[currentChoiceItemIndex];
    if (currentItem) {
      choiceQuestionItem = choiceItemToChoiceQuestion(currentItem, currentChoiceQuestionIndex);
    }
  } else if (article) {
    choiceQuestionItem = articleToChoiceQuestionItem(article, currentQuestionIndex);
  }

  const renderFlashcardPhase = () => (
    <FlashcardFocusTemplate
      title="真题词汇预热"
      subtitle="ERC 阅读理解"
      statusLabel="词汇预热"
      item={flashcardItem}
      loading={loading}
      error={error}
      emptyTitle="无需词汇预热"
      emptyDescription="当前文章没有需要预热的词汇。"
      completedCount={0}
      targetCount={preheatWords.length}
      disabled={disabled}
      onSubmitRating={handleFlashcardSubmit}
      onLoadNext={handleFlashcardLoadNext}
      onContentCompleted={handleFlashcardComplete}
    />
  );

  const renderChoiceQuestionPhase = () => (
    <ChoiceQuestionFocusTemplate
      title="真题练习"
      subtitle={isChoiceMode
        ? (choiceScope?.subjects?.[0] || choiceScope?.years?.[0] ? `${choiceScope.years?.[0] ?? ''} ${choiceScope.subjects?.[0] ?? ''}`.trim() : undefined)
        : article ? `${article.year} 年 Text ${article.text_no}` : undefined
      }
      statusLabel="真题练习"
      item={choiceQuestionItem}
      loading={loading}
      error={error}
      emptyTitle="暂无真题"
      emptyDescription="当前没有可用的真题练习。"
      answeredCount={currentArticleAnsweredCount}
      targetCount={isChoiceMode ? targetChoiceQuestionCount : (article?.questions.length ?? 0)}
      disabled={disabled}
      onSubmitAnswer={handleChoiceQuestionSubmit}
      onLoadNext={handleChoiceQuestionLoadNext}
      onContentCompleted={handleChoiceQuestionComplete}
    />
  );

  return (
    <FocusWorkPhaseTemplate
      phases={PHASES}
      currentPhaseIndex={currentPhaseIndex}
      disabled={disabled}
      onPhaseComplete={handlePhaseComplete}
      onSkipped={handleSkip}
    >
      {currentPhaseIndex === 0 ? renderFlashcardPhase() : renderChoiceQuestionPhase()}
    </FocusWorkPhaseTemplate>
  );
}
