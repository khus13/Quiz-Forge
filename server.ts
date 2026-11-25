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

const MAX_NOTES_LENGTH = 12000;
const PORT = Number(process.env.PORT) || 3000;

const SYSTEM_INSTRUCTION = `You are an automated STEM tutor supporting UN SDG 4 (Quality Education). You convert engineering and mathematics lecture notes into practice quizzes with step-by-step solutions. RULES:
1. Use ONLY concepts present in the provided lecture notes. Do not introduce outside topics.
2. Generate the requested number of questions, mixed across difficulty: easy (recall), medium (apply), hard (multi-step).
3. Every question must have exactly one correct answer.
4. Multiple-choice distractors must reflect common student mistakes (sign errors, wrong formula, unit mix-ups), not random values.
5. Explanations must be step-by-step: one step per array item, each showing the operation and the result. Do not skip algebra.
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
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/generate-quiz', async (req, res) => {
    try {
      const body = req.body ?? {};
      const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
      const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
      const notes = typeof body.notes === 'string' ? body.notes : '';
      const trimmedNotes = notes.trim();
      const rawCount = Number(body.count);
      const count = Number.isInteger(rawCount) && rawCount >= 1 && rawCount <= 15 ? rawCount : 5;
      const mix =
        body.mix === 'Easy-heavy' || body.mix === 'Hard-heavy' || body.mix === 'Balanced'
          ? body.mix
          : 'Balanced';
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
            'GEMINI_API_KEY is not configured on the server. Please add your API key in Settings > Secrets.',
        });
      }

      const safeSubject = subject || 'Engineering & Mathematics';
      const safeTopic = topic || 'Lecture Notes Review';
      const model = hardMathMode ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

      const contents = `Subject: ${safeSubject}
Topic: ${safeTopic}
Number of questions: ${count}
Difficulty mix: ${mix}

LECTURE NOTES:
"""
${trimmedNotes}
"""

Generate the practice quiz.`;

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.2,
          topP: 0.95,
          topK: 40,
          responseMimeType: 'application/json',
          responseSchema: QUIZ_RESPONSE_SCHEMA,
          safetySettings: SAFETY_SETTINGS,
        },
      });

      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY') {
        return res.status(422).json({
          error:
            'The request was blocked by safety filters. Please verify your lecture notes contain academic content.',
        });
      }

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        return res.status(502).json({
          error: 'The tutor returned an empty response. Please try again.',
        });
      }

      return res.json({ raw: rawText, model });
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      const status = typeof errorObj?.status === 'number' ? errorObj.status : 500;
      const message = errorObj?.message || 'Unable to generate quiz right now.';

      if (status === 401 || status === 403) {
        return res.status(status).json({
          error:
            'Gemini API authentication failed. Please check your GEMINI_API_KEY in Settings > Secrets.',
        });
      }
      if (status === 429) {
        return res.status(429).json({
          error:
            'Rate limit reached. Please wait a few seconds and try again, or switch off Hard math mode.',
        });
      }

      console.error('Error generating quiz:', err);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: message,
      });
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
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QuizForge server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
