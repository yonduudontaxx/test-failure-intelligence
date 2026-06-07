# Analytics & Reliability Engine

Maintainer reference for the analytics, reliability, and failure-
intelligence engine. The canonical design lives in the spec and the
Epic 5 + Epic 6 plans, linked at the bottom — this file is a scannable
map of how raw `TestRun` + `TestCaseResult` rows become flaky-test
lists, failure trends, health verdicts, overview dashboards, and the
structured failure-pattern records that drive severity and issue
detection.

## At a glance

```
Fastify route  →  Use case  →  Repository port  →  Pg<Resource>Repository  →  PostgreSQL
                     │
                     ▼
       Domain services (pure functions)
         classifyReliability   evaluateHealth
         extractPattern        assignSeverity        detectIssues
```

Routes live in `backend/src/http/routes/projects/<name>.route.ts`,
use cases in `backend/src/application/use-cases/<name>.ts`, and
domain services in `backend/src/domain/services/`. Each repository
method runs one SQL round-trip; the use case composes them. The
domain services are pure functions invoked after the data is in hand.

See [http-layer.md](./http-layer.md) for envelope and error-handler
conventions, [ingestion.md](./ingestion.md) for how the rows below
were written, and [data-layer.md](./data-layer.md) for the repository
patterns these queries extend.

## Domain services

Five pure functions in `backend/src/domain/services/`. All take plain
inputs, return plain outputs, and have zero external dependencies —
the unit tests drive them with literal arrays. Two were added in Epic
5 (`classifyReliability`, `evaluateHealth`); three were added in
Epic 6 (`extractPattern`, `assignSeverity`, `detectIssues`).

### `classifyReliability(results: TestCaseStatus[]): ReliabilityState`

Lives in `reliability-classifier.ts`. Filter `SKIPPED` first; treat
`FAILED` and `ERROR` as the same failure signal. Empty after filter →
`STABLE`. Only passes → `STABLE`. Only failures → `BROKEN`. Both →
`FLAKY`. `FLAKY` and `BROKEN` are what the flaky-tests endpoint
surfaces; `STABLE` tests are excluded.

### `evaluateHealth(input: HealthInput): ProjectHealthStatus`

Lives in `health-evaluator.ts`. Inputs:

| Field | Meaning |
|---|---|
| `totalRuns` | Run count inside the trend window |
| `recentFailureRate` | Failures ÷ runs inside the trend window (0.0–1.0) |
| `brokenTestCount` | Distinct tests classified `BROKEN` over the window |
| `flakyTestCount` | Distinct tests classified `FLAKY` over the window |

Thresholds (in order; first match wins):

| Condition | Verdict |
|---|---|
| `totalRuns === 0` | `HEALTHY` |
| `recentFailureRate > 0.20` OR `brokenTestCount ≥ 3` OR `flakyTestCount > 15` | `CRITICAL` |
| `recentFailureRate > 0.05` OR `brokenTestCount ≥ 1` OR `flakyTestCount > 5` | `WARNING` |
| otherwise | `HEALTHY` |

Any single dimension can move the verdict — three broken tests trip
`CRITICAL` even with a 0% failure rate. An empty project is `HEALTHY`,
not `WARNING`.

The thresholds are exported from `health-thresholds.ts` and shared
with `detectIssues` (below), so `evaluateHealth` and the issue
detector cannot drift apart.

### `extractPattern(failureMessage, failureType, testName)`

Lives in `pattern-extractor.ts`. Builds a canonical pattern string by
composing `failureType: firstLine(failureMessage)` (or a fallback
when one or both are absent), then scrubbing volatile substrings so
the same underlying defect collapses to one row regardless of
incidental variation. Scrub rules, applied in order:

| Pattern | Replacement |
|---|---|
| ISO timestamps | `<TS>` |
| UUIDs | `<UUID>` |
| File:line[:col] refs (10 source extensions) | `<PATH>` |
| Hex addresses (`0x…`) | `<ADDR>` |
| URL query strings (base preserved) | `<QUERY>` |
| Numeric clusters with word boundaries (`\b\d{3,}\b`) | `<N>` |

Whitespace is collapsed to single spaces, the result is truncated to
200 chars with an ellipsis. Output category comes from a separate
keyword scan over the pattern + type: `timeout`, `network`,
`database`, `assertion`, or `unknown`. See [tech-debt.md](../tech-debt.md)
TD-002 for a known limitation in the numeric scrub regex.

