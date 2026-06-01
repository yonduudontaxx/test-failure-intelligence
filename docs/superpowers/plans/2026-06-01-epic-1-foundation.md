# Epic 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a fully configured, runnable monorepo scaffold for the Test Failure Intelligence Platform with a working Fastify backend, Next.js frontend, PostgreSQL container, Docker Compose environments, passing linting and type checks, a green Jest suite, and a passing GitHub Actions CI pipeline — with zero business logic implemented.

**Architecture:** Layered monolith per the approved design spec. The backend is a Fastify TypeScript application. The frontend is a standalone Next.js App Router application. PostgreSQL runs in Docker. No domain entities, repositories, use cases, or ingestion adapters are created in this epic — only the project scaffold, tooling, and infrastructure that all future epics build on.

**Tech Stack:** Fastify 5, Next.js 15, TypeScript 5, PostgreSQL 16 (Docker), Jest 29 + ts-jest, ESLint 9 (flat config), Prettier 3, Docker Compose, GitHub Actions

**Reference:** `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md`

---

## File Map

All files created in this epic. No files outside this list should be created.

```
# Root
.gitignore                                    (update — expand coverage)

# Docker infrastructure
docker-compose.dev.yml
docker-compose.yml
docker/backend.Dockerfile
docker/frontend.Dockerfile

# CI
.github/workflows/ci.yml

# Backend
backend/package.json
backend/tsconfig.json
backend/tsconfig.build.json
backend/eslint.config.js
backend/.prettierrc
backend/.prettierignore
backend/jest.config.ts
backend/.env.example
backend/src/index.ts
backend/src/app.ts
backend/src/config.ts
backend/src/database/client.ts
backend/src/http/plugins/swagger.ts
backend/src/http/routes/health.ts
backend/tests/unit/.gitkeep
backend/tests/integration/health.test.ts
backend/tests/e2e/.gitkeep

# Frontend
frontend/package.json
frontend/tsconfig.json
frontend/next.config.ts
frontend/eslint.config.js
frontend/.prettierrc
frontend/.prettierignore
frontend/.env.example
frontend/src/app/layout.tsx
frontend/src/app/page.tsx
frontend/src/lib/api-client.ts
frontend/src/components/.gitkeep
```

---

## Epic 1: Foundation

---

### Story 1.1 — Repository Scaffolding

---

#### Task 1: Establish directory structure and root .gitignore

**Objective:**
Create all top-level directories required by the approved architecture and update `.gitignore` to cover Node.js, TypeScript build output, Next.js, Docker, and environment files. This establishes the skeleton that all subsequent tasks build into.

**Dependencies Added:**
None.

**Files Created:**
- `backend/` (directory)
- `backend/src/` (directory)
- `backend/src/http/routes/` (directory)
- `backend/src/http/middleware/` (directory)
- `backend/src/http/plugins/` (directory)
- `backend/src/use-cases/` (directory)
- `backend/src/domain/entities/` (directory)
- `backend/src/domain/enums/` (directory)
- `backend/src/domain/ports/` (directory)
- `backend/src/domain/services/` (directory)
- `backend/src/infrastructure/ingestion/` (directory)
- `backend/src/infrastructure/repositories/` (directory)
- `backend/src/database/` (directory)
- `backend/migrations/` (directory)
- `backend/tests/unit/` (directory)
- `backend/tests/integration/` (directory)
- `backend/tests/e2e/` (directory)
- `frontend/` (directory)
- `frontend/src/app/` (directory)
- `frontend/src/components/charts/` (directory)
- `frontend/src/components/tables/` (directory)
- `frontend/src/components/ui/` (directory)
- `frontend/src/lib/` (directory)
- `docker/` (directory)
- `.github/workflows/` (directory)

**Files Modified:**
- `.gitignore`

**`.gitignore` must cover:**
```
# Dependencies
node_modules/
.pnp
.pnp.js

# TypeScript build output
dist/
build/
*.tsbuildinfo

# Next.js
.next/
out/

# Environment files
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# Docker
docker-compose.override.yml

# IDE
.idea/
.vscode/
*.swp
*.swo

# Test coverage
coverage/
```

**Steps:**
- [ ] Create all directories listed above using `mkdir -p` for each path
- [ ] Add `.gitkeep` files to empty leaf directories so git tracks them: `backend/tests/unit/`, `backend/tests/e2e/`, `backend/migrations/`, `backend/src/use-cases/`, `backend/src/domain/entities/`, `backend/src/domain/enums/`, `backend/src/domain/ports/`, `backend/src/domain/services/`, `backend/src/infrastructure/ingestion/`, `backend/src/infrastructure/repositories/`, `backend/src/http/middleware/`, `frontend/src/components/charts/`, `frontend/src/components/tables/`, `frontend/src/components/ui/`
- [ ] Update `.gitignore` with all entries listed above
- [ ] Run `git status` and verify only the new directories and updated `.gitignore` appear
- [ ] Verify directory structure matches `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md` Section 2

**Acceptance Criteria:**
- [ ] `git status` shows the new directories tracked via `.gitkeep` files
- [ ] `.gitignore` covers `node_modules/`, `dist/`, `.next/`, `.env`, `coverage/`
- [ ] No `.DS_Store` or IDE files appear in `git status`
- [ ] Directory tree matches the approved spec repository structure exactly

**Commit Message:**
```
chore: establish repository directory structure
```

---

### Story 1.2 — Backend Project Setup

---

#### Task 2: Initialize backend TypeScript project

**Objective:**
Create `backend/package.json` with all runtime and development dependencies, define npm scripts for dev, build, and start, and configure TypeScript for strict Node.js development. At the end of this task `tsc --noEmit` must pass on an empty `src/index.ts`.

**Dependencies Added:**

Runtime:
```
fastify@^5.0.0
@fastify/sensible@^6.0.0
@fastify/cors@^10.0.0
pg@^8.13.0
dotenv@^16.4.0
```

Development:
```
typescript@^5.7.0
tsx@^4.19.0
@types/node@^22.0.0
@types/pg@^8.11.0
```

