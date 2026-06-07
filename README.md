# Test Failure Intelligence

A self-hosted quality engineering platform for teams that need visibility into test suite health. It ingests test results, surfaces flaky tests, tracks failure trends across environments, and exposes execution history — giving engineering teams the data to act on test reliability rather than tolerate it.

## Prerequisites

- Node.js >= 22
- npm >= 10
- Docker Desktop or Docker Engine with the Compose plugin

## Local Setup

### Option A: Run services individually

This starts only PostgreSQL in Docker and runs the backend and frontend directly on your machine.

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

### Option B: Run all services with Docker Compose

This builds and runs the entire dev stack — PostgreSQL, backend, and frontend — in containers. Credentials and ports are hardcoded in `docker-compose.dev.yml`; no env var setup is required.

```bash
docker compose -f docker-compose.dev.yml up
```

The backend logs at `debug` level when started this way.

To stop:

```bash
docker compose -f docker-compose.dev.yml down
```

To stop and remove the database volume:

```bash
docker compose -f docker-compose.dev.yml down -v
```

## Running Tests

The backend has two test layers with different infrastructure needs:

- **Unit tests** (`tests/unit/`) — pure TypeScript, no database, run in parallel.
- **Integration tests** (`tests/integration/`) — exercise the real PostgreSQL repositories and Fastify route handlers against a dedicated `tfi_test` database. Run serially (`--runInBand`) to avoid cross-file truncation races on a shared database.

### One-time test database setup

The integration suite uses a separate `tfi_test` database alongside `tfi_dev`. Create it once per machine after starting the Docker Compose dev Postgres:

```bash
docker compose -f docker-compose.dev.yml up postgres -d
docker compose -f docker-compose.dev.yml exec postgres \
  psql -U tfi -d postgres -c "CREATE DATABASE tfi_test OWNER tfi"
```

The database is created empty; the first `npm run test:integration` run applies all migrations via the suite's `globalSetup`.

### Running the suites

```bash
cd backend

# Unit only — fast (~1s), no DB needed
npm run test:unit

# Integration only — requires tfi_test, ~5s
npm run test:integration

# Both, serially
npm test

# Coverage report (both layers)
npm run test:coverage
```

In CI, the workflow provisions an ephemeral `postgres:16-alpine` service container with `tfi_test` pre-created via the image's `POSTGRES_DB` env — no manual step required. See `.github/workflows/ci.yml`.

## npm Scripts

### Backend (`backend/`)

| Script | Description |
|---|---|
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
| `npm run format` | Format `src/` and `tests/` with Prettier |
| `npm run format:check` | Check formatting without writing |

### Frontend (`frontend/`)

| Script | Description |
|---|---|
| `npm run dev` | Start Next.js dev server with Turbopack |
| `npm run build` | Build for production |
| `npm start` | Run the production build |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Lint `src/` |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run format` | Format `src/` with Prettier |
| `npm run format:check` | Check formatting without writing |

## Environment Variables

### Backend

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string. Format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE` |
| `PORT` | No | `3001` | HTTP port the server listens on |
| `NODE_ENV` | No | `development` | Runtime environment. One of: `development`, `production`, `test` |
| `LOG_LEVEL` | No | `info` | Log verbosity. One of: `debug`, `info`, `warn`, `error` |

`DATABASE_URL` is required at startup. The server will not start without it.

Copy `backend/.env.example` to `backend/.env` to get started with local defaults.

### Frontend

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3001/api/v1` | Base URL for backend API requests. Set this in production to the deployed backend URL. |

## API Documentation

Swagger UI is available at `http://localhost:3001/documentation` when the backend is running. Full request and response schemas for every endpoint are auto-generated there.

