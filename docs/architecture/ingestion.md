# Ingestion Pipeline

Maintainer reference for the Epic 4 ingestion pipeline. The canonical
design lives in the spec and the Epic 4 plan, linked at the bottom —
this file is a scannable map of how a test report becomes a persisted
`TestRun` + `TestCaseResult[]`.

## At a glance

```
HTTP request (JSON body OR multipart upload)
   │
   ▼
Fastify route          (backend/src/http/routes/projects/ingest.route.ts)
   │  branches on request.isMultipart()
   │  resolves IngestionAdapter via the inline adaptersBySourceType map
   ▼
ingestTestRun use case (backend/src/application/use-cases/ingest-test-run.ts)
   │  adapter.parse(raw) → ParsedTestRun (fragments only)
   │  derives status / totalTests / passedTests / failedTests / skippedTests
   │  merges input.overrides on top of parsed run fields
   │  withTransaction →
   │    runRepo.create(..., tx)
   │    caseRepo.createMany(..., tx)
   │    extractFailurePatterns(patternRepo, cases, projectId, tx)
   ▼
TestRun + TestCaseResult + FailurePattern rows in PostgreSQL
```

See [http-layer.md](./http-layer.md) for the envelope and error handler
this pipeline plugs into, and [data-layer.md](./data-layer.md) for the
repositories below.

## Endpoint

```
POST /api/v1/projects/:projectId/ingest
```

One route, two transports. The handler picks an adapter via
`request.isMultipart()`:

| Source | Transport | `sourceType` from |
|---|---|---|
| `api` | `application/json` | hardcoded (body must have `sourceType: 'api'`) |
| `json` | multipart with `format=json` | `format` form field |
| `playwright` | multipart with `format=playwright` | `format` form field |
| `jest` | multipart with `format=jest` | `format` form field |
| `junit_xml` | multipart with `format=junit-xml` | `format` (kebab → snake) |

`@fastify/multipart` is registered in `app.ts` with
`attachFieldsToBody: false` and a 5 MB file-size cap. The route uses
`attachValidation: true` so the multipart branch is not pre-rejected
by the JSON body schema; the JSON branch surfaces `validationError`
itself as `400 VALIDATION_ERROR`.

## Adapter contract

`IngestionAdapter.parse(input: AdapterInput): ParsedTestRun`, where
`AdapterInput` is `{ kind: 'json'; body: unknown } | { kind: 'xml';
text: string }`. Defined in `backend/src/application/ingestion/types.ts`.

Adapters return **fragments**: optional run metadata (`branch`,
`environment`, `commitSha`, `pipelineName`, `buildNumber`, `executedAt`,
`durationMs`, `metadata`), plus a `ParsedTestCase[]` array with the
per-case fields a report carries.

Adapters **must not** populate `projectId`, `sourceType`, `testRunId`,
`status` (the run rollup), or any of the derived counts. The use case
owns those fields. Letting an adapter set them would let an uploaded
file lie about which project, source, or run it belongs to.

## `fullName` — single source of truth

Every adapter builds `fullName` via
`backend/src/application/ingestion/normalize.ts`:

```
normalizeFullName(suiteName, testName)
  →  "Suite > test"  when suiteName is non-empty
  →  "test"          when suiteName is undefined or empty
```

This rule is **load-bearing for Epic 5**: the reliability classifier
groups executions by `full_name` to compute STABLE / FLAKY / BROKEN per
test. Inconsistent `fullName` formats across adapters would silently
fragment reliability. No other code path constructs `fullName` — every
adapter calls this helper, and a unit test guards the rule.

## Status derivation

The use case counts `ParsedTestCase[]` by status (`ERROR` counts toward
`failedTests` per spec §3 — an exception in test code is operationally
a failure) and derives `TestRunStatus`: `failedTests > 0 → FAILED`;
else `skippedTests > 0 → PARTIAL`; else `SUCCESS`. An empty `cases`
array yields `{ totalTests: 0, status: 'SUCCESS' }`.

## Overrides merging

`IngestTestRunInput.overrides` lets the multipart path supply run
metadata (`branch`, `environment`, `commitSha`, `pipelineName`,
`buildNumber`, `externalId`) as form fields. Merge order in the use case
is `parsed → overrides → projectId/sourceType/status/counts`: form
fields **beat** parsed file values; nothing can override `projectId`,
`sourceType`, `status`, or derived counts.

## Atomicity