**Files Created:**
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/tsconfig.build.json`

**Files Modified:**
None.

**`backend/package.json` scripts block:**
```json
{
  "name": "test-failure-intelligence-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

**`backend/tsconfig.json`** (used for IDE and typechecking — includes tests):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**`backend/tsconfig.build.json`** (used for production build — excludes tests):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Steps:**
- [ ] `cd backend && npm init -y` to create initial package.json
- [ ] Install runtime dependencies: `npm install fastify @fastify/sensible @fastify/cors pg dotenv`
- [ ] Install dev dependencies: `npm install -D typescript tsx @types/node @types/pg`
- [ ] Replace the generated `package.json` contents with the structure above (including scripts, `"type": "module"`, and `"engines"`)
- [ ] Create `backend/tsconfig.json` with contents above
- [ ] Create `backend/tsconfig.build.json` with contents above
- [ ] Create a minimal `backend/src/index.ts` containing only `export {};` (no logic — just satisfies the compiler)
- [ ] Run `cd backend && npm run typecheck` and verify it exits 0 with no errors
- [ ] Run `cd backend && npm run build` and verify `dist/` is produced

**Acceptance Criteria:**
- [ ] `cd backend && npm run typecheck` exits 0
- [ ] `cd backend && npm run build` exits 0 and produces `backend/dist/index.js`
- [ ] `package.json` has `"type": "module"` — the project uses ES modules throughout
- [ ] `tsconfig.json` has `"strict": true`
- [ ] `tsconfig.build.json` excludes `tests/` so tests do not end up in `dist/`

**Commit Message:**
```
chore(backend): initialize TypeScript project
```

---

#### Task 3: Add ESLint and Prettier to backend

**Objective:**
Configure ESLint 9 with the flat config format and `typescript-eslint` for TypeScript-aware linting. Add Prettier for deterministic formatting. Wire both into npm scripts. The configuration must enforce no-any, consistent imports, and catch common TypeScript mistakes without being so strict it blocks development.

**Dependencies Added:**

Development:
```
eslint@^9.0.0
typescript-eslint@^8.0.0
eslint-config-prettier@^9.0.0
prettier@^3.4.0
```

**Files Created:**
- `backend/eslint.config.js`
- `backend/.prettierrc`
- `backend/.prettierignore`

**Files Modified:**
- `backend/package.json` — add `lint`, `lint:fix`, `format`, and `format:check` scripts

**`backend/eslint.config.js`:**
```js
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  }
);
```

**`backend/.prettierrc`:**
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**`backend/.prettierignore`:**
```
dist/
node_modules/
coverage/
```

**Scripts to add to `backend/package.json`:**
```json
"lint": "eslint src tests",
"lint:fix": "eslint src tests --fix",
"format": "prettier --write src tests",
"format:check": "prettier --check src tests"
```

**Steps:**
- [ ] Install dev dependencies: `npm install -D eslint typescript-eslint eslint-config-prettier prettier`
- [ ] Create `backend/eslint.config.js` with the contents above
- [ ] Create `backend/.prettierrc` with the contents above
- [ ] Create `backend/.prettierignore` with the contents above
- [ ] Add the four scripts (`lint`, `lint:fix`, `format`, `format:check`) to `backend/package.json`
- [ ] Run `cd backend && npm run lint` — verify it exits 0
- [ ] Run `cd backend && npm run format:check` — verify it exits 0
- [ ] Run `cd backend && npm run typecheck` — verify it still exits 0 (ESLint config must not break TypeScript)

**Acceptance Criteria:**
- [ ] `cd backend && npm run lint` exits 0 with no warnings or errors
- [ ] `cd backend && npm run format:check` exits 0
- [ ] `cd backend && npm run typecheck` still exits 0
- [ ] `eslint.config.js` uses ESLint 9 flat config format (no `.eslintrc.js`)
- [ ] `@typescript-eslint/no-explicit-any` is set to `'error'`
- [ ] `eslint-config-prettier` is last in the config chain (disables formatting rules that conflict with Prettier)

**Commit Message:**
```
chore(backend): add ESLint and Prettier
```

---

#### Task 4: Configure Jest with ts-jest

**Objective:**
Set up Jest as the test runner for the backend with `ts-jest` for TypeScript transformation. Configure separate test path patterns for unit, integration, and e2e tests so they can be run independently. At the end of this task `npm test` must exit 0 (with a "no tests found" or skipped suite — not a configuration error).

**Dependencies Added:**

Development:
```
jest@^29.7.0
ts-jest@^29.2.0
@types/jest@^29.5.0
```

**Files Created:**
- `backend/jest.config.ts`

**Files Modified:**
- `backend/package.json` — add `test`, `test:unit`, and `test:integration` scripts

**`backend/jest.config.ts`:**
```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
      },
    ],
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
};

export default config;
```

**Scripts to add to `backend/package.json`:**
```json
"test": "jest",
"test:unit": "jest --testPathPattern=tests/unit",
"test:integration": "jest --testPathPattern=tests/integration",
"test:coverage": "jest --coverage"
```

**Steps:**
- [ ] Install dev dependencies: `npm install -D jest ts-jest @types/jest`
- [ ] Create `backend/jest.config.ts` with the contents above
- [ ] Add the four test scripts to `backend/package.json`
- [ ] Run `cd backend && npm test` — verify it exits 0 (no tests found is acceptable at this stage)
- [ ] Verify `npm run typecheck` still exits 0 (jest.config.ts must type-check cleanly)

**Acceptance Criteria:**
- [ ] `cd backend && npm test` exits 0
- [ ] `cd backend && npm run test:unit` exits 0
- [ ] `cd backend && npm run test:integration` exits 0
- [ ] `cd backend && npm run typecheck` exits 0 (including `jest.config.ts`)
- [ ] `jest.config.ts` is configured for ESM (`preset: 'ts-jest/presets/default-esm'`) to match `"type": "module"` in `package.json`

**Commit Message:**
```
chore(backend): configure Jest with ts-jest
```

---

### Story 1.3 — Frontend Project Setup

---

#### Task 5: Initialize Next.js TypeScript project

**Objective:**
Bootstrap the Next.js 15 App Router frontend project. Configure TypeScript strictly. Create the root layout and a minimal home page that renders without errors. Create the `api-client.ts` skeleton in `src/lib/`.

**Dependencies Added:**

Runtime:
```
next@^15.0.0
react@^19.0.0
react-dom@^19.0.0
```

Development:
```
typescript@^5.7.0
@types/node@^22.0.0
@types/react@^19.0.0
@types/react-dom@^19.0.0
```

**Files Created:**
- `frontend/package.json`
- `frontend/tsconfig.json`
- `frontend/next.config.ts`
- `frontend/src/app/layout.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/lib/api-client.ts`

**Files Modified:**
None.

**`frontend/package.json` scripts block:**
```json
{
  "name": "test-failure-intelligence-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

**`frontend/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**`frontend/next.config.ts`:**
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

**`frontend/src/app/layout.tsx`** must:
- Be a valid React Server Component
- Export a default `RootLayout` component that accepts `{ children: React.ReactNode }`
- Wrap children in `<html lang="en">` and `<body>` tags
- Export a `metadata` constant of type `Metadata` with `title: 'Test Failure Intelligence'` and `description: 'Quality engineering platform for analyzing test failures'`

**`frontend/src/app/page.tsx`** must:
- Be a valid React Server Component
- Export a default `HomePage` component
- Render a heading with text "Test Failure Intelligence" and a subheading indicating the platform status
- This page will be replaced in Epic 6; it exists only to prove the app builds and renders

**`frontend/src/lib/api-client.ts`** must:
- Export `API_BASE_URL` as a `const string` derived from `process.env.NEXT_PUBLIC_API_URL` with a fallback of `'http://localhost:3001/api/v1'`
- Export no functions at this stage — they will be added in Epic 6
- Add a comment indicating that typed fetch helpers will be added per endpoint as features are implemented

**Steps:**
- [ ] `cd frontend && npm init -y`
- [ ] Install runtime dependencies: `npm install next react react-dom`
- [ ] Install dev dependencies: `npm install -D typescript @types/node @types/react @types/react-dom`
- [ ] Replace `package.json` with the structure above
- [ ] Create `frontend/tsconfig.json` with contents above
- [ ] Create `frontend/next.config.ts` with contents above
- [ ] Create `frontend/src/app/layout.tsx` per the contract above
- [ ] Create `frontend/src/app/page.tsx` per the contract above
- [ ] Create `frontend/src/lib/api-client.ts` per the contract above
- [ ] Run `cd frontend && npm run typecheck` and verify it exits 0
- [ ] Run `cd frontend && npm run build` and verify it exits 0 and produces `.next/`

**Acceptance Criteria:**
- [ ] `cd frontend && npm run typecheck` exits 0
- [ ] `cd frontend && npm run build` exits 0
- [ ] `frontend/src/app/layout.tsx` exports `metadata` and a default `RootLayout` component
- [ ] `frontend/src/lib/api-client.ts` exports `API_BASE_URL`
- [ ] `tsconfig.json` has `"strict": true`

**Commit Message:**
```
chore(frontend): initialize Next.js App Router project
```

---

#### Task 6: Add ESLint and Prettier to frontend

**Objective:**
Configure ESLint for Next.js using `eslint-config-next` and the flat config format. Add Prettier with the same formatting rules as the backend. Wire lint and format scripts into `package.json`.

**Dependencies Added:**

Development:
```
eslint@^9.0.0
eslint-config-next@^15.0.0
eslint-config-prettier@^9.0.0
prettier@^3.4.0
```

**Files Created:**
- `frontend/eslint.config.js`
- `frontend/.prettierrc`
- `frontend/.prettierignore`

**Files Modified:**
- `frontend/package.json` — add `lint`, `lint:fix`, `format`, and `format:check` scripts

**`frontend/eslint.config.js`:**
```js
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  eslintConfigPrettier,
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
];
```

Note: `eslint-config-next` uses the legacy config format internally; `FlatCompat` bridges it to flat config. Also install `@eslint/eslintrc` as a dev dependency for `FlatCompat`:
```
@eslint/eslintrc@^3.0.0
```

**`frontend/.prettierrc`:** identical content to `backend/.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**`frontend/.prettierignore`:**
```
.next/
node_modules/
out/
```

**Scripts to add to `frontend/package.json`:**
```json
"lint": "eslint src",
"lint:fix": "eslint src --fix",
"format": "prettier --write src",
"format:check": "prettier --check src"
```

**Steps:**
- [ ] Install dev dependencies: `npm install -D eslint eslint-config-next eslint-config-prettier @eslint/eslintrc prettier`
- [ ] Create `frontend/eslint.config.js` with the contents above
- [ ] Create `frontend/.prettierrc` with the contents above
- [ ] Create `frontend/.prettierignore` with the contents above
- [ ] Add the four scripts to `frontend/package.json`
- [ ] Run `cd frontend && npm run lint` and verify it exits 0
- [ ] Run `cd frontend && npm run format:check` and verify it exits 0
- [ ] Run `cd frontend && npm run typecheck` and verify it still exits 0

**Acceptance Criteria:**
- [ ] `cd frontend && npm run lint` exits 0
- [ ] `cd frontend && npm run format:check` exits 0
- [ ] `cd frontend && npm run typecheck` exits 0
- [ ] `eslint.config.js` uses flat config format with `FlatCompat` for `next/core-web-vitals`
- [ ] `eslint-config-prettier` is last in the config array (disables conflicting formatting rules)

**Commit Message:**
```
chore(frontend): add ESLint and Prettier
```

---

### Story 1.4 — Docker Infrastructure

---

#### Task 7: Docker Compose development configuration

**Objective:**
Create `docker-compose.dev.yml` for local development. It runs PostgreSQL on a stable port, mounts backend and frontend source directories for live reload, and exposes all ports needed for local development. Developers run `docker compose -f docker-compose.dev.yml up` to get a complete local environment.

**Dependencies Added:**
None. Docker must be installed on the host machine.

**Files Created:**
- `docker-compose.dev.yml`

**Files Modified:**
None.

**`docker-compose.dev.yml`:**
```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: tfi-postgres-dev
    restart: unless-stopped
    environment:
      POSTGRES_DB: tfi_dev
      POSTGRES_USER: tfi
      POSTGRES_PASSWORD: tfi_dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tfi -d tfi_dev"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: ../docker/backend.Dockerfile
      target: development
    container_name: tfi-backend-dev
    restart: unless-stopped
    environment:
      NODE_ENV: development
      PORT: 3001
      DATABASE_URL: postgresql://tfi:tfi_dev_password@postgres:5432/tfi_dev
      LOG_LEVEL: debug
    ports:
      - "3001:3001"
    volumes:
      - ./backend/src:/app/src
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: ../docker/frontend.Dockerfile
      target: development
    container_name: tfi-frontend-dev
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001/api/v1
    ports:
      - "3000:3000"
    volumes:
      - ./frontend/src:/app/src
    depends_on:
      - backend

volumes:
  postgres_dev_data:
```

**Steps:**
- [ ] Create `docker-compose.dev.yml` with the contents above
- [ ] Run `docker compose -f docker-compose.dev.yml up postgres -d` — verify PostgreSQL starts
- [ ] Run `docker compose -f docker-compose.dev.yml exec postgres pg_isready -U tfi -d tfi_dev` — verify it reports "accepting connections"
- [ ] Run `docker compose -f docker-compose.dev.yml down -v` to clean up

**Acceptance Criteria:**
- [ ] `docker compose -f docker-compose.dev.yml up postgres -d` starts PostgreSQL on port 5432
- [ ] The health check passes: `pg_isready -U tfi -d tfi_dev` returns "accepting connections"
- [ ] The `postgres_dev_data` named volume persists data between container restarts
- [ ] The `backend` service `depends_on` PostgreSQL with `condition: service_healthy`
- [ ] The `DATABASE_URL` environment variable in the backend service correctly points to the PostgreSQL service by its service name (`postgres`), not `localhost`

**Commit Message:**
```
chore: add Docker Compose development configuration
```

---

#### Task 8: Docker Compose production configuration and Dockerfiles

**Objective:**
Create multi-stage Dockerfiles for both backend and frontend that produce minimal production images. Create `docker-compose.yml` for production deployment. The development stages in each Dockerfile are referenced by `docker-compose.dev.yml`; the production stages are used in `docker-compose.yml`.

**Dependencies Added:**
None.

**Files Created:**
- `docker-compose.yml`
- `docker/backend.Dockerfile`
- `docker/frontend.Dockerfile`

**Files Modified:**
None.

**`docker/backend.Dockerfile`:**
```dockerfile
# Development stage
FROM node:22-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]

# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

**`docker/frontend.Dockerfile`:**
```dockerfile
# Development stage
FROM node:22-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production stage
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

Note: The frontend production stage uses Next.js standalone output. Add `output: 'standalone'` to `frontend/next.config.ts` in the `NextConfig` object.

**`docker-compose.yml`:**
```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: tfi-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-tfi}
      POSTGRES_USER: ${POSTGRES_USER:-tfi}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-tfi} -d ${POSTGRES_DB:-tfi}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: ../docker/backend.Dockerfile
      target: production
    container_name: tfi-backend
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: ${BACKEND_PORT:-3001}
      DATABASE_URL: ${DATABASE_URL:?DATABASE_URL is required}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    ports:
      - "${BACKEND_PORT:-3001}:3001"
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: ../docker/frontend.Dockerfile
      target: production
    container_name: tfi-frontend
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:3001/api/v1}
    ports:
      - "${FRONTEND_PORT:-3000}:3000"
    depends_on:
      - backend

volumes:
  postgres_data:
```

**Steps:**
- [ ] Create `docker/backend.Dockerfile` with the contents above
- [ ] Create `docker/frontend.Dockerfile` with the contents above — and update `frontend/next.config.ts` to add `output: 'standalone'` inside `nextConfig`
- [ ] Create `docker-compose.yml` with the contents above
- [ ] Run `docker compose -f docker-compose.dev.yml build backend` — verify the development stage builds successfully
- [ ] Run `docker compose -f docker-compose.dev.yml build frontend` — verify the development stage builds successfully
- [ ] Verify `docker-compose.yml` uses the `production` target for both services

**Acceptance Criteria:**
- [ ] `docker compose -f docker-compose.dev.yml build` succeeds for all services
- [ ] Both Dockerfiles have three stages: `development`, `builder`, `production`
- [ ] The backend `production` stage runs from `dist/index.js` (compiled output)
- [ ] The frontend `production` stage uses Next.js standalone output
- [ ] `docker-compose.yml` uses `${VAR:?error}` syntax for required env vars (`POSTGRES_PASSWORD`, `DATABASE_URL`) so it fails fast if they are missing
- [ ] `frontend/next.config.ts` has `output: 'standalone'`

**Commit Message:**
```
chore: add production Dockerfiles and Docker Compose configuration
```

---

### Story 1.5 — Environment Configuration

---

#### Task 9: Backend environment variables and typed config module

**Objective:**
Create `backend/.env.example` documenting every environment variable the backend requires or supports. Create `backend/src/config.ts` — a typed configuration module that reads from `process.env`, validates required variables at startup, and exports a single frozen `config` object. All other backend modules must import from this module rather than reading `process.env` directly.

**Dependencies Added:**
None (dotenv is already in `package.json` from Task 2).

**Files Created:**
- `backend/.env.example`
- `backend/src/config.ts`

**Files Modified:**
None.

**`backend/.env.example`:**
```bash
# Server
PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# Database (required)
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL=postgresql://tfi:tfi_dev_password@localhost:5432/tfi_dev
```

**`backend/src/config.ts`** must implement the following contract:

*Exported interface:*
```typescript
interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

