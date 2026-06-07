# Analytics & Reliability Engine

Maintainer reference for the Epic 5 analytics and reliability engine.
The canonical design lives in the spec and the Epic 5 plan, linked at
the bottom — this file is a scannable map of how raw `TestRun` +
`TestCaseResult` rows become flaky-test lists, failure trends, health
verdicts, and overview dashboards.

## At a glance

```
Fastify route  →  Use case  →  Repository port  →  Pg<Resource>Repository  →  PostgreSQL
                     │
                     ▼
              Domain service (classifyReliability / evaluateHealth)
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

Two pure functions in `backend/src/domain/services/`. Both take plain
inputs, return plain outputs, and have zero external dependencies —
the unit tests drive them with literal arrays.

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

## MVP limitations

- **`topFailurePatterns` is always `[]`.** The `failure_patterns`
  table exists and `PgFailurePatternRepository.listByProject` returns
  the rows, but no use case writes them yet. Phase 2 will add pattern
  extraction from failure messages during ingestion. The `/overview`
  and `/failure-patterns` endpoints are wired so the contract is
  stable today; only the data is missing.
- **No caching.** Every request re-runs the SQL. The aggregate
  approach keeps each query under a few hundred ms on realistic
  volumes — measure before adding a cache layer.
- **Idempotency.** Duplicate ingestion double-counts in every
  analytics endpoint. The MVP accepts duplicate `test_runs` rows by
  design; see [ingestion.md](./ingestion.md#idempotency) for the
  Phase 2 plan (partial unique index on
  `(project_id, external_id) WHERE external_id IS NOT NULL`).

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
  - §3 enums (`ReliabilityState`, `ProjectHealthStatus`)
  - §8 Reliability classifier and health evaluator
  - §9 Epic 5 scope
- **Epic 5 plan:**
  `docs/superpowers/plans/2026-06-07-epic-5-analytics-reliability.md`
  - §6 Use case design
  - §7 Aggregated SQL strategy
  - §8 Health-evaluator thresholds
  - §13 Port-method rollout order
- **HTTP layer:** [http-layer.md](./http-layer.md)
- **Ingestion:** [ingestion.md](./ingestion.md)
- **Data layer:** [data-layer.md](./data-layer.md)
- **Live OpenAPI spec:** Swagger UI at `/documentation`
