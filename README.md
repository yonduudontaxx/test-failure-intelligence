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

Tests run without a database connection. All integration tests mock the database layer.

```bash
cd backend

# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage report
npm run test:coverage
```

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

Swagger UI is available at `http://localhost:3001/documentation` when the backend is running.

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