### `assignSeverity({ occurrenceCount, category, lastSeenAt, now? })`

Lives in `severity-assigner.ts`. Stale check first; then numeric
thresholds:

| Condition | Severity |
|---|---|
| `daysSinceLastSeen > 30` | `LOW` (stale — even huge counts age out) |
| `occurrenceCount ≥ 50` | `CRITICAL` |
| `occurrenceCount ≥ 25` AND `category ∈ {timeout, network, database}` | `CRITICAL` |
| `occurrenceCount ≥ 20` | `HIGH` |
| `occurrenceCount ≥ 5` | `MEDIUM` |
| otherwise | `LOW` |

The elevated-category branch reflects that infra-class failures
hitting double-digit recurrence usually indicate an outage or
regression — they pre-empt to `CRITICAL` earlier than e.g. assertion
failures. `now` is injectable for deterministic testing.

### `detectIssues({ totalRuns, recentFailureRate, brokenTestCount, flakyTestCount, patterns })`

Lives in `issue-detector.ts`. Consumes the same `HealthInput` as
`evaluateHealth` plus `FailurePatternSummary[] = { severity,
occurrenceCount }[]` and returns two arrays of `{ code, message }`.
`totalRuns === 0` short-circuits to empty arrays.

| Trigger | Code | Bucket |
|---|---|---|
| `brokenTestCount ≥ 1` | `BROKEN_TESTS_PRESENT` | warning |
| `brokenTestCount ≥ 3` | `BROKEN_TESTS_THRESHOLD` | critical |
| `recentFailureRate > 0.05` | `PASS_RATE_LOW` | warning |
| `recentFailureRate > 0.20` | `PASS_RATE_CRITICAL` | critical |
| `flakyTestCount > 5` | `FLAKY_TESTS_MODERATE` | warning |
| `flakyTestCount > 15` | `FLAKY_TESTS_HIGH` | critical |
| `pattern.severity === 'HIGH'` (per pattern) | `HIGH_SEVERITY_PATTERN` | warning |
| `pattern.severity === 'CRITICAL'` (per pattern) | `CRITICAL_SEVERITY_PATTERN` | critical |

Numeric-input triggers are independent — both `BROKEN_TESTS_PRESENT`
and `BROKEN_TESTS_THRESHOLD` fire at `brokenTestCount=5`. Pattern
triggers are mutually exclusive: a `CRITICAL` pattern emits only the
critical item, not also the warning.

`/health` returns both arrays in full. `/overview` exposes the top
three critical issues as `topCriticalIssues` (no warnings on
overview — the dashboard surfaces what's broken, not what's
degrading).

## The aggregated SQL approach

`computeReliabilitySummaries(projectId, { days })` on
`PgTestCaseRepository` powers `/flaky-tests`, `/health`, and
`/overview` from **one** round-trip. It runs a window query inside a
CTE:

```sql
WITH windowed AS (
  SELECT ..., ROW_NUMBER() OVER (
    PARTITION BY tcr.full_name
    ORDER BY tr.executed_at DESC NULLS LAST, tr.ingested_at DESC, tcr.id DESC
  ) AS rn
  FROM test_case_results tcr
  JOIN test_runs tr ON tr.id = tcr.test_run_id
  WHERE tcr.project_id = $1
    AND COALESCE(tr.executed_at, tr.ingested_at) >= $2
)
SELECT
  full_name,
  COUNT(*) FILTER (WHERE status = 'PASSED')                AS pass_count,
  COUNT(*) FILTER (WHERE status IN ('FAILED','ERROR'))     AS fail_count,
  COUNT(*) FILTER (WHERE status = 'SKIPPED')               AS skipped_count,
  (ARRAY_AGG(status      ORDER BY rn ASC))[1]              AS last_status,
  (ARRAY_AGG(executed_at ORDER BY rn ASC))[1]              AS last_executed_at
FROM windowed
GROUP BY full_name;
```

Each row is a `ReliabilitySummary`: one entry per distinct `full_name`
with per-status counts and the most recent execution. The use case
then synthesizes a status array from `passCount` + `failCount` and
passes it to `classifyReliability` — the SQL counts and the
classifier agree by construction because both treat `ERROR` as
`FAILED` and `SKIPPED` separately.

Run-bucket trends use a sibling query, `findFailureTrend(projectId,
{ days, bucketSize })`, which `DATE_TRUNC`s `COALESCE(executed_at,
ingested_at)` at `'day'` or `'week'` and returns
`{ date, totalRuns, failedRuns, passRate }[]` ordered ASC.