All three repo calls run inside one `withTransaction(pool, ...)` and
receive the same `PoolClient`. If any one fails — run insert, case
insert, or pattern upsert — every change rolls back. A failed pattern
upsert leaves no run and no cases behind. Epic 5 + Epic 6 can assume
"if a `test_runs` row exists, all of its `test_case_results` exist
**and** every pattern row it contributed to is accounted for."

The tradeoff: a pattern-extraction bug surfaces as a 500 on
ingestion, and the CI client must re-upload. Accepted because a
half-written run with no patterns leaves the analytics endpoints in
an inconsistent state that's harder to detect than a hard failure.

## Failure pattern extraction

After `caseRepo.createMany`, `extractFailurePatterns(patternRepo,
cases, projectId, tx)` runs over the parsed `ParsedTestCase[]`:

1. **Filter.** Only `status ∈ {FAILED, ERROR}` cases with at least
   one of `failureMessage` / `failureType` non-empty after trim
   contribute a pattern. PASSED, SKIPPED, and signal-less FAILED
   cases are ignored.
2. **Extract.** Each qualifying case feeds `extractPattern(msg,
   type, testName)` → `{ pattern, category }`. See
   [analytics.md](./analytics.md#extractpatternfailuremessage-failuretype-testname)
   for the scrub rules and category taxonomy.
3. **Dedup within batch.** Cases sharing the same canonical pattern
   collapse to one upsert with `occurrenceCount = N` — a single run
   that hits the same defect across three tests bumps the row by 1,
   not 3.
4. **Assign severity.** `assignSeverity({ occurrenceCount: batchN,
   category, lastSeenAt: now, now })` per distinct pattern. Severity
   reflects the batch only (see
   [analytics.md](./analytics.md#pattern-persistence) for the
   tradeoff).
5. **Upsert.** `patternRepo.upsertByPattern(...)` with the shared
   `tx`. Atomic `INSERT … ON CONFLICT (project_id, pattern) DO
   UPDATE` increments `occurrence_count`, advances `last_seen_at` via
   `GREATEST`, and sets `severity` to the batch-derived value.

## Idempotency

**MVP behaviour: accept duplicates.** Posting the same payload twice
creates two distinct `test_runs` rows. There is no unique constraint
on `(project_id, external_id)` and the use case performs no dedup
check. Deliberate choice (Epic 4 plan §7). **Phase 2** path: add a
partial unique index `(project_id, external_id) WHERE external_id IS
NOT NULL` and map the resulting `UniqueConstraintError` to `409
DUPLICATE_RUN` in the error handler.

## Error codes specific to ingestion

| HTTP | `error.code` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Ajv on JSON body; procedural multipart check (missing `file`, missing `format`, unknown `format`) |
| 404 | `PROJECT_NOT_FOUND` | `ForeignKeyError` on `test_runs_project_id_fkey` — `projectId` is well-formed but no row exists |
| 422 | `INGESTION_FAILED` | An adapter threw `IngestionFailedError` (unknown status, missing required structure, malformed XML, unparseable JSON file) |

General envelope and other error codes: [http-layer.md](./http-layer.md).

## Adding a new adapter

1. Implement `IngestionAdapter` in `application/ingestion/adapters/<name>.adapter.ts`
   using the existing `isObject` / `asString` / `asNumber` / `asArray`
   defensive helpers. Throw `IngestionFailedError` with a short, fixed
   message on structural mismatch — never echo raw input back.
2. Map the source's status vocabulary to `TestCaseStatus`; any unmapped
   value must throw. Build every `fullName` via `normalizeFullName`.
3. If the source is new, add it to the `SourceType` enum and to
   `adaptersBySourceType` in `ingest.route.ts`. For multipart access,
   add a `FORMAT_TO_SOURCE_TYPE` entry with the kebab-case `format`.
4. Add a unit test in
   `tests/unit/application/ingestion/adapters/<name>.adapter.test.ts`
   covering happy path, all status mappings, structural-error
   rejections, and wrong `AdapterInput.kind`.
5. Add a multipart integration case in
   `tests/integration/routes/projects/ingest.test.ts`.

## Where to read more

- **Design spec** (`docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md`):
  §3 enums, §7 Ingestion contract, §9 Epic 4 scope, §11 `fullName` rule
- **Epic 4 plan** (`docs/superpowers/plans/2026-06-05-epic-4-test-result-ingestion.md`):
  §5 normalization, §6 error matrix, §7 idempotency, §8 use case, §9 adapter design
- **HTTP layer:** [http-layer.md](./http-layer.md)
- **Data layer:** [data-layer.md](./data-layer.md)
- **Live OpenAPI spec:** Swagger UI at `/documentation`
