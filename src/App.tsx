import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  FileText,
  Loader2,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
  Upload,
} from 'lucide-react';
import { MathText } from './components/MathText';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { QuizCard } from './components/QuizCard';
import { ScoreSummary } from './components/ScoreSummary';
import { SAMPLE_NOTES } from './data/samples';
import type {
  DifficultyMix,
  OptionLabel,
  QuizPayload,
} from './types/quiz';

const MAX_NOTES_CHARS = 12000;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const LOADING_MESSAGES = [
  'Reading notes',
  'Writing questions',
  'Checking answers',
] as const;

const QUESTION_COUNTS = [3, 5, 8, 10] as const;
const DIFFICULTY_MIXES: DifficultyMix[] = ['Balanced', 'Easy-heavy', 'Hard-heavy'];

function getInitialDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem('quizforge-theme');
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function isValidQuizPayload(data: unknown): data is QuizPayload {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.notes_sufficient !== 'boolean') return false;
  if (!Array.isArray(obj.warnings)) return false;
  if (!Array.isArray(obj.quiz)) return false;
  return true;
}

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(getInitialDarkMode);

  // Input state
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [count, setCount] = useState<number>(5);
  const [mix, setMix] = useState<DifficultyMix>('Balanced');
  const [hardMathMode, setHardMathMode] = useState(false);

  // File upload feedback
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const quizStageRef = useRef<HTMLDivElement | null>(null);

  // Generation & quiz state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quizData, setQuizData] = useState<QuizPayload | null>(null);
  const [answers, setAnswers] = useState<Record<number, OptionLabel>>({});

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      window.localStorage.setItem('quizforge-theme', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('quizforge-theme', 'light');
    }
  }, [isDark]);

  // Rotate loading status text while generating
  useEffect(() => {
    if (!isLoading) {
      setLoadingStepIndex(0);
      return;
    }
    const interval = window.setInterval(() => {
      setLoadingStepIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 1800);
    return () => window.clearInterval(interval);
  }, [isLoading]);

  const notesLength = notes.length;
  const isNotesEmpty = notes.trim().length === 0;
  const isNotesTooLong = notesLength > MAX_NOTES_CHARS;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      setFileError(
        `File "${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Maximum allowed size is 10 MB.`
      );
      setUploadedFileName(null);
      e.target.value = '';
      return;
    }

    if (file.type && !file.type.startsWith('text/') && !file.name.toLowerCase().endsWith('.txt')) {
      setFileError('Only plain text (.txt) files are supported.');
      setUploadedFileName(null);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setNotes(content);
      setUploadedFileName(file.name);
      if (content.length > MAX_NOTES_CHARS) {
        setFileError(
          `Loaded ${content.length.toLocaleString()} characters. Please trim to ${MAX_NOTES_CHARS.toLocaleString()} characters or fewer before generating.`
        );
      }
    };
    reader.onerror = () => {
      setFileError('Could not read the selected file. Please try pasting your notes directly.');
      setUploadedFileName(null);
    };
    reader.readAsText(file);
  };

  const handleLoadSample = (sampleId: string) => {
    const sample = SAMPLE_NOTES.find((s) => s.id === sampleId);
    if (!sample) return;
    setSubject(sample.subject);
    setTopic(sample.topic);
    setNotes(sample.notes);
    setUploadedFileName(null);
    setFileError(null);
    setErrorMessage(null);
  };

  const handleClearNotes = () => {
    setSubject('');
    setTopic('');
    setNotes('');
    setUploadedFileName(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const generateQuiz = async () => {
    if (isLoading) return;

    if (isNotesEmpty) {
      setErrorMessage('Please paste or upload your lecture notes before generating a quiz.');
      notesTextareaRef.current?.focus();
      return;
    }

    if (isNotesTooLong) {
      setErrorMessage(
        `Lecture notes exceed the ${MAX_NOTES_CHARS.toLocaleString()} character limit. Please shorten your notes and try again.`
      );
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setQuizData(null);
    setAnswers({});

    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          topic: topic.trim(),
          notes,
          count,
          mix,
          hardMathMode,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const serverErr =
          payload && typeof payload.error === 'string'
            ? payload.error
            : `Request failed with status ${res.status}. Please try again.`;
        setErrorMessage(serverErr);
        return;
      }

      const rawText = payload && typeof payload.raw === 'string' ? payload.raw : '';
      let parsed: unknown;
      try {
        // Strip accidental markdown fences if a model emits them before JSON.parse
        const cleaned = rawText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch {
        setErrorMessage(
          'We received an unreadable response format from the tutor. Please retry to generate a clean quiz.'
        );
        return;
      }

      if (!isValidQuizPayload(parsed)) {
        setErrorMessage(
          'The generated quiz was missing required fields. Please retry.'
        );
        return;
      }

      setQuizData(parsed);

      // On mobile/tablet single-column layout, scroll smoothly to the generated quiz stage
      if (window.innerWidth < 1024) {
        window.setTimeout(() => {
          quizStageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    } catch {
      setErrorMessage(
        'Network error while contacting QuizForge. Check your connection and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAnswer = (questionId: number, choice: OptionLabel) => {
    setAnswers((prev) => {
      if (prev[questionId] !== undefined) return prev;
      return { ...prev, [questionId]: choice };
    });
  };

  const handleResetQuizAnswers = () => {
    setAnswers({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void generateQuiz();
  };

  const totalQuestions = quizData?.quiz.length ?? 0;
  const answeredCount = quizData
    ? quizData.quiz.filter((q) => answers[q.id] !== undefined).length
    : 0;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a
            href="/"
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            QuizForge
          </a>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <OfflineIndicator />

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* Intro Hero Header */}
        <section className="mb-6 border-b border-slate-200 pb-6 dark:border-slate-800">
          <h1 className="max-w-2xl text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100 [text-wrap:balance]">
            Turn STEM lecture notes into step-by-step practice quizzes
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Paste your engineering or math notes to generate multiple-choice questions strictly from your material, complete with LaTeX worked solutions and common mistake checks.
          </p>
        </section>

        {/* Two-Column Responsive Workspace */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Left Column: Lecture Notes Input & Configuration */}
          <section
            aria-label="Lecture notes input"
            className="lg:col-span-5"
          >
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  1. Lecture Notes
                </h2>
                {notes.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearNotes}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Sample Notes Quick Loader */}
              <div className="mt-3">
                <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Quick sample notes
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SAMPLE_NOTES.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => handleLoadSample(sample.id)}
                      className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:border-sky-500/60 dark:hover:bg-slate-800 dark:hover:text-sky-300"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject & Topic Fields */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="subject-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Subject
                  </label>
                  <input
                    id="subject-input"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g., Integral Calculus"
                    maxLength={120}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-500 dark:focus:bg-slate-950"
                  />
                </div>
                <div>
                  <label
                    htmlFor="topic-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Topic
                  </label>
                  <input
                    id="topic-input"
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Integration by Parts"
                    maxLength={120}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-500 dark:focus:bg-slate-950"
                  />
                </div>
              </div>

              {/* Textarea + .txt Upload */}
              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="notes-textarea"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Lecture Notes
                  </label>
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      isNotesTooLong
                        ? 'font-semibold text-rose-600 dark:text-rose-400'
                        : notesLength > 10500
                        ? 'font-medium text-amber-600 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {notesLength.toLocaleString()} / {MAX_NOTES_CHARS.toLocaleString()} chars
                  </span>
                </div>

                <textarea
                  ref={notesTextareaRef}
                  id="notes-textarea"
                  rows={8}
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    if (fileError) setFileError(null);
                  }}
                  placeholder="Paste definitions, formulas, theorems, and worked examples from your lecture notes..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-500 dark:focus:bg-slate-950"
                />

                {/* Optional .txt Upload */}
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="txt-upload"
                    className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-within:outline-2 focus-within:outline-sky-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Upload className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                    <span>Upload .txt file (max 10 MB)</span>
                    <input
                      ref={fileInputRef}
                      id="txt-upload"
                      type="file"
                      accept=".txt,text/plain"
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>

                  {uploadedFileName && !fileError && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="truncate">{uploadedFileName}</span>
                    </span>
                  )}
                </div>

                {fileError && (
                  <div
                    role="alert"
                    className="mt-2.5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                    <span>{fileError}</span>
                  </div>
                )}
              </div>

              {/* Quiz Options: Count & Difficulty Mix */}
              <div className="mt-5 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                <div>
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Number of questions
                  </span>
                  <div className="mt-1.5 grid grid-cols-4 gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-950">
                    {QUESTION_COUNTS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCount(n)}
                        className={`min-h-[40px] rounded-lg text-xs font-semibold tabular-nums transition-colors ${
                          count === n
                            ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Difficulty mix
                  </span>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-950">
                    {DIFFICULTY_MIXES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setMix(option)}
                        className={`min-h-[40px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                          mix === option
                            ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hard Math Mode Toggle */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
                  <div>
                    <label
                      htmlFor="hard-math-toggle"
                      className="block cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200"
                    >
                      Hard math mode
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {hardMathMode
                        ? 'Using Gemini 2.5 Pro for multi-step derivations'
                        : 'Using Gemini 2.5 Flash (faster, lighter)'}
                    </p>
                  </div>
                  <button
                    id="hard-math-toggle"
                    type="button"
                    role="switch"
                    aria-checked={hardMathMode}
                    onClick={() => setHardMathMode((prev) => !prev)}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
                      hardMathMode ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                        hardMathMode ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Generate CTA */}
              <button
                type="submit"
                disabled={isLoading || isNotesTooLong}
                className="mt-5 flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>{LOADING_MESSAGES[loadingStepIndex]}...</span>
                  </>
                ) : (
                  <span>Generate Practice Quiz</span>
                )}
              </button>
            </form>
          </section>

          {/* Right Column: Quiz Stage */}
          <section
            ref={quizStageRef}
            aria-label="Practice quiz"
            className="lg:col-span-7"
          >
            {/* Loading State */}
            {isLoading && (
              <div
                role="status"
                aria-live="polite"
                className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900"
              >
                <Loader2 className="h-8 w-8 animate-spin text-sky-600 dark:text-sky-400" aria-hidden="true" />
                <p className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {LOADING_MESSAGES[loadingStepIndex]}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Generating {count} {mix.toLowerCase()} questions with worked solutions
                </p>
              </div>
            )}

            {/* Error State with Retry Button */}
            {!isLoading && errorMessage && (
              <div
                role="alert"
                className="rounded-2xl border border-rose-200 bg-white p-6 dark:border-rose-900/60 dark:bg-slate-900"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                  <div className="flex-1">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Could not generate quiz
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {errorMessage}
                    </p>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => void generateQuiz()}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500"
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Warning Banner when notes_sufficient === false (no quiz rendered) */}
            {!isLoading && !errorMessage && quizData && !quizData.notes_sufficient && (
              <div
                role="alert"
                className="rounded-2xl border border-amber-300 bg-amber-50/70 p-6 dark:border-amber-800/70 dark:bg-amber-950/30"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle
                    className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400"
                    aria-hidden="true"
                  />
                  <div className="flex-1">
                    <h2 className="text-base font-semibold text-amber-950 dark:text-amber-100">
                      More lecture detail needed
                    </h2>
                    <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                      QuizForge only uses concepts present in your notes and could not generate a verified quiz from the text provided:
                    </p>
                    {quizData.warnings.length > 0 && (
                      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-amber-950 dark:text-amber-100">
                        {quizData.warnings.map((warning, idx) => (
                          <li key={idx}>
                            <MathText text={warning} />
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => notesTextareaRef.current?.focus()}
                        className="inline-flex min-h-[44px] items-center rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-100 dark:hover:bg-slate-800"
                      >
                        Add more notes
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Active Quiz View */}
            {!isLoading && !errorMessage && quizData && quizData.notes_sufficient && (
              <div className="space-y-5">
                {/* Quiz Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                      {quizData.topic || topic || 'Practice Quiz'}
                    </h2>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{quizData.subject || subject || 'STEM Review'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {answeredCount} of {totalQuestions} answered
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {answeredCount > 0 && (
                      <button
                        type="button"
                        onClick={handleResetQuizAnswers}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Reset answers
                      </button>
                    )}
                  </div>
                </div>

                {/* Non-blocking warnings if any accompanied a sufficient quiz */}
                {quizData.warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    <span className="font-semibold">Note: </span>
                    {quizData.warnings.join(' ')}
                  </div>
                )}

                {/* Question Cards */}
                <div className="space-y-4">
                  {quizData.quiz.map((q, idx) => (
                    <QuizCard
                      key={q.id}
                      question={q}
                      index={idx}
                      selectedAnswer={answers[q.id]}
                      onSelectAnswer={handleSelectAnswer}
                    />
                  ))}
                </div>

                {/* Score Summary */}
                <ScoreSummary
                  questions={quizData.quiz}
                  answers={answers}
                  onRegenerate={() => void generateQuiz()}
                  isLoading={isLoading}
                />
              </div>
            )}

            {/* Initial Empty State */}
            {!isLoading && !errorMessage && !quizData && (
              <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-sky-600 dark:border-slate-800 dark:bg-slate-900 dark:text-sky-400">
                  <BookOpen className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                  Your practice quiz will appear here
                </h2>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Paste your notes or pick a sample topic on the left, then click Generate Practice Quiz. Each question includes step-by-step LaTeX solutions.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Group 5 • GE-FEL-AIS • SDG 4
      </footer>
    </div>
  );
}