Why aggregate in SQL rather than streaming raw rows: a project with
weeks of history can have tens of thousands of `test_case_results`
rows. Counting them in JS pulls every row over the wire; counting them
in Postgres returns one row per distinct test. The window is bounded
by the `days` parameter (default 30, max 90) so the working set stays
small.

## Pattern persistence

Failure patterns are written during ingestion — see
[ingestion.md](./ingestion.md#failure-pattern-extraction) for the
pipeline. The write side uses
`FailurePatternRepository.upsertByPattern`, an atomic
`INSERT … ON CONFLICT (project_id, pattern) DO UPDATE` that:

- increments `occurrence_count` by 1,
- advances `last_seen_at` via `GREATEST` (a delayed write with an
  older timestamp cannot regress it),
- overwrites `severity` with the caller's value (re-derived from the
  current batch),
- leaves `category` and `first_seen_at` untouched on conflict.

Severity on the row reflects the most recent batch, not cumulative
history — a one-occurrence batch overwrites a previously-set `HIGH`
back to `LOW`. Acceptable for MVP; the next ingestion that produces
a larger batch escalates it again. If this churn becomes visible in
the dashboard, recompute severity from the persisted
`occurrence_count` post-upsert instead.

## Known limitations

- **No caching.** Every request re-runs the SQL. The aggregate
  approach keeps each query under a few hundred ms on realistic
  volumes — measure before adding a cache layer.
- **Idempotency.** Duplicate ingestion double-counts in every
  analytics endpoint *and* double-bumps pattern `occurrence_count`.
  The MVP accepts duplicate `test_runs` rows by design; see
  [ingestion.md](./ingestion.md#idempotency) for the Phase 2 plan
  (partial unique index on
  `(project_id, external_id) WHERE external_id IS NOT NULL`).
- **Pattern collapse edge case.** The numeric scrub regex requires
  word boundaries — `30000ms` is left intact while `30000 ms`
  collapses to `<N> ms`. Tracked as TD-002 in
  [tech-debt.md](../tech-debt.md).

## Adding a new analytics endpoint

1. **Schema** — declare query, response, and TS interface in
   `backend/src/http/schemas/analytics.ts`. Set
   `additionalProperties: false`; bound numeric inputs
   (`minimum`/`maximum`) so abusive parameters cannot trigger a
   multi-year scan.
2. **Port + impl** — extend the repository port in
   `backend/src/domain/ports/` and add the method to its
   `Pg<Name>Repository`. One SQL round-trip per port method; reuse
   the `windowed` CTE above for per-test aggregation, `DATE_TRUNC`
   for time bucketing.
3. **Use case** — pure function in
   `backend/src/application/use-cases/<name>.ts`: project lookup →
   404 if missing, call the repo, run any domain service, shape the
   response. No Fastify or `pg` imports.
4. **Route** — two or three lines in
   `backend/src/http/routes/projects/<name>.route.ts`: read query,
   call use case, `success(...)`.
5. **Register** — add the plugin to `backend/src/app.ts` under
   `/api/v1`.
6. **Tests** — unit test the use case with a hand-rolled mock repo
   (cover empty project + 404); integration test the route end-to-end
   against real data, asserting envelope shape and the 400 / 404
   paths.

## Where to read more

- **Design spec:**
  `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md`
  - §3 enums (`ReliabilityState`, `ProjectHealthStatus`, `FailureSeverity`)
  - §8 Reliability classifier and health evaluator
  - §9 Epic 5 + Epic 6 scope
- **Epic 5 plan:**
  `docs/superpowers/plans/2026-06-07-epic-5-analytics-reliability.md`
  - §6 Use case design
  - §7 Aggregated SQL strategy
  - §8 Health-evaluator thresholds
- **Epic 6 plan:**
  `docs/superpowers/plans/2026-06-07-epic-6-health-scoring-failure-intelligence.md`
  - §4 Pattern extraction & severity assignment design
  - §5 Issue detection rules
- **HTTP layer:** [http-layer.md](./http-layer.md)
- **Ingestion:** [ingestion.md](./ingestion.md)
- **Data layer:** [data-layer.md](./data-layer.md)
- **Tech debt:** [../tech-debt.md](../tech-debt.md) (TD-002)
- **Live OpenAPI spec:** Swagger UI at `/documentation`
