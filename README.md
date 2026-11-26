# QuizForge: AI-Powered STEM Tutor

QuizForge turns pasted engineering and mathematics lecture notes into multiple-choice practice quizzes with step-by-step worked solutions, rendered with LaTeX (KaTeX). It is a mobile-first progressive web app (PWA) supporting **UN SDG 4 (Quality Education)**.

---

## 1. What it does

| Feature | Details |
|---|---|
| Notes-grounded quizzes | Questions use only concepts found in the pasted notes |
| Worked solutions | 3 to 5 concise steps per question (`action -> result`) plus a "common mistake" callout |
| LaTeX math | Equations written as `$...$` render through KaTeX |
| Quiz controls | 3, 5, 8, or 10 questions; Balanced, Easy-heavy, or Hard-heavy difficulty mix |
| Hard math mode | Uses a stronger model with more reasoning for multi-step derivations |
| Input options | Paste notes (max 12,000 characters) or upload a `.txt` file (max 10 MB) |
| Sample notes | One-click samples: Calculus (Integration by Parts), Circuits (KVL & KCL), Discrete Math (Modular Arithmetic) |
| Sufficiency check | Warns when the notes are too thin to build a reliable quiz |
| PWA | Installable, offline app shell, light/dark theme |
| Secure API key | The Gemini key stays on the server and is never sent to the browser |

### How generation works

1. The browser sends subject, topic, notes, question count, mix, and Hard math mode to `POST /api/generate-quiz`.
2. The server splits the quiz into small batches (up to 4 questions each) and generates them **in parallel**.
3. Each batch uses **low thinking** (medium in Hard math mode) to keep responses fast.
4. If a model is busy or unavailable, the server moves to the next model immediately:
   - Normal: `gemini-3.6-flash` -> `gemini-3.5-flash` -> `gemini-3.1-flash-lite`
   - Hard math: `gemini-3.1-pro-preview` -> `gemini-3.8-flash` -> `gemini-3.6-flash`
5. Results are merged, duplicates removed, and returned as one quiz. If one batch fails, the rest are still returned with a warning.

The terminal prints a timing line after each quiz, for example:
`Generated 10/10 questions in 7.2s (gemini-3.6-flash, 3 parallel requests).`

---

## 2. How to access it

### Requirements
- Node.js 20.11 or newer
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### Run locally
```bash
git clone https://github.com/khus13/Quiz-Forge.git
cd Quiz-Forge
npm install
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```

Open `.env` and set your key:
```env
GEMINI_API_KEY="your_api_key_here"
```

Start the app:
```bash
npm run dev
```

Then open **http://localhost:3000** in your browser.

> Do not open `http://0.0.0.0:3000`. `0.0.0.0` is the address the server listens on, not a browsable address, and Chrome shows `ERR_ADDRESS_INVALID`.

### Production build
```bash
npm run build     # builds the app into dist/
npm start         # serves dist/ with the Express server
```
The install button and offline mode work in the production build (the service worker is off in dev mode).

### Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | Express + Vite dev server on port 3000 |
| `npm run build` | Production build into `dist/` |
| `npm start` | Production server |
| `npm run preview` | Preview the Vite build |
| `npm run lint` | TypeScript type-check |

### Project layout
```
server.ts              Express API + Gemini calls
vite.config.ts         Vite, Tailwind, PWA setup
src/
  App.tsx              Main screen
  main.tsx             Entry point
  components/          QuizCard, ScoreSummary, MathText, OfflineIndicator, PWAInstallButton
  data/samples.ts      Sample lecture notes
  hooks/               useOnlineStatus, usePWAInstall
  types/               Shared types
```

### Files excluded from Git
`.env` (and other `.env*` files except `.env.example`), `node_modules/`, `dist/`, `dev-dist/`, logs.

---

## 3. Missing pages and features (not built yet)

QuizForge currently has **one screen** and one quiz format (multiple choice). Nothing is saved between sessions.

