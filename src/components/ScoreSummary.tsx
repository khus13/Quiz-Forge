import React from 'react';
import { Award, RotateCcw } from 'lucide-react';
import type { DifficultyLevel, OptionLabel, QuizQuestion } from '../types/quiz';

interface ScoreSummaryProps {
  questions: QuizQuestion[];
  answers: Record<number, OptionLabel>;
  onRegenerate: () => void;
  isLoading: boolean;
}

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const ScoreSummary: React.FC<ScoreSummaryProps> = ({
  questions,
  answers,
  onRegenerate,
  isLoading,
}) => {
  const total = questions.length;
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;
  const correctCount = questions.filter((q) => answers[q.id] === q.correct_answer).length;
  const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const breakdown = (['easy', 'medium', 'hard'] as DifficultyLevel[])
    .map((level) => {
      const subset = questions.filter((q) => q.difficulty === level);
      const correct = subset.filter((q) => answers[q.id] === q.correct_answer).length;
      return {
        level,
        label: DIFFICULTY_LABELS[level],
        total: subset.length,
        correct,
      };
    })
    .filter((item) => item.total > 0);

  return (
    <section
      aria-label="Quiz score summary"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400">
            <Award className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {answeredCount === total ? 'Quiz Complete' : 'Quiz Summary'}
            </h3>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300 tabular-nums">
              Score: <span className="font-semibold text-slate-900 dark:text-slate-100">{correctCount} / {total}</span> ({percent}%)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRegenerate}
          disabled={isLoading}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Regenerate quiz
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-slate-200 pt-4 sm:grid-cols-3 dark:border-slate-800">
        {breakdown.map((item) => (
          <div
            key={item.level}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-950/50"
          >
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {item.label}
            </span>
            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {item.correct} / {item.total}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};