### Projects (`/api/v1/projects`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/projects` | Create a project with a unique kebab-case `slug`, a `name`, and optional `description` |
| `GET` | `/api/v1/projects` | Paginated list of projects, newest first; supports `?page=` and `?limit=` |
| `GET` | `/api/v1/projects/:projectId` | Fetch a single project by id |
| `POST` | `/api/v1/projects/:projectId/ingest` | Ingest a test run — either a canonical JSON body (`Content-Type: application/json`) or a multipart upload of a Playwright, Jest, JUnit XML, or generic JSON report file |
| `GET` | `/api/v1/projects/:projectId/runs` | List a project's test runs, newest first; supports `?page=`, `?limit=`, optional `?status=SUCCESS\|FAILED\|PARTIAL` filter |
| `GET` | `/api/v1/projects/:projectId/runs/:runId` | Fetch a single test run by id |
| `GET` | `/api/v1/projects/:projectId/runs/:runId/cases` | List the test cases in a run (full case payloads, ordered by id) |
| `GET` | `/api/v1/projects/:projectId/flaky-tests` | Distinct tests classified `FLAKY` or `BROKEN` over a window; supports `?days=` (1–90, default 30) and `?limit=` (1–100, default 20) |
| `GET` | `/api/v1/projects/:projectId/failure-trends` | Daily or weekly pass-rate buckets; supports `?days=` (1–90, default 30) and `?bucketSize=day\|week` |
| `GET` | `/api/v1/projects/:projectId/health` | Aggregate `HEALTHY` / `WARNING` / `CRITICAL` verdict with pass and failure rates; supports `?days=` (1–90, default 30) |
| `GET` | `/api/v1/projects/:projectId/overview` | One-call dashboard payload: counts, recent pass rate, health status, top flaky tests, top failure patterns |
| `GET` | `/api/v1/projects/:projectId/failure-patterns` | List recorded failure patterns ordered by occurrence count; supports `?limit=` (1–100, default 50). MVP: writes are deferred to Phase 2, so this list is empty until pattern extraction lands |

All `/api/v1` responses use the standard envelope: `{ "data": ... }` on success or `{ "error": { "code", "message" } }` on failure. See [docs/architecture/http-layer.md](docs/architecture/http-layer.md) for envelope conventions and the error-code table, [docs/architecture/ingestion.md](docs/architecture/ingestion.md) for the ingestion adapter contract and supported source types, and [docs/architecture/analytics.md](docs/architecture/analytics.md) for the reliability classifier, health-evaluator thresholds, and aggregated SQL approach behind the analytics endpoints.

## Production Docker Compose

`docker-compose.yml` is for production deployments. It requires the following environment variables to be set before running:

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `DATABASE_URL` | Yes | Full PostgreSQL connection string for the backend |
| `POSTGRES_DB` | No | Database name (default: `tfi`) |
| `POSTGRES_USER` | No | Database user (default: `tfi`) |
| `BACKEND_PORT` | No | Host port for the backend (default: `3001`) |
| `FRONTEND_PORT` | No | Host port for the frontend (default: `3000`) |
| `NEXT_PUBLIC_API_URL` | No | Backend API URL seen by browsers (default: `http://localhost:3001/api/v1`) |
| `LOG_LEVEL` | No | Backend log level (default: `info`) |

## Project Structure

```
test-failure-intelligence/
├── backend/
│   ├── migrations/          # Database migrations (upcoming)
│   ├── src/
│   │   ├── database/
│   │   │   └── client.ts    # PostgreSQL connection pool
│   │   ├── domain/          # Domain layer (entities, ports, services)
│   │   ├── http/
│   │   │   ├── middleware/
│   │   │   ├── plugins/
│   │   │   │   └── swagger.ts
│   │   │   └── routes/
│   │   │       └── health.ts
│   │   ├── infrastructure/  # Repository and ingestion adapters
│   │   ├── use-cases/
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
│       └── lib/
│           └── api-client.ts
├── .github/
│   └── workflows/
│       └── ci.yml
├── docker-compose.dev.yml   # Local development stack
└── docker-compose.yml       # Production stack
```
