# Epic 2 — Data Layer Implementation Plan

**Status:** Draft — pending review
**Date:** 2026-06-03
**Spec reference:** `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md` §1, §3–6, §9 "Epic 2: Core Domain"
**Predecessor:** Epic 1 Foundation (complete) + four migrations on `feat/migrations`

---

## 1. Objective

Establish the data layer between PostgreSQL and the application's use cases. Specifically: domain enums, domain entity types, repository ports, and PostgreSQL repository implementations for `projects`, `test_runs`, and `test_case_results`. The data layer must be testable in isolation against a real PostgreSQL instance, with a connection pool lifecycle that does not require `--forceExit`.

The output of this epic is the foundation that Epic 3 (Projects API), Epic 4 (Ingestion), and Epic 5 (Analytics) will build on. Domain services (`ReliabilityClassifier`, `HealthEvaluator`) listed under spec Epic 2 are **deferred** to a separate plan because they are pure logic with no data-layer dependency — keeping this epic focused on persistence is the KISS-aligned slice.

---

## 2. Scope

### In scope

- Migration gap remediation: add missing `projects.slug` column and the indexes named in the spec (§6) that were omitted from existing migrations
- Domain enums (`TestRunStatus`, `TestCaseStatus`, `SourceType`, `ReliabilityState`, `FailureSeverity`, `ProjectHealthStatus`) as TypeScript string-union types
- Domain entities (`Project`, `TestRun`, `TestCaseResult`, `FailurePattern`) as plain TypeScript types matching §4 of the spec
- Repository ports: `ProjectRepository`, `TestRunRepository`, `TestCaseRepository`
- PostgreSQL repository implementations: `pg-project.repository`, `pg-test-run.repository`, `pg-test-case.repository`
- Pool lifecycle refactor (resolves TD-001): pool constructed in `index.ts`, injected via Fastify decorator, `--forceExit` removed
- Integration test fixtures: dedicated test database, migration-based schema, per-test truncation for isolation
- CI: Postgres service container, `DATABASE_URL` wired into the backend job, `test:integration` executed in CI

### Explicitly out of scope (deferred, with justification)

- `FailurePattern` repository → deferred until Epic 4 needs it for writes (YAGNI; spec Epic 2 does not include it)
- `ReliabilityClassifier`, `HealthEvaluator` → pure domain services; will live in a domain-services plan that follows this epic
- Transaction propagation across use cases → repository methods will accept an optional `PoolClient` (see §6), but no `UnitOfWork`/`@Transactional` abstraction; Epic 4 will use the optional-client pattern directly
- `IngestionPort` → consumed only by Epic 4 ingestion adapters; not used by repositories
- API routes — Epic 3

### Constraints

- KISS: prefer language-level types over runtime classes; prefer SQL over ORMs
- DRY: shared SQL row-mapping in a single place per entity (e.g., `mapRow(row): TestRun`)
- YAGNI: no abstractions without a present consumer (no generic `BaseRepository<T>`; no migration framework changes; no caching layer)
- One logical task = one logical commit; commit messages follow conventional commits per `memory/workflow.md`

---

## 3. Architecture

Following the layered monolith described in spec §1:

```
HTTP routes (Fastify)        ← Epic 3+ (not in this plan)
        │
        ▼
Use cases                    ← Epic 3+ (not in this plan)
        │  depends on ports
        ▼
Domain (entities, enums, ports, services)   ← this epic adds: enums, entities, ports
        ▲  implements ports
        │
Infrastructure repositories  ← this epic adds: pg-project, pg-test-run, pg-test-case
        │  uses pg.Pool
        ▼
PostgreSQL
```

**Dependency direction:** domain has zero external dependencies (no `pg`, no Fastify, no I/O). Infrastructure depends on domain. Use cases depend on domain. HTTP depends on use cases.

