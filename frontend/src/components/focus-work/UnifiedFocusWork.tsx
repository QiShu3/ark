import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, RotateCcw, Volume2, X } from 'lucide-react';

import Button from '../Button';
import { initUnifiedPool, submitUnifiedAnswer, type UnifiedPoolInitResult, type UnifiedQuestion, type UnifiedSubmitResult } from '../../lib/focus-work/unifiedApi';
import type { FocusWorkRendererProps } from './focusWorkTypes';

type Phase = 'loading' | 'warning_init' | 'active' | 'submit_confirm' | 'done' | 'error';

const inputClass =
  'w-full rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]';

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
      setPhase('active');
    } catch (err) {
      setPhase('error');
      setErrorMessage(err instanceof Error ? err.message : '初始化失败');
    }
  }, [run.id, run.config_snapshot]);

  useEffect(() => {
    void initPool();
  }, [initPool]);

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
        time_spent_ms: timeSpentMs ?? 1000,
        user_input: userInput,
      });
      setSubmitResult(result);
      setAnsweredCount(result.answered_count);
      setBackflowMessage(result.backflow_info);
      setPhase('submit_confirm');
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
        run_summary: {
          answered_count: submitResult?.answered_count ?? answeredCount,
          correct_count: submitResult?.correct_count ?? 0,
          total_questions: initResult?.total ?? 0,
        },
      });
      return;
    }

    setQuestion(submitResult?.next_question ?? null);
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
      setPhase('active');
    } else {
      onContentCompleted({ run_summary: { answered_count: 0, correct_count: 0, total_questions: 0 } });
    }
  }

  const totalQuestions = initResult?.total ?? 0;

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
        <Button variant="secondary" onClick={() => void initPool()}>重试</Button>
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
            <Button variant="secondary" onClick={() => onContentCompleted({ run_summary: { answered_count: 0 } })}>
              结束本次专注
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-ark-text">{initResult?.warning}</p>
            <p className="text-xs text-ark-text-muted">将按实际题量（{totalQuestions} 题）开始</p>
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={() => onContentCompleted({ run_summary: { answered_count: 0 } })}>
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

  return (
    <div className="space-y-4">
      {backflowMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2 text-sm text-amber-400">
          <RotateCcw className="h-4 w-4 shrink-0" />
          <span>{backflowMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/5 px-4 py-2 text-sm text-red-400">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-ark-text-muted">
        <span>进度：{submitResult?.answered_count ?? answeredCount} / {totalQuestions}</span>
        {initResult?.target_count && initResult.target_count > totalQuestions && (
          <span className="text-amber-400">目标 {initResult.target_count} 题，实际 {totalQuestions} 题</span>
        )}
      </div>

      {kind === 'flash_card' && question && (
        <div className="space-y-4">
          <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-6 text-center">
            {!showAnswer ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <Volume2 className="h-5 w-5 text-ark-text-muted" />
                  <span className="text-2xl font-semibold text-ark-text">{question.question_id}</span>
                </div>
                <p className="text-sm text-ark-text-muted">点击下方按钮查看释义</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-2xl font-semibold text-ark-text">{question.question_id}</div>
                <div className="mx-auto max-w-md rounded-lg bg-ark-surface-strong p-4">
                  <p className="text-base text-ark-text">{question.answer}</p>
                </div>
                <div className="flex items-center justify-center gap-4 text-xs text-ark-text-muted">
                  <span>正确: {question.right_count}</span>
                  <span>错误: {question.wrong_count}</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-center gap-2">
            {!showAnswer ? (
              <Button variant="primary" onClick={handleShowAnswer} disabled={disabled}>显示答案</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void handleSubmitAnswer(false)} disabled={disabled} leftIcon={<X className="h-4 w-4" />}>
                  没记住
                </Button>
                <Button variant="primary" onClick={() => void handleSubmitAnswer(true)} disabled={disabled} leftIcon={<Check className="h-4 w-4" />}>
                  记住了
                </Button>
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
          <div className="rounded-lg border border-ark-border bg-ark-surface-subtle p-4">
            <p className="text-sm font-medium text-ark-text">{question.stem}</p>
          </div>
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