*Exported value:*
```typescript
export const config: Readonly<Config>
```

*Behavior:*
- Calls `dotenv/config` at module load time to populate `process.env` from `.env` if present
- Reads `PORT` from `process.env.PORT`, parses as integer, defaults to `3001`
- Reads `NODE_ENV` from `process.env.NODE_ENV`, defaults to `'development'`
- Reads `DATABASE_URL` from `process.env.DATABASE_URL` — **throws `Error`** with message `'DATABASE_URL environment variable is required'` if it is missing or empty
- Reads `LOG_LEVEL` from `process.env.LOG_LEVEL`, defaults to `'info'`
- Returns a `Object.freeze()`-d config object so it cannot be mutated at runtime

**Steps:**
- [ ] Create `backend/.env.example` with the contents above
- [ ] Create a local `backend/.env` by copying `.env.example`: `cp backend/.env.example backend/.env` — verify `.env` is in `.gitignore` and will not be committed
- [ ] Implement `backend/src/config.ts` per the contract above
- [ ] Run `cd backend && npm run typecheck` — verify it exits 0
- [ ] Temporarily unset `DATABASE_URL` and verify the module throws on import (test via a small inline script, then restore)

**Acceptance Criteria:**
- [ ] `backend/src/config.ts` exports `config` as `Readonly<Config>`
- [ ] `config` object is frozen at runtime (`Object.isFrozen(config) === true`)
- [ ] Missing `DATABASE_URL` throws `Error('DATABASE_URL environment variable is required')` at import time
- [ ] `backend/.env.example` documents all variables with descriptions and example values
- [ ] `backend/.env` is listed in `.gitignore` and does not appear in `git status`
- [ ] `cd backend && npm run typecheck` exits 0