**Repository instantiation:** during application bootstrap (`index.ts`), a single `pg.Pool` is created, repositories are constructed with the pool, and the pool + repositories are exposed to the Fastify lifecycle via a single plugin (`src/http/plugins/repositories.ts`). Closing the pool happens in the Fastify `onClose` hook, which is triggered by `SIGTERM`/`SIGINT` handlers in `index.ts`.

---

## 4. Database migration status review

The following migrations are **complete** on the `feat/migrations` branch:

| # | Migration file | Commit | Status |
|---|---|---|---|
| — | `node-pg-migrate` setup | `6c315c2` | ✅ Complete |
| 001 | `001_create_projects.sql` | `9660460` | ✅ Complete |
| 002 | `002_create_test_runs.sql` | `2511d32` | ✅ Complete |
| 003 | `003_create_test_case_results.sql` | `3c7b200` | ✅ Complete |
| 004 | `004_create_failure_patterns.sql` | `5ac28e7` | ✅ Complete |

This plan does **not** recreate that work.

### Gap analysis vs spec §6

A line-by-line comparison surfaced the following divergences between the spec schema and the migrations that landed. Each is classified as either **must fix in Epic 2** (blocks the data layer) or **accept divergence** (intentional or deferrable):

| Divergence | Spec | Migrations | Decision |
|---|---|---|---|
| `projects.slug` column | `slug TEXT UNIQUE NOT NULL` | absent | **Must fix** — slug is the URL-safe identifier used in API routes; required before Epic 3 |
| Enum types | Native `CREATE TYPE … AS ENUM` | `TEXT` + `CHECK` constraint | **Accept** — operationally easier to extend; functionally equivalent for the application |
| FK delete action | `ON DELETE CASCADE` | `ON DELETE RESTRICT` | **Accept** — `RESTRICT` is safer for an MVP; explicit project-delete use case can cascade in application code when Epic 3 ships |
| `test_runs` indexes | `(project_id)`, `(project_id, executed_at DESC)`, `(project_id, branch)`, `(project_id, environment)` | only `(project_id, executed_at DESC NULLS LAST)` | **Must fix** — analytics queries in Epic 5 filter by `branch` and `environment` |
| `test_case_results` indexes | `(project_id)`, `(test_run_id)`, `(project_id, full_name)`, `(project_id, status)` | `(test_run_id)`, `(project_id, full_name)` | **Must fix** — reliability and failure queries in Epic 5 filter by `status` |
| `failure_patterns` indexes | `(project_id)`, `(project_id, severity)` | none beyond unique key | **Must fix** — analytics queries in Epic 5 list patterns by severity |
| JSONB column nullability/default | `JSONB NOT NULL DEFAULT '{}'` | nullable, no default | **Accept** — repositories will normalize `null → {}` on read; no schema rewrite |
| `failure_patterns.occurrence_count` | `DEFAULT 1` | `DEFAULT 1` with `>= 1` check | **Accept** — additional check is stricter, harmless |

The "must fix" items are addressed by **Task 1** (one migration per fix would be excessive; one focused remediation migration is KISS-aligned).

---

## 5. Repository layer design

### Port interfaces (domain layer)

Each port is a TypeScript interface in `backend/src/domain/ports/`. Methods are derived from the use cases that will call them (Epic 3 reads/writes projects; Epic 4 writes test runs and cases; Epic 5 reads test runs, cases, and aggregates).

**`ProjectRepository`**
- `create(input: NewProject): Promise<Project>`
- `findById(id: string): Promise<Project | null>`
- `findBySlug(slug: string): Promise<Project | null>`
- `list(opts: { limit: number; offset: number }): Promise<{ items: Project[]; total: number }>`

**`TestRunRepository`**
- `create(input: NewTestRun, client?: PoolClient): Promise<TestRun>`
- `findById(id: string): Promise<TestRun | null>`
- `listByProject(projectId: string, opts: { limit: number; offset: number; branch?: string; environment?: string }): Promise<{ items: TestRun[]; total: number }>`
- `findMostRecentByProject(projectId: string): Promise<TestRun | null>` *(needed for `passRate` in `ProjectHealthStatus`)*

