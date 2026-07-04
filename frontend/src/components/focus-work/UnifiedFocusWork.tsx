import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, Check, CheckCircle2, Frown, Meh, RotateCcw, Rocket, Volume2, X } from 'lucide-react';

import Button from '../Button';
import { initUnifiedPool, submitUnifiedAnswer, type FlashcardRating, type UnifiedPoolInitResult, type UnifiedQuestion, type UnifiedSubmitResult } from '../../lib/focus-work/unifiedApi';
import type { FocusWorkRendererProps } from './focusWorkTypes';
import ChoiceQuestionFocusTemplate from './templates/ChoiceQuestionFocusTemplate';
import type { ChoiceQuestionItem, ChoiceQuestionSubmitResult } from './templates/choiceQuestionTypes';
import type { ContentBlockData } from './ContentBlockRenderer';
import MarkdownContent from '../MarkdownContent';
import { useFocusWorkHeaderRight } from './FocusWorkProvider';

type Phase = 'loading' | 'warning_init' | 'active' | 'submit_confirm' | 'done' | 'error';

const inputClass =
  'w-full rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]';

const FLASHCARD_RATINGS: Array<{
  value: FlashcardRating;
  label: string;
  hint: string;
  icon: typeof Frown;
  colorClass: string;
  shortcut: string;
}> = [
  {
    value: 'again',
    label: '没记住',
    hint: '今天稍后复习',
    icon: Frown,
    colorClass: 'hover:bg-[var(--focus-work-rose-bg)] hover:border-[var(--focus-work-rose-border)] focus-visible:bg-[var(--focus-work-rose-bg)] focus-visible:border-[var(--focus-work-rose-border)]',
    shortcut: '1',
  },
  {
    value: 'hard',
    label: '有点难',
    hint: '进入较短间隔',
    icon: Meh,
    colorClass: 'hover:bg-[var(--focus-work-amber-bg)] hover:border-[var(--focus-work-amber-border)] focus-visible:bg-[var(--focus-work-amber-bg)] focus-visible:border-[var(--focus-work-amber-border)]',
    shortcut: '2',
  },
  {
    value: 'good',
    label: '记住了',
    hint: '进入正常间隔',
    icon: CheckCircle2,
    colorClass: 'hover:bg-[var(--focus-work-emerald-bg)] hover:border-[var(--focus-work-emerald-border)] focus-visible:bg-[var(--focus-work-emerald-bg)] focus-visible:border-[var(--focus-work-emerald-border)]',
    shortcut: '3',
  },
  {
    value: 'easy',
    label: '很轻松',
    hint: '延后更久再看',
    icon: Rocket,
    colorClass: 'hover:bg-[var(--focus-work-sky-bg)] hover:border-[var(--focus-work-sky-border)] focus-visible:bg-[var(--focus-work-sky-bg)] focus-visible:border-[var(--focus-work-sky-border)]',
    shortcut: '4',
  },
];

function parseChoiceOptions(options: UnifiedQuestion['options_json']): Array<{ key: string; text: string }> {
  if (!options) return [];
  const normalized = typeof options === 'string'
    ? (() => {
        try {
          return JSON.parse(options) as unknown;
        } catch {
          return null;
        }
      })()
    : options;

  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    return [];
  }

  return Object.entries(normalized as Record<string, unknown>).map(([key, value]) => ({
    key,
    text: String(value ?? ''),
  }));
}

function stemToBlocks(stem: string): ContentBlockData[] {
  if (!stem.trim()) return [];
  return [{ type: 'paragraph', text: stem }];
}

function paragraphsToBlocks(paragraphs: string[]): ContentBlockData[] {
  if (!paragraphs || paragraphs.length === 0) return [];
  return paragraphs
    .filter((p) => p && p.trim())
    .map((p) => ({ type: 'paragraph' as const, text: p }));
}

