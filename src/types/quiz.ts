export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type OptionLabel = 'A' | 'B' | 'C' | 'D';

export type DifficultyMix = 'Balanced' | 'Easy-heavy' | 'Hard-heavy';

export interface QuizOption {
  label: OptionLabel;
  text: string;
}

export interface SolutionStep {
  step: number;
  action: string;
  result: string;
}

export interface QuizQuestion {
  id: number;
  difficulty: DifficultyLevel;
  concept_tested: string;
  question: string;
  options: QuizOption[];
  correct_answer: OptionLabel;
  solution_steps: SolutionStep[];
  common_mistake: string;
}

export interface QuizPayload {
  subject: string;
  topic: string;
  notes_sufficient: boolean;
  warnings: string[];
  quiz: QuizQuestion[];
}

export interface GenerateQuizRequest {
  subject: string;
  topic: string;
  notes: string;
  count: number;
  mix: DifficultyMix;
  hardMathMode: boolean;
}
