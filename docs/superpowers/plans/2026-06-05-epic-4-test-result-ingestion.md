# Epic 4 — Test Result Ingestion Implementation Plan

**Status:** Draft — pending review
**Date:** 2026-06-05
**Spec reference:** `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md` §3 (enums), §4 (TestRun, TestCaseResult), §6 (schema), §7 "Ingestion", §8 "MVP Scope", §9 "Epic 4: Ingestion Pipeline", §11 (implementation notes)
**Predecessor:** Epic 3 Project Management (released to `main` via PR #4) — supplies `projects` rows, `TestRunRepository`, `TestCaseRepository`, `withTransaction`, the global error handler, the envelope helpers, the `removeAdditional: false` Ajv config, and the `app.repos`/`app.pool` Fastify decorations

---

## 1. Objective

Expose the single MVP ingestion endpoint that accepts test results from any of the five sources defined in the spec and persists them as one `TestRun` plus its `TestCaseResult[]` atomically:

```
POST /api/v1/projects/:projectId/ingest
```

Five source types fan in through one route:

| `source_type` | Transport | Adapter input |
|---|---|---|
| `api` | `Content-Type: application/json` | Canonical CI-push body per spec §7 |
| `json` | `multipart/form-data` with `format=json` | Same canonical body, supplied as a file |
| `playwright` | `multipart/form-data` with `format=playwright` | Playwright JSON reporter output |
| `jest` | `multipart/form-data` with `format=jest` | Jest `--json` output |
| `junit_xml` | `multipart/form-data` with `format=junit-xml` | JUnit XML report |

The output of this epic is a fully-wired ingestion pipeline that:

- Validates the request (schema for the JSON path; form fields + format whitelist for the multipart path)
- Resolves an `IngestionAdapter` by source type
- Normalizes the payload to canonical `NewTestRun` and `NewTestCaseResult[]` shapes
- Persists both rows atomically in a single transaction via `withTransaction`
- Returns the summary envelope from spec §7 (`{ data: { runId, status, totalTests, passedTests, failedTests, skippedTests } }`)
- Maps every failure mode to a stable error envelope (`VALIDATION_ERROR`, `PROJECT_NOT_FOUND`, `INGESTION_FAILED`, `INTERNAL_ERROR`) via the existing global error handler from Epic 3

Reliability classification, failure-pattern extraction, and analytics endpoints are explicitly **out of scope** here — they read what this epic writes (Epic 5).

---

## 2. Scope

### In scope

- One Fastify route module `backend/src/http/routes/projects/ingest.route.ts` registered at `POST /:projectId/ingest` under the `/api/v1/projects` prefix
- `IngestionAdapter` interface in `backend/src/application/ingestion/types.ts` — pure parsing contract: raw input → canonical normalized payload
- Five adapter implementations in `backend/src/application/ingestion/adapters/`:
  - `canonical-json.adapter.ts` — drives both the `api` and `json` source types (same wire shape, different `sourceType` recorded)
  - `playwright.adapter.ts`
  - `jest.adapter.ts`
  - `junit-xml.adapter.ts` — uses `fast-xml-parser` (new dependency)
- One use case `backend/src/application/use-cases/ingest-test-run.ts` — orchestrates `adapter.parse` → derived counts/status → `withTransaction(pool, …)` → `runRepo.create(…, tx)` → `caseRepo.createMany(…, tx)` → return summary
- Request/response JSON schemas in `backend/src/http/schemas/ingest.ts` for the `api` JSON path; multipart fields validated procedurally in the route handler (Ajv does not validate multipart streams)
- `@fastify/multipart` plugin registered in `app.ts` (new dependency)
- New error code `INGESTION_FAILED` (HTTP 422) in the error handler, fired when an adapter rejects malformed input that nonetheless parsed structurally
- Unit tests for every adapter against fixture payloads checked into `backend/tests/fixtures/ingestion/`
- Unit tests for `ingestTestRun` against mock repos and a stub adapter
- Integration tests for `POST /api/v1/projects/:projectId/ingest`, one suite per source type, against the real `tfi_test` database via `app.inject()`
- README and `docs/architecture/http-layer.md` updates documenting the new endpoint and the adapter conventions

### Explicitly out of scope (deferred, with justification)

- **Idempotent ingestion / deduplication on `external_id`** → MVP accepts duplicate posts. The current `test_runs` schema has no unique constraint on `(project_id, external_id)`, and the spec §7 response treats each POST as a new run (`"runId": "<uuid>"`). Adding deduplication is a schema migration plus a use-case check; Phase 2 territory. Documented in §7 of this plan.
- **`FailurePattern` extraction** → Spec §9 lists failure-pattern surfacing under Epic 5 Analytics ("Failure pattern clustering" is also explicitly Phase 2). No write to `failure_patterns` happens in this epic.
- **Streaming uploads** → `@fastify/multipart` is configured to buffer the file into memory with a documented size cap. Streaming parse of multi-MB Jest/Playwright reports is a Phase 2 optimization.
- **Reporter CLI / framework SDKs (`@test-failure-intelligence/action`, etc.)** → Spec §10 Phase 2.
- **`POST /api/v1/projects/:projectId/runs` or any non-`ingest` write path for test runs** → YAGNI; ingestion is the only documented write path.
- **GET endpoints for runs and cases** → Epic 5.
- **Authentication / API keys on the ingest endpoint** → Spec §10 Phase 3. The endpoint is open in MVP; deployments behind a private VPN/reverse-proxy are the documented assumption.

### Constraints

- KISS: no plugin layer for adapters (no `app.adapters` decorator). The route file owns a `const adaptersBySourceType` map; adapters are stateless pure functions, no construction cost.
- DRY: one envelope module, one error handler, one ingest route. Each adapter has exactly one parse function with the same return shape.
- YAGNI: no abstractions beyond what the five source types require. No plug-in adapter registry, no per-tenant override, no streaming.
- Domain layer stays clean: `IngestionAdapter`, the use case, and the adapters all live under `application/`. Domain (`backend/src/domain/`) gains no new files. The new `INGESTION_FAILED` code lives in the HTTP error handler, not in `domain/errors/`.
- One logical task = one logical commit. Conventional Commits per `memory/workflow.md`. No `Co-authored-by` trailer.

---

## 3. Architecture

```
HTTP request (JSON or multipart)
   │
   ▼
Fastify route                              backend/src/http/routes/projects/ingest.route.ts
   │  detects Content-Type, validates schema (JSON path) or form fields (multipart path)
   │  resolves IngestionAdapter by sourceType / format
   ▼
ingestTestRun use case                      backend/src/application/use-cases/ingest-test-run.ts
   │  adapter.parse(raw) → { run: NewTestRunFragment, cases: NewTestCaseResultFragment[] }
   │  derives totalTests / passedTests / failedTests / skippedTests / status
   │  withTransaction(pool, tx => {
   │      run  = runRepo.create({ ...fragment, projectId, sourceType }, tx)
   │      caseRepo.createMany(cases.map(c => ({ ...c, projectId, testRunId: run.id })), tx)
   │  })
   ▼
TestRunRepository / TestCaseRepository       backend/src/domain/ports/*.repository.ts
   ▲  implemented by
   │
PgTestRunRepository / PgTestCaseRepository   backend/src/infrastructure/repositories/...
   │  pg.Pool / pg.PoolClient
   ▼
PostgreSQL
```

Dependency direction matches Epic 2/3: HTTP → Use Cases → Domain ← Infrastructure. The use case never imports `pg` or Fastify; it takes the `Pool` as an explicit argument so `withTransaction` can run, but the type is the `Pool` re-exported from `backend/src/infrastructure/database/types.ts` — the same indirection used by the existing `withTransaction` helper.

**Composition root:** `ingest.route.ts` resolves dependencies per request from `request.server.pool` and `request.server.repos.{testRuns,testCases}` (decorations already established by Epic 2's `repositoriesPlugin`). It picks the adapter from a local map keyed on `SourceType` and passes everything explicitly to `ingestTestRun`. This honours the Epic 3 correction §7 — use cases take explicit dependencies, never `req.server` or `req.body` directly.

---

## 4. Endpoint design

### 4.1 Route

```
POST /api/v1/projects/:projectId/ingest
```

Single route, two transports — the route handler branches on `Content-Type`.

### 4.2 Path parameter

| Param | Type | Constraint |
|---|---|---|
| `projectId` | string | `format: uuid` |

A malformed UUID returns `400 VALIDATION_ERROR` (Ajv). An unknown but well-formed UUID returns `404 PROJECT_NOT_FOUND` — the `projects(id)` foreign key on `test_runs` raises `ForeignKeyError` from `PgTestRunRepository.create`, the use case lets it propagate, and a new error-handler branch maps it (see §6).

### 4.3 `Content-Type: application/json` (the `api` source path)

**Request body (canonical CI push):**

```json
{
  "sourceType": "api",
  "pipelineName": "GitHub Actions",
  "buildNumber": "245",
  "branch": "main",
  "commitSha": "abc123",
  "environment": "ci",
  "externalId": "run-9876",
  "executedAt": "2026-06-01T12:00:00Z",
  "durationMs": 45000,
  "metadata": {},
  "testCases": [
    {
      "suiteName": "AuthService",
      "testName": "should authenticate valid user",
      "status": "PASSED",
      "durationMs": 120,
      "retryCount": 0
    },
    {
      "suiteName": "AuthService",
      "testName": "should reject expired token",
      "status": "FAILED",
      "durationMs": 88,
      "failureMessage": "Expected 401 but received 200",
      "failureType": "AssertionError",
      "retryCount": 1
    }
  ]
}
```

**Body JSON schema (Ajv)** — declared in `backend/src/http/schemas/ingest.ts`:

| Field | Type | Required | Constraint |
|---|---|---|---|
| `sourceType` | string | yes | `enum: ['api']` (multipart variants are not allowed through the JSON path) |
| `pipelineName` | string | no | `maxLength: 200` |
| `buildNumber` | string | no | `maxLength: 100` |
| `branch` | string | no | `maxLength: 200` |
| `commitSha` | string | no | `maxLength: 100` |
| `environment` | string | no | `maxLength: 100` |
| `externalId` | string | no | `maxLength: 200` |
| `executedAt` | string | no | `format: date-time` |
| `durationMs` | integer | no | `minimum: 0` |
| `metadata` | object | no | any object (default `{}`) |
| `testCases` | array | yes | `minItems: 0`, items per below |
| `testCases[i].suiteName` | string | no | `maxLength: 500` |
| `testCases[i].testName` | string | yes | `minLength: 1`, `maxLength: 500` |
| `testCases[i].status` | string | yes | `enum: ['PASSED', 'FAILED', 'SKIPPED', 'ERROR']` |
| `testCases[i].durationMs` | integer | no | `minimum: 0` |
| `testCases[i].failureMessage` | string | no | `maxLength: 10000` |
| `testCases[i].failureType` | string | no | `maxLength: 200` |
| `testCases[i].retryCount` | integer | no | `minimum: 0`, default `0` |
| `testCases[i].metadata` | object | no | default `{}` |

`additionalProperties: false` on the top-level body and on each test-case object. Combined with the global `removeAdditional: false` Ajv config established in Epic 3, unknown fields **reject** with `400 VALIDATION_ERROR`.

### 4.4 `Content-Type: multipart/form-data` (file upload path)

| Field | Required | Constraint |
|---|---|---|
| `file` | yes | The report file. Max size **5 MB** (configured on `@fastify/multipart`); larger requests reject with `413 INTERNAL_ERROR`-class. Adapter receives the file content as a UTF-8 string. |
| `format` | yes | `'junit-xml' \| 'playwright' \| 'jest' \| 'json'` |
| `pipelineName` | no | `maxLength: 200` |
| `buildNumber` | no | `maxLength: 100` |
| `branch` | no | `maxLength: 200` |
| `commitSha` | no | `maxLength: 100` |
| `environment` | no | `maxLength: 100` |
| `externalId` | no | `maxLength: 200` |

The `format` field uses kebab-case at the wire boundary (matches spec §7) and the route handler maps it to the `source_type` enum value: `junit-xml → junit_xml`, `playwright → playwright`, `jest → jest`, `json → json`.

Multipart form fields are validated procedurally in the route handler (presence, length, format whitelist) since Ajv does not run on the multipart stream. Validation failures throw `fastify.httpErrors.badRequest(...)` with a message; the error handler maps it to `400 VALIDATION_ERROR` (see §6.1).

### 4.5 Success response

**`201 Created`** (consistent with `POST /projects` from Epic 3):

```json
{
  "data": {
    "runId": "uuid",
    "status": "FAILED",
    "totalTests": 42,
    "passedTests": 40,
    "failedTests": 2,
    "skippedTests": 0
  }
}
```

Response schema declared on the route definition so Swagger picks it up.

### 4.6 Error responses

| HTTP | `error.code` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Ajv schema (JSON body) or procedural multipart-field validation rejects the request |
| 404 | `PROJECT_NOT_FOUND` | `projectId` UUID is valid but no row exists — surfaces from `ForeignKeyError` on `test_runs.project_id` |
| 413 | `VALIDATION_ERROR` (re-using the code) | File exceeds 5 MB — `@fastify/multipart`'s built-in error mapped at the boundary |
| 422 | `INGESTION_FAILED` | Adapter parsed structurally but the payload doesn't match the source format (e.g., Playwright JSON missing `suites`, JUnit XML missing `<testsuite>`, unrecognised case status). New code in this epic. |
| 500 | `INTERNAL_ERROR` | Anything else — full error logged, response sanitized |

Sample `422` body:

```json
{
  "error": {
    "code": "INGESTION_FAILED",
    "message": "Playwright report has no \"suites\" array."
  }
}
```

---

## 5. Normalization strategy

### 5.1 Canonical fragment shapes

Adapters produce **fragments** — partial entity shapes — rather than fully-formed `NewTestRun` / `NewTestCaseResult`. The use case owns the fields that the adapter cannot know (`projectId`, `sourceType`, `testRunId`, derived counts/status).

```ts
// backend/src/application/ingestion/types.ts

export interface ParsedTestCase {
  suiteName?: string;
  testName: string;
  fullName: string;          // canonical identity, see §5.2
  status: TestCaseStatus;
  durationMs?: number;
  failureMessage?: string;
  failureType?: string;
  retryCount: number;        // adapters default to 0 when source has no equivalent
  metadata: Record<string, unknown>;
}

export interface ParsedTestRun {
  externalId?: string;
  pipelineName?: string;
  buildNumber?: string;
  branch?: string;
  commitSha?: string;
  environment?: string;
  executedAt?: Date;
  durationMs?: number;
  metadata: Record<string, unknown>;
  cases: ParsedTestCase[];
}

export interface IngestionAdapter {
  /** @throws IngestionFailedError when the input cannot be normalized. */
  parse(input: AdapterInput): ParsedTestRun;
}

export type AdapterInput =
  | { kind: 'json'; body: unknown }            // canonical, playwright, jest
  | { kind: 'xml'; text: string };             // junit_xml
```

`IngestionFailedError` is defined in `backend/src/application/ingestion/errors.ts` and carries a message describing the parse failure. The HTTP error handler keys on it (see §6).

### 5.2 `fullName` canonical identity

Per spec §11: `full_name` is the canonical test identity key and **must** be normalized consistently across adapters. The rule is single-sourced in a helper:

```ts
// backend/src/application/ingestion/normalize-full-name.ts
export function normalizeFullName(
  suiteName: string | undefined,
  testName: string,
): string {
  return suiteName ? `${suiteName} > ${testName}` : testName;
}
```

Every adapter calls this helper — there is no other code path that constructs `fullName`. This is verified by a unit test that imports each adapter's parse output and asserts the format.

### 5.3 Status normalization per source type

`TestCaseStatus` is the canonical 4-value enum `PASSED | FAILED | SKIPPED | ERROR`. Each adapter maps its native status vocabulary:

| Source | Source status | → `TestCaseStatus` |
|---|---|---|
| api / json | `PASSED` | `PASSED` |
| api / json | `FAILED` | `FAILED` |
| api / json | `SKIPPED` | `SKIPPED` |
| api / json | `ERROR` | `ERROR` |
| playwright | `passed` | `PASSED` |
| playwright | `failed`, `timedOut`, `interrupted` | `FAILED` |
| playwright | `skipped` | `SKIPPED` |
| jest | `passed` | `PASSED` |
| jest | `failed` | `FAILED` |
| jest | `skipped`, `pending`, `todo`, `disabled` | `SKIPPED` |
| junit_xml | `<testcase>` with no children | `PASSED` |
| junit_xml | `<testcase><failure>…</failure></testcase>` | `FAILED` |
| junit_xml | `<testcase><error>…</error></testcase>` | `ERROR` |
| junit_xml | `<testcase><skipped/></testcase>` | `SKIPPED` |

Any source status the adapter does not recognise → throw `IngestionFailedError` (becomes 422). Silent fallback is forbidden because it would corrupt reliability classification downstream.

### 5.4 Derived `TestRun` fields

The use case derives these from `ParsedTestRun.cases` after adapter parsing, before persistence:

```ts
const totalTests   = cases.length;
const passedTests  = cases.filter(c => c.status === 'PASSED').length;
const failedTests  = cases.filter(c => c.status === 'FAILED' || c.status === 'ERROR').length;
const skippedTests = cases.filter(c => c.status === 'SKIPPED').length;

const status: TestRunStatus =
  failedTests  > 0 ? 'FAILED'
: skippedTests > 0 ? 'PARTIAL'
:                    'SUCCESS';
```

Rationale: this matches spec §3 (`FAILED` = "one or more tests failed", `PARTIAL` = "completed but some tests were skipped or inconclusive", `SUCCESS` = "all tests passed"). `ERROR` counts toward `failedTests` because per spec §3 it represents a test that "threw an unexpected exception or infrastructure error" — operationally a failure.

An empty `cases` array yields `totalTests = 0`, `status = 'SUCCESS'`. This is unusual but valid (e.g., a run that compiled but discovered no tests); the platform records it for trend visibility rather than rejecting it.

---

## 6. Error handling matrix and handler updates

### 6.1 Extending the global error handler

Epic 3's `backend/src/http/plugins/error-handler.ts` already wraps `/api/v1` errors. Two additions are needed:

1. **New branch — `IngestionFailedError`:**

   ```
   if (err instanceof IngestionFailedError) → 422 INGESTION_FAILED  (message = err.message)
   ```

   The adapter messages are intentionally human-readable and safe to expose (no stack traces, no raw input echo). A unit test asserts each adapter produces only the curated set of messages.

2. **New branch — `ForeignKeyError` on `test_runs.project_id`:**

   ```
   if (err instanceof ForeignKeyError && err.constraint === 'test_runs_project_id_fkey')
                                          → 404 PROJECT_NOT_FOUND  (message = `Project not found.`)
   ```

   This piggybacks on the existing 404→`PROJECT_NOT_FOUND` shape, but the trigger is the database FK rather than `getProject`'s null check. The constraint name comes from the migration that created `test_runs(project_id REFERENCES projects(id))`; the plan verifies the exact name during Task 8 implementation.

The 400 / 500 branches and the `/api/v1` path gate from Epic 3 are unchanged.

### 6.2 Per-scenario matrix

| Scenario | HTTP | `error.code` | Notes |
|---|---|---|---|
| `projectId` is not a UUID | 400 | `VALIDATION_ERROR` | Ajv on path params |
| JSON body missing `sourceType` | 400 | `VALIDATION_ERROR` | |
| JSON body `testCases[0].status = "MAYBE"` | 400 | `VALIDATION_ERROR` | enum constraint |
| JSON body unknown field at top level | 400 | `VALIDATION_ERROR` | `additionalProperties: false` |
| Multipart missing `file` part | 400 | `VALIDATION_ERROR` | procedural check in route |
| Multipart `format=unknown` | 400 | `VALIDATION_ERROR` | format whitelist in route |
| `projectId` is a valid UUID with no matching row | 404 | `PROJECT_NOT_FOUND` | `ForeignKeyError` from `test_runs.project_id` FK |
| Playwright JSON has no `suites` array | 422 | `INGESTION_FAILED` | adapter throws `IngestionFailedError` |
| JUnit XML is not well-formed | 422 | `INGESTION_FAILED` | `fast-xml-parser` throws → adapter wraps |
| JUnit XML has zero `<testcase>` elements | 422 | `INGESTION_FAILED` | adapter explicit check |
| Jest report case status is `weirdValue` | 422 | `INGESTION_FAILED` | unmapped status |
| File exceeds 5 MB | 400 | `VALIDATION_ERROR` | mapped from `@fastify/multipart` `FST_REQ_FILE_TOO_LARGE` |
| Database connection lost mid-write | 500 | `INTERNAL_ERROR` | full error logged, response sanitized |

---

## 7. Idempotency strategy

**MVP behaviour: accept duplicates.** Posting the same payload twice creates two independent `test_runs` rows with two distinct `id`s. Reliability classification computed in Epic 5 will see both runs and treat each `test_case_result` independently.

**Rationale:**

- The current `test_runs` schema has no unique constraint on `(project_id, external_id)` — adding it requires a migration.
- The spec §7 response (`"runId": "<uuid>"`) treats each call as creating a new run; no precedent for returning an existing id.
- CI integrations in MVP are presumed idempotent at the source (most CI systems do not blindly retry already-submitted runs).
- A use-case-level dedup check (`if external_id provided, look it up; if found, return 409`) is racy under concurrent uploads from the same pipeline and adds branching that won't survive contact with real workloads.

**Phase 2 path (documented for future-me):**

- Add migration: `UNIQUE (project_id, external_id) WHERE external_id IS NOT NULL` (partial index because `external_id` is nullable for manual uploads).
- Map the resulting `UniqueConstraintError` in the error handler to `409 DUPLICATE_RUN`.
- Update spec §7 ingest response to optionally return the existing run on duplicate.

This is **not** done in Epic 4. The plan explicitly chooses the simpler MVP path.

---

## 8. Use case design

```ts
// backend/src/application/use-cases/ingest-test-run.ts

import type { Pool } from '../../infrastructure/database/types.js';
import type { TestRunRepository } from '../../domain/ports/test-run.repository.js';
import type { TestCaseRepository } from '../../domain/ports/test-case.repository.js';
import type { IngestionAdapter, AdapterInput } from '../ingestion/types.js';
import type { SourceType } from '../../domain/enums/source-type.js';
import type { TestRunStatus } from '../../domain/enums/test-run-status.js';

export interface IngestTestRunInput {
  projectId: string;
  sourceType: SourceType;
  raw: AdapterInput;
  // Multipart-only overrides — set when the upload form provided these fields
  // and the adapter could not (or chose not to) populate them.
  overrides?: {
    pipelineName?: string;
    buildNumber?: string;
    branch?: string;
    commitSha?: string;
    environment?: string;
    externalId?: string;
  };
}

export interface IngestTestRunResult {
  runId: string;
  status: TestRunStatus;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
}

export async function ingestTestRun(
  pool: Pool,
  runRepo: TestRunRepository,
  caseRepo: TestCaseRepository,
  adapter: IngestionAdapter,
  input: IngestTestRunInput,
): Promise<IngestTestRunResult>;
```

**Algorithm:**

1. `parsed = adapter.parse(input.raw)` — may throw `IngestionFailedError`.
2. Merge `input.overrides` onto `parsed` for any field not already set by the adapter — multipart form fields are a fallback, not an override of in-file values.
3. Derive `totalTests / passedTests / failedTests / skippedTests / status` from `parsed.cases` (§5.4).
4. Open `withTransaction(pool, async (tx) => { … })`:
   - `run = await runRepo.create({ ...parsed, ...overrides-merged, projectId, sourceType, status, totalTests, passedTests, failedTests, skippedTests }, tx)`
   - `await caseRepo.createMany(parsed.cases.map(c => ({ ...c, projectId, testRunId: run.id })), tx)`
   - Return `run`.
5. Return the result-summary shape.

If `runRepo.create` raises `ForeignKeyError` because the project does not exist, the transaction rolls back, the error propagates, and the error handler maps it to `404 PROJECT_NOT_FOUND` (see §6).

**Explicit-dependency rationale (consistent with Epic 3 §7 correction):** the use case takes `pool`, `runRepo`, `caseRepo`, and `adapter` as positional arguments. It does **not** accept `req.server` or any HTTP type. The route handler is the seam that extracts those dependencies and selects the adapter:

```ts
// in ingest.route.ts
const adapter = adaptersBySourceType[sourceType];
const result = await ingestTestRun(
  req.server.pool,
  req.server.repos.testRuns,
  req.server.repos.testCases,
  adapter,
  { projectId, sourceType, raw, overrides },
);
return reply.code(201).send(success(result));
```

---

## 9. Adapter design (per source type)

Each adapter is a stateless module exporting one `parse` function and a `sourceType` constant. They live under `backend/src/application/ingestion/adapters/`.

### 9.1 `canonical-json.adapter.ts` (covers `api` and `json`)

Both the `api` source (JSON body) and the `json` source (multipart-uploaded JSON file) use the exact same wire shape per spec §7. The adapter therefore handles both and the route picks the recorded `sourceType` based on the transport.

- Input: `{ kind: 'json', body: unknown }` where `body` matches the schema in §4.3. The adapter is defensive — even though Ajv has validated the JSON-body path, the JSON-file path goes through `JSON.parse(text)` directly and may produce structurally-wrong input.
- Output: `ParsedTestRun` with `cases` derived 1:1 from `body.testCases`. `executedAt` parsed via `new Date(body.executedAt)`; invalid dates → `IngestionFailedError`. `metadata` defaults to `{}`.
- Status mapping per §5.3 (identity).
- Unrecognised case status → `IngestionFailedError('Unsupported test case status "<value>".')`.

### 9.2 `playwright.adapter.ts`

- Input: `{ kind: 'json', body: unknown }` — Playwright reporter JSON. Expected top-level keys: `config`, `suites`, `stats`.
- Output: flatten `suites[].specs[].tests[].results[]` into `ParsedTestCase[]`. Playwright nests results because of retries; this adapter takes the **last** result per spec (the final retry outcome), counts retries as `tests[i].results.length - 1`, and propagates the first error message from the final result when failed.
- `fullName`: `normalizeFullName(suite.title, spec.title)`. Suite titles can themselves nest; the adapter joins ancestor titles with `>` (Playwright convention).
- Status mapping per §5.3.
- `executedAt`: derived from `stats.startTime` if present; absent → `executedAt` is omitted (allowed by the entity type).
- Failures:
  - No `suites` array → `IngestionFailedError('Playwright report has no "suites" array.')`
  - `suites` is empty → succeeds with zero cases (legitimate Playwright outcome).

### 9.3 `jest.adapter.ts`

- Input: `{ kind: 'json', body: unknown }` — `jest --json` reporter output. Expected top-level keys: `testResults`, `numTotalTests`, `numFailedTests`, etc.
- Output: flatten `testResults[].testResults[]` into `ParsedTestCase[]`.
- `fullName`: `normalizeFullName(ancestorTitles.join(' > '), title)`. Jest's `ancestorTitles` is an array of `describe` blocks.
- Status mapping per §5.3.
- `failureMessage`: join `failureMessages` with `\n` if non-empty.
- `executedAt`: from `startTime` (a unix-epoch ms number) if present.
- Failures:
  - No `testResults` array → `IngestionFailedError('Jest report has no "testResults" array.')`

### 9.4 `junit-xml.adapter.ts`

- Input: `{ kind: 'xml'; text: string }`.
- Parser: **`fast-xml-parser`** (new direct dependency). Chosen over `xml2js` because (a) it ships with TypeScript types built-in, (b) it's measurably faster on large reports, (c) Fastify ecosystem already pulls it in transitively. The exact dep is added in Task 7.
- Parser config: `{ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false }`. Configured so element text and attributes are both addressable, and so numeric strings like `time="0.12"` are not auto-coerced (the adapter does its own validation).
- Output: walks `<testsuites>` → `<testsuite>` → `<testcase>`. JUnit reports vary in whether the root is `<testsuites>` or a single `<testsuite>` — the adapter accepts both.
- `suiteName`: from `<testcase classname>` if present, otherwise the enclosing `<testsuite name>`.
- `fullName`: `normalizeFullName(suiteName, testName)`.
- Status: per §5.3 mapping on the child element.
- `durationMs`: `Math.round(parseFloat(testcase['@_time']) * 1000)` — JUnit's `time` is seconds; absent or unparseable → `undefined`.
- `failureMessage`: from `<failure message="…">` attribute or the element's text content, whichever is non-empty.
- `failureType`: from `<failure type="…">` attribute (e.g., `AssertionError`).
- `executedAt`: from `<testsuites timestamp="…">` or `<testsuite timestamp="…">` if present.
- Failures:
  - `fast-xml-parser` throws (malformed XML) → wrap as `IngestionFailedError('JUnit XML is not well-formed: <reason>.')`
  - No `<testsuites>` or `<testsuite>` root → `IngestionFailedError('JUnit XML has no <testsuite> or <testsuites> root.')`
  - Zero `<testcase>` elements → `IngestionFailedError('JUnit XML contains no <testcase> elements.')`

---

## 10. Validation strategy

| Concern | Where | How |
|---|---|---|
| Request body shape (JSON path) | `backend/src/http/schemas/ingest.ts` | Fastify route `schema.body` (Ajv) |
| Path param (UUID) | same | Fastify route `schema.params` |
| Multipart fields presence and length | `ingest.route.ts` (procedural) | Lookup + `throw fastify.httpErrors.badRequest(...)` |
| `format` whitelist | `ingest.route.ts` (procedural) | Lookup against `adaptersByFormat` map; unknown → 400 |
| File size limit | `@fastify/multipart` config | `limits: { fileSize: 5_242_880 }` (5 MB) |
| Adapter-level structural validity | each `parse` function | Explicit checks + `throw new IngestionFailedError(...)` |
| Case status enum | adapter | Mapped per §5.3; unmapped → `IngestionFailedError` |
| `executedAt` is a real date | adapter | `Number.isNaN(new Date(s).getTime())` → `IngestionFailedError` |
| Foreign-key `project_id` | Database | `test_runs_project_id_fkey` → `ForeignKeyError` → 404 |

Procedural multipart validation is the only place this epic adds validation code outside of JSON Schema declarations. The justification: Ajv does not run against multipart streams, and adding a runtime guard library for one route is over-engineering. The validation surface is small (≤7 form fields) and lives in a single ~30-line block.

---

## 11. Repository consumption and dependency injection

No new repositories. No new ports. The use case consumes the existing `TestRunRepository` and `TestCaseRepository` ports unchanged.

The Fastify decorator pattern from Epic 2 (`backend/src/http/plugins/repositories.ts`) is the sole DI mechanism. The route handler reads `request.server.pool`, `request.server.repos.testRuns`, and `request.server.repos.testCases` from the existing decorations.

No new decorator for adapters: they are pure functions, stateless, with no construction-time dependencies. The route file owns a small map:

```ts
// inside ingest.route.ts (or a sibling file)
const adaptersBySourceType: Record<SourceType, IngestionAdapter> = {
  api:         canonicalJsonAdapter,
  json:        canonicalJsonAdapter,
  playwright:  playwrightAdapter,
  jest:        jestAdapter,
  junit_xml:   junitXmlAdapter,
};
```

This matches the rationale in Epic 3 plan §7 ("use cases have no construction-time dependencies … wrapping them in a decorator would add ceremony with no payoff") and Epic 2's KISS choice against a DI container.

---

## 12. Testing strategy

### 12.1 Unit tests

Located in `backend/tests/unit/`:

- **Each adapter** — `tests/unit/application/ingestion/adapters/<name>.adapter.test.ts`. Drives the adapter against fixture payloads in `backend/tests/fixtures/ingestion/<source>/`. Covers:
  - Happy path: representative report → expected `ParsedTestRun`
  - All status mappings per §5.3
  - `fullName` normalization with and without `suiteName`
  - Each `IngestionFailedError` branch (missing root, unknown status, malformed input)
- **`normalizeFullName` helper** — `tests/unit/application/ingestion/normalize-full-name.test.ts`. Covers with-suite, without-suite, empty suite (treated as missing), and unicode test names.
- **`ingestTestRun` use case** — `tests/unit/application/use-cases/ingest-test-run.test.ts`. Hand-rolled mock repos (`jest.fn<...>()` per method, consistent with Tasks 4/5/6 of Epic 3) and a stub adapter. Covers:
  - Happy path: adapter result + overrides → `runRepo.create` and `caseRepo.createMany` called with expected args; result summary shape
  - Status derivation: all-passed → `SUCCESS`; mix with skipped → `PARTIAL`; any failed → `FAILED`; ERROR counts toward failed
  - Empty `cases` → `SUCCESS`, `totalTests: 0`, no `caseRepo.createMany` call (or called with empty array — see Task 8 acceptance criterion)
  - Transaction failure: `caseRepo.createMany` rejects → outer promise rejects with the same error; `runRepo.create` was called (no manual rollback needed — `withTransaction` handles it)
  - Adapter throws `IngestionFailedError` → propagates unchanged; no repo methods invoked

### 12.2 Integration tests

Located in `backend/tests/integration/routes/projects/`:

- **`ingest-api.test.ts`** — JSON body path. Same harness as Epic 3 (`createTestPool()` + `buildApp({ pool, logger: false })` + `truncateAll` in `beforeEach` + `app.close()` in `afterAll`). Covers:
  - 201 happy path with rich payload — assert `data` envelope shape, derived counts, `status` = `FAILED`; round-trip via `app.repos.testRuns.findById(runId)` to confirm the row landed
  - 201 with empty `testCases` → `status: 'SUCCESS'`, `totalTests: 0`
  - 400 missing `sourceType`
  - 400 `testCases[0].status = "MAYBE"`
  - 400 unknown top-level field (`additionalProperties: false`)
  - 404 valid UUID, no project
  - 422 status `"PASS"` (close-but-wrong) — exercises adapter's status whitelist
- **`ingest-multipart-*.test.ts`** — one suite per multipart format:
  - `ingest-multipart-playwright.test.ts` — fixture upload, 201, run + cases persisted
  - `ingest-multipart-jest.test.ts` — same pattern
  - `ingest-multipart-junit-xml.test.ts` — same pattern
  - `ingest-multipart-json.test.ts` — same pattern using a canonical-shape JSON fixture
  - One representative 400 per multipart suite (missing `file`, unknown `format`, oversized file)
  - One representative 422 per multipart suite (malformed report)

### 12.3 What we are deliberately not doing

- **No live HTTP listener.** `app.inject()` exercises the full request lifecycle without sockets — same convention as Epic 3.
- **No mocking of `@fastify/multipart`.** Multipart payloads are constructed via `FormData` in tests and sent through `app.inject({ payload: form, headers })`. This validates the real plugin wiring.
- **No fuzz testing of XML / JSON parsers.** Fixture-based tests with explicit malformed inputs are enough for MVP.
- **No `Pool.connect`/`PoolClient` mocking** — `withTransaction` is exercised end-to-end against `tfi_test`.

---

## 13. Task breakdown

Each task is one logical commit per `memory/workflow.md`. Acceptance criteria are objective and runnable.

---

### Task 1 — Ingestion port types and shared helpers

**Purpose:** Lay the contract every adapter and the use case will share. Single source of truth for the parse output shape and the `fullName` rule.

**Files affected:**
- `backend/src/application/ingestion/types.ts` *(new — `ParsedTestCase`, `ParsedTestRun`, `IngestionAdapter`, `AdapterInput`)*
- `backend/src/application/ingestion/errors.ts` *(new — `IngestionFailedError` class)*
- `backend/src/application/ingestion/normalize-full-name.ts` *(new — `normalizeFullName(suiteName?, testName)` pure function)*
- `backend/tests/unit/application/ingestion/normalize-full-name.test.ts` *(new — covers with/without suite, empty suite, unicode)*

**Acceptance criteria:**
- `IngestionAdapter.parse(input: AdapterInput): ParsedTestRun` exported and documented with `@throws IngestionFailedError`
- `IngestionFailedError extends Error` with `readonly name = 'IngestionFailedError'`
- `normalizeFullName(undefined, "test")` returns `"test"`; `normalizeFullName("Suite", "test")` returns `"Suite > test"`; empty-string suite treated as missing
- Unit tests pass; `npm run typecheck && npm run lint && npm run format:check && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): add ingestion port types and fullName normalizer`

---

### Task 2 — Ingest request and response JSON schemas

**Purpose:** Declare the Ajv schemas that drive validation and OpenAPI generation for the JSON-body path.

**Files affected:**
- `backend/src/http/schemas/ingest.ts` *(new)*

**Acceptance criteria:**
- Exports `ingestApiBodySchema` matching the table in §4.3 (top-level `additionalProperties: false`; nested `testCases[i]` `additionalProperties: false`)
- Exports `ingestParamsSchema` requiring `projectId` with `format: 'uuid'`
- Exports `ingestResponseSchema` matching the §4.5 success envelope (`{ data: { runId, status, totalTests, passedTests, failedTests, skippedTests } }`)
- Exports TypeScript types `IngestApiBody`, `IngestParams`, `IngestResponse` parallel to the schemas
- `npm run typecheck` exits 0
- No runtime tests required

**Expected commit message:** `feat(backend): add ingest request and response JSON schemas`

---

### Task 3 — Canonical JSON adapter (covers `api` and `json`)

**Purpose:** First and simplest adapter — same input the Ajv body schema describes, with adapter-level defensive checks for the `json` multipart path.

**Files affected:**
- `backend/src/application/ingestion/adapters/canonical-json.adapter.ts` *(new)*
- `backend/tests/unit/application/ingestion/adapters/canonical-json.adapter.test.ts` *(new)*
- `backend/tests/fixtures/ingestion/canonical/happy-path.json` *(new)*

**Acceptance criteria:**
- `canonicalJsonAdapter.parse({ kind: 'json', body })` returns `ParsedTestRun`
- Status pass-through per §5.3 (identity)
- Unknown status → `IngestionFailedError`
- Invalid `executedAt` (not parseable as a Date) → `IngestionFailedError`
- Missing `testCases` → `IngestionFailedError('Canonical JSON has no "testCases" array.')`
- `metadata` defaults to `{}` when absent
- `fullName` produced via `normalizeFullName` only
- Tests: happy path, missing testCases, unknown status, invalid date, suite-less case, retryCount default
- `npm run typecheck && npm run lint && npm run format:check && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): add canonical JSON ingestion adapter`

---

### Task 4 — Playwright JSON adapter

**Purpose:** Map Playwright's nested suites/specs/tests/results structure into the canonical fragment shape.

**Files affected:**
- `backend/src/application/ingestion/adapters/playwright.adapter.ts` *(new)*
- `backend/tests/unit/application/ingestion/adapters/playwright.adapter.test.ts` *(new)*
- `backend/tests/fixtures/ingestion/playwright/happy-path.json` *(new — small representative report)*
- `backend/tests/fixtures/ingestion/playwright/with-retries.json` *(new)*

**Acceptance criteria:**
- Flattens nested `suites[].specs[].tests[].results[]` taking the last result per spec
- `retryCount` = `tests[i].results.length - 1`
- Status mapping per §5.3 (timedOut, interrupted → FAILED)
- Ancestor suite titles joined with ` > ` for `suiteName`
- `IngestionFailedError` on missing `suites`
- Empty `suites` → zero cases, success
- Tests cover: happy path, retries, skipped, timedOut, missing-suites failure
- `npm run typecheck && npm run lint && npm run format:check && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): add Playwright JSON ingestion adapter`

---

### Task 5 — Jest JSON adapter

**Purpose:** Map Jest's `--json` reporter output to the canonical fragment shape.

**Files affected:**
- `backend/src/application/ingestion/adapters/jest.adapter.ts` *(new)*
- `backend/tests/unit/application/ingestion/adapters/jest.adapter.test.ts` *(new)*
- `backend/tests/fixtures/ingestion/jest/happy-path.json` *(new)*

**Acceptance criteria:**
- Flattens `testResults[].testResults[]`
- `fullName` = `normalizeFullName(ancestorTitles.join(' > '), title)`
- Status mapping per §5.3 (pending, todo, disabled → SKIPPED)
- `failureMessage` = `failureMessages.join('\n')` when non-empty
- `executedAt` from `startTime` (epoch-ms number)
- `IngestionFailedError` on missing `testResults`
- Tests cover: happy path, skipped variants, todo, multiple failure messages, missing-testResults failure
- `npm run typecheck && npm run lint && npm run format:check && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): add Jest JSON ingestion adapter`

---

### Task 6 — JUnit XML adapter (with `fast-xml-parser` dependency)

**Purpose:** Map JUnit XML reports — the de-facto CI standard — to the canonical fragment shape.

**Files affected:**
- `backend/package.json`, `backend/package-lock.json` *(add `fast-xml-parser@^4.4.0` runtime dependency)*
- `backend/src/application/ingestion/adapters/junit-xml.adapter.ts` *(new)*
- `backend/tests/unit/application/ingestion/adapters/junit-xml.adapter.test.ts` *(new)*
- `backend/tests/fixtures/ingestion/junit-xml/happy-path.xml` *(new)*
- `backend/tests/fixtures/ingestion/junit-xml/skipped-and-errors.xml` *(new)*
- `backend/tests/fixtures/ingestion/junit-xml/single-suite-root.xml` *(new)*

**Acceptance criteria:**
- Accepts both `<testsuites>` and single-`<testsuite>` roots
- `suiteName` from `<testcase classname>` when present, else `<testsuite name>`
- Status branching per §5.3 on child elements (`<failure>`, `<error>`, `<skipped/>`)
- `durationMs` derived from `@_time` (seconds → ms rounded)
- `failureMessage` from `@_message` if present, otherwise element text
- Malformed XML wrapped as `IngestionFailedError('JUnit XML is not well-formed: …')`
- Missing root → `IngestionFailedError`; zero `<testcase>` → `IngestionFailedError`
- Tests cover: happy path, root variants, status variants, malformed-XML failure, no-testcase failure
- `npm run typecheck && npm run lint && npm run format:check && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): add JUnit XML ingestion adapter`

---

### Task 7 — `ingestTestRun` use case

**Purpose:** The orchestrator. Reads from the adapter, derives counts/status, persists atomically via `withTransaction`.

**Files affected:**
- `backend/src/application/use-cases/ingest-test-run.ts` *(new)*
- `backend/tests/unit/application/use-cases/ingest-test-run.test.ts` *(new)*

**Acceptance criteria:**
- Signature `ingestTestRun(pool, runRepo, caseRepo, adapter, input): Promise<IngestTestRunResult>` per §8
- Derives `totalTests`, `passedTests`, `failedTests` (PASSED, FAILED+ERROR, SKIPPED respectively), `skippedTests`, and `status` per §5.4
- Wraps `runRepo.create` and `caseRepo.createMany` in a single `withTransaction(pool, ...)` call — same `PoolClient` passed to both
- Overrides from `input.overrides` applied only where `parsed.<field>` is `undefined`
- Adapter `IngestionFailedError` propagates unchanged; no repo methods called in that case
- `runRepo.create` rejecting with `ForeignKeyError` propagates unchanged
- Unit tests use mock repos + stub adapter; cover:
  - All-passed → SUCCESS; one failed → FAILED; one skipped (no failures) → PARTIAL; mix of FAILED + SKIPPED → FAILED (failures dominate); ERROR counts toward failedTests
  - Empty `cases` array → `caseRepo.createMany` called with `[]` (or not called — pick one and assert; recommend "called with `[]`" so the call site stays simple)
  - Overrides fill `parsed` gaps but do not overwrite in-file values
  - Adapter throws → use case rejects, repos not invoked
  - `runRepo.create` rejects → use case rejects with same error; `caseRepo.createMany` not invoked
- `npm run typecheck && npm run lint && npm run format:check && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): add ingestTestRun use case with transactional persistence`

---

### Task 8 — Error handler extension (`INGESTION_FAILED` and `PROJECT_NOT_FOUND` via FK)

**Purpose:** Two new branches in the global error handler so the route handler stays pure delegation.

**Files affected:**
- `backend/src/http/plugins/error-handler.ts` *(extend)*
- `backend/tests/unit/http/plugins/error-handler.test.ts` *(extend — add two new test cases)*

**Acceptance criteria:**
- New branch: `if (err instanceof IngestionFailedError) → 422 + failure('INGESTION_FAILED', err.message)`
- New branch: `if (err instanceof ForeignKeyError && err.constraint === 'test_runs_project_id_fkey') → 404 + failure('PROJECT_NOT_FOUND', 'Project not found.')`
- The constraint name is verified against the live migration during implementation (run `\d test_runs` against `tfi_test` and copy the exact name)
- Path gate from Epic 3 still respected — both new branches are inside the `/api/v1` block
- Existing branches and 6 existing tests still pass
- 2 new unit tests: one drives `IngestionFailedError`, one drives a `ForeignKeyError(constraint = 'test_runs_project_id_fkey')`, asserting status + envelope code
- `npm run typecheck && npm run lint && npm run format:check && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): map IngestionFailedError and test_runs FK to envelope responses`

---

### Task 9 — `POST /api/v1/projects/:projectId/ingest` route + multipart plugin + integration tests

**Purpose:** The endpoint. Bridges the two transports (JSON body and multipart upload) into a single use-case invocation. The biggest task in the epic — combining route, multipart plugin registration, and full integration coverage in one logical unit so the commit lands a fully working endpoint.

**Files affected:**
- `backend/package.json`, `backend/package-lock.json` *(add `@fastify/multipart@^9.0.0` runtime dependency)*
- `backend/src/app.ts` *(register `@fastify/multipart`; register ingest route)*
- `backend/src/http/routes/projects/ingest.route.ts` *(new)*
- `backend/tests/integration/routes/projects/ingest-api.test.ts` *(new — JSON body path)*
- `backend/tests/integration/routes/projects/ingest-multipart-playwright.test.ts` *(new)*
- `backend/tests/integration/routes/projects/ingest-multipart-jest.test.ts` *(new)*
- `backend/tests/integration/routes/projects/ingest-multipart-junit-xml.test.ts` *(new)*
- `backend/tests/integration/routes/projects/ingest-multipart-json.test.ts` *(new)*

**Acceptance criteria:**
- `@fastify/multipart` registered in `app.ts` with `attachFieldsToBody: false`, `limits: { fileSize: 5_242_880 }`, and explicit `addToBody: false` (we read parts iteratively)
- Route registered at `POST /:projectId/ingest` under the existing `app.register(...{ prefix: '/api/v1' })` projects family
- JSON-path handler:
  - Validates body via `ingestApiBodySchema` and params via `ingestParamsSchema`
  - Resolves adapter as `adaptersBySourceType['api']`
  - Calls `ingestTestRun(server.pool, server.repos.testRuns, server.repos.testCases, adapter, { projectId, sourceType: 'api', raw: { kind: 'json', body }, overrides: {} })`
  - Replies `201` with `success(result)`
- Multipart-path handler:
  - Detects multipart via `request.isMultipart()`
  - Iterates parts, populates a local `{ file?: Buffer | string; format?: string; overrides: {...} }` accumulator
  - Procedurally validates `file` present, `format` present and in whitelist, optional fields within length bounds — throws `fastify.httpErrors.badRequest(...)` on miss
  - Maps `format` to `sourceType` (`junit-xml` → `junit_xml`, others identity)
  - Resolves adapter via `adaptersBySourceType[sourceType]`
  - Builds `AdapterInput`: `{ kind: 'xml', text }` for `junit_xml`, else `{ kind: 'json', body: JSON.parse(text) }`. JSON parse failure → `IngestionFailedError('File is not valid JSON.')`
  - Calls `ingestTestRun(...)` and replies `201` with `success(result)`
- Integration tests cover (one suite per file):
  - **api JSON suite:** 201 happy path (round-trip via repo); 201 empty `testCases` → `SUCCESS`; 400 missing `sourceType`; 400 unknown field; 400 invalid case status; 404 unknown project UUID; 422 invalid `executedAt`
  - **multipart playwright suite:** 201 happy path with fixture file; 400 missing `file`; 400 missing `format`; 400 unknown `format`; 422 missing `suites`; one persistence round-trip
  - **multipart jest suite:** 201 happy path; 422 missing `testResults`; one persistence round-trip
  - **multipart junit-xml suite:** 201 happy path with both root variants; 422 malformed XML; 422 zero testcases; one persistence round-trip
  - **multipart json suite:** 201 happy path; 422 malformed JSON file; one persistence round-trip
- All existing 76 integration tests continue to pass
- `npm run test:integration` passes locally against `tfi_test`
- `npm run typecheck && npm run lint && npm run format:check && npm run test:unit && npm run test:integration` all exit 0

**Expected commit message:** `feat(backend): add POST /api/v1/projects/:projectId/ingest endpoint`

---

### Task 10 — Documentation pass

**Purpose:** Surface the new endpoint and the adapter conventions in the developer-facing docs.

**Files affected:**
- `README.md` *(append the ingest endpoint to the projects API table; add a short "Ingesting test results" subsection with one `curl` per content type)*
- `docs/architecture/http-layer.md` *(extend the error code reference with `INGESTION_FAILED` 422; extend the "Adding a new endpoint" checklist with a sentence on ingestion specifically; add a new subsection "Ingestion adapters" describing the `IngestionAdapter` interface and where adapters live)*

**Acceptance criteria:**
- README's `## API Documentation` projects table gains a `POST /api/v1/projects/:projectId/ingest` row
- A new `### Ingesting test results` subsection includes two `curl` examples — one for the JSON body path, one for the multipart upload path (using `--form file=@report.xml --form format=junit-xml`)
- `docs/architecture/http-layer.md` adds:
  - `INGESTION_FAILED` row in the error code reference table (422)
  - A new `## Ingestion adapters` section after `## Schemas`, describing the `IngestionAdapter` interface, the `ParsedTestRun` fragment shape, where adapters live (`backend/src/application/ingestion/adapters/`), the `fullName` rule, and the adapter selection map in the route file
- No source code changes — docs only
- `npm run typecheck && npm run lint && npm run format:check && npm run test:unit && npm run test:integration` all exit 0 (confirming docs don't break anything)

**Expected commit message:** `docs: document ingestion endpoint and adapter conventions`

---

## 14. Definition of done

The epic is complete when all of the following hold simultaneously on `develop`:

- All ten tasks above are committed in order with the expected commit messages
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration` all pass locally and in CI
- CI green on the PR that merges the epic to `develop`
- `curl` against a locally-running backend (per the README) successfully ingests representative payloads for all five source types and returns the documented summary envelope
- A 404 from an unknown project, a 400 from missing fields, and a 422 from a malformed Playwright report all round-trip correctly
- Swagger UI at `http://localhost:3001/documentation` shows the `POST /api/v1/projects/:projectId/ingest` endpoint with request schema (for the JSON path) and response schema
- The Epic 4 section of `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md` §9 is fully implemented (all four tasks under "REST API ingestion" and "File upload ingestion")
- A release PR has merged the work to `main` per the established `--admin` release pattern
- No `Co-authored-by` lines, no AI attribution anywhere in the commit history, code comments, README, or architecture docs

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `@fastify/multipart` behaviour differs across versions (the v8 → v9 split changed default options) | Pin a known-good version (`@fastify/multipart@^9.0.0`); test the upload path end-to-end in Task 9 against `tfi_test` |
| `fast-xml-parser` configuration drift between versions could change attribute prefixing | Pin a known-good version (`fast-xml-parser@^4.4.0`); the adapter explicitly sets `attributeNamePrefix: '@_'` and the test suite asserts attribute access; failure here surfaces immediately in unit tests |
| Multipart upload of a 5 MB file via `app.inject()` might be slow or memory-heavy in CI | Fixtures used in tests are small (<10 KB); the 5 MB limit is a runtime guard, not a test scenario |
| Future Epic 5 sub-routes under `/api/v1/projects/:projectId/...` will hit the Epic 3 §13 routerPath caveat | Track as a separate concern when Epic 5 lands; ingestion errors are routed by `instanceof IngestionFailedError` (not routerPath) so this epic is unaffected |
| Race: two concurrent POSTs for the same `external_id` create two rows | Documented as accepted in §7; Phase 2 fix is a partial unique index |
| Adapter messages could leak input fragments (PII / secrets in failureMessage) into 422 responses | Adapters compose their own messages from format-level facts ("Playwright report has no \"suites\" array") — never echo raw input fields. Verified by unit tests that match against an explicit message whitelist per adapter. |
| The Playwright reporter format has evolved (v1.30 → v1.45 had small changes around `interrupted` status) | Fixture-based testing; if a real-world report fails, we add a new fixture and extend the adapter. No defensive "future-proofing". |

---

## 16. Commit sequence (summary)

| # | Commit message |
|---|---|
| 1 | `feat(backend): add ingestion port types and fullName normalizer` |
| 2 | `feat(backend): add ingest request and response JSON schemas` |
| 3 | `feat(backend): add canonical JSON ingestion adapter` |
| 4 | `feat(backend): add Playwright JSON ingestion adapter` |
| 5 | `feat(backend): add Jest JSON ingestion adapter` |
| 6 | `feat(backend): add JUnit XML ingestion adapter` |
| 7 | `feat(backend): add ingestTestRun use case with transactional persistence` |
| 8 | `feat(backend): map IngestionFailedError and test_runs FK to envelope responses` |
| 9 | `feat(backend): add POST /api/v1/projects/:projectId/ingest endpoint` |
| 10 | `docs: document ingestion endpoint and adapter conventions` |

Ten commits, each a small reviewable unit. The story across the history reads: **establish the shared types** (port, error class, fullName helper, schemas), **build each adapter** (canonical, Playwright, Jest, JUnit XML), **assemble the use case** with transactional persistence, **plumb the new error codes** through the global handler, **wire the endpoint** with full integration coverage, **document**.
