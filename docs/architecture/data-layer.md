# Data Layer

Maintainer reference for the data layer added in Epic 2. The canonical
design lives in the spec and the Epic 2 plan, linked at the bottom — this
file is a scannable map of where things live and which conventions apply
when extending them.

## At a glance

```
HTTP routes (Fastify)
        │
        ▼
Use cases                              ← Epic 3+
        │  depends on ports
        ▼
Domain (entities, enums, ports, errors)
        ▲  implements ports
        │
Infrastructure (pg repositories, db helpers)
        │
        ▼
PostgreSQL
```

Dependency arrows point inward. The domain layer has zero `import` of
`pg`, Fastify, infrastructure, http, or use-case code. Verified by
`grep -r "from 'pg'" backend/src/domain/` returning zero matches.

## Layers

### Domain — `backend/src/domain/`

- **`entities/`** — `Project`, `TestRun`, `TestCaseResult`, `FailurePattern`.
  Plain readonly TypeScript types in camelCase. Each module also exports
  a `New<Entity>` input type for `repo.create()` calls (omits
  server-generated fields).
- **`enums/`** — `TestRunStatus`, `TestCaseStatus`, `SourceType`,
  `ReliabilityState`, `FailureSeverity`, `ProjectHealthStatus`. Each is
  a string-union derived from an `as const` array, paired with an
  `is<EnumName>(value): value is …` type guard for boundary validation.
- **`ports/`** — repository interfaces (`ProjectRepository`,
  `TestRunRepository`, `TestCaseRepository`) and the opaque `TxClient`
  alias used on write methods that participate in transactions.
- **`errors/`** — `UniqueConstraintError`, `ForeignKeyError`. Thrown by
  repositories for constraint violations; everything else propagates.

### Infrastructure — `backend/src/infrastructure/`

- **`database/types.ts`** — re-exports `Pool`, `PoolClient`, `QueryResult`,
  `QueryResultRow` from `pg`. One of only two files in `backend/src/`
  that import directly from `'pg'`.
- **`database/create-pool.ts`** — the single `new Pool(...)` call site.
  Factory used by `index.ts` for production and (with `TEST_DATABASE_URL`
  override) by `test-pool.ts` for integration tests.
- **`database/with-transaction.ts`** — `withTransaction(pool, fn)`
  acquires a client, runs `BEGIN`/`COMMIT`, calls `ROLLBACK` on throw,
  and releases the client in `finally`. The rollback path swallows
  rollback errors so the caller-relevant error is preserved.
- **`database/pg-errors.ts`** — `isUniqueViolation`,
  `isForeignKeyViolation`, and `toDomainError(err)` mapping SQLSTATE
  23505/23503 to the corresponding domain error class.
- **`repositories/pg-*.repository.ts`** — concrete Postgres
  implementations. Each owns a `private readonly pool: Pool`, a private
  `mapRow(row): Entity` translator, and wraps writes in
  `try { … } catch (err) { throw toDomainError(err) ?? err }`.

### Bootstrap — `backend/src/`

- **`index.ts`** — calls `createPool(config)`, hands the pool to
  `buildApp({ pool })`, registers `SIGTERM`/`SIGINT` handlers that
  invoke `app.close()`, and `app.listen`s.
- **`http/plugins/repositories.ts`** — Fastify plugin that decorates
  `app.pool` and `app.repos.{projects,testRuns,testCases}`, registers
  the pool's error listener through Fastify's logger, and tears the
  pool down in the app's `onClose` hook.

## Naming conventions

| Layer | Convention | Example |
|---|---|---|
| Database columns | `snake_case` | `project_id`, `executed_at` |
| Domain entities | `camelCase` | `projectId`, `executedAt` |
| API JSON | `camelCase` | `"projectId": "..."` |

Each repository's `mapRow(row): Entity` helper is the single seam that
translates between the database shape and the domain shape. It also
normalises pg's `null` to `undefined` for optional fields and `null`
JSONB columns to `{}`.

## Transaction pattern

Write methods on `TestRunRepository` and `TestCaseRepository` accept
an optional `client?: TxClient`:

```ts
async create(input: NewTestRun, client?: TxClient): Promise<TestRun> {
  const runner = client ?? this.pool;
  // … runner.query(...) …
}
```

Callers use `withTransaction` to bracket cross-repository writes
atomically (this is exactly what Epic 4 ingestion will do):

```ts
await withTransaction(pool, async (tx) => {
  const run = await repos.testRuns.create(newRun, tx);
  await repos.testCases.createMany(
    cases.map((c) => ({ ...c, testRunId: run.id })),
    tx,
  );
});
```

If the callback throws, both the run and the cases roll back together.
`ProjectRepository.create` does **not** accept `client?` — no use case
needs project creation to participate in a larger transaction.

## Pool lifecycle

```
node dist/index.js
        │
        ▼
  index.ts: start()
        ├── createPool(config)                        ← single construction site
        ├── buildApp({ pool })                        ← registers repositories plugin
        │     └── plugin: decorate('pool', pool), addHook('onClose', pool.end)
        └── app.listen()

(later)

SIGTERM / SIGINT  →  app.close()  →  onClose hook  →  pool.end()  →  process.exit(0)
```

One ownership path means:

- No module-level pool anywhere in `backend/src/`
- No `--forceExit` in the integration test script (closed TD-001)
- No orphan Postgres connections after `npm run dev` exits
- Test files own their own pool through `createTestPool()`, closed by
  `afterAll(() => pool.end())` — the same `onClose`/`pool.end` mechanic
  is exercised in CI via `globalSetup`

## Adding a new repository

When a future epic needs a fourth repository (e.g., `FailurePattern`):

1. Define the port in `backend/src/domain/ports/<name>.repository.ts`
   — interface only, no implementation, no `pg` imports.
2. Confirm the entity and `New<Entity>` types exist in
   `backend/src/domain/entities/<name>.ts` (they were sketched in Task 3).
3. Implement `Pg<Name>Repository` in
   `backend/src/infrastructure/repositories/pg-<name>.repository.ts`.
   Pattern: class with `private readonly pool: Pool` constructor
   injection; top-level `mapRow`; `try/catch + toDomainError` on writes;
   `client?: TxClient` parameter on writes that may participate in
   transactions.
4. Wire into `backend/src/http/plugins/repositories.ts`: extend the
   `declare module 'fastify'` interface to add the new repo, and
   instantiate it in the plugin body.
5. Add an integration test file at
   `backend/tests/integration/repositories/pg-<name>.repository.test.ts`.
   Reuse `createTestPool()` and `truncateAll()`; do `beforeEach`
   truncation.
6. If the new repository participates in a cross-table transaction with
   an existing one, add a `withTransaction` rollback test that asserts
   both sides do not persist.

## Where to read more

- **Design spec:**
  `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md`
  - §1 System Architecture
  - §2 Repository Structure
  - §3 Domain Enums
  - §4 Domain Model (snake_case schema; entity field tables)
  - §6 Database Schema
- **Epic 2 plan:**
  `docs/superpowers/plans/2026-06-03-epic-2-data-layer.md`
  - §5 Repository layer design and naming conventions
  - §6 Transaction strategy
  - §7 Dependency injection strategy
- **Tech debt log:** `docs/tech-debt.md` (TD-001 closed by Task 5)