function buildUnifiedChoiceItem(question: UnifiedQuestion | null, answeredCount: number, targetCount: number): ChoiceQuestionItem | null {
  if (!question) return null;

  const hasArticleMaterial =
    question.article_pk &&
    Array.isArray(question.article_paragraphs) &&
    question.article_paragraphs.length > 0;

  const articleTitle = question.article_title || '阅读材料';
  const stemBlocks = stemToBlocks(question.stem);
  const materialBlocks = hasArticleMaterial
    ? paragraphsToBlocks(question.article_paragraphs)
    : stemBlocks;
  const stemPlacement = hasArticleMaterial ? 'question' : 'material';

  return {
    id: question.id,
    numberLabel: `Q${question.index + 1}`,
    stem: question.stem,
    stemBlocks: stemBlocks,
    stemPlacement,
    options: parseChoiceOptions(question.options_json),
    material: {
      title: hasArticleMaterial ? articleTitle : '题目',
      paragraphs: hasArticleMaterial ? [{ id: 'main', text: '' }] : [],
    },
    materialBlocks,
    explanationBlocks: question.explanation
      ? [{ type: 'paragraph', text: question.explanation }]
      : undefined,
    meta: [{ label: `题目 ${Math.min(answeredCount + 1, Math.max(targetCount, 1))} / ${Math.max(targetCount, 1)}` }],
  };
}