**`TestCaseRepository`**
- `createMany(inputs: NewTestCaseResult[], client?: PoolClient): Promise<void>` *(bulk insert path used by ingestion)*
- `findByTestRun(testRunId: string): Promise<TestCaseResult[]>`
- `findRecentByFullName(projectId: string, fullName: string, limit: number): Promise<TestCaseResult[]>` *(rolling window for reliability)*

Method signatures are deliberately minimal — only what current and immediately-next epics consume. Additional methods will be added as Epic 4/5 needs them, with the corresponding tests.

### Postgres implementations (infrastructure layer)

Each implementation lives in `backend/src/infrastructure/repositories/pg-*.repository.ts` and:

- Takes a `pg.Pool` in its constructor and stores it as a private readonly field
- Defines a private `mapRow(row): Entity` helper (DRY) that handles `null`-to-`undefined` and `null`-JSONB normalization
- Uses parameterized queries exclusively (`$1`, `$2`, …) — never string concatenation
- Accepts an optional `PoolClient` on write methods, allowing Epic 4 to pass a client that's already in a transaction
- Maps Postgres-specific error codes (unique violation `23505`, foreign key violation `23503`) to domain-meaningful errors via a small `pgErrors.ts` helper (single place — DRY)

---

## 6. Transaction strategy

### Decision: optional client parameter, no `UnitOfWork`

Repository write methods accept an optional `PoolClient`. If provided, the method uses that client; otherwise it acquires a client from the pool for the duration of the call. A thin `withTransaction(pool, fn)` helper lives at `backend/src/infrastructure/database/with-transaction.ts`:

```ts
async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T>
```

The helper does `BEGIN` → run `fn(client)` → `COMMIT`; on throw, `ROLLBACK`. The client is released in `finally`.

### Why this and not a `UnitOfWork` abstraction

- **KISS:** Node's `pg` driver already gives us a transactional primitive. A `UnitOfWork` adds an indirection that only pays off when multiple ORMs or backends exist.
- **YAGNI:** Epic 2 has no transactional use case (each repository operation is independent). Epic 4 has exactly one: ingest run + cases atomically. That one call site can use `withTransaction` directly.
- **Visibility:** `withTransaction(pool, async (tx) => { ... })` in a use case makes the transaction boundary obvious to a reader; an injected unit-of-work hides it.

### Why repositories accept an optional `PoolClient` rather than always pool

Forces the caller to be honest about boundaries. Tests that need a transaction-per-test (later optimization — not in this plan) can pass a shared client to assert behavior across calls; production code that does not need a transaction omits the argument and uses the pool directly.

---

## 7. Dependency injection strategy

### Decision: Fastify decorators, single `repositories` plugin

A single Fastify plugin at `backend/src/http/plugins/repositories.ts` decorates the app instance with `app.pool` and `app.repos` (an object containing each repository). The plugin's `onClose` hook calls `app.pool.end()`.

```ts
// in index.ts
const pool = new Pool(buildPoolConfig(config));
const app = await buildApp({ pool });
// install SIGTERM/SIGINT handlers that call app.close()
```

```ts
// in app.ts
export async function buildApp({ pool }: { pool: Pool }) {
  ...
  app.register(repositoriesPlugin, { pool });
  ...
}
```

```ts
// in routes/use-cases
fastify.get('/projects/:id', async (req, reply) => {
  const project = await req.server.repos.projects.findById(req.params.id);
  ...
});
```

### Why this and not a DI container

- The application has one composition root (`index.ts`) and one runtime (Fastify). A container (`tsyringe`, `inversify`) adds reflection, decorators, and a learning tax for zero current benefit.
- Fastify decorators are the idiomatic Fastify pattern. Reviewers already know it.
- Tests can either build a real `Pool` against `tfi_test` (integration) or construct a repository with a mock `Pool` (unit) — both work without DI.

### Resolves TD-001

