import { useCallback, useEffect, useRef, useState } from 'react';

import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import InputQuestionFocusTemplate from '../focus-work/templates/InputQuestionFocusTemplate';
import type { InputArticleItem, InputQuestionItem, InputSubmitResult } from '../focus-work/templates/inputQuestionTypes';
import { fetchInputNext, submitInputAnswer } from '../../lib/input/api';
import type { InputArticleDTO, InputQuestionDTO } from '../../lib/input/api';

type InputFocusWorkProps = FocusWorkRendererProps;

function getBankId(run: FocusWorkRendererProps['run']): string | null {
  const snap = run.config_snapshot;
  if (!snap) return null;
  // Direct bank_id (deliberate workflow stores this)
  if (typeof snap.bank_id === 'string' && snap.bank_id) return snap.bank_id;
  // Legacy: input_bank_id
  if (typeof snap.input_bank_id === 'string' && snap.input_bank_id) return snap.input_bank_id;
  // Legacy: input_scope.bank_id
  const scope = snap.input_scope;
  if (scope && typeof scope === 'object' && 'bank_id' in scope) {
    return String((scope as Record<string, unknown>).bank_id || '');
  }
  return null;
}

function getTargetCount(run: FocusWorkRendererProps['run']): number {
  const raw = Number(run.config_snapshot?.target_question_count ?? run.config_snapshot?.daily_question_target ?? 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.max(1, Math.min(200, Math.floor(raw)));
}

function dtoToQuestionItem(dto: InputQuestionDTO): InputQuestionItem {
  const meta: InputQuestionItem['meta'] = [];
  meta.push({ label: `题目 ${dto.question_no}` });
  if (dto.mode === 'fill') {
    meta.push({ label: '填空', tone: 'blue' });
  } else {
    meta.push({ label: '主观', tone: 'amber' });
  }

  return {
    id: dto.question_id,
    numberLabel: `Q${dto.question_no}`,
    stem: dto.stem,
    inputConfig: (dto.input_config as InputQuestionItem['inputConfig']) || {},
    mode: dto.mode,
    acceptedAnswers: dto.accepted_answers,
    matchRule: dto.match_rule as InputQuestionItem['matchRule'],
    caseSensitive: dto.case_sensitive,
    rubric: dto.rubric,
    referenceAnswer: dto.reference_answer,
    meta,
  };
}

function dtoToArticleItem(dto: InputArticleDTO): InputArticleItem {
  return {
    id: dto.article_id,
    title: dto.title,
    paragraphs: dto.paragraphs.map((p) => ({
      id: p.id,
      text: p.text,
    })),
    questions: dto.questions.map((q) => dtoToQuestionItem(q)),
  };
}

export default function InputFocusWork({ run, disabled, onContentCompleted }: InputFocusWorkProps) {
  const bankId = getBankId(run);
  const targetCount = getTargetCount(run);

  const [article, setArticle] = useState<InputArticleItem | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const answeredQuestionsRef = useRef<Array<{ question_id: string; correct: boolean; time_spent: number; input_type: string }>>([]);
  const startTimeRef = useRef<number>(Date.now());

  const currentQuestion = article?.questions[questionIndex] ?? null;

  const loadNext = useCallback(async () => {
    if (!bankId) {
      setError('未配置题库');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchInputNext(bankId);
      if (res.has_item && res.article) {
        const articleItem = dtoToArticleItem(res.article);
        setArticle(articleItem);
        setQuestionIndex(0);
      } else {
        setArticle(null);
        setQuestionIndex(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [bankId]);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  const handleLoadNext = useCallback((): { article: InputArticleItem; question: InputQuestionItem } | null => {
    if (!article) return null;
    const nextIndex = questionIndex + 1;
    if (nextIndex < article.questions.length) {
      setQuestionIndex(nextIndex);
      setAnsweredCount((prev) => prev + 1);
      return { article, question: article.questions[nextIndex] };
    }
    setAnsweredCount((prev) => prev + 1);
    void loadNext();
    return null;
  }, [article, questionIndex, loadNext]);

  const handleSubmitAnswer = useCallback(
    async (questionItem: InputQuestionItem, userInput: string): Promise<InputSubmitResult> => {
      const startTime = Date.now();
      const res = await submitInputAnswer({
        question_id: questionItem.id,
        user_input: userInput,
        time_spent_ms: Date.now() - startTime,
      });
      if (res.correct === true) {
        setCorrectCount((prev) => prev + 1);
      } else if (res.correct === false) {
        setWrongIds((prev) => [...prev, questionItem.id]);
      }
      answeredQuestionsRef.current.push({
        question_id: questionItem.id,
        correct: res.correct === true,
        time_spent: Date.now() - startTime,
        input_type: questionItem.mode || 'text',
      });
      return {
        correct: res.correct ?? undefined,
        acceptedAnswers: res.accepted_answers,
        score: res.score ?? undefined,
        feedback: res.feedback,
      };
    },
    [],
  );

  const handleContentCompleted = useCallback(
    (progressSnapshot?: Record<string, unknown>) => {
      const answered = answeredQuestionsRef.current;
      const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      onContentCompleted({
        question_count: answeredCount,
        correct_count: correctCount,
        wrong_question_ids: wrongIds,
        target_question_count: targetCount,
        ...progressSnapshot,
        run_summary: {
          total_questions: targetCount,
          answered_count: answeredCount,
          correct_count: correctCount,
          accuracy: answeredCount > 0 ? correctCount / answeredCount : 0,
          duration_seconds: durationSeconds,
          question_details: answered,
        },
      });
    },
    [answeredCount, correctCount, wrongIds, targetCount, onContentCompleted],
  );

  const subtitle = article ? `${article.title}` : undefined;

  return (
    <InputQuestionFocusTemplate
      title="输入练习"
      subtitle={subtitle}
      statusLabel={disabled ? '已暂停' : undefined}
      article={article}
      currentQuestion={currentQuestion}
      loading={loading}
      error={error}
      emptyTitle="暂无题目"
      emptyDescription="当前范围内没有待做的题目"
      answeredCount={answeredCount}
      targetCount={targetCount}
      disabled={disabled}
      onSubmitAnswer={handleSubmitAnswer}
      onLoadNext={handleLoadNext}
      onContentCompleted={handleContentCompleted}
    />
  );
}
