import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  Type,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const MAX_NOTES_LENGTH = 12000;
const PORT = Number(process.env.PORT) || 3000;

// A quiz is split into requests of at most this many questions, and the
// requests run in parallel. 10 questions -> 3 parallel requests of 4/3/3.
const QUESTIONS_PER_REQUEST = 4;

// Per-attempt limit. Small requests with low thinking should finish far
// sooner; this just stops a stuck request from hanging the app.
const REQUEST_TIMEOUT_MS = 40_000;

// Tried in order. On 503/429/504/404 the next model is used immediately.
const FLASH_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
const HARD_MATH_MODELS = ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.6-flash'];

// Gemini 3 thinks at "high" by default, which is the main cause of slow
// responses. "low" is much faster; Hard math mode uses "medium" for accuracy.
const THINKING_NORMAL = 'low';
const THINKING_HARD_MATH = 'medium';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Difficulty = 'easy' | 'medium' | 'hard';
type Mix = 'Balanced' | 'Easy-heavy' | 'Hard-heavy';
type QuizItem = { id: number; question: string; [key: string]: unknown };
type QuizPayload = {
  subject?: string;
  topic?: string;
  notes_sufficient?: boolean;
  warnings?: string[];
  quiz?: QuizItem[];
};
type ChunkResult = { data: QuizPayload; model: string };

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const statusOf = (err: unknown): number => {
  const s = (err as { status?: unknown })?.status;
  return typeof s === 'number' ? s : 500;
};

// ---------------------------------------------------------------------------
// Prompt + schema
// ---------------------------------------------------------------------------
const SYSTEM_INSTRUCTION = `You are an automated STEM tutor supporting UN SDG 4 (Quality Education). You convert engineering and mathematics lecture notes into practice quizzes with step-by-step solutions. RULES:
1. Use ONLY concepts present in the provided lecture notes. Do not introduce outside topics.
2. Generate exactly the number of questions requested, using the difficulty list given in the request, in that order (easy = recall, medium = apply, hard = multi-step).
3. Every question must have exactly one correct answer.
4. Multiple-choice distractors must reflect common student mistakes (sign errors, wrong formula, unit mix-ups), not random values.
5. Explanations must be step-by-step but concise: 3 to 5 steps per question, one short line each showing the operation and the result. Keep "common_mistake" to one sentence.
6. Write math in LaTeX using $...$ delimiters. Double-escape backslashes for valid JSON.
7. Verify every final answer by recomputing before output. If the notes are ambiguous or insufficient, set "notes_sufficient" to false and explain in "warnings".
8. Reject requests unrelated to generating a quiz from lecture notes. Respond with notes_sufficient=false and a warning.
9. Output ONLY valid JSON matching the schema. No markdown fences, no extra text.
10. Use clear, simple English suitable for undergraduate students.`;

const QUIZ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING },
    topic: { type: Type.STRING },
    notes_sufficient: { type: Type.BOOLEAN },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    quiz: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          difficulty: {
            type: Type.STRING,
            enum: ['easy', 'medium', 'hard'],
          },
          concept_tested: { type: Type.STRING },
          question: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: {
                  type: Type.STRING,
                  enum: ['A', 'B', 'C', 'D'],
                },
                text: { type: Type.STRING },
              },
              required: ['label', 'text'],
            },
          },
          correct_answer: {
            type: Type.STRING,
            enum: ['A', 'B', 'C', 'D'],
          },
          solution_steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                step: { type: Type.INTEGER },
                action: { type: Type.STRING },
                result: { type: Type.STRING },
              },
              required: ['step', 'action', 'result'],
            },
          },
          common_mistake: { type: Type.STRING },
        },
        required: [
          'id',
          'difficulty',
          'concept_tested',
          'question',
          'options',
          'correct_answer',
          'solution_steps',
          'common_mistake',
        ],
      },
    },
  },
  required: ['subject', 'topic', 'notes_sufficient', 'warnings', 'quiz'],
};

const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({
  category,
  threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
}));

// ---------------------------------------------------------------------------
// Gemini client
// ---------------------------------------------------------------------------
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });
}

