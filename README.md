# QuizForge: AI-Powered STEM Tutor

A lightweight, mobile-first progressive web app (PWA) supporting **UN SDG 4 (Quality Education)**. QuizForge converts pasted engineering and mathematics lecture notes into multiple-choice practice quizzes with step-by-step LaTeX solutions rendered via KaTeX.

## Features

- **Notes-Grounded Quizzes**: Generates easy, medium, and hard multiple-choice questions using only concepts present in your lecture notes.
- **Step-by-Step Worked Solutions**: Displays numbered algebraic steps (`action → result`) and common student mistake callouts with KaTeX math rendering (`$...$`).
- **Two Gemini Models**: Uses `gemini-2.5-flash` by default for fast, low-bandwidth responses, with an optional **Hard math mode** toggle for `gemini-2.5-pro`.
- **Plain-Text Upload & Validation**: Supports `.txt` file uploads (10 MB file cap, 12,000-character notes limit) and checks whether notes are sufficient before generating questions.
- **Mobile-First & Light/Dark Ready**: Works cleanly on phones and desktop screens with offline-ready app shell caching.

## Environment Setup (`GEMINI_API_KEY`)

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Set your Gemini API key inside `.env` (or in the **Settings > Secrets** panel in AI Studio):
   ```env
   GEMINI_API_KEY="your_api_key_here"
   ```
   The API key is read strictly on the server (`server.ts`) via `process.env.GEMINI_API_KEY` and is never exposed to browser code.

## Files Excluded from Git

Per `.gitignore`, the following files and directories are **not committed** to version control:
- `.env` and any `.env*` files containing secrets (only `.env.example` is committed)
- `node_modules/`
- `dist/` and `build/`
- `coverage/`, `.DS_Store`, and `*.log`

## Local Development & Build

```bash
npm install
npm run dev      # Starts Express + Vite server on port 3000
npm run lint     # Runs TypeScript type-checking
npm run build    # Builds production bundle into dist/
npm run start    # Runs production server (after build)
```