export default function UnifiedFocusWork({ run, disabled, onContentCompleted }: FocusWorkRendererProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [initResult, setInitResult] = useState<UnifiedPoolInitResult | null>(null);
  const [question, setQuestion] = useState<UnifiedQuestion | null>(null);
  const [kind, setKind] = useState('');
  const [submitResult, setSubmitResult] = useState<UnifiedSubmitResult | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [backflowMessage, setBackflowMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const submitInFlight = useRef(false);
  const sessionStartedAtRef = useRef<number>(Date.now());
  const questionStartedAtRef = useRef<number>(Date.now());
  const { setHeaderRight } = useFocusWorkHeaderRight();

  const buildRunSummary = useCallback((nextAnsweredCount: number, nextCorrectCount: number) => ({
    answered_count: nextAnsweredCount,
    correct_count: nextCorrectCount,
    total_questions: initResult?.total ?? 0,
    accuracy: nextAnsweredCount > 0 ? nextCorrectCount / nextAnsweredCount : 0,
    duration_seconds: Math.max(0, Math.round((Date.now() - sessionStartedAtRef.current) / 1000)),
  }), [initResult?.total]);

  const handleAbort = useCallback(() => {
    // 发送事件触发快照重载，清除过期的 active_run
    window.dispatchEvent(new CustomEvent('ark:reload-focus'));
    onContentCompleted({ aborted: true });
  }, [onContentCompleted]);

  const initPool = useCallback(async () => {
    setPhase('loading');
    setErrorMessage(null);
    try {
      if (!run.config_snapshot?.bank_id && !run.config_snapshot?.deliberate_config_id) {
        setPhase('error');
        setErrorMessage('配置不完整：未指定题库');
        return;
      }

      const result = await initUnifiedPool(run.id);
      setInitResult(result);
      setKind(result.kind);

      if (result.total === 0) {
        setPhase('warning_init');
        return;
      }

      if (result.warning) {
        setPhase('warning_init');
        return;
      }

      setQuestion(result.first_question);
      sessionStartedAtRef.current = Date.now();
      questionStartedAtRef.current = Date.now();
      setPhase('active');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '初始化失败';
      // 404 表示专注运行记录不存在（过期/无效），提供退出选项而非死循环重试
      const isNotFound = errorMsg.includes('不存在') || errorMsg.includes('404') || errorMsg.includes('not found');
      if (isNotFound) {
        // 自动触发快照重载以清除过期状态
        window.dispatchEvent(new CustomEvent('ark:reload-focus'));
      }
      setPhase('error');
      setErrorMessage(errorMsg);
    }
  }, [run.id, run.config_snapshot]);

  useEffect(() => {
    void initPool();
  }, [initPool]);

  // Flashcard keyboard shortcuts
  useEffect(() => {
    if (kind !== 'flash_card' || !question || disabled) return;
    if (phase !== 'active') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName)) return;

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (!showAnswer) {
            setShowAnswer(true);
          }
          break;
        case '1':
          e.preventDefault();
          if (showAnswer) void handleFlashcardRating('again');
          break;
        case '2':
          e.preventDefault();
          if (showAnswer) void handleFlashcardRating('hard');
          break;
        case '3':
          e.preventDefault();
          if (showAnswer) void handleFlashcardRating('good');
          break;
        case '4':
          e.preventDefault();
          if (showAnswer) void handleFlashcardRating('easy');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [kind, question, disabled, phase, showAnswer]);

  function handleShowAnswer() {
    if (disabled) return;
    setShowAnswer(true);
  }

  async function handleSubmitAnswer(isCorrect: boolean, timeSpentMs?: number) {
    if (submitInFlight.current || !question || disabled) return;
    submitInFlight.current = true;
    setErrorMessage(null);

    try {
      const result = await submitUnifiedAnswer(run.id, {
        question_id: question.id,
        is_correct: isCorrect,
        time_spent_ms: timeSpentMs ?? Math.max(0, Date.now() - questionStartedAtRef.current),
        user_input: userInput,
      });
      setSubmitResult(result);
      setAnsweredCount(result.answered_count);
      setBackflowMessage(result.backflow_info);

      // 闪卡模式：非重试情况下直接进入下一题，不需要手动点击
      if (kind === 'flash_card' && result.backflow_action !== 'retry') {
        if (result.done || !result.next_question) {
          setPhase('done');
          onContentCompleted({
            run_summary: buildRunSummary(
              result.answered_count,
              result.correct_count ?? 0,
            ),
          });
        } else {
          setQuestion(result.next_question);
          questionStartedAtRef.current = Date.now();
          setShowAnswer(false);
          setSelectedOption('');
          setUserInput('');
          setBackflowMessage(null);
          setSubmitResult(null);
        }
      } else {
        setPhase('submit_confirm');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '提交失败');
    } finally {
      submitInFlight.current = false;
    }
  }

  async function handleFlashcardRating(rating: FlashcardRating) {
    if (submitInFlight.current || !question || disabled) return;
    submitInFlight.current = true;
    setErrorMessage(null);

    try {
      const result = await submitUnifiedAnswer(run.id, {
        question_id: question.id,
        rating,
        time_spent_ms: Math.max(0, Date.now() - questionStartedAtRef.current),
      });
      setSubmitResult(result);
      setAnsweredCount(result.answered_count);
      setBackflowMessage(result.backflow_info);

      if (result.backflow_action !== 'retry') {
        if (result.done || !result.next_question) {
          setPhase('done');
          onContentCompleted({
            run_summary: buildRunSummary(
              result.answered_count,
              result.correct_count ?? 0,
            ),
          });
        } else {
          setQuestion(result.next_question);
          questionStartedAtRef.current = Date.now();
          setShowAnswer(false);
          setSelectedOption('');
          setUserInput('');
          setBackflowMessage(null);
          setSubmitResult(null);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '提交失败');
    } finally {
      submitInFlight.current = false;
    }
  }

  function handleNextQuestion() {
    if (submitResult?.done || (!submitResult?.next_question && phase === 'submit_confirm')) {
      setPhase('done');
      onContentCompleted({
        run_summary: buildRunSummary(
          submitResult?.answered_count ?? answeredCount,
          submitResult?.correct_count ?? 0,
        ),
      });
      return;
    }

    setQuestion(submitResult?.next_question ?? null);
    questionStartedAtRef.current = Date.now();
    setShowAnswer(false);
    setSelectedOption('');
    setUserInput('');
    setBackflowMessage(null);
    setSubmitResult(null);
    setPhase('active');
  }

  function handleStartAnyway() {
    if (initResult && initResult.total > 0 && initResult.first_question) {
      setQuestion(initResult.first_question);
      sessionStartedAtRef.current = Date.now();
      questionStartedAtRef.current = Date.now();
      setPhase('active');
    } else {
      onContentCompleted({ run_summary: buildRunSummary(0, 0) });
    }
  }

  const totalQuestions = initResult?.total ?? 0;
  const choiceItem = kind === 'choice'
    ? buildUnifiedChoiceItem(question, submitResult?.answered_count ?? answeredCount, totalQuestions)
    : null;

  // 同步进度徽章到外层 header 右侧（仅选择题模式）
  useEffect(() => {
    if (kind === 'choice' && (phase === 'active' || phase === 'submit_confirm')) {
      const current = Math.min(submitResult?.answered_count ?? answeredCount, Math.max(totalQuestions, 1));
      const total = Math.max(totalQuestions, 1);
      setHeaderRight(
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--focus-work-text-muted)]">
          <BarChart3 className="h-3.5 w-3.5" />
          题目 {current} / {total}
        </span>,
      );
    } else {
      setHeaderRight(null);
    }
    return () => setHeaderRight(null);
  }, [answeredCount, submitResult?.answered_count, totalQuestions, phase, kind, setHeaderRight]);

  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-ark-text-muted">正在准备题目…</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="space-y-4 rounded-lg border border-red-400/30 bg-red-400/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
        <p className="text-sm text-ark-text">{errorMessage || '加载失败'}</p>
        <div className="flex justify-center gap-3">
          <Button variant="secondary" onClick={() => void initPool()}>重试</Button>
          <Button variant="primary" onClick={handleAbort}>返回工作台</Button>
        </div>
      </div>
    );
  }

  if (phase === 'warning_init') {
    return (
      <div className="space-y-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
        {totalQuestions === 0 ? (
          <>
            <p className="text-sm font-medium text-ark-text">当前筛选项下没有可用的题目</p>
            <p className="text-xs text-ark-text-muted">请返回调整配置后重试</p>
            <Button variant="secondary" onClick={() => onContentCompleted({ run_summary: buildRunSummary(0, 0) })}>
              结束本次专注
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-ark-text">{initResult?.warning}</p>
            <p className="text-xs text-ark-text-muted">将按实际题量（{totalQuestions} 题）开始</p>
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={() => onContentCompleted({ run_summary: buildRunSummary(0, 0) })}>
                取消
              </Button>
              <Button variant="primary" onClick={handleStartAnyway}>
                开始 ({totalQuestions} 题)
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="space-y-4 rounded-lg border border-ark-border bg-ark-surface-subtle p-6 text-center">
        <Check className="mx-auto h-8 w-8 text-green-500" />
        <p className="text-sm font-medium text-ark-text">专注完成</p>
        <p className="text-xs text-ark-text-muted">共完成 {answeredCount} 题</p>
      </div>
    );
  }

  if (kind === 'choice' && (phase === 'active' || phase === 'submit_confirm') && choiceItem) {
    return (
      <div className="flex h-full flex-col gap-4">
        {backflowMessage && (
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2 text-sm text-amber-400">
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span>{backflowMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="shrink-0 rounded-lg border border-red-400/30 bg-red-400/5 px-4 py-2 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        <div className="min-h-0 flex-1">

        <ChoiceQuestionFocusTemplate
          title="选择练习"
          subtitle="阅读训练"
          statusLabel="选择练习"
          item={choiceItem}
          loading={false}
          error={null}
          emptyTitle="暂无题目"
          emptyDescription="当前没有可用的题目。"
          answeredCount={submitResult?.answered_count ?? answeredCount}
          targetCount={Math.max(totalQuestions, 1)}
          disabled={disabled}
          onSubmitAnswer={async (_item, optionKey): Promise<ChoiceQuestionSubmitResult> => {
            setSelectedOption(optionKey);
            const isCorrect = optionKey === question?.answer;
            const result = await submitUnifiedAnswer(run.id, {
              question_id: question?.id || '',
              is_correct: isCorrect,
              time_spent_ms: Math.max(0, Date.now() - questionStartedAtRef.current),
              user_input: optionKey,
            });
            setSubmitResult(result);
            setAnsweredCount(result.answered_count);
            setBackflowMessage(result.backflow_info);
            setPhase('submit_confirm');
            return {
              correctOptionKey: isCorrect ? optionKey : question?.answer,
            };
          }}
          onLoadNext={async () => {
            if (submitResult?.done || !submitResult?.next_question) {
              setPhase('done');
              onContentCompleted({
                run_summary: buildRunSummary(
                  submitResult?.answered_count ?? answeredCount,
                  submitResult?.correct_count ?? 0,
                ),
              });
              return null;
            }

            setQuestion(submitResult.next_question);
            questionStartedAtRef.current = Date.now();
            setShowAnswer(false);
            setSelectedOption('');
            setUserInput('');
            setBackflowMessage(null);
            setSubmitResult(null);
            setPhase('active');
            return buildUnifiedChoiceItem(
              submitResult.next_question,
              submitResult.answered_count,
              totalQuestions,
            );
          }}
          onContentCompleted={(progressSnapshot) => {
            const snapshotAnsweredCount = typeof progressSnapshot?.answered_count === 'number'
              ? progressSnapshot.answered_count
              : 0;
            if (submitResult?.done || snapshotAnsweredCount >= Math.max(totalQuestions, 1)) {
              setPhase('done');
              onContentCompleted({
                ...progressSnapshot,
                run_summary: buildRunSummary(
                  submitResult?.answered_count ?? answeredCount,
                  submitResult?.correct_count ?? 0,
                ),
              });
            }
          }}
        />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {backflowMessage && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2 text-sm text-amber-400">
          <RotateCcw className="h-4 w-4 shrink-0" />
          <span>{backflowMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="shrink-0 rounded-lg border border-red-400/30 bg-red-400/5 px-4 py-2 text-sm text-red-400">
          {errorMessage}
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between text-xs text-ark-text-muted">
        <span>进度：{submitResult?.answered_count ?? answeredCount} / {totalQuestions}</span>
        {initResult?.target_count && initResult.target_count > totalQuestions && (
          <span className="text-amber-400">目标 {initResult.target_count} 题，实际 {totalQuestions} 题</span>
        )}
      </div>

      {kind === 'flash_card' && question && (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Flashcard - 居中区域 */}
          <section className="relative flex-1 flex items-center justify-center rounded-[2rem] border border-[var(--focus-work-border-strong)] bg-[var(--focus-work-surface-soft)] px-6 py-4 text-center backdrop-blur-md overflow-hidden shadow-[var(--focus-work-card-shadow)] min-h-0">
            {/* Radial Background Mesh Glow */}
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.08),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(147,197,253,0.12),transparent_60%)]" />

            {/* Content */}
            <div className="w-full max-w-md">
              {/* Word */}
              <div className="text-4xl font-bold tracking-wide text-[var(--focus-work-text)] animate-fade-in">
                {question.question_id}
              </div>

              {!showAnswer ? (
                <>
                  {/* Separator Decorator */}
                  <div className="mt-4 mb-3 flex items-center justify-center">
                    <div className="h-[1px] w-12 bg-[var(--focus-work-border)] opacity-60" />
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/80 mx-2.5 shadow-[0_0_8px_rgba(110,231,183,0.7)] animate-pulse" />
                    <div className="h-[1px] w-12 bg-[var(--focus-work-border)] opacity-60" />
                  </div>

                  {/* Recall Hint */}
                  <div className="text-sm text-[var(--focus-work-text-faint)] select-none">
                    先在脑中回忆释义
                  </div>

                  {/* Reveal Button */}
                  <button
                    type="button"
                    onClick={handleShowAnswer}
                    disabled={disabled}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] px-5 py-2 text-sm font-medium text-[var(--focus-work-text-muted)] transition hover:border-[var(--focus-work-border-strong)] hover:text-[var(--focus-work-text)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed animate-pulse-slow"
                  >
                    <span>显示释义</span>
                    <svg
                      className="h-3.5 w-3.5 transition-transform duration-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </>
              ) : (
                <div className="animate-fade-in">
                  {/* Separator Decorator */}
                  <div className="my-4 flex items-center justify-center">
                    <div className="h-[1px] w-16 bg-[var(--focus-work-border)] opacity-60" />
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/90 mx-2.5 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
                    <div className="h-[1px] w-16 bg-[var(--focus-work-border)] opacity-60" />
                  </div>

                  {/* Answer */}
                  <div className="text-xl font-medium text-[var(--focus-work-text)] leading-relaxed tracking-wide">
                    {question.answer}
                  </div>

                  {/* Stats */}
                  <div className="mt-4 flex items-center justify-center gap-5 text-xs text-[var(--focus-work-text-muted)]">
                    <span>
                      正确 <span className="text-[var(--focus-work-emerald-text)] font-semibold">{question.right_count}</span>
                    </span>
                    <span className="h-3 w-px bg-[var(--focus-work-border)]" />
                    <span>
                      错误 <span className="text-[var(--focus-work-rose-text)] font-semibold">{question.wrong_count}</span>
                    </span>
                    <span className="h-3 w-px bg-[var(--focus-work-border)]" />
                    <span>
                      已复习 <span className="text-[var(--focus-work-text)] font-semibold">
                        {(question.right_count ?? 0) + (question.wrong_count ?? 0)}
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Pronunciation button - top left */}
            <button
              type="button"
              onClick={() => {
                const utterance = new SpeechSynthesisUtterance(question.question_id);
                utterance.lang = 'en-US';
                window.speechSynthesis.speak(utterance);
              }}
              className="absolute top-4 left-4 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] text-[var(--focus-work-text-muted)] transition hover:text-[var(--focus-work-text)] hover:border-[var(--focus-work-border-strong)] active:scale-95"
              aria-label="播放发音"
            >
              <Volume2 className="h-3.5 w-3.5" />
            </button>
          </section>

          {/* Four-point Rating Buttons - 底部固定 */}
          <div className="space-y-2 shrink-0">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {FLASHCARD_RATINGS.map((rating) => {
                const Icon = rating.icon;
                return (
                  <button
                    key={rating.value}
                    type="button"
                    onClick={() => {
                      if (!showAnswer) {
                        handleShowAnswer();
                        return;
                      }
                      void handleFlashcardRating(rating.value);
                    }}
                    disabled={disabled}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border bg-[var(--focus-work-surface-soft)] px-2 py-3 text-center transition-all duration-200 active:scale-95 ${
                      showAnswer
                        ? 'border-[var(--focus-work-border)] hover:-translate-y-0.5'
                        : 'border-[var(--focus-work-border)]/50 opacity-60 hover:opacity-80'
                    } ${showAnswer ? rating.colorClass : ''}`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-[var(--focus-work-surface-raised)] ${
                      showAnswer ? 'border-[var(--focus-work-border)] text-[var(--focus-work-text-muted)]' : 'border-[var(--focus-work-border)]/50 text-[var(--focus-work-text-faint)]'
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className={`text-sm font-semibold ${
                      showAnswer ? 'text-[var(--focus-work-text)]' : 'text-[var(--focus-work-text-muted)]'
                    }`}>
                      {rating.label}
                    </div>
                    <div className="text-[10px] text-[var(--focus-work-text-muted)] leading-tight">
                      {rating.hint}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Status hint */}
            {!showAnswer ? (
              <div className="flex items-center justify-center text-[10px] text-[var(--focus-work-text-faint)]">
                <span>点击任意按钮或按 [Space] 显示释义</span>
              </div>
            ) : (
              <div className="flex items-center justify-center text-[10px] text-[var(--focus-work-text-faint)]">
                <span>⌨️ 快捷键：[1] 没记住 · [2] 有点难 · [3] 记住了 · [4] 很轻松</span>
              </div>
            )}
          </div>
        </div>
      )}

      {kind === 'choice' && question && (
        <div className="space-y-4">
          <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
            <p className="text-sm font-medium text-ark-text">{question.stem}</p>
          </div>
          {question.options_json && typeof question.options_json === 'object' && (
            <div className="space-y-2">
              {Object.entries(question.options_json).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  disabled={showAnswer || disabled}
                  onClick={() => {
                    setSelectedOption(key);
                    setShowAnswer(true);
                    const isCorrect = key === question.answer;
                    void handleSubmitAnswer(isCorrect);
                  }}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                    selectedOption === key
                      ? key === question.answer
                        ? 'border-green-500 bg-green-500/10 text-green-400'
                        : 'border-red-400 bg-red-400/10 text-red-400'
                      : 'border-ark-border bg-ark-surface-subtle text-ark-text hover:border-ark-accent/50'
                  }`}
                >
                  <span className="font-medium">{key}.</span> {String(value)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {kind === 'input' && question && (
        <div className="space-y-4">
          {question.article_pk && Array.isArray(question.article_paragraphs) && question.article_paragraphs.length > 0 && (
            <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
              <p className="mb-2 text-xs font-medium text-ark-text-muted">
                {question.article_title || '阅读材料'}
              </p>
              <div className="space-y-3">
                {question.article_paragraphs.map((p: string, i: number) => (
                  <div key={i} className="text-sm leading-7 text-ark-text">
                    <MarkdownContent content={p} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {question.stem && (
            <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
              <div className="text-sm font-medium text-ark-text">
                <MarkdownContent content={question.stem} />
              </div>
            </div>
          )}
          {!showAnswer ? (
            <div className="space-y-3">
              <input
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && userInput.trim() && !disabled) {
                    handleShowAnswer();
                  }
                }}
                placeholder="输入你的答案…"
                className={inputClass}
                autoFocus
                disabled={disabled}
              />
              <div className="flex justify-center">
                <Button
                  variant="primary"
                  disabled={!userInput.trim() || disabled}
                  onClick={handleShowAnswer}
                >
                  提交
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-3">
                <p className="text-xs text-ark-text-muted mb-1">你的回答：</p>
                <p className="text-sm text-ark-text">{userInput}</p>
              </div>
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                <p className="text-xs text-ark-text-muted mb-1">参考答案：</p>
                <p className="text-sm text-green-400">{question.answer}</p>
              </div>
              <div className="flex justify-center gap-2">
                <Button variant="secondary" onClick={() => void handleSubmitAnswer(false)} disabled={disabled} leftIcon={<X className="h-4 w-4" />}>
                  答错了
                </Button>
                <Button variant="primary" onClick={() => void handleSubmitAnswer(true)} disabled={disabled} leftIcon={<Check className="h-4 w-4" />}>
                  答对了
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'submit_confirm' && (
        <div className="flex justify-center pt-2">
          {submitResult?.backflow_action === 'retry' ? (
            <div className="space-y-2 text-center">
              <p className="text-sm text-amber-400">请重新作答本题</p>
              <Button variant="primary" onClick={handleNextQuestion} disabled={disabled}>
                继续
              </Button>
            </div>
          ) : (
            <Button variant="primary" onClick={handleNextQuestion} disabled={disabled}>
              {submitResult?.done ? '完成' : '下一题'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
