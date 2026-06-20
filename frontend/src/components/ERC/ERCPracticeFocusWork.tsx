import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchERCArticles,
  fetchERCOverview,
  fetchERCArticle,
  fetchERCVocabularyPreheat,
  submitERCVocabularyPreheat,
  submitERCArticle,
} from '../../lib/erc/api';
import type { ERCArticleDetail, ERCArticleListItem, ERCArticleSubmitResult } from '../../lib/erc/types';
import type { VocabReviewItem } from '../../lib/vocab/types';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import FlashcardFocusTemplate from '../focus-work/templates/FlashcardFocusTemplate';
import type { FlashcardItem, FlashcardRating, FlashcardSubmitResult } from '../focus-work/templates/flashcardTypes';
import FocusWorkPhaseTemplate, { usePhaseManager } from '../focus-work/templates/FocusWorkPhaseTemplate';
import type { FocusWorkPhaseConfig } from '../focus-work/templates/phaseTypes';
import ChoiceQuestionFocusTemplate from '../focus-work/templates/ChoiceQuestionFocusTemplate';
import type { ChoiceQuestionItem, ChoiceQuestionSubmitResult } from '../focus-work/templates/choiceQuestionTypes';
import WordMetaPanel from '../Vocab/WordMetaPanel';

type OptionKey = 'A' | 'B' | 'C' | 'D';
type ERCPracticeFocusWorkProps = FocusWorkRendererProps;

const PHASES: FocusWorkPhaseConfig[] = [
  { type: 'flashcard', label: '词汇预热' },
  { type: 'choice_question', label: '真题练习' },
];

function articleTargetCountFromRun(run: FocusWorkRendererProps['run']) {
  const rawTarget = Number(run.config_snapshot?.target_article_count ?? run.config_snapshot?.daily_article_target ?? 1);
  if (!Number.isFinite(rawTarget)) return 1;
  return Math.max(1, Math.min(10, Math.floor(rawTarget)));
}

async function resolvePracticeArticleId(run: FocusWorkRendererProps['run'], completedArticleIds: Set<string>) {
  if (run.counts_for_task_completion) {
    const overview = await fetchERCOverview();
    return overview.recommended_article?.article_id ?? null;
  }

  const articles = await fetchERCArticles(articleFiltersFromRun(run));
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
  const targetArticleCount = articleTargetCountFromRun(run);
  const [article, setArticle] = useState<ERCArticleDetail | null>(null);
  const [preheatWords, setPreheatWords] = useState<VocabReviewItem[]>([]);
  const [completedArticleCount, setCompletedArticleCount] = useState(0);
  const [completedCorrectCount, setCompletedCorrectCount] = useState(0);
  const [completedQuestionCount, setCompletedQuestionCount] = useState(0);
  const [currentArticleAnsweredCount, setCurrentArticleAnsweredCount] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [submitResult, setSubmitResult] = useState<ERCArticleSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preheatCompleted, setPreheatCompleted] = useState(false);
  const completedArticleIdsRef = useRef<Set<string>>(new Set());

  const {
    currentPhaseIndex,
    handlePhaseComplete,
    handleSkip,
  } = usePhaseManager(PHASES, () => {
    onContentCompleted({
      article_count: completedArticleCount,
      target_article_count: targetArticleCount,
      correct_count: completedCorrectCount,
      question_count: completedQuestionCount,
    });
  });

  // Skip flashcard phase if no preheat words
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
      setSubmitResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '真题练习加载失败');
    } finally {
      setLoading(false);
    }
  }, [run]);

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
    if (!article) {
      return { correctOptionKey: undefined };
    }

    const question = article.questions.find((q) => q.question_id === item.id);
    if (!question) {
      return { correctOptionKey: undefined };
    }

    const answers = [{ question_id: question.question_id, chosen_option: optionKey as OptionKey }];

    try {
      const result = await submitERCArticle(article.article_id, answers);
      setSubmitResult(result);
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
  }, [article]);

  const handleChoiceQuestionLoadNext = useCallback(async (): Promise<ChoiceQuestionItem | null> => {
    if (!article) return null;

    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < article.questions.length) {
      setCurrentQuestionIndex(nextIndex);
      return articleToChoiceQuestionItem(article, nextIndex);
    }
    return null;
  }, [article, currentQuestionIndex]);

  const handleChoiceQuestionComplete = useCallback((progressSnapshot?: Record<string, unknown>) => {
    if (progressSnapshot?.no_available_content === true) {
      onContentCompleted({
        article_count: completedArticleCount,
        target_article_count: targetArticleCount,
        correct_count: completedCorrectCount,
        question_count: completedQuestionCount,
        no_available_content: true,
      });
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
  ]);

  const flashcardItem = preheatWords.length > 0 ? vocabItemToFlashcardItem(preheatWords[0]) : null;
  const choiceQuestionItem = article ? articleToChoiceQuestionItem(article, currentQuestionIndex) : null;

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
      title="ERC PRACTICE"
      subtitle={article ? `${article.year} 年 Text ${article.text_no}` : undefined}
      statusLabel="真题练习"
      item={choiceQuestionItem}
      loading={loading}
      error={error}
      emptyTitle="暂无真题"
      emptyDescription="当前没有可用的真题练习。"
      answeredCount={currentArticleAnsweredCount}
      targetCount={article?.questions.length ?? 0}
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