**Commit Message:**
```
chore(backend): add environment variable configuration
```

---

#### Task 10: Frontend environment variables

**Objective:**
Create `frontend/.env.example` documenting the frontend environment variables. Create a local `frontend/.env.local` for development. The `api-client.ts` created in Task 5 already reads `NEXT_PUBLIC_API_URL` — this task ensures the variable is documented and the local development value is configured.

**Dependencies Added:**
None.

**Files Created:**
- `frontend/.env.example`

**Files Modified:**
None (the local `frontend/.env.local` is created but not committed — it is in `.gitignore`).

**`frontend/.env.example`:**
```bash
# Backend API URL (must be accessible from the browser)
# In development, the backend runs on localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

**Steps:**
- [ ] Create `frontend/.env.example` with the contents above
- [ ] Create `frontend/.env.local` by copying `.env.example`: `cp frontend/.env.example frontend/.env.local`
- [ ] Verify `frontend/.env.local` is in `.gitignore` and does not appear in `git status`
- [ ] Run `cd frontend && npm run build` — verify it still exits 0

**Acceptance Criteria:**
- [ ] `frontend/.env.example` documents `NEXT_PUBLIC_API_URL` with a description and default value
- [ ] `frontend/.env.local` exists locally but is excluded from git
- [ ] `cd frontend && npm run build` exits 0

**Commit Message:**
```
chore(frontend): add environment variable configuration
```

---

### Story 1.6 — Fastify Application Scaffold

---

#### Task 11: App factory, entry point, and health check route

**Objective:**
Implement the Fastify application factory in `backend/src/app.ts` and the server entry point in `backend/src/index.ts`. Implement the `GET /health` route in `backend/src/http/routes/health.ts`. The health check route is the only route implemented in Epic 1. It must return a structured response and integrate with the database connection created in Task 13.

The app factory and entry point are separated so that tests can build the app without starting the HTTP server.

**Dependencies Added:**
None (all packages already installed).

**Files Created:**
- `backend/src/app.ts`
- `backend/src/index.ts`
- `backend/src/http/routes/health.ts`

**Files Modified:**
None.

**`backend/src/app.ts`** must implement:

*Exported function:*
```typescript
export async function buildApp(
  opts?: FastifyServerOptions
): Promise<FastifyInstance>
```

*Behavior:*
- Creates a Fastify instance with the provided options merged with `{ logger: { level: config.logLevel } }`
- Registers `@fastify/sensible` plugin (provides `fastify.httpErrors`, consistent error handling)
- Registers `@fastify/cors` plugin (accept all origins in development; tighten in production)
- Registers the health route plugin from `./http/routes/health.ts` with prefix `/`
- Registers the Swagger plugin from `./http/plugins/swagger.ts` (implemented in Task 12)
- Returns the Fastify instance **without calling `app.listen()`** — listening is the responsibility of `index.ts`

**`backend/src/index.ts`** must implement:

*Behavior:*
- Imports `buildApp` and `config`
- Calls `buildApp()` to get the Fastify instance
- Calls `app.listen({ port: config.port, host: '0.0.0.0' })` to start the server
- Logs the port on successful start
- Handles `SIGTERM` and `SIGINT` signals by calling `app.close()` for graceful shutdown
- Calls `process.exit(1)` if the app fails to start

**`backend/src/http/routes/health.ts`** must implement:

*Exported:*
```typescript
export default async function healthRoutes(fastify: FastifyInstance): Promise<void>
```

*Behavior:*
- Registers `GET /health` with an inline JSON Schema response definition:
  ```json
  {
    "type": "object",
    "properties": {
      "status":    { "type": "string", "enum": ["ok"] },
      "database":  { "type": "string", "enum": ["connected", "disconnected"] },
      "timestamp": { "type": "string", "format": "date-time" }
    },
    "required": ["status", "database", "timestamp"]
  }
  ```
- At this stage in Epic 1, before the database pool is created (Task 13), `database` should return `"disconnected"` — the field exists in the schema so that Task 14 can update its value without changing the schema
- Returns HTTP 200 regardless of database state (health check degraded, not failed, is appropriate for infrastructure monitoring)
- Returns `{ status: 'ok', database: 'disconnected', timestamp: new Date().toISOString() }`

**Steps:**
- [ ] Implement `backend/src/http/routes/health.ts` per the contract above (returns `database: 'disconnected'` for now)
- [ ] Implement `backend/src/app.ts` per the contract above — leave the Swagger plugin registration as a no-op comment for now (Task 12 adds it)
- [ ] Implement `backend/src/index.ts` per the contract above
- [ ] Run `cd backend && npm run typecheck` — verify exits 0
- [ ] Run `cd backend && npm run dev` — verify the server starts on port 3001
- [ ] In a second terminal: `curl http://localhost:3001/health` — verify response is `{"status":"ok","database":"disconnected","timestamp":"..."}`
- [ ] Stop the dev server

**Acceptance Criteria:**
- [ ] `cd backend && npm run typecheck` exits 0
- [ ] `cd backend && npm run dev` starts the server and logs the port
- [ ] `curl http://localhost:3001/health` returns HTTP 200 with `{"status":"ok","database":"disconnected","timestamp":"..."}`
- [ ] Stopping the process with `Ctrl+C` logs a graceful shutdown message (no unhandled rejection)
- [ ] `buildApp()` accepts an optional `FastifyServerOptions` parameter — test code in Task 15 will use `{ logger: false }` to suppress logs during tests

**Commit Message:**
```
feat(backend): add Fastify app factory and health check route
```

---

#### Task 12: Register OpenAPI plugin