// ---------------------------------------------------------------------------
// Quiz planning: difficulty list -> parallel chunks
// ---------------------------------------------------------------------------
const MIX_RATIOS: Record<Mix, [easy: number, hard: number]> = {
  Balanced: [1 / 3, 1 / 3], // medium takes the remainder
  'Easy-heavy': [0.5, 0.2],
  'Hard-heavy': [0.2, 0.5],
};

function planDifficulties(count: number, mix: Mix): Difficulty[] {
  const [easyShare, hardShare] = MIX_RATIOS[mix];
  const easy = Math.round(count * easyShare);
  const hard = Math.round(count * hardShare);
  const medium = Math.max(0, count - easy - hard);
  const rep = (d: Difficulty, n: number) => Array.from({ length: n }, () => d);
  return [...rep('easy', easy), ...rep('medium', medium), ...rep('hard', hard)].slice(0, count);
}

// Round-robin so every chunk gets a mix of difficulties.
function splitIntoChunks(difficulties: Difficulty[]): Difficulty[][] {
  const chunkCount = Math.max(1, Math.ceil(difficulties.length / QUESTIONS_PER_REQUEST));
  const chunks: Difficulty[][] = Array.from({ length: chunkCount }, () => []);
  difficulties.forEach((d, i) => chunks[i % chunkCount].push(d));
  return chunks;
}

function buildPrompt(opts: {
  subject: string;
  topic: string;
  notes: string;
  difficulties: Difficulty[];
  part: number;
  parts: number;
}): string {
  const { subject, topic, notes, difficulties, part, parts } = opts;
  const overlapHint =
    parts > 1
      ? `\nThis is part ${part} of ${parts}; the other parts are generated separately. To avoid overlap, draw your questions mainly from portion ${part} of ${parts} of the notes (by order) and test different concepts.`
      : '';

  return `Subject: ${subject}
Topic: ${topic}
Number of questions: ${difficulties.length}
Difficulty of each question, in order: ${difficulties.join(', ')}${overlapHint}

LECTURE NOTES:
"""
${notes}
"""

Generate the practice quiz.`;
}

