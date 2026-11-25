import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  XCircle,
} from 'lucide-react';
import type { OptionLabel, QuizQuestion } from '../types/quiz';
import { MathText } from './MathText';

interface QuizCardProps {
  question: QuizQuestion;
  index: number;
  selectedAnswer: OptionLabel | undefined;
  onSelectAnswer: (questionId: number, choice: OptionLabel) => void;
}

const DIFFICULTY_META: Record<
  QuizQuestion['difficulty'],
  { label: string; textClass: string }
> = {
  easy: {
    label: 'Easy · Recall',
    textClass: 'text-emerald-700 dark:text-emerald-400',
  },
  medium: {
    label: 'Medium · Apply',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
  hard: {
    label: 'Hard · Multi-step',
    textClass: 'text-rose-700 dark:text-rose-400',
  },
};

export const QuizCard: React.FC<QuizCardProps> = ({
  question,
  index,
  selectedAnswer,
  onSelectAnswer,
}) => {
  const [isSolutionOpen, setIsSolutionOpen] = useState(true);
  const isAnswered = selectedAnswer !== undefined;
  const isCorrect = selectedAnswer === question.correct_answer;
  const diffMeta = DIFFICULTY_META[question.difficulty] ?? DIFFICULTY_META.medium;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      {/* Unboxed typographic metadata header */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold tabular-nums text-slate-500 dark:text-slate-400">
            Question {index + 1}
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
            ·
          </span>
          <span className={`font-semibold ${diffMeta.textClass}`}>{diffMeta.label}</span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
            ·
          </span>
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {question.concept_tested}
          </span>
        </div>

        {isAnswered && (
          <span
            className={`inline-flex items-center gap-1.5 font-semibold ${
              isCorrect
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {isCorrect ? (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Correct
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Incorrect
              </>
            )}
          </span>
        )}
      </div>

      {/* Question Prompt */}
      <div className="mt-3 text-base font-medium leading-relaxed text-slate-900 dark:text-slate-100">
        <MathText text={question.question} />
      </div>

      {/* Options A-D */}
      <div className="mt-4 space-y-2.5" role="radiogroup" aria-label={`Options for question ${index + 1}`}>
        {question.options.map((opt) => {
          const isSelected = selectedAnswer === opt.label;
          const isCorrectOption = opt.label === question.correct_answer;

          let containerClasses =
            'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-sky-400 hover:bg-sky-50/50 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:bg-slate-800/70';

          if (isAnswered) {
            if (isCorrectOption) {
              containerClasses =
                'border-emerald-500 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500/70 dark:bg-emerald-950/40 dark:text-emerald-100';
            } else if (isSelected && !isCorrectOption) {
              containerClasses =
                'border-rose-500 bg-rose-50/80 text-rose-950 dark:border-rose-500/70 dark:bg-rose-950/40 dark:text-rose-100';
            } else {
              containerClasses =
                'border-slate-200 bg-slate-50/40 text-slate-500 opacity-75 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400';
            }
          }

          return (
            <button
              key={opt.label}
              type="button"
              disabled={isAnswered}
              onClick={() => onSelectAnswer(question.id, opt.label)}
              aria-pressed={isSelected}
              className={`flex w-full min-h-[48px] items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-default ${containerClasses}`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-semibold ${
                  isAnswered && isCorrectOption
                    ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600'
                    : isAnswered && isSelected && !isCorrectOption
                    ? 'border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-600'
                    : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {opt.label}
              </span>
              <span className="min-w-0 flex-1 leading-relaxed">
                <MathText text={opt.text} />
              </span>
              {isAnswered && isCorrectOption && (
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-label="Correct answer"
                />
              )}
              {isAnswered && isSelected && !isCorrectOption && (
                <XCircle
                  className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400"
                  aria-label="Your incorrect choice"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Collapsible Step-by-Step Explanation Panel */}
      {isAnswered && (
        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setIsSolutionOpen((prev) => !prev)}
            aria-expanded={isSolutionOpen}
            className="flex w-full min-h-[44px] items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span>
              Step-by-step solution (Answer: {question.correct_answer})
            </span>
            {isSolutionOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            )}
          </button>

          {isSolutionOpen && (
            <div className="mt-3 space-y-3">
              <ol className="space-y-2.5">
                {question.solution_steps.map((s) => (
                  <li
                    key={s.step}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm dark:border-slate-800 dark:bg-slate-950/60"
                  >
                    <div className="flex items-baseline gap-2.5">
                      <span className="font-mono text-xs font-semibold tabular-nums text-sky-700 dark:text-sky-400">
                        Step {s.step}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        <MathText text={s.action} />
                      </span>
                    </div>
                    <div className="mt-1.5 pl-12 text-slate-700 dark:text-slate-300">
                      <span className="mr-1.5 text-slate-400 dark:text-slate-500" aria-hidden="true">
                        →
                      </span>
                      <MathText text={s.result} />
                    </div>
                  </li>
                ))}
              </ol>

              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <div>
                  <span className="font-semibold">Common mistake: </span>
                  <MathText text={question.common_mistake} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
};
