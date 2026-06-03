# Technical Debt

This document tracks known technical debt — accepted shortcuts and structural
issues that are not blockers today but should be addressed when they begin to
affect reliability, developer productivity, or feature work.

Each item is logged with:

- **Current state** — what exists today and how it works
- **Target state** — what the resolution looks like
- **Acceptance criteria** — objective signals that the debt is paid down
- **Trigger to revisit** — the condition that promotes this from "later" to "now"

---

## TD-001 — Refactor PostgreSQL pool lifecycle management

**Status:** Closed (2026-06-03) — see Resolution below.

### Current state

- `backend/src/database/client.ts` creates a module-level `pg.Pool` at import
  time as a singleton
- The backend integration test suite (`backend/tests/integration/`) requires the
  `--forceExit` Jest flag to terminate the test process cleanly
- Pool lifecycle is not explicitly managed in tests — there is no `pool.end()`
  call in any test teardown
- The pool's internal handles (TCP sockets, async resources) can keep the Node
  event loop alive after `app.close()`, because Fastify's lifecycle does not
  own the pool

### Target state

- The pool is constructed inside the application bootstrap (`backend/src/index.ts`)
  rather than at module evaluation time
- The pool is injected into application components (route handlers, plugins)
  that need it, via Fastify decorators or explicit constructor parameters
- Graceful shutdown in `index.ts` calls `pool.end()` on `SIGTERM` and `SIGINT`
- Integration tests construct (or mock) the pool explicitly per suite and
  release it in `afterAll`
- The `--forceExit` flag is removed from `package.json`

### Acceptance criteria

- `npm run test:integration` exits normally with exit code 0 and no `--forceExit`
- `jest --detectOpenHandles` reports no open handles after the suite completes
- No module-level `new Pool(...)` construction anywhere in `backend/src/`
- CI passes without `--forceExit`
- Backend graceful shutdown closes the pool cleanly within 5 seconds

### Trigger to revisit

Promote this item to active work when **any** of the following occurs:

- A second route or use-case imports `database/client.ts`, multiplying the
  surface area of the singleton coupling
- The integration test suite begins flaking in CI due to slow shutdown or
  resource exhaustion
- A future test introduces a second `pg.Pool` (e.g., for a different schema or
  read replica) and the module-level pattern blocks clean isolation
- Developer feedback indicates that `--forceExit` is masking an unrelated
  resource leak

### Notes

`--forceExit` is the accepted pragmatic workaround during Epic 1 foundation
work. It is not architecturally correct, but the refactor scope (touching
`buildApp`, `index.ts`, route plugins, and test fixtures) is larger than the
current symptom warrants. Logged here so it is not forgotten.

### Resolution (2026-06-03)

Closed by Task 5 of
`docs/superpowers/plans/2026-06-03-epic-2-data-layer.md`. Changes:

- `pg.Pool` is constructed in `backend/src/index.ts` via the
  `backend/src/database/create-pool.ts` factory — no module-level
  construction anywhere in `backend/src/`
- The pool is exposed to route handlers as `fastify.pool` by a new
  `backend/src/http/plugins/repositories.ts` plugin, which also registers
  the pool's error listener through Fastify's logger and tears the pool
  down in the app's `onClose` hook
- `SIGTERM` / `SIGINT` handlers in `index.ts` call `app.close()`, which
  drains the pool via the `onClose` hook — single shutdown path for
  production and tests
- `backend/src/database/client.ts` retains `testConnection(pool)` as a
  pure function taking the pool as an argument
- `--forceExit` removed from `backend/package.json` `test:integration`
  script; `jest --detectOpenHandles` reports zero open handles
- Integration test for `/health` rewritten to inject a stub pool to
  `buildApp({ pool })`, exercising the real plugin glue without relying
  on Jest's ESM module mocking