// ---------------------------------------------------------------------------
// Generation: one chunk, with instant model fallback
// ---------------------------------------------------------------------------
async function generateChunk(
  ai: GoogleGenAI,
  models: string[],
  contents: string,
  thinkingLevel: string
): Promise<ChunkResult> {
  let lastError: unknown;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: QUIZ_RESPONSE_SCHEMA,
          safetySettings: SAFETY_SETTINGS,
          maxOutputTokens: 8192,
          // Cast keeps this compiling across SDK versions.
          thinkingConfig: { thinkingLevel } as any,
        },
      });

      if (response.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new HttpError(
          422,
          'The request was blocked by safety filters. Please verify your lecture notes contain academic content.'
        );
      }

      const text = (response.text ?? '').trim();
      if (!text) throw new HttpError(502, 'The tutor returned an empty response.');

      return { data: JSON.parse(text) as QuizPayload, model };
    } catch (err) {
      lastError = err;
      const skippable =
        err instanceof SyntaxError || [400, 404, 429, 502, 503, 504].includes(statusOf(err));
      console.warn(`[${model}] failed (status ${statusOf(err)}).`);
      if (!skippable) throw err;
      if (i < models.length - 1) console.warn(`Falling back to ${models[i + 1]}...`);
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Merge chunk results into one quiz
// ---------------------------------------------------------------------------
function mergeResults(
  results: ChunkResult[],
  count: number,
  subject: string,
  topic: string,
  failedChunks: number
) {
  const seen = new Set<string>();
  const quiz: QuizItem[] = [];

  for (const { data } of results) {
    for (const q of data.quiz ?? []) {
      const key = String(q.question).toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) continue; // drop exact duplicates across chunks
      seen.add(key);
      quiz.push(q);
    }
  }

  const finalQuiz = quiz.slice(0, count).map((q, i) => ({ ...q, id: i + 1 }));
  const warnings = Array.from(new Set(results.flatMap((r) => r.data.warnings ?? [])));

  if (failedChunks > 0) {
    warnings.push(
      `Only ${finalQuiz.length} of ${count} questions could be generated because Gemini was busy. Click Generate again for a full set.`
    );
  }

  return {
    subject: results[0]?.data.subject || subject,
    topic: results[0]?.data.topic || topic,
    notes_sufficient: results.every((r) => r.data.notes_sufficient !== false),
    warnings,
    quiz: finalQuiz,
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/generate-quiz', async (req, res) => {
    const startedAt = Date.now();

    try {
      const body = req.body ?? {};
      const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
      const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
      const notes = typeof body.notes === 'string' ? body.notes : '';
      const trimmedNotes = notes.trim();
      const rawCount = Number(body.count);
      const count = Number.isInteger(rawCount) && rawCount >= 1 && rawCount <= 15 ? rawCount : 5;
      const mix: Mix =
        body.mix === 'Easy-heavy' || body.mix === 'Hard-heavy' ? body.mix : 'Balanced';
      const hardMathMode = Boolean(body.hardMathMode);

      if (!trimmedNotes) {
        return res.status(400).json({
          error: 'Please paste or upload your lecture notes before generating a quiz.',
        });
      }

      if (notes.length > MAX_NOTES_LENGTH) {
        return res.status(400).json({
          error: `Lecture notes exceed the ${MAX_NOTES_LENGTH.toLocaleString()} character limit (${notes.length.toLocaleString()} characters provided). Please shorten the notes and try again.`,
        });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is not configured on the server. Please add your API key to the .env file and restart the server.',
        });
      }

      const safeSubject = subject || 'Engineering & Mathematics';
      const safeTopic = topic || 'Lecture Notes Review';
      const models = hardMathMode ? HARD_MATH_MODELS : FLASH_MODELS;
      const thinkingLevel = hardMathMode ? THINKING_HARD_MATH : THINKING_NORMAL;

      // Split into chunks and generate them all at the same time.
      const chunks = splitIntoChunks(planDifficulties(count, mix));
      const settled = await Promise.allSettled(
        chunks.map((difficulties, idx) =>
          generateChunk(
            ai,
            models,
            buildPrompt({
              subject: safeSubject,
              topic: safeTopic,
              notes: trimmedNotes,
              difficulties,
              part: idx + 1,
              parts: chunks.length,
            }),
            thinkingLevel
          )
        )
      );

      const results = settled
        .filter((s): s is PromiseFulfilledResult<ChunkResult> => s.status === 'fulfilled')
        .map((s) => s.value);

      // Every chunk failed -> surface the first error.
      if (results.length === 0) {
        const firstFailure = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult;
        throw firstFailure.reason;
      }

      const merged = mergeResults(
        results,
        count,
        safeSubject,
        safeTopic,
        settled.length - results.length
      );

      if (merged.quiz.length === 0 && merged.notes_sufficient) {
        return res.status(502).json({
          error: 'The tutor returned an empty response. Please try again.',
        });
      }

      const usedModels = Array.from(new Set(results.map((r) => r.model))).join(' + ');
      console.log(
        `Generated ${merged.quiz.length}/${count} questions in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (${usedModels}, ${chunks.length} parallel request${chunks.length > 1 ? 's' : ''}).`
      );

      return res.json({ raw: JSON.stringify(merged), model: usedModels });
    } catch (err: unknown) {
      const status = statusOf(err);

      if (status === 401 || status === 403) {
        return res.status(status).json({
          error:
            'Gemini API authentication failed. Please check your GEMINI_API_KEY in the .env file.',
        });
      }
      if (status === 429) {
        return res.status(429).json({
          error:
            'Rate limit reached. Please wait a few seconds and try again, or switch off Hard math mode.',
        });
      }
      if (status === 503 || status === 504) {
        return res.status(503).json({
          error: 'Gemini is busy right now. Please try again in a few seconds.',
        });
      }

      console.error('Error generating quiz:', err);
      const message =
        err instanceof HttpError ? err.message : 'Unable to generate quiz right now. Please try again.';
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    // Express 4 syntax ('/{*splat}' is Express 5 only)
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QuizForge server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});