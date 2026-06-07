# Epic 5 — Analytics & Reliability Engine Implementation Plan

**Status:** Draft — pending review
**Date:** 2026-06-07
**Spec reference:** `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md` §1, §3 (`ReliabilityState`, `ProjectHealthStatus`), §4 (`TestCaseResult`, `FailurePattern`), §6, §7 "Test Runs" + "Analytics", §9 "Epic 5: Analytics API", §11 (implementation notes — "Reliability classification is computed on-read")
**Predecessor:** Epic 4 Test Result Ingestion (released to `main` via PR #6, back-merged into develop as `85771ba`) — supplies populated `test_runs` and `test_case_results` tables, `TestRunRepository.listByProject` / `findById` / `findMostRecentByProject`, `TestCaseRepository.findByTestRun` / `findRecentByFullName`, the global error handler, envelope helpers, and the `removeAdditional: false` Ajv config

---

## 1. Objective

Expose the read-side analytics surface that consumes the test-run and test-case-result data Epic 4 ingests. Eight endpoints, grouped:

```
# Test run queries (raw history)
GET /api/v1/projects/:projectId/runs                       paginated run list
GET /api/v1/projects/:projectId/runs/:runId                single run detail
GET /api/v1/projects/:projectId/runs/:runId/cases          cases for one run

# Analytics
GET /api/v1/projects/:projectId/overview                   pass-rate, counts, recent runs, top patterns
GET /api/v1/projects/:projectId/health                     HEALTHY / WARNING / CRITICAL
GET /api/v1/projects/:projectId/flaky-tests                FLAKY + BROKEN tests (rolling window)
GET /api/v1/projects/:projectId/failure-trends             daily run-failure-rate buckets
GET /api/v1/projects/:projectId/failure-patterns           failure-pattern records (empty in MVP)
```

The two load-bearing pieces of new behaviour are:

- **`ReliabilityClassifier`** — a pure domain service that maps a rolling window of `TestCaseResult` rows for one `full_name` to `STABLE | FLAKY | BROKEN` (or `null` when there's no signal).
- **`HealthEvaluator`** — a pure domain service that maps pass-rate + broken-test count + flaky-test rate to `HEALTHY | WARNING | CRITICAL` per spec §3.

Both are upgradeable without schema changes (spec §11: "Reliability classification is computed on-read"). Everything else in this epic is repository SQL, response shaping, and route wiring on top of these two services.

---

## 2. Scope

### In scope

- One Fastify route module `backend/src/http/routes/projects/runs.route.ts` registering the three test-run query endpoints
- One Fastify route module `backend/src/http/routes/projects/analytics.route.ts` registering the five analytics endpoints
- Two domain services in `backend/src/domain/services/`:
  - `reliability-classifier.ts` — pure function `classify(results: TestCaseResult[]): ReliabilityState | null`
  - `health-evaluator.ts` — pure function `evaluate({ passRate, brokenTests, flakyTestRate }): ProjectHealthStatus`
- Five use cases in `backend/src/application/use-cases/`:
  - `list-test-runs.ts`, `get-test-run.ts`, `list-run-cases.ts` (the three run-query endpoints share data)
  - `compute-reliability.ts` (drives the flaky-tests endpoint)
  - `get-project-health.ts`
  - `get-failure-trend.ts`
  - `get-project-overview.ts`
  - `list-failure-patterns.ts`
- Repository extensions:
  - **`TestCaseRepository.computeReliabilitySummaries(projectId, window): Promise<ReliabilitySummary[]>`** — one SQL query that returns per-`full_name` pass/fail/skip counts across the last N executions, plus `lastStatus` and `lastExecutedAt`. Drives flaky-tests, health, and overview.
  - **`TestRunRepository.findFailureTrend(projectId, opts): Promise<DailyFailureBucket[]>`** — date-bucketed run-failure-rate aggregation
  - **`TestRunRepository.countByProject(projectId): Promise<number>`** — overview metric
  - **`TestCaseRepository.countByProject(projectId): Promise<number>`** — overview metric
  - **`TestCaseRepository.countByStatus(projectId, status): Promise<number>`** — overview pass-rate denominator
- New minimal `FailurePatternRepository` port + `PgFailurePatternRepository` — only a `listByProject(projectId, opts)` read method. Writes are Phase 2.
- JSON schemas for all eight endpoints in `backend/src/http/schemas/test-run.ts` and `backend/src/http/schemas/analytics.ts`
- Unit tests for the two domain services (table-driven), each use case (mock repos), and each repository extension's SQL (against `tfi_test`)
- Integration tests for every route via `app.inject()` against the real `tfi_test` database
- README + `docs/architecture/analytics.md` (new) + minor `http-layer.md` updates

### Explicitly out of scope (deferred, with justification)

- **Failure-pattern extraction / writing to `failure_patterns`** → Spec §10 Phase 2 ("failure pattern clustering"). The table stays empty in MVP; `GET /failure-patterns` returns `[]` and `topFailurePatterns` in the overview response is always `[]`. The read repository exists so Phase 2 only needs to add writes.
- **`PATCH` on failure patterns (severity assignment)** → Spec §3 says "Phase 2: heuristic-based assignment". Not in MVP scope.
- **Statistical flakiness scoring** → Spec §10 Phase 3. Epic 5 implements the simple rolling-window classifier from spec §3 only.
- **Trend comparison (current vs previous period)** → Spec §10 Phase 2.
- **Environment / branch breakdown in analytics** → Spec §10 Phase 2 "Environment stability analytics".
- **Cursor pagination** → Existing `listByProject` uses offset pagination. Not changing pagination contracts in this epic.
- **Authentication on analytics routes** → Spec §10 Phase 3.
- **PostHog-style cohort analytics, custom dashboards** → Phase 3.

### Constraints

- KISS: no premature aggregation table, no materialised view, no caching layer. The spec §11 deliberately computes reliability on read — that holds for MVP volumes (hundreds of runs per project).
- DRY: one envelope module (Epic 3), one error handler (Epic 3+4), one `ReliabilityClassifier`, one `HealthEvaluator` — every use case that needs these calls the same functions.
- YAGNI: no domain-event bus, no read-side cache, no Phase-2 fields snuck in. New repo methods exist only when an endpoint needs them.
- The domain services stay pure: no `pg`, no Fastify, no I/O. Their unit tests run without any database.
- One logical task = one logical commit. Conventional Commits per `memory/workflow.md`. No `Co-authored-by` trailer.

---

## 3. Architecture

```
HTTP routes
   │   backend/src/http/routes/projects/runs.route.ts
   │   backend/src/http/routes/projects/analytics.route.ts
   │     validates path/query via JSON Schema (Ajv)
   ▼
Use cases
   │   backend/src/application/use-cases/
   │     list-test-runs.ts   get-test-run.ts   list-run-cases.ts
   │     compute-reliability.ts   get-project-health.ts
   │     get-failure-trend.ts   get-project-overview.ts
   │     list-failure-patterns.ts
   │     each: pure function (repos, services, input) → result
   ▼
Domain services + Repository ports
   │   backend/src/domain/services/reliability-classifier.ts
   │   backend/src/domain/services/health-evaluator.ts
   │   backend/src/domain/ports/test-run.repository.ts        (extended)
   │   backend/src/domain/ports/test-case.repository.ts        (extended)
   │   backend/src/domain/ports/failure-pattern.repository.ts  (new)
   ▲
   │   implemented by
Infrastructure
   │   backend/src/infrastructure/repositories/
   │     pg-test-run.repository.ts          (extended)
   │     pg-test-case.repository.ts          (extended)
   │     pg-failure-pattern.repository.ts    (new)
   ▼
PostgreSQL
```

Dependency direction unchanged from Epics 2–4. The two new domain services have **zero** runtime dependencies — pure functions over plain inputs. The use cases consume them by direct import (no DI for pure functions; same KISS rationale as Epic 3 §7 for use cases).

**Composition root:** existing `repositoriesPlugin` (Epic 2) gets one new field: `app.repos.failurePatterns`. The pre-existing `app.repos.testRuns` and `app.repos.testCases` gain new methods on their ports; the route handlers consume them directly.

---

## 4. Endpoint designs

All under the `/api/v1/projects/:projectId/` prefix. All return the spec §7 envelope: `{ data: ... }` on success or `{ error: { code, message } }` on failure. `projectId` is validated as `format: 'uuid'` across all eight; an unknown but well-formed UUID returns `404 PROJECT_NOT_FOUND`.

### 4.1 GET /runs (list test runs)

**Path:** `GET /api/v1/projects/:projectId/runs`

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | integer | `1` | `minimum: 1`, `maximum: 10000` |
| `limit` | integer | `50` | `minimum: 1`, `maximum: 100` |
| `branch` | string | — | Optional filter, exact match |
| `environment` | string | — | Optional filter, exact match |

`additionalProperties: false`.

**Response — 200 OK:**

```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "sourceType": "api",
        "pipelineName": "GitHub Actions",
        "buildNumber": "245",
        "branch": "main",
        "commitSha": "abc123",
        "environment": "ci",
        "status": "FAILED",
        "totalTests": 42,
        "passedTests": 40,
        "failedTests": 2,
        "skippedTests": 0,
        "durationMs": 45000,
        "ingestedAt": "2026-06-01T12:00:00.000Z",
        "executedAt": "2026-06-01T11:59:00.000Z"
      }
    ],
    "total": 137,
    "page": 1,
    "limit": 50
  }
}
```

**Errors:** 400 `VALIDATION_ERROR` (bad query/params), 404 `PROJECT_NOT_FOUND` (no runs for unknown project, derived by the use case checking project existence).

### 4.2 GET /runs/:runId

**Path:** `GET /api/v1/projects/:projectId/runs/:runId`

**Response — 200 OK:** `{ data: <run object> }` (same shape as a single item in §4.1).

**Errors:** 400 `VALIDATION_ERROR` (non-UUID `runId`), 404 `RUN_NOT_FOUND` (run id not found OR exists but in a different project).

> **New error code introduced:** `RUN_NOT_FOUND` (404). Mapped via a new branch in the global error handler keyed on a route-thrown `httpErrors.notFound(...)` with `request.url` matching `/api/v1/projects/.../runs/`. See §6.

### 4.3 GET /runs/:runId/cases

**Path:** `GET /api/v1/projects/:projectId/runs/:runId/cases`

**Response — 200 OK:**

```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "suiteName": "AuthService",
        "testName": "should authenticate",
        "fullName": "AuthService > should authenticate",
        "status": "PASSED",
        "durationMs": 120,
        "failureMessage": null,
        "failureType": null,
        "retryCount": 0
      }
    ]
  }
}
```

No pagination — a single run's case list is bounded (~thousands at most) and the dashboard's case-view page consumes the whole list.

**Errors:** 400 (non-UUID), 404 `RUN_NOT_FOUND` (run id unknown or in another project).

### 4.4 GET /overview

**Path:** `GET /api/v1/projects/:projectId/overview`

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `window` | integer | `30` | Rolling-window size for reliability classification. `minimum: 1`, `maximum: 200` |

**Response — 200 OK:**

```json
{
  "data": {
    "totalRuns": 150,
    "totalTestCases": 6300,
    "passRate": 92.4,
    "failureRate": 7.6,
    "flakyTestCount": 14,
    "brokenTestCount": 3,
    "stableTestCount": 243,
    "recentRuns": [
      {
        "runId": "uuid",
        "status": "FAILED",
        "executedAt": "2026-06-01T12:00:00.000Z",
        "passedTests": 40,
        "failedTests": 2
      }
    ],
    "topFailurePatterns": []
  }
}
```

`passRate` and `failureRate` are derived from the most recent test run's `passed_tests / total_tests` per spec §3. `recentRuns` returns the last **5** runs. `topFailurePatterns` is `[]` in MVP (the source table is empty).

**Errors:** 400 (bad `window`), 404 `PROJECT_NOT_FOUND`.

### 4.5 GET /health

**Path:** `GET /api/v1/projects/:projectId/health`

**Query parameters:** same `?window=N` (default 30).

**Response — 200 OK:**

```json
{
  "data": {
    "overallStatus": "WARNING",
    "passRate": 92,
    "failureRate": 8,
    "flakyTests": 14,
    "brokenTests": 3,
    "latestRunStatus": "SUCCESS"
  }
}
```

`overallStatus` is computed by `HealthEvaluator` per spec §3 decision matrix:
- `CRITICAL` if `passRate < 80 OR brokenTests >= 3 OR flakyTestRate > 15%`
- `WARNING` if `passRate 80–94 OR brokenTests 1–2 OR flakyTestRate 6–15%`
- `HEALTHY` if `passRate >= 95 AND brokenTests == 0 AND flakyTestRate <= 5%`

CRITICAL > WARNING > HEALTHY precedence. `flakyTestRate` = `(flakyTestCount / totalUniqueFullNames) * 100`.

If the project has zero runs, response is `{ overallStatus: 'HEALTHY', passRate: null, failureRate: null, flakyTests: 0, brokenTests: 0, latestRunStatus: null }`. Documented explicitly; alternative ("UNKNOWN" status) rejected because spec §3 only defines three states.

**Errors:** 400, 404.

### 4.6 GET /flaky-tests

**Path:** `GET /api/v1/projects/:projectId/flaky-tests`

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `window` | integer | `30` | Rolling-window size |
| `state` | string | — | Optional filter: `FLAKY` \| `BROKEN`. Default = both |

**Response — 200 OK:**

```json
{
  "data": {
    "items": [
      {
        "fullName": "AuthService > should reject expired token",
        "suiteName": "AuthService",
        "testName": "should reject expired token",
        "reliabilityState": "FLAKY",
        "passCount": 18,
        "failCount": 7,
        "lastStatus": "FAILED",
        "lastExecutedAt": "2026-06-01T12:00:00.000Z",
        "windowSize": 30
      }
    ],
    "windowSize": 30
  }
}
```

Ordering: `BROKEN` first (more severe), then `FLAKY`; within each state, `failCount DESC, lastExecutedAt DESC` so the most-impactful and recent failures lead.

**Errors:** 400 (bad `window`, bad `state`), 404.

### 4.7 GET /failure-trends

**Path:** `GET /api/v1/projects/:projectId/failure-trends`

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `from` | string (date) | 30 days ago (UTC) | ISO 8601 date `YYYY-MM-DD` |
| `to` | string (date) | today (UTC) | ISO 8601 date `YYYY-MM-DD`; must be ≥ `from` |

**Response — 200 OK:**

```json
{
  "data": {
    "buckets": [
      { "date": "2026-05-25", "totalRuns": 6, "failedRuns": 1, "failureRate": 16.7 },
      { "date": "2026-05-26", "totalRuns": 8, "failedRuns": 3, "failureRate": 37.5 }
    ],
    "period": { "from": "2026-05-08", "to": "2026-06-07" }
  }
}
```

`failedRuns` counts runs with `status = 'FAILED'` (PARTIAL is **not** counted as failed — spec §3 treats PARTIAL as "completed but skipped", a neutral outcome). `failureRate` is rounded to 1 decimal place. Days with zero runs are **omitted** from `buckets` (not emitted as `{ totalRuns: 0 }`).

Date bucketing is by `executedAt::date` in UTC. Runs without `executedAt` (very rare; ingestion may omit it) fall back to `ingestedAt::date` for bucketing.

**Errors:** 400 (bad `from`/`to`, `to < from`, range > 365 days), 404.

### 4.8 GET /failure-patterns

**Path:** `GET /api/v1/projects/:projectId/failure-patterns`

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | integer | `1` | |
| `limit` | integer | `50` | `maximum: 100` |

**Response — 200 OK:**

```json
{
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "limit": 50
  }
}
```

In MVP the result is always empty. The read path exists so Phase 2 only needs to add pattern-extraction writes.

**Errors:** 400, 404.

---

## 5. Reliability classification

### 5.1 The pure domain service

```ts
// backend/src/domain/services/reliability-classifier.ts

import type { TestCaseResult } from '../entities/test-case-result.js';
import type { ReliabilityState } from '../enums/reliability-state.js';

/**
 * Classifies a rolling window of test executions for ONE full_name.
 * Returns null when there is no actionable signal — typically when the
 * window contains only SKIPPED results.
 *
 * Algorithm (spec §3):
 *   - filter to PASSED, FAILED, ERROR (SKIPPED is neutral)
 *   - empty filtered set        → null
 *   - all PASSED                → 'STABLE'
 *   - all FAILED or ERROR       → 'BROKEN'
 *   - mix of PASSED and (FAILED | ERROR) → 'FLAKY'
 */
export function classifyReliability(
  results: ReadonlyArray<Pick<TestCaseResult, 'status'>>,
): ReliabilityState | null;
```

Per spec §3 the filter rule is: **SKIPPED results are ignored**. The window is "last N executions" raw from SQL; the classifier filters internally. Rationale: a developer who marks a test `it.skip(...)` for one CI run does not signal stability or instability. ERROR counts toward "failed" (it is an unexpected exception, operationally a failure).

### 5.2 Aggregated SQL — `TestCaseRepository.computeReliabilitySummaries`

The flaky-tests, health, and overview endpoints all need the same per-`full_name` rollup. Computing it via N+1 round trips (`findRecentByFullName` per full_name) is wasteful. One SQL query covers it:

```sql
WITH ranked AS (
  SELECT
    tcr.full_name,
    tcr.suite_name,
    tcr.test_name,
    tcr.status,
    tr.executed_at,
    tr.ingested_at,
    ROW_NUMBER() OVER (
      PARTITION BY tcr.full_name
      ORDER BY tr.executed_at DESC NULLS LAST, tr.ingested_at DESC, tcr.id DESC
    ) AS rn
  FROM test_case_results tcr
  JOIN test_runs tr ON tr.id = tcr.test_run_id
  WHERE tcr.project_id = $1
),
windowed AS (
  SELECT * FROM ranked WHERE rn <= $2
)
SELECT
  full_name,
  MAX(suite_name)  AS suite_name,
  MAX(test_name)   AS test_name,
  COUNT(*) FILTER (WHERE status = 'PASSED')                 AS pass_count,
  COUNT(*) FILTER (WHERE status IN ('FAILED', 'ERROR'))      AS fail_count,
  COUNT(*) FILTER (WHERE status = 'SKIPPED')                 AS skipped_count,
  (ARRAY_AGG(status     ORDER BY rn ASC))[1] AS last_status,
  (ARRAY_AGG(executed_at ORDER BY rn ASC))[1] AS last_executed_at
FROM windowed
GROUP BY full_name
ORDER BY full_name ASC;
```

Returns `ReliabilitySummary[]`:

```ts
interface ReliabilitySummary {
  fullName: string;
  suiteName?: string;
  testName: string;
  passCount: number;
  failCount: number;        // includes ERROR
  skippedCount: number;
  lastStatus: TestCaseStatus;
  lastExecutedAt?: Date;
}
```

The use case maps each summary through `classifyReliability` to attach `reliabilityState`.

**Note on `suite_name`/`test_name` aggregation:** `MAX(...)` is used as a deterministic-but-arbitrary picker over rows that share `full_name`. Two rows with the same `full_name` should not differ in `suite_name`/`test_name` (that's the invariant the `normalizeFullName` helper enforces from Epic 4); if they do, `MAX` simply picks one. The unit test exercises this with a uniform fixture.

### 5.3 Aggregated reliability counts for overview/health

Once `computeReliabilitySummaries` returns the rollup, counting `STABLE` / `FLAKY` / `BROKEN` is a single linear scan in JavaScript:

```ts
const summaries = await repo.computeReliabilitySummaries(projectId, window);
const states = summaries.map((s) => ({
  ...s,
  reliabilityState: classifyReliability(/* synthesize results array from counts */),
}));
const flakyCount  = states.filter((s) => s.reliabilityState === 'FLAKY').length;
const brokenCount = states.filter((s) => s.reliabilityState === 'BROKEN').length;
const stableCount = states.filter((s) => s.reliabilityState === 'STABLE').length;
```

The classifier doesn't actually need the full results array — it only needs the counts. The plan therefore exposes a sibling helper:

```ts
export function classifyReliabilityFromCounts(
  passCount: number,
  failCount: number,
): ReliabilityState | null;
```

`classifyReliability(results)` calls this internally after filtering and counting. Both functions live in `reliability-classifier.ts`; both are exported; both have unit tests. Use cases call `classifyReliabilityFromCounts` to avoid synthesising fake results arrays from counts.

---

## 6. Error handling matrix and handler updates

### 6.1 New error code: `RUN_NOT_FOUND`

The runs endpoints need a 404 that isn't `PROJECT_NOT_FOUND`. Two new branches in `backend/src/http/plugins/error-handler.ts`:

```
if (err.statusCode === 404 && /\/api\/v1\/projects\/[^/]+\/runs\//.test(request.url))
                                          → 404 RUN_NOT_FOUND  (message = err.message)
```

The existing `/api/v1/projects/...` 404 branch (Epic 3) only fires for top-level project 404s — it's already conservative enough that the new `runs` branch can sit ahead of it.

### 6.2 Per-scenario matrix (additions to the existing matrix)

| Scenario | HTTP | `error.code` |
|---|---|---|
| `runId` is not a UUID | 400 | `VALIDATION_ERROR` |
| `runId` unknown OR run belongs to a different project | 404 | `RUN_NOT_FOUND` |
| `window` query out of bounds | 400 | `VALIDATION_ERROR` |
| `from` later than `to` in failure-trends | 400 | `VALIDATION_ERROR` |
| `from`/`to` range > 365 days | 400 | `VALIDATION_ERROR` |
| Unknown `?state=` for flaky-tests | 400 | `VALIDATION_ERROR` |
| `projectId` valid UUID, no project row | 404 | `PROJECT_NOT_FOUND` |
| Database error mid-query | 500 | `INTERNAL_ERROR` |

The 404 `PROJECT_NOT_FOUND` for unknown project is thrown by the use case: it issues `repo.projects.findById(projectId)` first and throws `httpErrors.notFound('Project not found.')` on null. The error handler's existing project-404 branch maps it (Epic 3 §5.2).

### 6.3 What we are NOT doing in this epic

- No `INVALID_TIME_RANGE` error code. Failure-trend range issues are mapped to the existing `VALIDATION_ERROR` (Ajv-driven for parse errors, route-handler-driven for `to < from` via `fastify.httpErrors.badRequest`).
- No 422 codes. Analytics endpoints don't have payload semantics that can be "structurally valid but operationally wrong" — that's an ingestion concern.

---

## 7. Project-existence check

The Epic 3 `getProject` use case throws via `http-errors`' `createError(404, ...)` when the project is missing. All analytics use cases reuse the same pattern as their first step:

```ts
const project = await projectRepo.findById(projectId);
if (!project) throw createError(404, 'Project not found.');
```

Centralising this in a helper (e.g., `ensureProjectExists`) is reasonable but rejected for MVP — a three-line check used in seven use cases is below the abstraction threshold. The check is added per use case and verified in each integration test.

---

## 8. Domain service: `HealthEvaluator`

```ts
// backend/src/domain/services/health-evaluator.ts

import type { ProjectHealthStatus } from '../enums/project-health-status.js';

export interface HealthInput {
  passRate: number;        // 0–100, derived from most recent run
  brokenTestCount: number; // BROKEN tests in rolling window
  flakyTestRate: number;   // 0–100, percent of unique tests classified FLAKY
}

/**
 * Pure function per spec §3 decision matrix.
 * CRITICAL > WARNING > HEALTHY precedence.
 */
export function evaluateHealth(input: HealthInput): ProjectHealthStatus;
```

Algorithm (exactly the spec §3 thresholds):

```
if passRate < 80 || brokenTestCount >= 3 || flakyTestRate > 15  → 'CRITICAL'
if passRate <= 94 || brokenTestCount >= 1 || flakyTestRate > 5  → 'WARNING'
otherwise                                                       → 'HEALTHY'
```

Edge cases:
- `passRate === 95` exactly → HEALTHY (spec says "passRate >= 95")
- `passRate === 80` → WARNING (boundary inclusive on the WARNING side per spec wording)
- `brokenTestCount === 0 && flakyTestRate === 5 && passRate >= 95` → HEALTHY
- The `null`-passRate case (no runs yet) is handled in the **use case** before calling `evaluateHealth` — the use case returns `HEALTHY` directly with `passRate: null` in the response. The evaluator is only called when there's data.

Unit-tested with a table of ~20 inputs covering each branch and boundary.

---

## 9. Use case design

All eight use cases follow the explicit-dependency pattern established in Epic 3 §7 correction:

```ts
listTestRuns(
  runRepo: TestRunRepository,
  projectRepo: ProjectRepository,
  input: ListTestRunsInput,
): Promise<ListTestRunsResult>;

getTestRun(
  runRepo: TestRunRepository,
  projectId: string,
  runId: string,
): Promise<TestRun>;

listRunCases(
  runRepo: TestRunRepository,
  caseRepo: TestCaseRepository,
  projectId: string,
  runId: string,
): Promise<TestCaseResult[]>;

computeReliability(
  caseRepo: TestCaseRepository,
  projectRepo: ProjectRepository,
  input: { projectId: string; window: number; state?: 'FLAKY' | 'BROKEN' },
): Promise<{ items: FlakyTestResponse[]; windowSize: number }>;

getProjectHealth(
  runRepo: TestRunRepository,
  caseRepo: TestCaseRepository,
  projectRepo: ProjectRepository,
  input: { projectId: string; window: number },
): Promise<HealthResponse>;

getFailureTrend(
  runRepo: TestRunRepository,
  projectRepo: ProjectRepository,
  input: { projectId: string; from: Date; to: Date },
): Promise<FailureTrendResponse>;

getProjectOverview(
  runRepo: TestRunRepository,
  caseRepo: TestCaseRepository,
  projectRepo: ProjectRepository,
  patternRepo: FailurePatternRepository,
  input: { projectId: string; window: number },
): Promise<OverviewResponse>;

listFailurePatterns(
  patternRepo: FailurePatternRepository,
  projectRepo: ProjectRepository,
  input: { projectId: string; page: number; limit: number },
): Promise<{ items: FailurePatternResponse[]; total: number; page: number; limit: number }>;
```

No `Pool` argument: none of these use cases write, so no transactions are needed. All reads are independent and parallelizable.

**Cross-cutting parallelism:** `getProjectOverview` issues five independent queries (`countByProject` ×2, `countByStatus` for the pass-rate proxy, `listByProject` for recent runs, `computeReliabilitySummaries` for the reliability counts). They run in `Promise.all` inside the use case.

---

## 10. Repository extensions

### 10.1 `TestRunRepository` — new methods

```ts
countByProject(projectId: string): Promise<number>;

findFailureTrend(
  projectId: string,
  opts: { from: Date; to: Date },
): Promise<DailyFailureBucket[]>;

interface DailyFailureBucket {
  date: string;        // 'YYYY-MM-DD' UTC
  totalRuns: number;
  failedRuns: number;
}
```

`findFailureTrend` SQL:

```sql
SELECT
  TO_CHAR(COALESCE(executed_at, ingested_at)::date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
  COUNT(*)::int                                              AS total_runs,
  COUNT(*) FILTER (WHERE status = 'FAILED')::int             AS failed_runs
FROM test_runs
WHERE project_id = $1
  AND COALESCE(executed_at, ingested_at) >= $2
  AND COALESCE(executed_at, ingested_at) <  $3 + INTERVAL '1 day'
GROUP BY date
ORDER BY date ASC;
```

`failureRate` is computed in the use case (avoid floating-point rounding in SQL).

### 10.2 `TestCaseRepository` — new methods

```ts
countByProject(projectId: string): Promise<number>;
countByStatus(projectId: string, status: TestCaseStatus): Promise<number>;

computeReliabilitySummaries(
  projectId: string,
  window: number,
): Promise<ReliabilitySummary[]>;
```

The reliability SQL is the one in §5.2. `countByProject` and `countByStatus` are trivial single-row aggregations.

### 10.3 `FailurePatternRepository` — new port + adapter

```ts
// backend/src/domain/ports/failure-pattern.repository.ts
export interface FailurePatternRepository {
  listByProject(
    projectId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ items: FailurePattern[]; total: number }>;
}
```

The `FailurePattern` entity already exists in `backend/src/domain/entities/failure-pattern.ts` (Epic 2). The Pg adapter is straightforward: `SELECT … FROM failure_patterns WHERE project_id = $1 …`. In MVP the table is empty, but the integration test seeds a row directly via SQL and verifies it round-trips.

The plugin (`backend/src/http/plugins/repositories.ts`) is updated to add `failurePatterns: new PgFailurePatternRepository(pool)` to `app.repos`.

---

## 11. Validation strategy

| Concern | Where | How |
|---|---|---|
| Path param `projectId` (UUID) | `schemas/test-run.ts` and `schemas/analytics.ts` | Fastify `schema.params` |
| Path param `runId` (UUID) | `schemas/test-run.ts` | Fastify `schema.params` |
| Query params (window, page, limit, branch, environment, state, from, to) | `schemas/test-run.ts` / `schemas/analytics.ts` | Fastify `schema.querystring` |
| `to >= from` in failure-trends | use case | `throw fastify.httpErrors.badRequest(...)` if `to < from` |
| Range > 365 days in failure-trends | use case | same |
| `?state=...` enum | schema | `enum: ['FLAKY', 'BROKEN']` |
| `?window` bounds | schema | `minimum: 1`, `maximum: 200` |
| Unknown query field | schema | `additionalProperties: false` (Ajv with `removeAdditional: false`) |

All eight routes share the `additionalProperties: false` posture from Epic 3.

---

## 12. Testing strategy

### 12.1 Unit tests

Located in `backend/tests/unit/`:

- **`tests/unit/domain/services/reliability-classifier.test.ts`** — table-driven. Cases include: all-passed, all-failed, all-error, mix, all-skipped (returns `null`), empty (returns `null`), single result, large windows (50+ entries), mixed PASSED/SKIPPED (treated as STABLE because SKIPPED is filtered out), mixed FAILED/SKIPPED (BROKEN).
- **`tests/unit/domain/services/health-evaluator.test.ts`** — boundary table for every spec §3 row plus precedence rules.
- **One file per use case** under `tests/unit/application/use-cases/`. Each uses hand-rolled mock repos (same `jest.fn<RepoMethod['name']>()` pattern as Epics 3 and 4) and asserts:
  - Repo methods called with expected args
  - Project-existence check happens first (404 thrown when null)
  - Response shape (counts, derived fields, ordering)
  - For `getFailureTrend`: range validation and 365-day cap
  - For `getProjectHealth`: zero-runs path returns `HEALTHY` without calling `HealthEvaluator`
  - For `getProjectOverview`: `recentRuns` capped at 5, `topFailurePatterns` is `[]`

### 12.2 Integration tests

Located in `backend/tests/integration/`:

- **Repository extensions** — one new test file per repo extension:
  - `tests/integration/repositories/pg-test-case.repository.test.ts` *(extend)* — `computeReliabilitySummaries`, `countByProject`, `countByStatus`
  - `tests/integration/repositories/pg-test-run.repository.test.ts` *(extend)* — `findFailureTrend`, `countByProject`
  - `tests/integration/repositories/pg-failure-pattern.repository.test.ts` *(new)* — `listByProject` with seeded rows
- **Routes** — one file per route module:
  - `tests/integration/routes/projects/runs.test.ts` — three runs endpoints
  - `tests/integration/routes/projects/analytics.test.ts` — five analytics endpoints
  - Fixture data: each `beforeEach` truncates and re-seeds a representative dataset (1 project, 25 runs across 3 branches and 2 environments, ~300 case results across ~30 unique full_names with a mix of statuses)

The fixture is centralised in a helper `backend/tests/integration/fixtures/analytics-fixture.ts` so both the routes test and the repo tests can share the seed. This is the only file in the epic that's specifically a test-only helper.

### 12.3 What we are NOT testing

- **No load testing of `computeReliabilitySummaries`.** SQL is profiled against the fixture; performance work is deferred until production data shows it matters.
- **No snapshot tests** for response bodies — same convention as Epic 3.
- **No mocking of the Pg repos in route tests** — full wire, real DB.

---

## 13. Task breakdown

15 tasks. Each is one logical commit per `memory/workflow.md`.

---

### Task 1 — Reliability classifier domain service

**Purpose:** Drop the pure function the rest of the epic depends on. Unit-tested in isolation against a results-shaped input.

**Files affected:**
- `backend/src/domain/services/reliability-classifier.ts` *(new)*
- `backend/tests/unit/domain/services/reliability-classifier.test.ts` *(new)*

**Acceptance criteria:**
- Exports `classifyReliability(results): ReliabilityState | null` per the §5.1 algorithm
- Exports `classifyReliabilityFromCounts(passCount, failCount): ReliabilityState | null` per §5.3
- Both treat SKIPPED as filtered-out
- Table-driven test with ≥ 15 cases covering all branches + edge cases (empty, all-skipped, single result, boundary mixes)
- `npm run typecheck && npm run lint && npm run format:check && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): add ReliabilityClassifier domain service`

---

### Task 2 — Health evaluator domain service

**Files affected:**
- `backend/src/domain/services/health-evaluator.ts` *(new)*
- `backend/tests/unit/domain/services/health-evaluator.test.ts` *(new)*

**Acceptance criteria:**
- Exports `evaluateHealth(input): ProjectHealthStatus` per spec §3
- CRITICAL > WARNING > HEALTHY precedence
- Boundary cases tested: `passRate == 80`, `passRate == 94.99`, `passRate == 95`, `brokenTestCount == 0/1/2/3`, `flakyTestRate == 5 / 5.01 / 15 / 15.01`
- ≥ 12 test cases
- All checks pass

**Expected commit message:** `feat(backend): add HealthEvaluator domain service`

---

### Task 3 — Repository port extensions (interfaces only)

**Purpose:** Add the new method signatures to the domain ports. No Pg implementations yet — keeps the domain change isolated and reviewable.

**Files affected:**
- `backend/src/domain/ports/test-run.repository.ts` *(extend)*
- `backend/src/domain/ports/test-case.repository.ts` *(extend)*
- `backend/src/domain/ports/failure-pattern.repository.ts` *(new)*

**Acceptance criteria:**
- `TestRunRepository` gains `countByProject(projectId)` and `findFailureTrend(projectId, opts)` returning the `DailyFailureBucket[]` shape from §10.1
- `TestCaseRepository` gains `countByProject`, `countByStatus`, and `computeReliabilitySummaries` per §10.2
- New `FailurePatternRepository` port per §10.3
- All existing implementations (`pg-test-run.repository.ts`, `pg-test-case.repository.ts`) fail to compile because methods are missing — this is expected; Task 4 + 5 + 6 add them
- *Workaround for Task 3 to compile in isolation:* the port interfaces are extended but the existing Pg classes get **stub implementations that throw `new Error('not implemented')`**. Tasks 4–6 replace each stub.
- `npm run typecheck` exits 0 (stubs satisfy the port)
- Existing tests still pass (no callers invoke the new methods yet)

**Expected commit message:** `feat(backend): extend repository ports for analytics queries`

---

### Task 4 — `PgTestCaseRepository` extensions

**Files affected:**
- `backend/src/infrastructure/repositories/pg-test-case.repository.ts` *(extend)*
- `backend/tests/integration/repositories/pg-test-case.repository.test.ts` *(extend)*

**Acceptance criteria:**
- Implements `countByProject`, `countByStatus`, `computeReliabilitySummaries` per §10.2 (replacing the Task 3 stubs)
- The reliability SQL uses the CTE from §5.2 — verified by integration test with multi-status fixture covering a mix of full_names and a window smaller than total executions
- `windowSize` accounting: if a full_name has 5 executions and window=3, only the last 3 are summarised
- Skipped-only test in fixture: `computeReliabilitySummaries` still returns it with `passCount=0, failCount=0, skippedCount=3`
- All integration tests pass against `tfi_test`
- `npm run test:integration` passes

**Expected commit message:** `feat(backend): add test-case repository analytics queries`

---

### Task 5 — `PgTestRunRepository` extensions

**Files affected:**
- `backend/src/infrastructure/repositories/pg-test-run.repository.ts` *(extend)*
- `backend/tests/integration/repositories/pg-test-run.repository.test.ts` *(extend)*

**Acceptance criteria:**
- Implements `countByProject` and `findFailureTrend` per §10.1
- `findFailureTrend` integration test covers: empty range, single-day range with mixed statuses, multi-day range with gaps (gaps omitted from result), runs with `executedAt = null` (fall back to `ingestedAt`)
- All integration tests pass

**Expected commit message:** `feat(backend): add test-run repository analytics queries`

---

### Task 6 — `PgFailurePatternRepository` + repositories plugin wiring

**Files affected:**
- `backend/src/infrastructure/repositories/pg-failure-pattern.repository.ts` *(new)*
- `backend/src/http/plugins/repositories.ts` *(extend — add `failurePatterns` to `app.repos`)*
- `backend/tests/integration/repositories/pg-failure-pattern.repository.test.ts` *(new)*

**Acceptance criteria:**
- Implements `FailurePatternRepository.listByProject(projectId, { limit, offset })`
- Integration test seeds 3 failure-pattern rows via raw SQL, queries them via the repository, asserts mapping (id, pattern, severity, firstSeenAt, lastSeenAt, occurrenceCount)
- `app.repos.failurePatterns` decorated by the repositories plugin
- `declare module 'fastify'` interface extended to include `failurePatterns`
- All checks pass

**Expected commit message:** `feat(backend): add failure-pattern repository`

---

### Task 7 — JSON schemas for test-run query endpoints

**Files affected:**
- `backend/src/http/schemas/test-run.ts` *(new)*

**Acceptance criteria:**
- Exports `listTestRunsParamsSchema`, `listTestRunsQuerySchema`, `listTestRunsResponseSchema`
- Exports `getTestRunParamsSchema`, `getTestRunResponseSchema`
- Exports `listRunCasesParamsSchema`, `listRunCasesResponseSchema`
- All request schemas: `additionalProperties: false`, UUID format on path params, range constraints on `page` and `limit`
- Exports TypeScript types parallel to the schemas
- `npm run typecheck` exits 0
- No runtime tests required (declarative schemas — same convention as Epic 3 Task 3 / Epic 4 Task 2)

**Expected commit message:** `feat(backend): add test-run query JSON schemas`

---

### Task 8 — Test-run query use cases

**Files affected:**
- `backend/src/application/use-cases/list-test-runs.ts` *(new)*
- `backend/src/application/use-cases/get-test-run.ts` *(new)*
- `backend/src/application/use-cases/list-run-cases.ts` *(new)*
- `backend/tests/unit/application/use-cases/list-test-runs.test.ts` *(new)*
- `backend/tests/unit/application/use-cases/get-test-run.test.ts` *(new)*
- `backend/tests/unit/application/use-cases/list-run-cases.test.ts` *(new)*

**Acceptance criteria:**
- All three use cases issue a project-existence check first; missing project → throw 404 via `createError(404, 'Project not found.')`
- `listTestRuns` translates `page`/`limit` to `offset`, calls `runRepo.listByProject`, returns shaped payload
- `getTestRun` looks up by id AND asserts the returned run's `projectId` matches the path param — otherwise throws 404 RUN_NOT_FOUND
- `listRunCases` performs the same scoping check before calling `caseRepo.findByTestRun`
- Unit tests cover happy path, project-missing → 404, run-not-in-project → 404, empty results
- All checks pass

**Expected commit message:** `feat(backend): add test-run query use cases`

---

### Task 9 — `POST` runs route module + integration tests

**Files affected:**
- `backend/src/http/routes/projects/runs.route.ts` *(new)*
- `backend/src/app.ts` *(register runsRoute)*
- `backend/src/http/plugins/error-handler.ts` *(extend — add RUN_NOT_FOUND branch per §6.1)*
- `backend/tests/integration/routes/projects/runs.test.ts` *(new)*
- `backend/tests/integration/fixtures/analytics-fixture.ts` *(new — shared seed helper)*
- `backend/tests/unit/http/plugins/error-handler.test.ts` *(extend — add RUN_NOT_FOUND case)*

**Acceptance criteria:**
- All three GET endpoints registered under `/api/v1/projects/:projectId/...` prefix
- Each handler is two lines: call use case, wrap in `success(...)`, reply 200
- Integration tests against `tfi_test`:
  - 200 happy path for each endpoint (against the shared fixture)
  - 200 with filters (`?branch=`, `?environment=`)
  - 200 pagination (page=2)
  - 404 PROJECT_NOT_FOUND for unknown project UUID
  - 404 RUN_NOT_FOUND for a UUID that exists but in a different project
  - 400 VALIDATION_ERROR for non-UUID, bad limit
- All checks pass

**Expected commit message:** `feat(backend): add GET /runs, /runs/:runId, /runs/:runId/cases endpoints`

---

### Task 10 — JSON schemas for analytics endpoints

**Files affected:**
- `backend/src/http/schemas/analytics.ts` *(new)*

**Acceptance criteria:**
- Exports schemas for `overview`, `health`, `flaky-tests`, `failure-trends`, `failure-patterns`
- `?window` query: integer 1–200, default 30
- `?state` query for flaky-tests: enum `['FLAKY', 'BROKEN']`
- `?from`/`?to` for failure-trends: string with `format: 'date'` (YYYY-MM-DD only, no time)
- All request schemas have `additionalProperties: false`
- TypeScript types exported
- `npm run typecheck` exits 0

**Expected commit message:** `feat(backend): add analytics endpoint JSON schemas`

---

### Task 11 — `computeReliability` use case + GET /flaky-tests endpoint

**Files affected:**
- `backend/src/application/use-cases/compute-reliability.ts` *(new)*
- `backend/tests/unit/application/use-cases/compute-reliability.test.ts` *(new)*
- `backend/src/http/routes/projects/analytics.route.ts` *(new — start)*
- `backend/src/app.ts` *(register analyticsRoute)*
- `backend/tests/integration/routes/projects/analytics.test.ts` *(new — flaky-tests cases)*

**Acceptance criteria:**
- `computeReliability` calls `caseRepo.computeReliabilitySummaries`, maps each through `classifyReliabilityFromCounts`, filters by `state` query if provided, omits STABLE tests from output (only FLAKY + BROKEN appear)
- Ordering per §4.6 (BROKEN first, then FLAKY; within each, `failCount DESC, lastExecutedAt DESC`)
- Integration tests cover happy path, `?state=BROKEN` filter, `?window=10`, empty project → empty items
- All checks pass

**Expected commit message:** `feat(backend): add GET /flaky-tests endpoint`

---

### Task 12 — `getFailureTrend` use case + GET /failure-trends endpoint

**Files affected:**
- `backend/src/application/use-cases/get-failure-trend.ts` *(new)*
- `backend/tests/unit/application/use-cases/get-failure-trend.test.ts` *(new)*
- `backend/src/http/routes/projects/analytics.route.ts` *(extend)*
- `backend/tests/integration/routes/projects/analytics.test.ts` *(extend)*

**Acceptance criteria:**
- Parses `from`/`to` as UTC midnight `Date`s; defaults to last 30 days when omitted
- Rejects `to < from` and ranges > 365 days with `400 VALIDATION_ERROR`
- Calls `runRepo.findFailureTrend`, computes `failureRate` = `Math.round(failedRuns / totalRuns * 1000) / 10` (1 decimal place)
- Days with zero runs are omitted (not zero-filled)
- Integration tests: happy path, default range (when query omitted), bad range, single-day range
- All checks pass

**Expected commit message:** `feat(backend): add GET /failure-trends endpoint`

---

### Task 13 — `getProjectHealth` use case + GET /health endpoint

**Files affected:**
- `backend/src/application/use-cases/get-project-health.ts` *(new)*
- `backend/tests/unit/application/use-cases/get-project-health.test.ts` *(new)*
- `backend/src/http/routes/projects/analytics.route.ts` *(extend)*
- `backend/tests/integration/routes/projects/analytics.test.ts` *(extend)*

**Acceptance criteria:**
- Issues `Promise.all([runRepo.findMostRecentByProject, caseRepo.computeReliabilitySummaries])`
- Computes `passRate` from the most-recent run; `flakyTestRate = flaky / unique-totals * 100`
- Calls `evaluateHealth` only when there is data; otherwise returns `{ overallStatus: 'HEALTHY', passRate: null, failureRate: null, flakyTests: 0, brokenTests: 0, latestRunStatus: null }`
- Integration tests cover: empty project (no runs), 100% pass-rate clean project (HEALTHY), 1 broken test (WARNING), 3 broken tests (CRITICAL), high flaky rate (CRITICAL)
- All checks pass

**Expected commit message:** `feat(backend): add GET /health endpoint`

---

### Task 14 — `getProjectOverview` + `listFailurePatterns` use cases + their endpoints

**Files affected:**
- `backend/src/application/use-cases/get-project-overview.ts` *(new)*
- `backend/src/application/use-cases/list-failure-patterns.ts` *(new)*
- `backend/tests/unit/application/use-cases/get-project-overview.test.ts` *(new)*
- `backend/tests/unit/application/use-cases/list-failure-patterns.test.ts` *(new)*
- `backend/src/http/routes/projects/analytics.route.ts` *(extend)*
- `backend/tests/integration/routes/projects/analytics.test.ts` *(extend)*

**Acceptance criteria:**
- Overview use case runs five queries in `Promise.all` (count runs, count case results, count passed cases, list 5 most recent runs, reliability summaries)
- `passRate` derived from most-recent run, not aggregated — matches spec §3 ("derived from the most recent test run")
- `recentRuns` capped at 5 items, projected to the 5-field shape from §4.4
- `topFailurePatterns` is always `[]` in MVP (documented in code + spec)
- `listFailurePatterns` returns the standard paginated envelope; empty in MVP but the route exists
- Integration tests for both endpoints
- All checks pass

**Expected commit message:** `feat(backend): add GET /overview and GET /failure-patterns endpoints`

---

### Task 15 — Documentation pass

**Files affected:**
- `docs/architecture/analytics.md` *(new — ~140 lines, scannable maintainer reference)*
- `docs/architecture/http-layer.md` *(extend — endpoint list + error code table)*
- `README.md` *(extend — API table)*

**Acceptance criteria:**
- `analytics.md` covers: dependency diagram, the eight endpoints + their primary purpose, the reliability classification algorithm (with SKIPPED behaviour), the health decision matrix, the SQL design for `computeReliabilitySummaries` and `findFailureTrend`, the project-existence guard convention, the "add a new analytics endpoint" checklist
- `http-layer.md` endpoint table includes all eight new routes; error code table includes `RUN_NOT_FOUND` (404)
- README API section adds a new sub-table for analytics endpoints with one-line descriptions, pointing to `analytics.md`
- All five check commands exit 0

**Expected commit message:** `docs: document analytics endpoints and reliability conventions`

---

## 14. Definition of done

The epic is complete when all of the following hold simultaneously on `develop`:

- All fifteen tasks above are committed in order with the expected commit messages
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration` all pass locally and in CI
- CI green on PR #7 (Epic 5 → develop)
- `curl` against a locally-running backend successfully exercises all eight endpoints with the seeded fixture data, returning envelopes that match the §4 shapes
- Swagger UI at `/documentation` shows all eight endpoints with request/response schemas
- The Epic 5 section of the design spec §9 is fully implemented
- Release PR has merged to `main` via the established `--admin` release flow; `main` carries an `f23a721`-style merge commit referencing develop; develop has been back-merged afterwards
- No `Co-authored-by` lines anywhere

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `computeReliabilitySummaries` slow on large datasets (10k+ runs × 1k tests) | The CTE uses indexed columns (`tcr.project_id`, `tcr.full_name`, `tr.executed_at`). Performance is profiled on a 50k-row fixture; deferring optimisation past that until production telemetry shows it matters. |
| `MAX(suite_name)` in the CTE picks an arbitrary suite when same `full_name` has divergent suites | The Epic 4 `normalizeFullName` invariant guarantees they cannot differ. The unit test for `computeReliabilitySummaries` constructs a fixture with a uniform suite to assert pass-through, and a separate test seeds divergent suites to confirm `MAX` simply picks one without erroring. |
| `findFailureTrend` includes / excludes the `to` day off-by-one | The SQL uses `< to + INTERVAL '1 day'` to be explicit. Integration test covers a one-day range (`from=2026-06-01, to=2026-06-01`) and asserts a single bucket with all runs from that day. |
| Project-existence check duplicated across seven use cases | Accepted tradeoff: three lines × seven use cases = trivial duplication. Extraction is one line less per call site but adds a file. Reconsider in Epic 6+ if the count climbs. |
| `topFailurePatterns: []` in overview looks broken | Documented in the response schema description; analytics.md states "Phase 2 will populate this from failure_patterns extraction". Frontend (Epic 6) should render "No failure patterns yet" with a Phase 2 note. |
| `?window` default of 30 disagrees with the dashboard's intent | Spec §3 says default 30 and matches industry convention. Use cases accept `?window=N` to override; integration tests cover both default and explicit. |
| New `RUN_NOT_FOUND` regex on `request.url` could match a future sub-resource (e.g., `/runs/:runId/comments` if added) | Acceptable for this epic — every 404 under `/api/v1/projects/.../runs/...` is operationally a run-not-found. Re-examined when a sub-resource lands. |

---

## 16. Commit sequence (summary)

| # | Commit message |
|---|---|
| 1 | `feat(backend): add ReliabilityClassifier domain service` |
| 2 | `feat(backend): add HealthEvaluator domain service` |
| 3 | `feat(backend): extend repository ports for analytics queries` |
| 4 | `feat(backend): add test-case repository analytics queries` |
| 5 | `feat(backend): add test-run repository analytics queries` |
| 6 | `feat(backend): add failure-pattern repository` |
| 7 | `feat(backend): add test-run query JSON schemas` |
| 8 | `feat(backend): add test-run query use cases` |
| 9 | `feat(backend): add GET /runs, /runs/:runId, /runs/:runId/cases endpoints` |
| 10 | `feat(backend): add analytics endpoint JSON schemas` |
| 11 | `feat(backend): add GET /flaky-tests endpoint` |
| 12 | `feat(backend): add GET /failure-trends endpoint` |
| 13 | `feat(backend): add GET /health endpoint` |
| 14 | `feat(backend): add GET /overview and GET /failure-patterns endpoints` |
| 15 | `docs: document analytics endpoints and reliability conventions` |

Fifteen commits — establishes pure domain services first (Tasks 1–2), extends ports and Pg adapters (Tasks 3–6), then wires schemas → use cases → routes for the run-query trio (Tasks 7–9) and the five analytics endpoints (Tasks 10–14), closing with docs (Task 15). Each step is reviewable on its own.