Moving the `Pool` construction from `database/client.ts` (module scope) to `index.ts` (function scope), and tearing it down in Fastify's `onClose`, removes the open-handle leak that motivated `--forceExit`. Once integration tests pass cleanly without it, `--forceExit` is removed from `package.json` and `docs/tech-debt.md` is updated to close TD-001.

---

## 8. Testing strategy

### Unit tests

- Domain enums and entity types are compile-time only; no runtime tests needed (YAGNI — no logic to test)
- `withTransaction` has a small unit test using a `Pool` stub: verify `BEGIN`/`COMMIT` on success, `ROLLBACK` on throw, `release()` always called
- Row-mapping helpers (`mapRow`) have a unit test per entity: verify `null` JSONB → `{}` normalization and date parsing

### Integration tests

- Each repository has an integration test suite that runs against a real PostgreSQL database (`tfi_test`)
- Test database is provisioned by Docker Compose dev stack (a sibling database to `tfi_dev` in the same container) and by a service container in CI
- Schema is created by running `node-pg-migrate up` against `tfi_test` once per test run (in `globalSetup`)
- Each test starts with `TRUNCATE projects, test_runs, test_case_results, failure_patterns RESTART IDENTITY CASCADE` in `beforeEach` for isolation
- A `globalTeardown` calls `pool.end()` on the test pool — combined with the production-code refactor, this is what removes the need for `--forceExit`

### What we are deliberately not doing

- **No testcontainers-node:** spawning a fresh Postgres per suite is overkill at this scale and triples test runtime
- **No transaction-rollback isolation:** TRUNCATE is simple, the suite is small, and rollback-isolation forces repositories to opt into a shared transaction which leaks test concerns into production signatures
- **No fake/in-memory implementations:** the repositories *are* the integration boundary; mocking them in repository tests defeats the purpose. Higher layers (use cases in Epic 3+) will mock the repository ports

### CI

- The backend job in `.github/workflows/ci.yml` gains a `services.postgres` block (image `postgres:16-alpine`, healthcheck, exposed port)
- `DATABASE_URL` set as a step-level env var pointing at the service
- New CI step: `npm run migrate:up` against the test database before `npm run test:integration`
- `npm test` (the existing step) remains the unit-test gate; `npm run test:integration` becomes a separate step so a unit-test failure is identifiable before integration runs

---

## 9. Task breakdown

Each task is one logical commit per `memory/workflow.md`. Acceptance criteria are objective and runnable.

---

### Task 1 — Schema gap remediation migration

**Purpose:** Close the spec-vs-migration divergences classified as "must fix" in §4: add `projects.slug`, add the missing indexes on `test_runs`, `test_case_results`, and `failure_patterns`.

**Files affected:**
- `backend/migrations/005_schema_gap_remediation.sql` *(new)*

**Acceptance criteria:**
- Migration adds `slug TEXT` to `projects` with a `UNIQUE` index, NOT NULL via a two-step pattern (populate-from-id-then-constrain) — or NOT NULL directly if Task 1 lands before any production data exists (which it does)
- Migration creates: `(project_id, branch)`, `(project_id, environment)` on `test_runs`; `(project_id, status)` on `test_case_results`; `(project_id, severity)` on `failure_patterns`
- Down migration removes the above
- `npm run migrate:up` against a fresh database succeeds; `npm run migrate:down` rolls back cleanly
- `\d+ projects`, `\d+ test_runs`, `\d+ test_case_results`, `\d+ failure_patterns` in `psql` show the expected columns and indexes

**Expected commit message:** `feat(backend): add schema gap remediation migration`

---

### Task 2 — Domain enums

**Purpose:** Define every domain enum from spec §3 as a TypeScript string-union with a runtime `as const` array (for validation/listing) and a type guard.

**Files affected:**
- `backend/src/domain/enums/test-run-status.ts`
- `backend/src/domain/enums/test-case-status.ts`
- `backend/src/domain/enums/source-type.ts`
- `backend/src/domain/enums/reliability-state.ts`
- `backend/src/domain/enums/failure-severity.ts`
- `backend/src/domain/enums/project-health-status.ts`
- `backend/tests/unit/domain/enums/*.test.ts` *(one trivial test file per enum, asserting the `as const` array values)*