| # | Missing item | Purpose | What it needs |
|---|---|---|---|
| 1 | **Login / Sign Up** | Let students sign in to keep quizzes and progress | Auth provider (for example Firebase Auth, Supabase Auth, or Auth.js), login page, protected routes, session handling |
| 2 | **Create Account** | Registration and profile setup | Form with name, email, password, and confirmation; validation; email verification; password reset |
| 3 | **Folder for each subject** | Organize saved quizzes by subject (Algebra, Calculus, Circuits, ...) | Create, rename, and delete folders; save a generated quiz into a folder; list, reopen, and retake. Start with `localStorage`, then move to a database tied to the account. The existing Subject field can pick the default folder |
| 4 | **Flash Cards** | Front/back study cards with flip and "known / review again" | New quiz format, schema in `server.ts`, `FlashCard` component |
| 5 | **True or False** | Quick statement-based checks | New schema (statement + true/false + short explanation), `TrueFalseCard` component |
| 6 | **Fill in the Blanks** | Recall practice with typed answers | New schema (sentence with blank + accepted answers), answer normalization (case, spaces, equivalent forms), `FillBlankCard` component |

For items 4 to 6, the work is the same pattern: add a **format selector** to the form, send a `format` field to the server, add a response schema and prompt per format, and build one UI component per format.

### Suggested build order
1. Quiz formats (4 to 6): self-contained and need no login.
2. Subject folders using `localStorage`: gives saved quizzes without a backend.
3. Login / Sign Up and Create Account (1 and 2).
4. Move folders from `localStorage` to the database so they follow the account.

---

## 4. What went wrong previously and what changed

| # | Problem | Cause | Fix |
|---|---|---|---|
| 1 | `ERR_ADDRESS_INVALID` in Chrome | The app was opened at `0.0.0.0:3000`, which is a bind address, not a destination | Open `localhost:3000`; the startup log now prints the `localhost` link |
| 2 | "GEMINI_API_KEY is not configured" | The server did not load `.env`, and the message pointed to AI Studio's "Settings > Secrets", which does not exist locally | Added `import 'dotenv/config'` and the `dotenv` dependency; error messages now point to `.env` |
| 3 | 404: `gemini-2.5-pro` and `gemini-2.5-flash` no longer available | Google retired these models for new API users | Switched to current models with a fallback chain (see section 1) |
| 4 | `model is not defined` | A code edit removed the line that declared `model` | Model selection is now handled inside the generation function |
| 5 | 503 "high demand" | The newest model was overloaded | Automatic fallback to the next model, with no waiting between attempts |
| 6 | Request spinning for 30+ minutes | No timeout on the Gemini call | 40-second limit per attempt, then fallback |
| 7 | 504 `DEADLINE_EXCEEDED` | One large request with long solutions, while Gemini 3 models think at high effort by default | Low thinking level, parallel batches of up to 4 questions, shorter solutions, and 504 now triggers fallback |
| 8 | Production build would show a blank page for routes | The catch-all route used Express 5 syntax on Express 4 | Changed to `app.get('*', ...)` |
| 9 | `npm start` did not run in production mode; `clean` script failed on Windows | `node server.ts` without `NODE_ENV`; `rm -rf` is not available in PowerShell | `start` now uses `cross-env` + `tsx`; `clean` script removed |
| 10 | Unused or stale setup slowing the project | AI Studio leftovers in `vite.config.ts`, unused `autoprefixer` and `esbuild`, duplicate `bun.lock`, dev service worker caching stale pages | Removed them; the dev service worker is now off |
| 11 | `dev-dist/` staged in Git; push rejected | Generated PWA folder not ignored; remote had newer commits | `dev-dist/` added to `.gitignore`; use `git pull --rebase` before `git push` |

### Known issues
- The **Hard math mode** toggle label in the UI may still say "Gemini 2.5". It is only text; the server uses the models listed in section 1.
- Questions appear only after the whole quiz is ready. Showing them as each batch finishes would need a change in `src/App.tsx`.

---

## 5. Security notes
- Keep `.env` out of Git. Only `.env.example` should be committed.
- If an API key is ever shown in a screenshot, chat, or commit, revoke it in Google AI Studio and create a new one.
- The key is read only in `server.ts` through `process.env.GEMINI_API_KEY`.
