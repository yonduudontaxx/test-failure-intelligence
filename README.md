# Test Failure Intelligence

[![CI](https://github.com/yonduudontaxx/test-failure-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/yonduudontaxx/test-failure-intelligence/actions/workflows/ci.yml)

A self-hosted quality engineering platform that gives engineering teams visibility into test suite health. It ingests test results from Jest, Vitest, Playwright, and JUnit XML, then surfaces flaky tests, failure trends, environment stability, and execution history — so teams act on test reliability rather than tolerate it.

**Live test reports:** [https://yonduudontaxx.github.io/test-failure-intelligence/](https://yonduudontaxx.github.io/test-failure-intelligence/)

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Running Tests](#running-tests)
- [Test Reports](#test-reports)
- [API Documentation](#api-documentation)
- [Frontend Dashboard](#frontend-dashboard)
- [CI Integration](#ci-integration)
- [npm Scripts](#npm-scripts)
- [Environment Variables](#environment-variables)
- [Production Deployment](#production-deployment)
- [Project Structure](#project-structure)

---

## Prerequisites

- Node.js >= 22
- npm >= 10
- Docker Desktop or Docker Engine with the Compose plugin

---

## Local Setup

### Option A — Services individually

Runs only PostgreSQL in Docker; backend and frontend run directly on your machine.

```bash
# 1. Clone and enter the repo
git clone <repo-url>
cd test-failure-intelligence

# 2. Configure backend environment
cp backend/.env.example backend/.env

# 3. Install dependencies
cd backend && npm install
cd ../frontend && npm install
cd ..

# 4. Start PostgreSQL
docker compose -f docker-compose.dev.yml up postgres -d

# 5. Start backend (new terminal)
cd backend && npm run dev

# 6. Start frontend (new terminal)
cd frontend && npm run dev
```

Verify the backend is running:

```bash
curl http://localhost:3001/health
# {"status":"ok","database":"connected","timestamp":"..."}
```

Open `http://localhost:3000` for the dashboard.

### Option B — Full Docker Compose stack

Builds and runs PostgreSQL, backend, and frontend together. No env var setup required; credentials are hardcoded in `docker-compose.dev.yml`.

```bash
docker compose -f docker-compose.dev.yml up
```

The backend runs at `http://localhost:3001` and logs at `debug` level. The frontend runs at `http://localhost:3000`.

```bash
# Stop services
docker compose -f docker-compose.dev.yml down

# Stop and remove the database volume
docker compose -f docker-compose.dev.yml down -v
```

---

## Running Tests

### Backend

The backend has two test layers:

- **Unit tests** (`tests/unit/`) — pure TypeScript, no database, run in parallel.
- **Integration tests** (`tests/integration/`) — exercise real PostgreSQL repositories and Fastify route handlers against a dedicated `tfi_test` database. Run serially (`--runInBand`) to avoid cross-file truncation races.

**One-time test database setup** (local only — CI provisions it automatically):

```bash
docker compose -f docker-compose.dev.yml up postgres -d
docker compose -f docker-compose.dev.yml exec postgres \
  psql -U tfi -d postgres -c "CREATE DATABASE tfi_test OWNER tfi"
```

The first `npm run test:integration` run applies all migrations via the suite's `globalSetup`.

```bash
cd backend

# Unit only — fast (~1s), no DB needed
npm run test:unit

# Integration only — requires tfi_test
npm run test:integration

# Both, serially
npm test

# Coverage report
npm run test:coverage
```

### Frontend

```bash
cd frontend
npm test
```

Runs Vitest smoke tests (one renders-without-crashing assertion per page component).

---

## Test Reports

Every push to `main` or `develop` automatically generates an Allure HTML report and publishes it to GitHub Pages:

| Suite | URL |
|-------|-----|
| Backend (Jest) | https://yonduudontaxx.github.io/test-failure-intelligence/backend/ |
| Frontend (Vitest) | https://yonduudontaxx.github.io/test-failure-intelligence/frontend/ |

Reports update within ~2 minutes of each push. Each CI run also uploads the raw reports as downloadable artifacts (30-day retention) — find them on the Actions run page under **Artifacts**.

---

## API Documentation

Swagger UI is available at `http://localhost:3001/documentation` when the backend is running.

### Projects (`/api/v1/projects`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/projects` | Create a project with a unique kebab-case `slug`, a `name`, and optional `description` |
| `GET` | `/api/v1/projects` | Paginated list of projects, newest first; supports `?page=` and `?limit=` |
| `GET` | `/api/v1/projects/:projectId` | Fetch a single project by id |
| `POST` | `/api/v1/projects/:projectId/ingest` | Ingest a test run — JSON body or multipart upload (Playwright, Jest, JUnit XML, or generic JSON) |
| `GET` | `/api/v1/projects/:projectId/runs` | List test runs, newest first; `?status=SUCCESS\|FAILED\|PARTIAL`, `?page=`, `?limit=` |
| `GET` | `/api/v1/projects/:projectId/runs/:runId` | Fetch a single test run |
| `GET` | `/api/v1/projects/:projectId/runs/:runId/cases` | List test cases in a run, ordered by id |
| `GET` | `/api/v1/projects/:projectId/flaky-tests` | Tests classified `FLAKY` or `BROKEN`; `?days=` (1–90), `?limit=` (1–100) |
| `GET` | `/api/v1/projects/:projectId/failure-trends` | Daily or weekly pass-rate buckets; `?days=`, `?bucketSize=day\|week` |
| `GET` | `/api/v1/projects/:projectId/health` | `HEALTHY` / `WARNING` / `CRITICAL` verdict with `warnings` and `criticalIssues`; `?days=` |
| `GET` | `/api/v1/projects/:projectId/overview` | One-call dashboard payload: counts, pass rate, health status, top flaky tests, top failure patterns |
| `GET` | `/api/v1/projects/:projectId/failure-patterns` | Failure patterns ordered by occurrence count; `?limit=` (1–100) |

All responses use the envelope `{ "data": ... }` on success or `{ "error": { "code", "message" } }` on failure.

See [docs/architecture/http-layer.md](docs/architecture/http-layer.md), [docs/architecture/ingestion.md](docs/architecture/ingestion.md), and [docs/architecture/analytics.md](docs/architecture/analytics.md) for full detail.

---

## Frontend Dashboard

Seven pages built on Next.js 15 (App Router) + Tailwind CSS + Recharts:

| Page | Route |
|------|-------|
| Projects list | `/` |
| Project dashboard | `/projects/:id` |
| Run history | `/projects/:id/runs` |
| Run detail | `/projects/:id/runs/:runId` |
| Reliability report (flaky tests) | `/projects/:id/reliability` |
| Failure trends | `/projects/:id/trends` |
| Failure pattern explorer | `/projects/:id/patterns` |

```bash
cd frontend
npm run dev
# Open http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` before starting if the backend is not at `http://localhost:3001`:

```bash
NEXT_PUBLIC_API_URL=https://tfi.example.com npm run dev
```

See [docs/architecture/frontend.md](docs/architecture/frontend.md) for the full architecture guide.

---

## CI Integration

### Ingesting your own test results

Copy `.github/INGEST_TEMPLATE.yml` into your repository's `.github/workflows/` directory. It supports JUnit XML (Jest, Maven, Gradle, Go), Playwright JSON, and Vitest JSON. Set three repository variables to activate ingestion:

| Variable | Description |
|----------|-------------|
| `TFI_API_URL` | Base URL of your TFI backend (e.g. `https://tfi.example.com`) |
| `TFI_PROJECT_ID` | UUID of the TFI project to ingest into |
| `TFI_DASHBOARD_URL` | Base URL of your TFI frontend (used for the PR comment link) |

Set these under **Settings → Variables → Actions** in your repository.

### Self-dogfooding

This repository ingests its own backend unit test results into a live TFI instance on every push to `main` and `develop`, and posts a dashboard link on every pull request. See `.github/workflows/ingest.yml`.

---

## npm Scripts

### Backend (`backend/`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the server with live reload via tsx |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests only |
| `npm run test:coverage` | Run all tests with coverage report |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Lint `src/` and `tests/` |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run format` | Format with Prettier |
| `npm run format:check` | Check formatting without writing |

### Frontend (`frontend/`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server with Turbopack |
| `npm run build` | Build for production |
| `npm start` | Run the production build |
| `npm test` | Run Vitest smoke tests (CI mode) |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Lint `src/` |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run format` | Format with Prettier |
| `npm run format:check` | Check formatting without writing |

---

## Environment Variables

### Backend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE` |
| `PORT` | No | `3001` | HTTP port |
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, or `error` |

`DATABASE_URL` is required at startup. Copy `backend/.env.example` to `backend/.env` to get started locally.

### Frontend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3001/api/v1` | Backend API base URL. Set this in production to the deployed backend URL. |

---

## Production Deployment

`docker-compose.yml` runs the full production stack. Set the following before running:

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `DATABASE_URL` | Yes | Full PostgreSQL connection string for the backend |
| `POSTGRES_DB` | No | Database name (default: `tfi`) |
| `POSTGRES_USER` | No | Database user (default: `tfi`) |
| `BACKEND_PORT` | No | Host port for the backend (default: `3001`) |
| `FRONTEND_PORT` | No | Host port for the frontend (default: `3000`) |
| `NEXT_PUBLIC_API_URL` | No | Backend API URL seen by browsers (default: `http://localhost:3001/api/v1`) |
| `LOG_LEVEL` | No | Backend log level (default: `info`) |

```bash
docker compose up -d
```

---

## Project Structure

```
test-failure-intelligence/
├── backend/
│   ├── migrations/          # PostgreSQL migrations (node-pg-migrate)
│   ├── src/
│   │   ├── database/        # Connection pool
│   │   ├── domain/          # Entities, ports, domain services (zero external deps)
│   │   ├── http/            # Fastify routes, plugins, middleware
│   │   ├── infrastructure/  # Repository and ingestion adapters
│   │   ├── use-cases/       # Application use cases
│   │   ├── app.ts           # Fastify app factory
│   │   ├── config.ts        # Environment variable validation
│   │   └── index.ts         # Server entry point
│   └── tests/
│       ├── integration/
│       └── unit/
├── docker/                  # Dockerfiles for dev and production
├── frontend/
│   └── src/
│       ├── app/             # Next.js App Router pages
│       ├── components/      # UI, chart, and table components
│       └── lib/             # API client and type definitions
├── .github/
│   ├── INGEST_TEMPLATE.yml  # Reusable CI ingestion template
│   └── workflows/
│       ├── ci.yml           # Lint, typecheck, test, build, Allure report deploy
│       └── ingest.yml       # Self-dogfooding ingestion workflow
├── docs/
│   └── architecture/        # HTTP layer, ingestion, analytics, frontend guides
├── docker-compose.dev.yml   # Local development stack
└── docker-compose.yml       # Production stack
```