**Acceptance criteria:**
- Each file exports a `const` array (e.g., `TEST_RUN_STATUSES`) and a derived type (`TestRunStatus`)
- Each file exports an `isTestRunStatus(value: unknown): value is TestRunStatus` guard
- `npm run typecheck` exits 0
- `npm run lint` exits 0
- `npm run test:unit` includes the new tests, all pass

**Expected commit message:** `feat(backend): add domain enums for test runs, cases, and analytics`

---

### Task 3 — Domain entities

**Purpose:** Define `Project`, `TestRun`, `TestCaseResult`, `FailurePattern` as TypeScript types matching spec §4.

**Files affected:**
- `backend/src/domain/entities/project.ts`
- `backend/src/domain/entities/test-run.ts`
- `backend/src/domain/entities/test-case-result.ts`
- `backend/src/domain/entities/failure-pattern.ts`

**Acceptance criteria:**
- Each entity is a readonly `type` (not a class) — fields match spec §4 verbatim
- Each file also exports `NewProject`, `NewTestRun`, etc. — the input type for `create()` (omits server-assigned fields: `id`, timestamps, denormalized counts where applicable)
- No imports from `pg` or any infrastructure package — pure domain
- `npm run typecheck` exits 0

**Expected commit message:** `feat(backend): add domain entities for project, run, case, and pattern`

---

### Task 4 — Repository port interfaces

**Purpose:** Define the abstract contracts that infrastructure implementations satisfy and use cases consume.

**Files affected:**
- `backend/src/domain/ports/project.repository.ts`
- `backend/src/domain/ports/test-run.repository.ts`
- `backend/src/domain/ports/test-case.repository.ts`

**Acceptance criteria:**
- Each port is a TypeScript `interface` with the methods listed in §5
- No `pg` import — the optional `client?` parameter uses a domain-local type alias (`type TxClient = unknown` for now, narrowed in Task 6 to `PoolClient` re-exported through `infrastructure/database`)
- `npm run typecheck` exits 0
- `npm run lint` exits 0

**Expected commit message:** `feat(backend): add repository port interfaces for projects, runs, and cases`

---

### Task 5 — Pool lifecycle refactor (closes TD-001)

**Purpose:** Move `Pool` construction out of module scope into `index.ts`, expose it through Fastify, and remove `--forceExit`.

**Files affected:**
- `backend/src/database/client.ts` *(remove module-level `pool`; keep `testConnection` as a function that takes a `Pool`)*
- `backend/src/app.ts` *(accept `pool` in `buildApp` options)*
- `backend/src/index.ts` *(construct `Pool`, pass to `buildApp`, wire `SIGTERM`/`SIGINT` to `app.close()`)*
- `backend/src/http/plugins/repositories.ts` *(new — placeholder plugin that decorates `app.pool`; repository decorations added in Tasks 7–9)*
- `backend/src/http/routes/health.ts` *(call `testConnection(request.server.pool)` instead of the imported singleton)*
- `backend/tests/integration/health.test.ts` *(build app with a pool injected, mock at the pool level not the module level; remove `unstable_mockModule`)*
- `backend/package.json` *(remove `--forceExit` from `test:integration`)*
- `backend/tests/integration/setup.ts` *(new — `globalSetup`/`globalTeardown` skeleton)*
- `backend/jest.config.ts` *(register `globalSetup`/`globalTeardown` for integration tests)*
- `docs/tech-debt.md` *(mark TD-001 closed)*

**Acceptance criteria:**
- No file in `backend/src/` constructs a `Pool` at module scope (grep returns zero matches outside `index.ts`)
- `npm run test:integration` exits 0 without `--forceExit`
- `npm run test:integration` followed by `jest --detectOpenHandles --testPathPattern=tests/integration` reports zero open handles
- Starting the backend with `npm run dev`, then sending `SIGTERM`, results in a clean shutdown log line within 5 seconds (no orphan connections in Postgres)
- `docs/tech-debt.md` shows TD-001 as Closed with a link to the commit

