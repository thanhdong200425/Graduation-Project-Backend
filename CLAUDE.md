# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
yarn start:dev          # Run in watch mode
yarn build              # Compile TypeScript to dist/
yarn start:prod         # Run compiled output

# Code quality
yarn lint               # ESLint with auto-fix
yarn format             # Prettier

# Tests
yarn test               # Unit tests
yarn test:watch         # Unit tests in watch mode
yarn test:cov           # Coverage report
yarn test:e2e           # End-to-end tests

# Database
yarn prisma:generate    # Regenerate Prisma client after schema changes
yarn prisma:migrate     # Run pending migrations
yarn prisma:studio      # Open Prisma Studio GUI
```

## Architecture

This is a NestJS backend for an AI-powered exam and question generation system. It exposes a REST API and uses a LangGraph workflow to generate multiple-choice questions from textbook content stored in a vector database.

### Module Overview

- **auth** — JWT authentication (register, login). Uses `JwtAuthGuard` and `JwtStrategy` (Passport). Emails are normalized (trim + lowercase); passwords hashed with bcrypt (10 rounds).
- **users** — User CRUD. `UsersService` exposes `safeUserSelect` to strip password hashes from responses.
- **exam-generation** — Core AI pipeline. Orchestrates LangGraph to generate questions.
- **questions** — CRUD for `GeneratedQuestion` records (status: DRAFT/APPROVED/REJECTED, difficulty: EASY/MEDIUM/HARD).
- **exams** — Exam management. `ExamsService.createComplete` uses a Prisma transaction to create an exam and link questions atomically.
- **exam-questions** — Junction table between `Exam` and `GeneratedQuestion` with ordering.
- **subjects / chapters** — Course content hierarchy (Subject → Chapter → TextbookChunk).
- **upload** — File upload handling.
- **prisma** — Singleton `PrismaService` wrapping PrismaClient with shutdown hooks.

### AI Question Generation Pipeline (`exam-generation/`)

The pipeline is implemented as a LangGraph state machine in `question-generation-graph.service.ts`:

1. **Build query** — Constructs a semantic search query from subject/chapter metadata.
2. **Retrieve chunks** — `ChapterRetrievalService` searches Qdrant for relevant `TextbookChunk` vectors.
3. **Grade chunks** — Calls an external FastAPI service (`FASTAPI_BASE_URL`) to rerank/score retrieved chunks.
4. **Build prompt** — `QuestionPromptService` assembles the LLM prompt with graded chunks.
5. **Generate** — Sends prompt to LLM (Ollama or Gemini, decided by `create-question-llm.factory.ts`).
6. **Validate** — `QuestionValidationService` parses and validates the JSON response.

The LLM provider is selected at startup via `MODEL_TYPE` env var (`OLLAMA` or `API`).

### Key Patterns

- **Global `ValidationPipe`** — Whitelist enabled, unknown properties forbidden, transform enabled (set in `main.ts`).
- **CORS** — Dynamic origin list parsed from `CORS_ORIGIN` env var (comma-separated), defaults to `http://localhost:5173`.
- **Transactions** — Use Prisma interactive transactions (`$transaction`) for multi-step writes.
- **DTOs** — All incoming request bodies use `class-validator` decorated DTO classes.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3344` | HTTP port |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `JWT_SECRET` | — | JWT signing secret (required) |
| `JWT_EXPIRES_IN` | `1d` | JWT expiry |
| `QDRANT_URL` | `localhost:6333` | Qdrant vector DB URL |
| `QDRANT_API_KEY` | — | Qdrant API key |
| `QDRANT_COLLECTION` | `textbook_chunks` | Collection name |
| `MODEL_TYPE` | `OLLAMA` | `OLLAMA` or `API` (Gemini) |
| `OLLAMA_BASE_URL` | `localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.1` | Ollama chat model |
| `OLLAMA_EMBED_MODEL` | `all-minilm` | Ollama embedding model |
| `OLLAMA_TEMPERATURE` | `0.2` | Generation temperature |
| `GEMINI_API_KEY` | — | Google Gemini API key (if `MODEL_TYPE=API`) |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini model name |
| `GEMINI_EMBEDDING_MODEL` | `text-embedding-004` | Gemini embedding model |
| `FASTAPI_BASE_URL` | — | Chunk reranking service URL |

## External Services (Docker Compose)

The project ships a `docker-compose.yml` with three services:

- **PostgreSQL 16** — Primary relational database
- **Qdrant** — Vector database for semantic chunk retrieval
- **MongoDB 7** — Included but not actively used in the current codebase

## Database Schema Highlights

- `TextbookChunk` — RAG source material with `lesson`, `topic`, and `keywords` fields.
- `GeneratedQuestion` — Multiple-choice (options A–D), `DifficultyLevel` enum, `QuestionStatus` enum.
- `Exam` — Stores difficulty distribution counts (`easyCount`, `mediumCount`, `hardCount`).
- `ExamQuestion` — Junction with `orderIndex` for question ordering within an exam.

After modifying `prisma/schema.prisma`, always run `yarn prisma:generate` to update the client, and `yarn prisma:migrate` to create the migration.