**Objective:**
Create `backend/src/http/plugins/swagger.ts` to register `@fastify/swagger` and `@fastify/swagger-ui` with the Fastify instance. The OpenAPI spec is generated automatically from the JSON Schema definitions attached to each route (starting with the health route). The Swagger UI is served at `/documentation`.

**Dependencies Added:**

Runtime:
```
@fastify/swagger@^9.0.0
@fastify/swagger-ui@^5.0.0
```

**Files Created:**
- `backend/src/http/plugins/swagger.ts`

**Files Modified:**
- `backend/src/app.ts` — uncomment/add the Swagger plugin registration

**`backend/src/http/plugins/swagger.ts`** must implement:

*Exported:*
```typescript
export default async function swaggerPlugin(fastify: FastifyInstance): Promise<void>
```

*Behavior:*
- Registers `@fastify/swagger` with:
  - `openapi.info.title`: `'Test Failure Intelligence API'`
  - `openapi.info.version`: `'1.0.0'`
  - `openapi.info.description`: `'API for ingesting test results and surfacing quality intelligence'`
  - `openapi.servers`: `[{ url: '/api/v1' }]`
- Registers `@fastify/swagger-ui` with:
  - `routePrefix`: `'/documentation'`
  - `uiConfig.docExpansion`: `'list'`
  - `uiConfig.deepLinking`: `false`

**`backend/src/app.ts`** — add plugin registration:
- Register `swaggerPlugin` **before** all route plugins so that routes are included in the generated spec
- Import `swaggerPlugin` from `./http/plugins/swagger.js`

**Steps:**
- [ ] Install dependencies: `cd backend && npm install @fastify/swagger @fastify/swagger-ui`
- [ ] Implement `backend/src/http/plugins/swagger.ts` per the contract above
- [ ] Update `backend/src/app.ts` to register the swagger plugin before route plugins
- [ ] Run `cd backend && npm run typecheck` — verify exits 0
- [ ] Run `cd backend && npm run dev`
- [ ] Open `http://localhost:3001/documentation` in a browser — verify Swagger UI loads
- [ ] Verify the `GET /health` route appears in the Swagger UI with the correct response schema
- [ ] Stop the dev server

**Acceptance Criteria:**
- [ ] `cd backend && npm run typecheck` exits 0
- [ ] `GET /documentation` returns HTTP 200 and serves the Swagger UI HTML
- [ ] `GET /documentation/json` returns a valid OpenAPI 3.0 JSON document
- [ ] The `GET /health` route appears in the OpenAPI document with its response schema
- [ ] The Swagger plugin is registered before route plugins in `app.ts`

**Commit Message:**
```
feat(backend): add OpenAPI documentation with Swagger UI
```

---

### Story 1.7 — PostgreSQL Connection

---

#### Task 13: PostgreSQL connection pool

**Objective:**
Create `backend/src/database/client.ts` — a module that exports a `pg.Pool` singleton and a `testConnection()` utility function. This module is the single source of truth for database connectivity in the backend. All repositories (added in Epic 2) import the pool from this module.

**Dependencies Added:**
None (pg and @types/pg already installed in Task 2).

**Files Created:**
- `backend/src/database/client.ts`

**Files Modified:**
None.

**`backend/src/database/client.ts`** must implement:

*Exported values:*
```typescript
export const pool: pg.Pool

export async function testConnection(): Promise<boolean>
```

*Behavior of `pool`:*
- Created from `config.databaseUrl` (imported from `../config.js`)
- Pool configuration: `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 2000`
- Listens to the pool `'error'` event and logs unexpected errors on idle clients to prevent unhandled rejections

*Behavior of `testConnection()`:*
- Acquires a client from the pool
- Executes `SELECT 1`
- Releases the client
- Returns `true` if successful
- Returns `false` if an error occurs (catches the error internally, does not rethrow)

**Steps:**
- [ ] Implement `backend/src/database/client.ts` per the contract above
- [ ] Ensure Docker Compose dev PostgreSQL is running: `docker compose -f docker-compose.dev.yml up postgres -d`
- [ ] Run `cd backend && npm run typecheck` — verify exits 0
- [ ] Run `cd backend && npm run dev` — verify the server starts without database connection errors
- [ ] In a second terminal: `curl http://localhost:3001/health` — the response should still show `database: 'disconnected'` (Task 14 wires this in)

**Acceptance Criteria:**
- [ ] `cd backend && npm run typecheck` exits 0
- [ ] `backend/src/database/client.ts` exports `pool` of type `pg.Pool` and `testConnection` as an async function returning `Promise<boolean>`
- [ ] The pool's `'error'` event handler is registered to prevent unhandled rejections
- [ ] `testConnection()` returns `false` (not throws) when the database is unreachable

**Commit Message:**
```
feat(backend): add PostgreSQL connection pool
```

---

#### Task 14: Integrate database health check into health route

**Objective:**
Update `backend/src/http/routes/health.ts` to call `testConnection()` from the database client and return the actual database connectivity status in the health response. This is the wire-up that connects the health route to the database pool.

**Dependencies Added:**
None.

**Files Created:**
None.

**Files Modified:**
- `backend/src/http/routes/health.ts`

**Updated behavior of `GET /health`:**
- Calls `testConnection()` from `../../database/client.js`
- Sets `database: 'connected'` if `testConnection()` returns `true`
- Sets `database: 'disconnected'` if `testConnection()` returns `false`
- Returns HTTP 200 in both cases (degraded state, not failure)
- The response schema and shape are unchanged from Task 11

**Steps:**
- [ ] Update `backend/src/http/routes/health.ts` to import and call `testConnection()`
- [ ] Ensure PostgreSQL is running: `docker compose -f docker-compose.dev.yml up postgres -d`
- [ ] Run `cd backend && npm run dev`
- [ ] Run `curl http://localhost:3001/health` — verify response shows `"database":"connected"`
- [ ] Stop PostgreSQL: `docker compose -f docker-compose.dev.yml stop postgres`
- [ ] Wait 3 seconds for the connection timeout to expire
- [ ] Run `curl http://localhost:3001/health` — verify response shows `"database":"disconnected"` and HTTP status is still 200
- [ ] Restart PostgreSQL: `docker compose -f docker-compose.dev.yml start postgres`
- [ ] Run `cd backend && npm run typecheck` — verify exits 0