**Expected commit message:** `refactor(backend): manage pg.Pool lifecycle from application bootstrap`

---

### Task 6 — Database infrastructure: withTransaction + row-mapping helpers + pg error mapping

**Purpose:** Add the shared infrastructure that all repositories will reuse (DRY).

**Files affected:**
- `backend/src/infrastructure/database/with-transaction.ts` *(new)*
- `backend/src/infrastructure/database/pg-errors.ts` *(new — `isUniqueViolation`, `isForeignKeyViolation`, etc.)*
- `backend/src/infrastructure/database/types.ts` *(new — re-export `Pool`, `PoolClient` so domain code can stay free of direct `pg` imports if needed)*
- `backend/tests/unit/infrastructure/database/with-transaction.test.ts` *(BEGIN/COMMIT on success, ROLLBACK on throw, `release()` always)*
- `backend/tests/unit/infrastructure/database/pg-errors.test.ts`

**Acceptance criteria:**
- `withTransaction(pool, fn)` calls `BEGIN`, awaits `fn(client)`, calls `COMMIT`, returns the result
- On throw inside `fn`, `withTransaction` calls `ROLLBACK` and re-throws the original error
- `client.release()` is called in `finally` regardless of outcome
- `npm run test:unit` includes the new tests, all pass

**Expected commit message:** `feat(backend): add transaction helper and pg error mapping utilities`

---

### Task 7 — pg-project repository + integration tests

**Purpose:** First concrete repository. Establishes the integration-test pattern that Tasks 8 and 9 reuse.

**Files affected:**
- `backend/src/infrastructure/repositories/pg-project.repository.ts` *(new)*
- `backend/src/http/plugins/repositories.ts` *(decorate `app.repos.projects`)*
- `backend/tests/integration/setup.ts` *(extend with truncation helper and migration runner)*
- `backend/tests/integration/repositories/pg-project.repository.test.ts` *(new)*

**Acceptance criteria:**
- Implements every method on `ProjectRepository`
- `create` returns the persisted entity with server-generated `id`, `created_at`, `updated_at`
- `create` rejects on duplicate `slug` with a domain-meaningful error (not a raw `error 23505`)
- `findById` and `findBySlug` return `null` (not `undefined`, not throw) for missing rows
- `list` paginates correctly: integration test inserts 25 rows and asserts `limit=10`/`offset=10` returns rows 11–20
- `npm run test:integration` runs the new suite against `tfi_test`, all pass
- Suite exits cleanly with no `--forceExit`

**Expected commit message:** `feat(backend): add postgres projects repository`

---

### Task 8 — pg-test-run repository + integration tests

**Purpose:** Test run persistence and listing, with filtering by branch and environment.

**Files affected:**
- `backend/src/infrastructure/repositories/pg-test-run.repository.ts` *(new)*
- `backend/src/http/plugins/repositories.ts` *(decorate `app.repos.testRuns`)*
- `backend/tests/integration/repositories/pg-test-run.repository.test.ts` *(new)*

**Acceptance criteria:**
- Implements every method on `TestRunRepository`
- `create` accepts an optional `PoolClient`; integration test verifies that passing a client inside `withTransaction` and then throwing causes the run NOT to be persisted
- `listByProject` filter combinations (no filter, branch only, environment only, both) each verified with a focused test
- `findMostRecentByProject` returns the run with the most recent `executed_at`, with `NULLS LAST` semantics
- FK violation on unknown `project_id` returns a domain-meaningful error
- `npm run test:integration` passes; no `--forceExit`

**Expected commit message:** `feat(backend): add postgres test runs repository`

---

### Task 9 — pg-test-case repository + integration tests

**Purpose:** Test-case persistence (bulk insert), retrieval by run, and rolling-window lookup by full_name (foundation for Epic 5 reliability).

