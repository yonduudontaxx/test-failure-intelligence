# Epic 6 — Health Scoring and Failure Intelligence Implementation Plan

**Status:** Draft — pending review
**Date:** 2026-06-07
**Spec reference:** `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md` §3 (`FailureSeverity`, `ProjectHealthStatus`), §4 (`FailurePattern`, `TestCaseResult.failure_message` and `failure_type`), §6 (`failure_patterns` schema, `UNIQUE(project_id, pattern)`), §7 (`/health` and `/failure-patterns` response shapes; `/overview` `topFailurePatterns`), §10 Phase 2 ("Failure pattern clustering (basic text similarity / grouping)"), §11 (`full_name` invariant)
**Predecessor:** Epic 5 Analytics & Reliability Engine (released to `main` via PR #8 at `2d2671a`, back-merged into develop at `4d5e6fa`) — supplies pure `evaluateHealth` and `classifyReliability` services, `computeReliabilitySummaries` CTE, read-only `PgFailurePatternRepository.listByProject`, `getProjectHealth` / `getProjectOverview` use cases, the global error handler with `RUN_NOT_FOUND` + `PROJECT_NOT_FOUND` path-gating, and the `topFailurePatterns: []` MVP gap that this epic closes
**Epic-numbering note:** Spec §9 originally listed "Epic 6: Frontend Dashboard" and slotted failure-pattern clustering under Phase 2. This plan reframes Epic 6 as a backend epic — pulling the Phase 2 pattern-extraction work forward so the frontend (now Epic 7+) has real data to render. The frontend dashboard scope from the spec is unchanged and will land in a later epic.

---

## 1. Objective

Close the `topFailurePatterns: []` MVP limitation, surface structured warnings and critical issues alongside the existing health verdict, and make Severity assignment heuristic-driven rather than a hardcoded `LOW` default. Concretely:

- **Pattern extraction** runs inside ingestion: every `FAILED` / `ERROR` `TestCaseResult` contributes a canonical pattern row to `failure_patterns`, atomically with the run + cases insert.
- **Severity assignment** is computed per upsert from a pure heuristic (`occurrence_count` + category + recency) — no manual classification, no Phase 3 statistical model.
- **`GET /failure-patterns` and `GET /overview.topFailurePatterns`** return real data — no behaviour change to the route signatures, just real rows behind them.
- **`GET /health` response gains two optional arrays** — `warnings: WarningItem[]` and `criticalIssues: CriticalIssueItem[]` — each surfacing the specific conditions that elevated the verdict.
- **`GET /overview.topCriticalIssues`** — a new top-3 critical-issue summary alongside `topFailurePatterns`.

The two load-bearing new behaviours:

- **Pattern normalisation** — a pure domain service mapping a raw `failure_message` + `failure_type` to a stable canonical pattern string. Volatile substrings (file:line refs, UUIDs, timestamps, memory addresses, free numerics) are scrubbed so the same underlying defect collapses to one row instead of N.
- **Issue derivation** — pure domain services that turn the same inputs `evaluateHealth` already consumes (plus the new pattern rows) into structured `WarningItem` / `CriticalIssueItem` lists that explain *why* the verdict is what it is.

Both stay pure (no `pg`, no Fastify, no I/O). Both are upgradeable without schema changes — same `as const` table-driven approach as the existing reliability classifier and health evaluator.

---

## 2. Scope

### In scope

- Three new domain services in `backend/src/domain/services/`:
  - `pattern-extractor.ts` — pure `extractPattern({ failureMessage?, failureType? }): ExtractedPattern | null`
  - `severity-assigner.ts` — pure `assignSeverity({ occurrenceCount, category?, daysSinceLastSeen }): FailureSeverity`
  - `issue-detector.ts` — pure `detectIssues(input: IssueDetectorInput): { warnings: WarningItem[]; criticalIssues: CriticalIssueItem[] }`
- One new application use case `backend/src/application/use-cases/extract-failure-patterns.ts` — consumes the parsed `TestCaseResult[]` from ingestion plus a `TxClient` and upserts one row per distinct pattern.
- One use-case extension to `backend/src/application/use-cases/ingest-test-run.ts` — calls `extractFailurePatterns` inside the existing `withTransaction` block, after `caseRepo.createMany`.
- Two use-case extensions:
  - `get-project-health.ts` — calls `detectIssues` after `evaluateHealth`, attaches `warnings` + `criticalIssues` to the response.
  - `get-project-overview.ts` — also derives `topCriticalIssues` (max 3) from the same input; the existing `topFailurePatterns` mapping now returns non-empty results because the table will be populated.
- One repository extension to `FailurePatternRepository` and `PgFailurePatternRepository`:
  - `upsertByPattern(input: NewFailurePattern, client?: TxClient): Promise<FailurePattern>` — atomic `INSERT … ON CONFLICT (project_id, pattern) DO UPDATE` that bumps `occurrence_count`, advances `last_seen_at`, leaves `first_seen_at` untouched, and re-evaluates `severity` from the heuristic.
- Two JSON schema extensions in `backend/src/http/schemas/analytics.ts`:
  - `healthResponseSchema` — adds `warnings: WarningItem[]`, `criticalIssues: CriticalIssueItem[]`
  - `overviewResponseSchema` — adds `topCriticalIssues: CriticalIssueItem[]`
- Unit tests for the three new domain services (table-driven), the pattern-extraction use case (mock repo), and the upsert path on `PgFailurePatternRepository` (against `tfi_test`).
- Integration tests extending `ingest.test.ts`, `overview.test.ts`, `health.test.ts`, `failure-patterns.test.ts` to assert real rows after ingestion.
- README + `docs/architecture/analytics.md` + `docs/architecture/ingestion.md` updates. **No** Swagger/OpenAPI change beyond what the schema additions auto-generate.

### Explicitly out of scope (deferred, with justification)

- **A new migration / new columns on `failure_patterns`.** The existing schema already exposes `occurrence_count`, `first_seen_at`, `last_seen_at`, `category`, `severity`, `pattern`, plus the `UNIQUE(project_id, pattern)` constraint. The heuristic in this epic operates on these inputs only. Adding `affected_test_count` (distinct tests touched) would persist a precomputed value but introduces a second invariant to maintain across upserts; YAGNI until the dashboard demands it.
- **`PATCH /failure-patterns/:id`** (manual severity override). The original Phase 2 line in spec §3 hedged "can be updated manually". With heuristic assignment in this epic, manual override is no longer necessary for MVP. Re-add only when product feedback requires it.
- **Statistical flakiness scoring / ML-based clustering.** Spec §10 Phase 3. This epic stays with regex-based scrubbing — deterministic, debuggable, no model artifacts.
- **Alerting / webhook notifications on critical issues.** Spec §10 Phase 3. The endpoint surfaces structured items; downstream notifiers are out of scope.
- **Trend-based issues** ("pass rate dropped 20 points week-over-week"). Spec §10 Phase 2 "Trend comparison". This epic surfaces point-in-time issues only, derived from the same trailing window as Epic 5's `evaluateHealth`.
- **Per-environment / per-branch issue breakdown.** Spec §10 Phase 2 "Environment stability analytics". Issues are project-level only.
- **Pattern dedup across projects.** `UNIQUE(project_id, pattern)` is per-project by design (spec §6). Cross-project clustering is Phase 3.
- **Updating the original spec §9 Epic 6 wording.** The frontend epic moves to a later position in the roadmap; the spec is updated only in §10 ("Phase 2 → Phase 1 graduation note") and §3 Severity. Epic-numbering reconciliation is documented inline in this plan and in the analytics docs.

### Constraints

- KISS: regex-based pattern scrubbing only; no embeddings, no Levenshtein clustering, no background batch jobs. The heuristic severity is a five-line lookup table.
- DRY: one `extractPattern`, one `assignSeverity`, one `detectIssues` — shared by ingestion (writes) and analytics (reads). No duplicate threshold values between `evaluateHealth` and `detectIssues`; the issue detector consumes the same constants the health evaluator exposes.
- YAGNI: no new column, no background recompute job, no admin endpoint to "reseed" patterns from history. Patterns build up forward from this epic's deploy; historical data can be backfilled with a one-off script if needed (not part of this epic).
- The new domain services stay pure: no `pg`, no Fastify, no I/O. Their unit tests run without any database.
- Pattern extraction must run **inside** the ingestion transaction — a half-written run with no patterns (or patterns with no parent run) is not a state Epic 5's analytics endpoints can interpret.
- One logical task = one logical commit. Conventional Commits per `memory/workflow.md`. No `Co-authored-by` trailer.

---

## 3. Architecture

```
HTTP routes (unchanged signatures)
   │   /api/v1/projects/:projectId/ingest                  (Epic 4)
   │   /api/v1/projects/:projectId/health                  (Epic 5; response extended)
   │   /api/v1/projects/:projectId/overview                (Epic 5; response extended)
   │   /api/v1/projects/:projectId/failure-patterns        (Epic 5; data now populated)
   ▼
Use cases
   │   ingest-test-run.ts                                  (extended — calls extractFailurePatterns)
   │   extract-failure-patterns.ts                         (NEW)
   │   get-project-health.ts                                (extended — calls detectIssues)
   │   get-project-overview.ts                              (extended — derives topCriticalIssues)
   ▼
Domain services (all pure, no I/O)
   │   reliability-classifier.ts                            (Epic 5; unchanged)
   │   health-evaluator.ts                                  (Epic 5; thresholds now re-exported as constants)
   │   pattern-extractor.ts                                 (NEW)
   │   severity-assigner.ts                                 (NEW)
   │   issue-detector.ts                                    (NEW; consumes health-evaluator thresholds)
   ▲
   │   used by
Repository ports + adapters
   │   FailurePatternRepository.upsertByPattern             (NEW method on existing port)
   │   PgFailurePatternRepository.upsertByPattern           (NEW impl; INSERT … ON CONFLICT)
   ▼
PostgreSQL — no schema changes
```

Dependency direction unchanged. The new domain services have **zero** runtime dependencies (pure functions over plain inputs). The existing `healthEvaluator` thresholds (currently inline literals in `health-evaluator.ts`) are factored into an exported `HEALTH_THRESHOLDS` constant so `issue-detector.ts` and `health-evaluator.ts` agree by construction.

**Composition root:** existing `repositoriesPlugin` (Epic 2) unchanged — `app.repos.failurePatterns` already exists; only its underlying class gains one new method. No new Fastify decorations, no new plugin.

**Transaction ownership:** `ingestTestRun` already opens `withTransaction(pool, ...)` and threads a `TxClient` into `runRepo.create` and `caseRepo.createMany`. The new `extractFailurePatterns` use case takes the same `TxClient` and the `failurePatternRepo`, so its writes share the transaction. Either the run, all cases, and all pattern upserts succeed — or all roll back. This preserves the Epic 4 invariant "if a `test_runs` row exists, all of its `test_case_results` exist" and extends it to "and all pattern rows it contributed to are accounted for."

---

## 4. Pattern extraction design

### 4.1 The pure domain service

**File:** `backend/src/domain/services/pattern-extractor.ts`

```ts
export interface ExtractPatternInput {
  failureMessage?: string;
  failureType?: string;
}

export interface ExtractedPattern {
  /** Canonical pattern string, ≤ 200 chars, deterministic for the same input. */
  pattern: string;
  /** Inferred category bucket, undefined when no rule matches. */
  category?: string;
}

export function extractPattern(input: ExtractPatternInput): ExtractedPattern | null;
```

Algorithm:

1. **Inputs.** Read `failureMessage` and `failureType` off the case. If both are empty / undefined / whitespace, return `null` — the case carries no signal and contributes no pattern row.
2. **Compose the raw text.** `failureType ? `${failureType}: ${firstLine(failureMessage)}` : firstLine(failureMessage)`. Take only the first line of the message — stack traces beyond the first line are too volatile to be load-bearing and would balloon `pattern` length.
3. **Scrub volatile substrings, in order:**
   - File path + line:column refs: `/(?:[A-Za-z]:|\/)?[\w\-./]+\.(?:ts|tsx|js|jsx|cjs|mjs|py|rb|java|kt|go|cs):\d+(?::\d+)?/g` → `<PATH>`
   - UUIDs: `/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi` → `<UUID>`
   - ISO timestamps: `/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g` → `<TS>`
   - Hex addresses: `/0x[0-9a-fA-F]+/g` → `<ADDR>`
   - URLs with query: replace the query string portion only — `/(https?:\/\/[^\s?]+)\?[^\s]*/g` → `$1?<QUERY>`
   - Standalone numbers ≥ 3 digits (line numbers, ports, ms, ids): `/\b\d{3,}\b/g` → `<N>`
4. **Collapse whitespace.** `/\s+/g` → ` `, then trim.
5. **Truncate.** Hard cap at 200 chars with a trailing `…` ellipsis if cut.
6. **Category derivation** (sibling pure function `categorizePattern(patternText, failureType?)`):
   - `/timeout|timed out/i` → `'timeout'`
   - `/assertion|expected.*to (be|equal|match|contain)|expect\(/i` → `'assertion'`
   - `/network|ECONNREFUSED|ENOTFOUND|fetch failed|socket hang up|getaddrinfo/i` → `'network'`
   - `/null|undefined|cannot read prop|TypeError/i` → `'null_reference'`
   - `/database|connection|deadlock|pg|psql|sql/i` → `'database'`
   - else → `undefined`

The result is a tuple `{ pattern, category }`. Stability requirement: two ingest payloads where the same defect surfaces at different file:line locations with different request UUIDs must collapse to the same `pattern` string. This is what the regex scrubbing guarantees.

### 4.2 Severity assignment

**File:** `backend/src/domain/services/severity-assigner.ts`

```ts
export interface SeverityInput {
  occurrenceCount: number;
  category?: string;
  daysSinceLastSeen: number;
}

export function assignSeverity(input: SeverityInput): FailureSeverity;
```

Heuristic, in evaluation order:

| Condition | Severity |
|---|---|
| `daysSinceLastSeen > 30` | `LOW` (stale — even high counts age out) |
| `occurrenceCount >= 50` | `CRITICAL` |
| `occurrenceCount >= 25 AND category IN ('timeout', 'database', 'network')` | `CRITICAL` |
| `occurrenceCount >= 20` | `HIGH` |
| `occurrenceCount >= 5` | `MEDIUM` |
| otherwise | `LOW` |

Rationale:

- Network / timeout / database failures hitting double-digit recurrence usually indicate an outage or systemic regression — they pre-empt to CRITICAL earlier than e.g. `null_reference` (which is often one bad test).
- Stale patterns aren't escalated regardless of historical count — the dashboard should not surface a 200-occurrence pattern that hasn't been seen for 2 months as `CRITICAL`.
- All thresholds are exported constants for the issue detector to consume.

### 4.3 Pattern upsert SQL

**File:** `backend/src/infrastructure/repositories/pg-failure-pattern.repository.ts`

```sql
INSERT INTO failure_patterns
  (project_id, pattern, category, severity, first_seen_at, last_seen_at, occurrence_count)
VALUES
  ($1, $2, $3, $4, $5, $5, 1)
ON CONFLICT (project_id, pattern) DO UPDATE
SET
  occurrence_count = failure_patterns.occurrence_count + 1,
  last_seen_at     = GREATEST(failure_patterns.last_seen_at, EXCLUDED.last_seen_at),
  category         = COALESCE(failure_patterns.category, EXCLUDED.category),
  severity         = $4
RETURNING id, project_id, pattern, category, severity,
          first_seen_at, last_seen_at, occurrence_count;
```

Where:

- `$5` is the case's parent run's `executed_at` (or `ingested_at` if `executed_at` is null) — passed as a single timestamp so insert and update agree.
- `$4` is the heuristic severity computed in the use case **before** the SQL call, given the new `occurrence_count` the row will end up with. The use case reads the current count with a `SELECT` first? No — too racy under concurrency. Instead, the use case computes severity assuming `existingCount + 1`; if that overshoots reality (because a concurrent transaction merged first), the next upsert will recompute correctly.

Why `GREATEST` on `last_seen_at`: an ingestion of a delayed historical run should not regress a more recent `last_seen_at`. Cleaner than a conditional update.

Why `COALESCE` on `category`: once a category has been assigned, don't overwrite it with `undefined` from a future case that doesn't match. This is conservative; if the rules ever flip on a previously-uncategorised pattern, the next ingestion that *does* match assigns the category and from then on it sticks.

### 4.4 The `extractFailurePatterns` use case

**File:** `backend/src/application/use-cases/extract-failure-patterns.ts`

```ts
export interface ExtractFailurePatternsInput {
  projectId: string;
  runTimestamp: Date; // executedAt ?? ingestedAt
  cases: ParsedTestCase[];
}

export async function extractFailurePatterns(
  patternRepo: FailurePatternRepository,
  input: ExtractFailurePatternsInput,
  tx: TxClient,
): Promise<void>;
```

Body:

1. Filter `cases` to those with `status === 'FAILED' || status === 'ERROR'`.
2. For each, call `extractPattern({ failureMessage, failureType })`. Drop entries returning `null`.
3. **Deduplicate within this batch** by `pattern` — if a single run hits the same pattern across three tests, that's `+1` occurrence row update, not `+3`. The natural batch dedup makes the count semantically "distinct runs that contained the pattern" rather than "distinct cases per run", which matches what the dashboard surfaces.
4. For each unique pattern in the batch:
   - Fetch the current `occurrence_count` via the repo's existing read (or accept `existingCount = 0` if not found). Add `+1`. Call `assignSeverity({ occurrenceCount: existingCount + 1, category, daysSinceLastSeen: 0 })`. Call `patternRepo.upsertByPattern({ projectId, pattern, category, severity, firstSeenAt: runTimestamp, lastSeenAt: runTimestamp }, tx)`.

The read-then-write is fine within a transaction because the per-pattern row is locked by the `INSERT ... ON CONFLICT` semantics under PostgreSQL's default isolation — two concurrent transactions cannot both win the insert, and the loser sees the inserted row. If both transactions go down the "exists, update" path, both updates serialise on the row's lock. The severity miscount mentioned in §4.3 is acceptable because the next ingestion corrects it.

### 4.5 Integration into `ingestTestRun`

Single change to `backend/src/application/use-cases/ingest-test-run.ts`:

```ts
await withTransaction(pool, async (tx) => {
  const run = await runRepo.create(/* ... */, tx);
  await caseRepo.createMany(/* ... */, tx);
  await extractFailurePatterns(
    patternRepo,
    {
      projectId: input.projectId,
      runTimestamp: run.executedAt ?? run.ingestedAt,
      cases,
    },
    tx,
  );
  return run;
});
```

`patternRepo` is added to the use case's signature alongside the existing `runRepo`, `caseRepo`. The ingest route picks it up from `app.repos.failurePatterns`. No new transaction is opened.

---

## 5. Issue detection design

### 5.1 The pure domain service

**File:** `backend/src/domain/services/issue-detector.ts`

```ts
export type WarningCode =
  | 'BROKEN_TESTS_PRESENT'
  | 'PASS_RATE_LOW'
  | 'FLAKY_TESTS_MODERATE'
  | 'HIGH_SEVERITY_PATTERN';

export type CriticalIssueCode =
  | 'BROKEN_TESTS_THRESHOLD'
  | 'PASS_RATE_CRITICAL'
  | 'FLAKY_TESTS_HIGH'
  | 'CRITICAL_SEVERITY_PATTERN';

export interface WarningItem {
  code: WarningCode;
  message: string;
  metadata: Record<string, string | number>;
}

export interface CriticalIssueItem {
  code: CriticalIssueCode;
  message: string;
  metadata: Record<string, string | number>;
}

export interface IssueDetectorInput {
  totalRuns: number;
  recentFailureRate: number; // 0.0 – 1.0
  brokenTestCount: number;
  flakyTestCount: number;
  /** Pre-sorted by severity DESC — caller passes whatever the relevant repo returned. */
  patterns: Pick<FailurePattern, 'pattern' | 'severity' | 'occurrenceCount'>[];
}

export function detectIssues(
  input: IssueDetectorInput,
): { warnings: WarningItem[]; criticalIssues: CriticalIssueItem[] };
```

Rules — evaluated independently; both arrays may be empty, both may be populated:

| Condition | Code | Severity bucket |
|---|---|---|
| `recentFailureRate > 0.20` | `PASS_RATE_CRITICAL` | critical |
| `recentFailureRate > 0.05` (and not critical) | `PASS_RATE_LOW` | warning |
| `brokenTestCount >= 3` | `BROKEN_TESTS_THRESHOLD` | critical |
| `brokenTestCount >= 1` (and not critical) | `BROKEN_TESTS_PRESENT` | warning |
| `flakyTestCount > 15` | `FLAKY_TESTS_HIGH` | critical |
| `flakyTestCount > 5` (and not high) | `FLAKY_TESTS_MODERATE` | warning |
| any `patterns[i].severity === 'CRITICAL'` | `CRITICAL_SEVERITY_PATTERN` | critical (one item per pattern, max 5) |
| any `patterns[i].severity === 'HIGH'` | `HIGH_SEVERITY_PATTERN` | warning (one item per pattern, max 5) |
| `totalRuns === 0` | (no issues) | — |

Thresholds match the ones in `evaluateHealth` exactly. Both functions import them from a single source — `HEALTH_THRESHOLDS` in `backend/src/domain/services/health-thresholds.ts` (new file factored out of the existing `health-evaluator.ts` literals).

Each `WarningItem.message` / `CriticalIssueItem.message` is a short human string. Examples:

- `BROKEN_TESTS_THRESHOLD` → `"3 tests are persistently failing (BROKEN)"` — `metadata: { brokenTestCount: 3 }`
- `PASS_RATE_CRITICAL` → `"Pass rate is 73% — below the 80% threshold"` — `metadata: { passRate: 73, threshold: 80 }`
- `CRITICAL_SEVERITY_PATTERN` → `"Pattern 'TimeoutError: navigation timeout exceeded' has CRITICAL severity (47 occurrences)"` — `metadata: { pattern: "...", occurrenceCount: 47 }`

### 5.2 Integration into `getProjectHealth`

The use case already gathers `totalRuns`, `passRate`, `failureRate`, `brokenTestCount`, `flakyTestCount` from `findFailureTrend` + `computeReliabilitySummaries`. It adds one fetch:

```ts
const patterns = await patternRepo.listByProject(projectId, { limit: 100 });
const { warnings, criticalIssues } = detectIssues({
  totalRuns, recentFailureRate, brokenTestCount, flakyTestCount, patterns,
});
return { status, totalRuns, passRate, failureRate, brokenTestCount, flakyTestCount, windowDays, warnings, criticalIssues };
```

`patternRepo.listByProject` already orders by `occurrence_count DESC, last_seen_at DESC` — fine for issue detection because we only need to know whether any HIGH / CRITICAL exists.

### 5.3 Integration into `getProjectOverview`

The overview use case already calls `patternRepo.listByProject(...)`. It will additionally call `detectIssues(...)` with the same inputs as health, then expose `topCriticalIssues: criticalIssues.slice(0, 3)` in the response. Warnings are **not** surfaced in overview — the overview dashboard focuses on what's broken, not on what's degrading.

---

## 6. Error handling

No new error codes. No handler changes. Failures inside `extractFailurePatterns` propagate up through `withTransaction`, which calls `ROLLBACK`, which means the ingest endpoint returns `500 INTERNAL_ERROR` and the client retries — same as any other ingest failure today. The pattern table never holds rows for a non-existent run.

`patternRepo.listByProject` (called by health + overview) cannot fail in a meaningful way for these endpoints — if the DB is down, the existing analytics queries already 500.

---

## 7. Schema additions

### 7.1 `healthResponseSchema` extension

In `backend/src/http/schemas/analytics.ts`:

```ts
export const warningItemSchema = {
  type: 'object',
  required: ['code', 'message', 'metadata'],
  properties: {
    code: {
      type: 'string',
      enum: ['BROKEN_TESTS_PRESENT', 'PASS_RATE_LOW', 'FLAKY_TESTS_MODERATE', 'HIGH_SEVERITY_PATTERN'],
    },
    message: { type: 'string' },
    metadata: { type: 'object', additionalProperties: true },
  },
} as const;

export const criticalIssueItemSchema = {
  type: 'object',
  required: ['code', 'message', 'metadata'],
  properties: {
    code: {
      type: 'string',
      enum: ['BROKEN_TESTS_THRESHOLD', 'PASS_RATE_CRITICAL', 'FLAKY_TESTS_HIGH', 'CRITICAL_SEVERITY_PATTERN'],
    },
    message: { type: 'string' },
    metadata: { type: 'object', additionalProperties: true },
  },
} as const;
```

`healthResponseSchema` adds `warnings` and `criticalIssues` as required arrays (empty when no issues). `overviewResponseSchema` adds `topCriticalIssues` as a required array (max 3, empty when no critical issues). Backward compatibility: clients that don't read the new fields are unaffected; clients that do see real data immediately.

### 7.2 TypeScript interfaces

Parallel to the schemas:

```ts
export interface WarningItem { code: WarningCode; message: string; metadata: Record<string, string | number>; }
export interface CriticalIssueItem { code: CriticalIssueCode; message: string; metadata: Record<string, string | number>; }
export interface HealthResponse { /* existing fields */ warnings: WarningItem[]; criticalIssues: CriticalIssueItem[]; }
export interface OverviewResponse { /* existing fields */ topCriticalIssues: CriticalIssueItem[]; }
```

---

## 8. Repository port extension

**File:** `backend/src/domain/ports/failure-pattern.repository.ts`

```ts
export interface FailurePatternRepository {
  listByProject(projectId: string, opts?: { limit?: number }): Promise<FailurePattern[]>;
  /**
   * Atomic upsert keyed on (projectId, pattern):
   *  - INSERT a new row with occurrenceCount=1 if no row exists
   *  - UPDATE bumps occurrenceCount, advances lastSeenAt (GREATEST), sets severity
   * Returns the post-upsert row.
   */
  upsertByPattern(input: NewFailurePattern, client?: TxClient): Promise<FailurePattern>;
}
```

`NewFailurePattern` already exists from Epic 2 (`Omit<FailurePattern, 'id'>`). No entity change needed.

---

## 9. Testing strategy

### 9.1 Unit tests (no DB)

- **`pattern-extractor.test.ts`** — table-driven cases covering:
  - empty inputs → `null`
  - `failureMessage` only → uses message
  - `failureType` only → uses type
  - both → `${type}: ${firstLine}`
  - scrub: file:line refs from Node, browser, Python, JVM, .NET sources
  - scrub: UUIDs, hex addresses, ISO timestamps, URL query strings, free numerics
  - stability: two semantically identical errors with different file:line / UUID / timestamp collapse to the same pattern
  - truncation at 200 chars (with ellipsis)
  - category derivation for each rule branch + the `undefined` fall-through
- **`severity-assigner.test.ts`** — table-driven cases for each threshold branch + stale-row aging.
- **`issue-detector.test.ts`** — table-driven cases for every `WarningCode` / `CriticalIssueCode` independently, plus a fixture with all conditions firing, plus the `totalRuns === 0 → no issues` case.
- **`extract-failure-patterns.test.ts`** — mock repo asserts:
  - PASSED / SKIPPED cases produce no upserts
  - Multiple FAILED cases with the same scrubbed pattern dedup to one upsert
  - Multiple FAILED cases with distinct patterns produce one upsert each
  - `failureMessage`/`failureType` empty → case skipped
  - `tx` is forwarded to every `upsertByPattern` call

### 9.2 Integration tests (`tfi_test`)

- **`pg-failure-pattern.repository.test.ts`** — new `upsertByPattern` describe block:
  - First call inserts a row with `occurrenceCount=1`, equal `firstSeenAt` / `lastSeenAt`
  - Second call with the same pattern updates: `occurrenceCount=2`, `lastSeenAt` advances, `firstSeenAt` unchanged
  - Concurrent upserts of the same pattern serialise (run two in parallel via `Promise.all`, assert count = 2)
  - `lastSeenAt` is `GREATEST` — a delayed write with an older timestamp doesn't regress
  - `category` once set is not overwritten by a subsequent `null`
- **`ingest.test.ts`** — extends one existing fixture:
  - Ingest a payload with three FAILED cases (two sharing a defect, one unique). Assert that `failure_patterns` ends up with two rows, one with `occurrenceCount=2` after a second identical ingest.
  - Ingest a payload with all PASSED → no rows.
- **`failure-patterns.test.ts`** — extends to ingest before asserting `GET /failure-patterns` returns the seeded rows.
- **`overview.test.ts`** — asserts `topFailurePatterns` and `topCriticalIssues` are populated after ingestion that produces a CRITICAL pattern.
- **`health.test.ts`** — asserts `warnings` and `criticalIssues` appear with the expected codes for a seeded broken / flaky scenario.

### 9.3 What we are NOT testing

- Performance under 10k+ pattern rows. The aggregate cap is `limit: 100` in `listByProject` calls from this epic; if perf degrades we revisit with an index on `(project_id, severity, occurrence_count)`.
- Regex pathological inputs — pattern-extractor regexes are deliberately greedy-but-bounded by the 200-char truncate.
- Concurrent ingestion of the *same* run twice. Idempotency is still the Phase 2 item from Epic 4; this epic does not change that.

---

## 10. Use case signatures

For copy-paste consistency with Epic 5:

```ts
// extract-failure-patterns.ts
export async function extractFailurePatterns(
  patternRepo: FailurePatternRepository,
  input: { projectId: string; runTimestamp: Date; cases: ParsedTestCase[] },
  tx: TxClient,
): Promise<void>;

// ingest-test-run.ts (signature CHANGES — new patternRepo arg)
export async function ingestTestRun(
  pool: Pool,
  runRepo: TestRunRepository,
  caseRepo: TestCaseRepository,
  patternRepo: FailurePatternRepository,
  adapter: IngestionAdapter,
  input: IngestTestRunInput,
): Promise<IngestResponse>;

// get-project-health.ts (signature CHANGES — patternRepo added)
export async function getProjectHealth(
  projectRepo: ProjectRepository,
  runRepo: TestRunRepository,
  caseRepo: TestCaseRepository,
  patternRepo: FailurePatternRepository,
  input: { projectId: string; days?: number },
): Promise<HealthResponse>;

// get-project-overview.ts (signature UNCHANGED — already takes patternRepo)
```

The `ingest-test-run.ts` and `get-project-health.ts` route handlers gain one line each (`app.repos.failurePatterns` passed alongside the other repos).

---

## 11. Task breakdown

Each task = one logical commit. The sequence puts pure services first (Tasks 1–3), repo extension next (Task 4), then the use case (Task 5), ingestion integration (Task 6), analytics integration (Tasks 7–8), schema + route wiring (Task 9), then docs (Task 10). Ten commits, smaller than Epic 5's fifteen because there are no new endpoints.

### Task 1 — Health thresholds module + pattern extractor domain service

- Create `backend/src/domain/services/health-thresholds.ts` exporting `HEALTH_THRESHOLDS = { passRate: { warning: 0.05, critical: 0.20 }, brokenTestCount: { warning: 1, critical: 3 }, flakyTestCount: { warning: 5, critical: 15 } }`.
- Refactor `backend/src/domain/services/health-evaluator.ts` to import from `HEALTH_THRESHOLDS` — no behaviour change, all existing tests still pass.
- Create `backend/src/domain/services/pattern-extractor.ts` with `extractPattern` and `categorizePattern` (the latter exported for unit testability; the former calls the latter internally).
- Unit test file `backend/tests/unit/domain/services/pattern-extractor.test.ts` covering the table-driven cases from §9.1.
- All existing tests + new tests pass.
- Commit: `feat(backend): add pattern extractor and centralised health thresholds`

### Task 2 — Severity assigner domain service

- Create `backend/src/domain/services/severity-assigner.ts` exporting `assignSeverity(input: SeverityInput): FailureSeverity` and `SEVERITY_THRESHOLDS = { critical: 50, criticalCategoryBoost: 25, high: 20, medium: 5, staleAfterDays: 30 }`.
- Unit test file `backend/tests/unit/domain/services/severity-assigner.test.ts` covering every branch.
- Commit: `feat(backend): add severity assigner domain service`

### Task 3 — Issue detector domain service

- Create `backend/src/domain/services/issue-detector.ts` exporting `WarningCode`, `CriticalIssueCode`, `WarningItem`, `CriticalIssueItem`, `IssueDetectorInput`, `detectIssues(input)`.
- Reuses `HEALTH_THRESHOLDS` from Task 1. Imports `FailurePattern` type from the entity module.
- Unit test file `backend/tests/unit/domain/services/issue-detector.test.ts` covering every code, the empty-state case, and the "all conditions firing" fixture.
- Commit: `feat(backend): add issue detector domain service`

### Task 4 — `FailurePatternRepository.upsertByPattern` port + impl

- Extend `backend/src/domain/ports/failure-pattern.repository.ts` with the `upsertByPattern(input, client?)` method signature and a JSDoc block describing the SQL semantics.
- Implement on `backend/src/infrastructure/repositories/pg-failure-pattern.repository.ts` using the `INSERT … ON CONFLICT` from §4.3. Use the existing `RETURN_COLUMNS` and `mapRow` helpers. Accept `client?: TxClient` and use the existing `runner = client ?? this.pool` pattern.
- Integration test additions in `backend/tests/integration/repositories/pg-failure-pattern.repository.test.ts` — a new `describe('upsertByPattern', ...)` block covering the cases from §9.2.
- Commit: `feat(backend): add upsertByPattern method to failure pattern repository`

### Task 5 — `extractFailurePatterns` use case

- Create `backend/src/application/use-cases/extract-failure-patterns.ts` with the signature from §10. Implements §4.4: filter to FAILED/ERROR, extract, dedup within batch, upsert each.
- Unit test `backend/tests/unit/application/use-cases/extract-failure-patterns.test.ts` covering the cases from §9.1 (mock `FailurePatternRepository` with one `jest.fn<...>()` per method).
- Commit: `feat(backend): add extract failure patterns use case`

### Task 6 — Wire pattern extraction into `ingestTestRun`

- Modify `backend/src/application/use-cases/ingest-test-run.ts`:
  - Add `patternRepo: FailurePatternRepository` parameter (slotted between `caseRepo` and `adapter`).
  - Inside the `withTransaction(pool, async (tx) => ...)` block, after `caseRepo.createMany`, call `extractFailurePatterns(patternRepo, { projectId, runTimestamp: run.executedAt ?? run.ingestedAt, cases }, tx)`.
- Modify `backend/src/http/routes/projects/ingest.route.ts`: pass `app.repos.failurePatterns` to the `ingestTestRun` call.
- Update existing unit test `backend/tests/unit/application/use-cases/ingest-test-run.test.ts` — mock repos gain a `failurePatternRepo` arg. Assertion: after a payload with N failed cases, `upsertByPattern` is called for each distinct pattern, sharing the same `tx`.
- Update integration tests in `backend/tests/integration/routes/projects/ingest.test.ts` per §9.2.
- Commit: `feat(backend): persist failure patterns during ingestion`

### Task 7 — Wire issue detection into `getProjectHealth`

- Modify `backend/src/application/use-cases/get-project-health.ts`:
  - Add `patternRepo: FailurePatternRepository` parameter.
  - Add a parallel `patternRepo.listByProject(projectId, { limit: 100 })` to the `Promise.all`.
  - Call `detectIssues(...)` and attach `warnings` + `criticalIssues` to the response.
- Modify `backend/src/http/routes/projects/project-health.route.ts` to pass `app.repos.failurePatterns`.
- Extend `backend/src/http/schemas/analytics.ts` with `warningItemSchema`, `criticalIssueItemSchema`, the TypeScript interfaces, and the `healthResponseSchema` additions.
- Update `backend/tests/unit/application/use-cases/get-project-health.test.ts` and `backend/tests/integration/routes/projects/project-health.test.ts` to cover the new fields.
- Commit: `feat(backend): surface warnings and critical issues on health endpoint`

### Task 8 — Wire `topCriticalIssues` into `getProjectOverview`

- Modify `backend/src/application/use-cases/get-project-overview.ts`:
  - Call `detectIssues(...)` with the existing inputs + the already-fetched `patterns`.
  - Return `topCriticalIssues: criticalIssues.slice(0, 3)`.
- Extend `overviewResponseSchema` and `OverviewResponse` interface with `topCriticalIssues`.
- Update `backend/tests/unit/application/use-cases/get-project-overview.test.ts` and `backend/tests/integration/routes/projects/overview.test.ts` to assert `topCriticalIssues` populated when a CRITICAL pattern exists.
- Commit: `feat(backend): add topCriticalIssues to project overview response`

### Task 9 — Failure-patterns integration test fixture extension

- Extend `backend/tests/integration/routes/projects/failure-patterns.test.ts` with an end-to-end fixture: ingest a payload with FAILED cases, then assert `GET /failure-patterns` returns the seeded rows (no longer relying on direct `INSERT INTO failure_patterns` seeding for the happy path — though the existing direct-seed tests stay, since they isolate the route).
- Commit: `test(backend): seed failure patterns via ingestion in failure-patterns integration test`

### Task 10 — Documentation pass

- Update `docs/architecture/analytics.md`:
  - Remove the MVP-limitation paragraph saying `topFailurePatterns` is always `[]`.
  - Add a new section "Pattern extraction and severity assignment" covering the three new domain services, the upsert SQL, and the issue-detector code/message mappings.
  - Note the integration of `extractFailurePatterns` into the ingest transaction.
- Update `docs/architecture/ingestion.md`:
  - Extend the "At a glance" diagram with the pattern-extraction step inside `withTransaction`.
  - Add a "Pattern extraction" subsection summarising what runs and why it shares the transaction.
- Update `docs/architecture/http-layer.md` endpoint table — no new endpoints, but flag the `/health` and `/overview` response additions in the existing rows.
- Update `README.md` — extend the `/health` and `/overview` row descriptions to mention warnings / critical issues; remove the "MVP: writes are deferred to Phase 2" note from the `/failure-patterns` row.
- Update the design spec inline: §3 Severity replaces "Phase 2: heuristic-based assignment" with "Heuristic-based, see Epic 6 plan"; §9 Epic 6 wording: prepend a note "Frontend dashboard delivery moved later; Epic 6 is now Health Scoring and Failure Intelligence — see `docs/superpowers/plans/2026-06-07-epic-6-health-scoring-failure-intelligence.md`". §10 Phase 2 line "Failure pattern clustering" gains a "(MVP: regex-based extraction in Epic 6; clustering deferred)" parenthetical.
- Commit: `docs: document failure pattern extraction and issue detection`

---

## 12. Definition of done

The epic is complete when all of the following hold simultaneously on `develop`:

- All ten tasks above are committed in order with the expected commit messages.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration` all pass locally and in CI.
- CI green on the Epic 6 PR (→ develop).
- A `curl` ingest against a locally-running backend, followed by `curl` against `/api/v1/projects/:id/failure-patterns` and `/api/v1/projects/:id/overview` and `/api/v1/projects/:id/health`, returns non-empty `failure_patterns` data, non-empty `topFailurePatterns`, non-empty `topCriticalIssues` (when CRITICAL severity triggers), and non-empty `warnings`/`criticalIssues` for the seeded fixture.
- Swagger UI at `/documentation` shows the extended `/health` and `/overview` response schemas.
- The `topFailurePatterns: []` MVP limitation is fully closed.
- Release PR has merged to `main` via the established `--admin` release flow; develop has been back-merged afterwards.
- No `Co-authored-by` lines anywhere.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Pattern extractor regexes overfit to one stack's failure formats and leave another's volatile bits unscrubbed | Unit-test corpus includes failure-message exemplars from Node (Jest), Browser (Playwright), JVM (JUnit XML), Python (pytest), and .NET. If a new stack's format leaks, add a regex; the change is local to `pattern-extractor.ts`. |
| Truncation at 200 chars collapses semantically distinct patterns that share a long prefix | 200 chars covers the typical `failure_type: first-line` content. Tight enough to keep the column shallow; long enough that prefix-only collapses are rare. Re-examine when a real-world conflict shows up. |
| Heuristic severity churns: a row oscillates between MEDIUM and HIGH on every ingest near a threshold | Thresholds are integer counts of occurrences — strictly monotonic. Once a pattern crosses, it can only escalate. The only de-escalation path is the `daysSinceLastSeen > 30 → LOW` rule, which is a deliberate "aging" behaviour. |
| Pattern row contention under burst ingestion (CI matrix uploads 30 runs in parallel) | `INSERT … ON CONFLICT` is atomic at the row level. Two concurrent upserts on the same pattern serialise on the conflicted row; throughput is bounded by row contention, not the table. If CI matrix throughput becomes a bottleneck (>100 conflicting upserts/sec on one pattern), revisit batching at the use-case level. |
| `daysSinceLastSeen` computation has a race window (between `now()` and the row's `last_seen_at`) | The use case passes `runTimestamp` (the ingest's executedAt) as both `last_seen_at` input and the `daysSinceLastSeen` reference. Time isn't sampled in the DB, so there's no race. |
| `extractFailurePatterns` failing rolls back the entire run, including valid case data | This is the intended invariant (§3). A pattern-extraction bug is a code bug, surfaces in tests, and is rare. If it ever fires in production, the missing run is preferable to a half-written one — we can fix and re-ingest. |
| Frontend epic expects different `warnings` / `criticalIssues` shape than what this epic ships | The shapes here align with the spec's "structured items with code + message + metadata" convention used elsewhere. The frontend epic plan will consume these as-is; if it needs additions, they're optional fields appended without breaking compatibility. |
| Reframing Epic 6 leaves the design spec inconsistent | Task 10 of this plan explicitly edits §3, §9, and §10 of the design spec to point at this plan and reflect the new ordering. The original spec's Epic 6 (Frontend Dashboard) is preserved verbatim except for the prepended pointer. |

---

## 14. Commit sequence (summary)

| # | Commit message |
|---|---|
| 1 | `feat(backend): add pattern extractor and centralised health thresholds` |
| 2 | `feat(backend): add severity assigner domain service` |
| 3 | `feat(backend): add issue detector domain service` |
| 4 | `feat(backend): add upsertByPattern method to failure pattern repository` |
| 5 | `feat(backend): add extract failure patterns use case` |
| 6 | `feat(backend): persist failure patterns during ingestion` |
| 7 | `feat(backend): surface warnings and critical issues on health endpoint` |
| 8 | `feat(backend): add topCriticalIssues to project overview response` |
| 9 | `test(backend): seed failure patterns via ingestion in failure-patterns integration test` |
| 10 | `docs: document failure pattern extraction and issue detection` |

Ten commits — establishes pure domain services first (Tasks 1–3), extends the repo (Task 4), wires the use case (Task 5), integrates into ingestion (Task 6), extends the two analytics use cases (Tasks 7–8), strengthens the integration fixture (Task 9), closes with docs (Task 10). Each step is reviewable on its own and leaves the system in a working state.