**Acceptance Criteria:**
- [ ] `curl http://localhost:3001/health` returns `{"status":"ok","database":"connected","timestamp":"..."}` when PostgreSQL is up
- [ ] `curl http://localhost:3001/health` returns `{"status":"ok","database":"disconnected","timestamp":"..."}` when PostgreSQL is down, still with HTTP 200
- [ ] `cd backend && npm run typecheck` exits 0
- [ ] `cd backend && npm run lint` exits 0

**Commit Message:**
```
feat(backend): integrate database connectivity into health check
```

---

#### Task 15: Health check integration test

**Objective:**
Write the first integration test that builds the Fastify app using `buildApp()` and sends real HTTP requests against it using Fastify's `.inject()` method. The test covers the `GET /health` endpoint for both the healthy and disconnected states.

This test validates: HTTP status code, response body shape, response content type, and JSON schema compliance.

**Dependencies Added:**
None.

**Files Created:**
- `backend/tests/integration/health.test.ts`

**Files Modified:**
None.

**`backend/tests/integration/health.test.ts`** must test:

1. `GET /health` with database available:
   - Returns HTTP 200
   - `Content-Type` includes `application/json`
   - Response body has `status: 'ok'`
   - Response body has `database: 'connected'` (requires PostgreSQL to be running)
   - Response body has a `timestamp` string matching ISO 8601 format

2. `GET /health` structure validation (can run without a database):
   - Returns HTTP 200
   - Response body has property `status`
   - Response body has property `database`
   - Response body has property `timestamp`

*Test setup requirements:*
- Build the app with `buildApp({ logger: false })` in `beforeAll()` — the `logger: false` option suppresses Fastify log output during tests
- Call `app.close()` in `afterAll()` to cleanly close the connection pool
- Use `app.inject({ method: 'GET', url: '/health' })` — this sends HTTP requests without opening a real socket, making tests fast and hermetic

*Environment requirement for the database-connected test:*
- Requires `DATABASE_URL` to be set. In CI (Task 16), a PostgreSQL service container provides the database. Locally, developers run PostgreSQL via Docker Compose before running integration tests.
- If `DATABASE_URL` is not set, `buildApp()` will throw because `config.ts` validates it. The test file must be run with a valid `DATABASE_URL` in the environment.

**Steps:**
- [ ] Ensure PostgreSQL is running locally: `docker compose -f docker-compose.dev.yml up postgres -d`
- [ ] Implement `backend/tests/integration/health.test.ts` per the contract above
- [ ] Run `cd backend && npm run test:integration` — verify all tests pass
- [ ] Run `cd backend && npm run lint` — verify no lint errors in test files
- [ ] Run `cd backend && npm run typecheck` — verify exits 0

**Acceptance Criteria:**
- [ ] `cd backend && npm run test:integration` exits 0 with all tests green when PostgreSQL is available
- [ ] The test builds `buildApp({ logger: false })` — no log output during test runs
- [ ] `afterAll()` calls `app.close()` — no open handles warning from Jest
- [ ] `cd backend && npm run typecheck` exits 0
- [ ] `cd backend && npm run lint` exits 0

**Commit Message:**
```
test(backend): add health check integration test
```

---

### Story 1.8 — GitHub Actions CI

---

#### Task 16: GitHub Actions CI workflow

**Objective:**
Create a CI pipeline that runs on every push to any branch and on every pull request targeting `main` or `develop`. The pipeline runs four jobs: `lint`, `typecheck`, `test`, and `build`. The `test` job uses a PostgreSQL service container so integration tests can connect to a real database without Docker Compose.

**Dependencies Added:**
None.

**Files Created:**
- `.github/workflows/ci.yml`

**Files Modified:**
None.

**`.github/workflows/ci.yml`:**
```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: |
            backend/package-lock.json
            frontend/package-lock.json

      - name: Install backend dependencies
        run: npm ci
        working-directory: backend

      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend

      - name: Lint backend
        run: npm run lint
        working-directory: backend

      - name: Lint frontend
        run: npm run lint
        working-directory: frontend

  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: |
            backend/package-lock.json
            frontend/package-lock.json

      - name: Install backend dependencies
        run: npm ci
        working-directory: backend

      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend

      - name: Typecheck backend
        run: npm run typecheck
        working-directory: backend

      - name: Typecheck frontend
        run: npm run typecheck
        working-directory: frontend

  test:
    name: Test
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: tfi_test
          POSTGRES_USER: tfi
          POSTGRES_PASSWORD: tfi_test_password
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U tfi -d tfi_test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: backend/package-lock.json

      - name: Install backend dependencies
        run: npm ci
        working-directory: backend

      - name: Run backend tests
        run: npm test
        working-directory: backend
        env:
          DATABASE_URL: postgresql://tfi:tfi_test_password@localhost:5432/tfi_test
          NODE_ENV: test

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: |
            backend/package-lock.json
            frontend/package-lock.json

      - name: Install backend dependencies
        run: npm ci
        working-directory: backend

      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend

      - name: Build backend
        run: npm run build
        working-directory: backend

      - name: Build frontend
        run: npm run build
        working-directory: frontend
        env:
          NEXT_PUBLIC_API_URL: http://localhost:3001/api/v1
```

**Steps:**
- [ ] Create `.github/workflows/ci.yml` with the contents above
- [ ] Push the branch to GitHub: `git push origin develop`
- [ ] Navigate to the repository's Actions tab on GitHub
- [ ] Verify all four jobs (`lint`, `typecheck`, `test`, `build`) complete with green status
- [ ] If any job fails, read the job log and fix the underlying issue before marking this task complete

**Acceptance Criteria:**
- [ ] All four CI jobs pass on the first green run: `lint`, `typecheck`, `test`, `build`
- [ ] The `test` job connects to the PostgreSQL service container via `DATABASE_URL` in the step `env`
- [ ] The `build` job builds both `backend/` and `frontend/` successfully
- [ ] No job has hardcoded secrets — database credentials are defined only in the service block and step `env`
- [ ] The workflow triggers on push to all branches and on PRs to `main` and `develop`

**Commit Message:**
```
ci: add GitHub Actions workflow for lint, typecheck, test, and build
```

---