**Files affected:**
- `backend/src/infrastructure/repositories/pg-test-case.repository.ts` *(new)*
- `backend/src/http/plugins/repositories.ts` *(decorate `app.repos.testCases`)*
- `backend/tests/integration/repositories/pg-test-case.repository.test.ts` *(new)*

**Acceptance criteria:**
- `createMany` performs a single multi-row INSERT (verified by spying on the client's `query` calls in a small unit test; integration test verifies semantics)
- `createMany` accepts optional `PoolClient`; integration test in a transaction with the test-run insert verifies all-or-nothing behavior
- `findByTestRun` returns cases in stable order (e.g., by `full_name`)
- `findRecentByFullName` returns the most recent N executions ordered by run `executed_at DESC`
- `npm run test:integration` passes; no `--forceExit`

**Expected commit message:** `feat(backend): add postgres test case results repository`

---

### Task 10 — CI integration: Postgres service + integration test step

**Purpose:** Make the integration tests run on every PR.

**Files affected:**
- `.github/workflows/ci.yml`

**Acceptance criteria:**
- Backend job gains `services.postgres` (`postgres:16-alpine`, healthcheck, exposed port)
- Backend job environment includes `DATABASE_URL` pointing at the service
- New step before `npm test`: `npm run migrate:up`
- New step after `npm test`: `npm run test:integration`
- A PR with a deliberately broken repository query fails CI on the integration step
- CI runtime increase is reasonable (target: < 90 seconds added to the backend job)

**Expected commit message:** `ci: run backend integration tests against postgres service`

---

### Task 11 — Documentation pass

**Purpose:** Update the developer-facing README and architecture notes to reflect the data layer.

**Files affected:**
- `README.md` *(add `tfi_test` to the local-setup section; document how to run `npm run test:integration` locally)*
- `docs/architecture/` *(new file: `data-layer.md` describing ports/adapters, transactions, pool lifecycle — kept short, ~1 page)*

**Acceptance criteria:**
- README has copy-pasteable commands for setting up `tfi_test` and running integration tests locally
- `docs/architecture/data-layer.md` exists and references the spec sections by anchor
- No code changes in this task — docs only

**Expected commit message:** `docs: document data layer and integration test workflow`

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Adding `slug` as `NOT NULL` on a non-empty `projects` table would fail | Project is pre-MVP; no production data. Task 1 acceptance criteria verifies on a fresh DB. If staging data exists by then, add a backfill step. |
| Pool refactor (Task 5) lands before repositories (Tasks 7–9) but `--forceExit` removal exposes a different leak | Task 5 acceptance includes `--detectOpenHandles` reporting clean; if a non-pool handle appears, fix it in Task 5 rather than restoring `--forceExit` |
| CI Postgres service slows the pipeline materially | Task 10 acceptance puts a 90-second budget; if exceeded, parallelize unit and integration into separate jobs |
| Migration `005` collides with someone else's `005` | The branching strategy is feature branches off `develop`; no other epic 2 work is in flight. Coordinate via PR titles. |

---

## 11. Commit sequence (summary)

| # | Commit message |
|---|---|
| 1 | `feat(backend): add schema gap remediation migration` |
| 2 | `feat(backend): add domain enums for test runs, cases, and analytics` |
| 3 | `feat(backend): add domain entities for project, run, case, and pattern` |
| 4 | `feat(backend): add repository port interfaces for projects, runs, and cases` |
| 5 | `refactor(backend): manage pg.Pool lifecycle from application bootstrap` |
| 6 | `feat(backend): add transaction helper and pg error mapping utilities` |
| 7 | `feat(backend): add postgres projects repository` |
| 8 | `feat(backend): add postgres test runs repository` |
| 9 | `feat(backend): add postgres test case results repository` |
| 10 | `ci: run backend integration tests against postgres service` |
| 11 | `docs: document data layer and integration test workflow` |

Eleven commits, each one a small, reviewable, self-contained unit of work. The story across the history reads: "remediate schema, define the contract (enums → entities → ports), fix the pool, build the shared infra, implement each repository against real Postgres, turn on CI, document."
