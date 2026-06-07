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

---

## TD-002 — Numeric scrub word-boundary limitation in PatternExtractor

**Status:** Accepted (2026-06-07)

### Current state

`backend/src/domain/services/pattern-extractor.ts` scrubs numeric
clusters of 3 or more digits to `<N>` via the regex
`/\b\d{3,}\b/g`. The `\b` anchors require a word/non-word transition
on either side, so digits immediately adjacent to letters are not
matched:

- `"timed out after 30000 ms"` → `"timed out after <N> ms"` ✓
- `"timed out after 30000ms"`  → `"timed out after 30000ms"` ✗ (left as-is)
- `"port 8080"`                 → `"port <N>"` ✓
- `"port8080"`                  → `"port8080"` ✗

### Impact

Two failure messages that differ only by a digit cluster glued to a
unit suffix (`30000ms` vs `45000ms`) extract to **distinct** canonical
patterns and produce two `failure_patterns` rows instead of one. The
dashboard surfaces them as separate "top failure patterns" entries.

The collision case is narrow:

- common shapes like `Took 30 ms`, `port 8080`, ISO timestamps, hex
  addresses, and bare numerics ≥ 3 digits all collapse correctly
- only failures emitted by frameworks that don't space units away
  from numbers exhibit the divergence
- the JS/TS ecosystem mostly emits `30000 ms` (with a space), so
  Node/Jest/Playwright payloads are unaffected in practice

### Target state

Relax the regex to `/\d{3,}/g` (no word-boundary anchors). This
scrubs digit clusters wherever they appear, at the cost of over-
scrubbing identifiers like `id123` (rendered `id<N>`).

### Acceptance criteria

- All existing pattern-extractor unit tests pass with the relaxed
  regex
- Added unit cases assert that `30000ms`, `port8080`, and
  `Took45000ms` all scrub to `<N>` form
- No production pattern row exists today that would split into
  multiple rows under the new regex (verified via a one-off audit
  query before flipping)

### Trigger to revisit

Promote this item when **any** of the following:

- Users report duplicate "top failure patterns" entries that look
  almost identical except for an adjacent-digit cluster
- A non-JS ecosystem adapter (e.g., pytest, JUnit XML from JVM
  frameworks) lands and produces failure messages with unit-glued
  numerics
- The `failure_patterns` table grows past 10× expected cardinality
  for a single project, and inspection shows pattern duplication

### Notes

The decision to keep `\b…\b` was deliberate during Epic 6 — it
preserves identifier-style strings (e.g., test names like
`fixture_42_alpha`) from getting scrubbed in test-name-containing
fallback patterns. Removing the anchors trades one false-collapse
class for another; revisit when there's data to choose between them.