### Story 1.9 — Developer Documentation

---

#### Task 17: README local development guide

**Objective:**
Rewrite `README.md` with a developer-focused guide covering prerequisites, local setup, how to run all services, how to run tests, available npm scripts, environment variable reference, and the project structure. The README must be accurate for the state of the codebase at the end of Epic 1.

**Dependencies Added:**
None.

**Files Created:**
None.

**Files Modified:**
- `README.md`

**`README.md` must cover:**

1. **Project Overview** — one paragraph describing the platform (pull from the design spec context)

2. **Prerequisites** — exact versions required:
   - Node.js >= 22
   - Docker Desktop (or Docker Engine + Compose plugin)
   - npm >= 10

3. **Local Setup** — step-by-step:
   - Clone the repo
   - Copy env files: `cp backend/.env.example backend/.env` and `cp frontend/.env.example frontend/.env.local`
   - Install backend deps: `cd backend && npm install`
   - Install frontend deps: `cd frontend && npm install`
   - Start PostgreSQL: `docker compose -f docker-compose.dev.yml up postgres -d`
   - Start backend: `cd backend && npm run dev`
   - Start frontend: `cd frontend && npm run dev`
   - Health check: `curl http://localhost:3001/health`

4. **Running All Services with Docker** — using `docker-compose.dev.yml`:
   - `docker compose -f docker-compose.dev.yml up`
   - How to stop: `docker compose -f docker-compose.dev.yml down`
   - How to destroy volumes: `docker compose -f docker-compose.dev.yml down -v`

5. **Running Tests:**
   - `cd backend && npm test` — all tests
   - `cd backend && npm run test:unit` — unit tests only
   - `cd backend && npm run test:integration` — integration tests (requires PostgreSQL)

6. **npm Scripts Reference** — table with all backend and frontend scripts

7. **Environment Variables** — table for backend (PORT, NODE_ENV, DATABASE_URL, LOG_LEVEL) and frontend (NEXT_PUBLIC_API_URL) with required/optional, default, and description columns

8. **API Documentation** — note that Swagger UI is available at `http://localhost:3001/documentation` when the backend is running

9. **Project Structure** — condensed directory tree mirroring the approved spec

**Steps:**
- [ ] Draft `README.md` covering all sections above
- [ ] Verify every command in the README works by running each one in a clean terminal
- [ ] Run `cd backend && npm run format:check` and `npm run lint` — verify README is not flagged (it won't be, since it's Markdown, not TypeScript)
- [ ] Verify `curl http://localhost:3001/health` returns the expected JSON as documented in the README

**Acceptance Criteria:**
- [ ] README covers all nine sections listed above
- [ ] Every shell command in the README is correct and executable
- [ ] Environment variable table matches `backend/.env.example` and `frontend/.env.example` exactly
- [ ] The Swagger UI URL is documented correctly
- [ ] The project structure section matches the spec

**Commit Message:**
```
docs: add local development guide to README
```

---

## Commit Sequence Summary

Seventeen commits, each representing one complete, self-contained unit of work:

| # | Commit Message | Story | Task |
|---|---|---|---|
| 1 | `chore: establish repository directory structure` | 1.1 | Task 1 |
| 2 | `chore(backend): initialize TypeScript project` | 1.2 | Task 2 |
| 3 | `chore(backend): add ESLint and Prettier` | 1.2 | Task 3 |
| 4 | `chore(backend): configure Jest with ts-jest` | 1.2 | Task 4 |
| 5 | `chore(frontend): initialize Next.js App Router project` | 1.3 | Task 5 |
| 6 | `chore(frontend): add ESLint and Prettier` | 1.3 | Task 6 |
| 7 | `chore: add Docker Compose development configuration` | 1.4 | Task 7 |
| 8 | `chore: add production Dockerfiles and Docker Compose configuration` | 1.4 | Task 8 |
| 9 | `chore(backend): add environment variable configuration` | 1.5 | Task 9 |
| 10 | `chore(frontend): add environment variable configuration` | 1.5 | Task 10 |
| 11 | `feat(backend): add Fastify app factory and health check route` | 1.6 | Task 11 |
| 12 | `feat(backend): add OpenAPI documentation with Swagger UI` | 1.6 | Task 12 |
| 13 | `feat(backend): add PostgreSQL connection pool` | 1.7 | Task 13 |
| 14 | `feat(backend): integrate database connectivity into health check` | 1.7 | Task 14 |
| 15 | `test(backend): add health check integration test` | 1.7 | Task 15 |
| 16 | `ci: add GitHub Actions workflow for lint, typecheck, test, and build` | 1.8 | Task 16 |
| 17 | `docs: add local development guide to README` | 1.9 | Task 17 |

---

## Spec Coverage Verification

Every requirement from the design spec's Epic 1 section is covered:

| Requirement | Task |
|---|---|
| Configure TypeScript + ESLint + Prettier (backend) | Tasks 2, 3 |
| Configure Next.js + TypeScript (frontend) | Task 5 |
| ESLint + Prettier (frontend) | Task 6 |
| Docker Compose dev and prod configs | Tasks 7, 8 |
| GitHub Actions CI pipeline (lint, typecheck, test, build) | Task 16 |
| PostgreSQL connection pool | Task 13 |
| Fastify app scaffold | Tasks 11, 12 |
| OpenAPI/Swagger | Task 12 |
| Environment variable configuration | Tasks 9, 10 |
| Directory structure matching approved spec | Task 1 |
| README with setup guide | Task 17 |

**Not in Epic 1 (by design):**
- Database migrations — Epic 1 Story 2 (next implementation plan)
- Domain entities, enums, ports, services — Epic 2
- Any route other than `GET /health` — Epic 3+

---

## Local Development Quick Reference

After completing all tasks, the local development workflow is:

```bash
# Start database
docker compose -f docker-compose.dev.yml up postgres -d

# Start backend (separate terminal)
cd backend && npm run dev

# Start frontend (separate terminal)
cd frontend && npm run dev

# Verify everything works
curl http://localhost:3001/health
# Expected: {"status":"ok","database":"connected","timestamp":"..."}

# Run all backend tests (requires postgres running)
cd backend && npm test

# Check linting and formatting
cd backend && npm run lint && npm run format:check
cd frontend && npm run lint && npm run format:check
```
