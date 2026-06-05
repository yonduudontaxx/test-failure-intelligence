# Epic 3 — Project Management Implementation Plan

**Status:** Draft — pending review
**Date:** 2026-06-05
**Spec reference:** `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md` §1, §4, §7 "Projects", §9 "Epic 3: Projects API"
**Predecessor:** Epic 2 Data Layer (released on `main` via PR #2) — provides `ProjectRepository` port, `PgProjectRepository`, `UniqueConstraintError`, and `app.repos.projects` Fastify decorator

---

## 1. Objective

Expose the three MVP project-management endpoints over HTTP, completing the read/write surface that the dashboard and ingestion epics depend on:

```
POST   /api/v1/projects                  Create project
GET    /api/v1/projects                  List projects (paginated)
GET    /api/v1/projects/:projectId       Get project by ID
```

The output of this epic is a fully-wired HTTP surface that validates input, returns the spec-defined response envelopes, maps domain errors to HTTP status codes consistently, and is documented in the auto-generated OpenAPI spec. The envelope, error-handler, and use-case patterns established here are deliberately reusable so Epic 4 (Ingestion) and Epic 5 (Analytics) can drop into them without re-deciding shape.

`PATCH` and `DELETE` for projects are explicitly out of scope per spec §7 ("Phase 2") and §8 ("Excluded from MVP").

---

## 2. Scope

### In scope

- HTTP envelope helpers: spec §7 success envelope (`{ data, meta? }`) and error envelope (`{ error: { code, message, details? } }`) as a single small module
- Global Fastify error handler that maps:
  - Fastify Ajv validation failures (request body / params / query) → `400 VALIDATION_ERROR`
  - `UniqueConstraintError` (already defined in Epic 2) → `409 DUPLICATE_PROJECT_SLUG` for the projects route; future routes register their own code via a thin per-route hook
  - All other errors → `500 INTERNAL_ERROR` with a sanitized message
- Three use case functions in `backend/src/use-cases/`: `createProject`, `getProject`, `listProjects` — pure functions that take a `ProjectRepository` and return domain entities
- One Fastify route module `backend/src/http/routes/projects.ts` registered under the `/api/v1` prefix in `app.ts`
- Request/response JSON schemas in `backend/src/http/schemas/project.ts`, wired into route definitions so Fastify performs validation and Swagger auto-generates OpenAPI
- Slug validation rule: lowercase alphanumeric + hyphens, 1–63 chars, no leading/trailing/double hyphens (`^[a-z0-9]+(-[a-z0-9]+)*$`)
- Integration tests for every route via `app.inject()` against the real `tfi_test` database (same harness as Epic 2)
- Unit tests for use cases against a mock `ProjectRepository`
- README and architecture updates documenting the new endpoints with copy-pasteable `curl` examples

### Explicitly out of scope (deferred, with justification)

- `PATCH /projects/:projectId`, `DELETE /projects/:projectId` → spec §7 marks Phase 2; spec §8 excludes from MVP
- Authentication, authorization, API keys → spec §10 Phase 3
- `findBySlug` exposed as a route (e.g., `GET /projects/by-slug/:slug`) → not in spec §7; YAGNI until a UI consumer needs it
- Cursor-based pagination → spec §7 uses offset pagination (`?page=…&limit=…`); cursor pagination is a Phase 2+ optimization
- A use-cases-as-classes pattern with a DI container → KISS; use cases here are thin orchestrations, pure functions suffice (same reasoning Epic 2 §7 used to reject a DI container)
- A custom `NotFoundError` domain class → the repository already returns `null`; routes convert `null → 404` with one inline check, no extra type needed

### Constraints

- KISS / YAGNI: no new abstractions without a present consumer. Use case = function, not class. Error mapping = `setErrorHandler`, not middleware chain.
- DRY: one envelope module, one error handler, one route module — every Epic 4/5 route will reuse all three.
- One logical task = one logical commit. Conventional Commits per `memory/workflow.md`.
- The domain layer stays free of HTTP concerns (no `code`, `statusCode`, or envelope shape leaking into `domain/`).

---

## 3. Architecture

```
HTTP layer  (Fastify routes + JSON schemas + envelopes + error handler)
   │
   │  calls
   ▼
Use case layer  (createProject, getProject, listProjects — pure functions)
   │
   │  depends on port
   ▼
Domain layer  (ProjectRepository interface, Project entity, UniqueConstraintError)
   ▲
   │  implemented by
Infrastructure layer  (PgProjectRepository — already exists)
```

**Dependency direction:** HTTP → Use Cases → Domain ← Infrastructure. The use case never imports from `infrastructure/` or `http/`. The HTTP layer never imports from `infrastructure/` (it goes through use cases that receive a `ProjectRepository` port).

**Composition root:** `backend/src/http/routes/projects.ts` wires the use cases to the repository at request time. Per request, the route handler calls `req.server.repos.projects` (decorated by Epic 2's `repositoriesPlugin`), passes it into the relevant use case function, and serializes the result through an envelope helper.

```ts
// shape of a route handler in this epic
fastify.post<{ Body: CreateProjectBody }>('/projects', { schema }, async (req, reply) => {
  const project = await createProject(req.server.repos.projects, req.body);
  return reply.code(201).send(success(toProjectResponse(project)));
});
```

The use case shape stays the same for Epic 4/5 — explicit dependencies followed by an input object — the only thing that grows is the number of dependency arguments (e.g., `ingestTestRun(runRepo, caseRepo, pool, input)` will orchestrate multiple repositories inside a `withTransaction`, with the route handler extracting each dependency from `req.server` and passing it explicitly).

---

## 4. Endpoint design

Base prefix: `/api/v1` (registered once in `app.ts`).

### 4.1 POST /api/v1/projects

**Purpose:** Create a new project.

**Request body (JSON):**

```json
{
  "slug": "my-service",
  "name": "My Service",
  "description": "Optional description"
}
```

**Request body JSON schema (Ajv):**

| Field | Type | Required | Constraint |
|---|---|---|---|
| `slug` | string | yes | `pattern: ^[a-z0-9]+(-[a-z0-9]+)*$`, `minLength: 1`, `maxLength: 63` |
| `name` | string | yes | `minLength: 1`, `maxLength: 200`, trimmed non-empty |
| `description` | string | no | `maxLength: 2000` |

`additionalProperties: false` — unknown fields are rejected with 400. This is forward-incompatible with adding fields without a schema bump, which is the desired tradeoff for an MVP API.

**Success response — `201 Created`:**

```json
{
  "data": {
    "id": "uuid",
    "slug": "my-service",
    "name": "My Service",
    "description": "Optional description",
    "createdAt": "2026-06-05T12:00:00.000Z",
    "updatedAt": "2026-06-05T12:00:00.000Z"
  }
}
```

**Error responses:**

| Status | `error.code` | Trigger |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Body fails Ajv schema (missing required field, slug regex mismatch, length, unknown property) |
| `409` | `DUPLICATE_PROJECT_SLUG` | Insert raised `UniqueConstraintError` for the `projects_slug_key` constraint |
| `500` | `INTERNAL_ERROR` | Any other unhandled error |

`409` body example:

```json
{
  "error": {
    "code": "DUPLICATE_PROJECT_SLUG",
    "message": "A project with slug \"my-service\" already exists.",
    "details": [{ "field": "slug", "value": "my-service" }]
  }
}
```

### 4.2 GET /api/v1/projects

**Purpose:** Paginated list of all projects, newest first (matches `PgProjectRepository.list` which orders by `created_at DESC, id ASC`).

**Query parameters:**

| Param | Type | Default | Constraint |
|---|---|---|---|
| `page` | integer | `1` | `minimum: 1`, `maximum: 10000` |
| `limit` | integer | `50` | `minimum: 1`, `maximum: 100` |

`offset = (page - 1) * limit` is computed by the `listProjects` use case before calling the repository.

**Success response — `200 OK`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "slug": "service-a",
      "name": "Service A",
      "description": "...",
      "createdAt": "2026-06-05T12:00:00.000Z",
      "updatedAt": "2026-06-05T12:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 137 }
}
```

When `total` is 0, `data` is `[]` and `meta.total` is `0`. Pages beyond the last data page return `data: []` with the correct `meta.total` — they are **not** a 404.

**Error responses:**

| Status | `error.code` | Trigger |
|---|---|---|
| `400` | `VALIDATION_ERROR` | `page` or `limit` fails bounds/integer check |
| `500` | `INTERNAL_ERROR` | Any other unhandled error |

### 4.3 GET /api/v1/projects/:projectId

**Purpose:** Fetch a single project by UUID.

**Path parameter:**

| Param | Type | Constraint |
|---|---|---|
| `projectId` | string | `format: uuid` |

**Success response — `200 OK`:**

```json
{
  "data": {
    "id": "uuid",
    "slug": "service-a",
    "name": "Service A",
    "description": "...",
    "createdAt": "2026-06-05T12:00:00.000Z",
    "updatedAt": "2026-06-05T12:00:00.000Z"
  }
}
```

**Error responses:**

| Status | `error.code` | Trigger |
|---|---|---|
| `400` | `VALIDATION_ERROR` | `projectId` not a valid UUID |
| `404` | `PROJECT_NOT_FOUND` | Repository returned `null` |
| `500` | `INTERNAL_ERROR` | Any other unhandled error |

`404` body example:

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project with id \"00000000-0000-0000-0000-000000000000\" not found."
  }
}
```

---

## 5. HTTP response envelope and error handler design

### 5.1 Envelope helpers — `backend/src/http/envelopes.ts`

```ts
export type SuccessEnvelope<T> = { data: T; meta?: PaginationMeta };
export type PaginationMeta = { page: number; limit: number; total: number };
export type ErrorEnvelope = {
  error: { code: string; message: string; details?: unknown[] };
};

export function success<T>(data: T, meta?: PaginationMeta): SuccessEnvelope<T>;
export function failure(code: string, message: string, details?: unknown[]): ErrorEnvelope;
```

`success` and `failure` are the only two functions other modules call. The route layer never constructs envelope objects inline — DRY.

### 5.2 Error handler — `backend/src/http/error-handler.ts`

A single `setErrorHandler` registered in `app.ts` after all plugins are loaded. The domain-error envelope wrapping applies **only** to requests where `request.url` starts with `/api/v1`. Requests outside that prefix (`/health`, `/documentation`, and any future non-API routes) bypass all wrapping branches and fall through to Fastify's default error serialization, preserving the existing health-endpoint response shape.

Logic, in order:

```
if (request.url does not start with '/api/v1')
                                          → pass through; Fastify default serializer handles it
if (err is FastifyError with validation)  → 400 VALIDATION_ERROR  (details = err.validation array)
if (err is UniqueConstraintError && err.constraint == 'projects_slug_key')
                                          → 409 DUPLICATE_PROJECT_SLUG  (details = { field: 'slug', value })
if (err.statusCode)                       → use that status, code from a small map (404→PROJECT_NOT_FOUND when route registers it)
otherwise                                  → 500 INTERNAL_ERROR  (log full error, message = 'Internal server error')
```

Route handlers signal 404 by throwing `fastify.httpErrors.notFound('Project with id ...')` from `@fastify/sensible` (already a dependency). The error handler maps `404`s to `PROJECT_NOT_FOUND` when the throw originated from a project route. For now, route-specific code mapping uses a tiny inline lookup on `request.routerPath` — KISS, no new abstraction.

### 5.3 Why the unique-constraint mapping is keyed on constraint name

`projects_slug_key` is the Postgres constraint name for the unique index on `projects.slug`. Mapping on the constraint name (already surfaced through `UniqueConstraintError.constraint` by Epic 2) keeps the HTTP layer route-agnostic — Epic 4 can add `test_runs_external_id_key` later without touching the projects code path.

### 5.4 Wiring into `app.ts`

```ts
import errorHandlerPlugin from './http/error-handler.js';
import projectsRoutes from './http/routes/projects.js';

await app.register(repositoriesPlugin, { pool });
app.register(sensible);
app.register(cors);
app.register(swaggerPlugin);
app.register(errorHandlerPlugin);             // new
app.register(healthRoutes);
app.register(projectsRoutes, { prefix: '/api/v1' });   // new
```

Order matters: `errorHandlerPlugin` must register before route plugins so it's installed when their handlers are wired.

---

## 6. Use case design

Three pure functions in `backend/src/use-cases/`:

```ts
// create-project.ts
export interface CreateProjectInput {
  slug: string;
  name: string;
  description?: string;
}
export async function createProject(
  repo: ProjectRepository,
  input: CreateProjectInput,
): Promise<Project>;

// get-project.ts
export async function getProject(
  repo: ProjectRepository,
  id: string,
): Promise<Project | null>;

// list-projects.ts
export interface ListProjectsInput { page: number; limit: number }
export interface ListProjectsResult {
  items: Project[];
  page: number;
  limit: number;
  total: number;
}
export async function listProjects(
  repo: ProjectRepository,
  input: ListProjectsInput,
): Promise<ListProjectsResult>;
```

- `createProject` does **not** trim or canonicalize input — Ajv validation has already rejected anything that doesn't match the schema. KISS.
- `createProject` lets `UniqueConstraintError` propagate; the global error handler maps it.
- `getProject` returns `null` rather than throwing — the route translates `null → 404`. Keeps the use case framework-agnostic.
- `listProjects` is where `page/limit → offset` translation lives. The repository sees only `offset/limit`. The translation is one line but lives in the use case so route handlers stay declarative.

### Why use cases at all for thin wrappers

Three reasons, each load-bearing:

1. **Consistency with Epic 4/5.** Ingestion and analytics use cases will not be thin wrappers — they'll orchestrate multiple repositories inside a transaction. Establishing the calling pattern now means routes look the same everywhere.
2. **Domain-only inputs.** The use case signature uses domain types (`Project`, `ProjectRepository`), not Fastify types. This is what stops the HTTP layer from leaking into the domain.
3. **Testability.** Unit-test the orchestration with a mock repo, without spinning up Fastify or Postgres.

---

## 7. Repository consumption and dependency injection

The Fastify decorator pattern established in Epic 2 (`backend/src/http/plugins/repositories.ts`) is the sole DI mechanism. Route handlers read `req.server.repos.projects` and pass it into the use case.

```ts
// in routes/projects.ts
fastify.post<{ Body: CreateProjectBody }>(
  '/projects',
  { schema: createProjectSchema },
  async (req, reply) => {
    const project = await createProject(req.server.repos.projects, req.body);
    return reply.code(201).send(success(toResponse(project)));
  },
);
```

### Why not also decorate use cases (`app.useCases.projects.create`)

- Use cases have no construction-time dependencies. The only thing they need (`ProjectRepository`) is passed in at call-time as a function argument. Wrapping them in a decorator would add ceremony with no payoff.
- When Epic 4 introduces an `ingestTestRun` use case that needs `Pool` (for `withTransaction`) plus three repositories, the route handler extracts each dependency from `req.server.repos` and `req.server.pool` and passes them explicitly: `ingestTestRun(runRepo, caseRepo, pool, input)`. This is the same pattern as Epic 3 — the only thing that grows is the number of arguments, not the shape. Passing `req.server` (or `req.body`) directly into a use case is explicitly **not** the convention: it would leak HTTP types into the domain and violate the domain-only-inputs criterion stated in §6. No plugin needed.
- This matches Epic 2's reasoning (§7) for choosing decorators over a DI container: one composition root, idiomatic Fastify, zero magic.

### Test paths

- **Use case unit tests** construct a hand-rolled mock `ProjectRepository` (Jest `jest.fn()` for each method) and assert call args / return value translation. No Fastify, no Postgres.
- **Route integration tests** call `buildApp({ pool })` against `tfi_test` (the same pool/test harness Epic 2 set up) and use `app.inject()` to drive HTTP requests through the real wiring. Tests truncate via the shared `truncateAll` helper in `beforeEach`.

---

## 8. Validation strategy

Validation lives in exactly one place per dimension:

| Concern | Where | How |
|---|---|---|
| Request body shape (POST) | `backend/src/http/schemas/project.ts` | Fastify route `schema.body` (Ajv) |
| Path params (UUID) | same file | Fastify route `schema.params` |
| Query params (page/limit bounds) | same file | Fastify route `schema.querystring` |
| Slug uniqueness | Database | `projects_slug_key` UNIQUE; mapped to 409 |
| Slug character set / length | Schema body | `pattern` + `minLength`/`maxLength` |
| `additionalProperties: false` | Schema body | Reject unknown fields with 400 |

No validation logic in the use cases — input arriving at a use case is already structurally valid by Ajv. The use case can trust its argument types. This is the only thing that justifies skipping a runtime guard library inside use cases (KISS).

### Why `pattern: '^[a-z0-9]+(-[a-z0-9]+)*$'` and not `format: 'slug'`

Ajv has no built-in `slug` format. Defining a regex inline keeps the validation visible at the schema, which is the file a reviewer expects to read when checking input rules. A custom Ajv format would add an indirection for one occurrence.

### Trimming

Names are not trimmed by the server — `minLength: 1` after Ajv coercion is enough to reject empty-after-trim strings if we add `transform: ['trim']` later. For MVP, treat leading/trailing whitespace as the caller's mistake; reject `"   "` via `minLength: 1` and `pattern` if needed. Not adding `transform` keeps the schema standard.

---

## 9. Error handling matrix

This matrix describes the error envelope behavior for routes under `/api/v1`. Errors on non-`/api/v1` routes (e.g., `/health`) are **not** wrapped in the envelope — they pass through to Fastify's default error serialization so the existing health response shape is preserved.

| Scenario | HTTP | `error.code` | `error.message` | `details` |
|---|---|---|---|---|
| POST body missing `slug` | 400 | `VALIDATION_ERROR` | `Request validation failed` | Ajv `validation` array |
| POST `slug` violates regex | 400 | `VALIDATION_ERROR` | `Request validation failed` | Ajv `validation` array |
| POST has unknown field `foo` | 400 | `VALIDATION_ERROR` | `Request validation failed` | Ajv `validation` array |
| POST duplicate slug | 409 | `DUPLICATE_PROJECT_SLUG` | `A project with slug "X" already exists.` | `[{ field: 'slug', value: 'X' }]` |
| GET list `?page=0` | 400 | `VALIDATION_ERROR` | `Request validation failed` | Ajv |
| GET list `?limit=200` | 400 | `VALIDATION_ERROR` | `Request validation failed` | Ajv |
| GET by id, invalid UUID | 400 | `VALIDATION_ERROR` | `Request validation failed` | Ajv |
| GET by id, unknown UUID | 404 | `PROJECT_NOT_FOUND` | `Project with id "<id>" not found.` | omitted |
| Database connection lost | 500 | `INTERNAL_ERROR` | `Internal server error` | omitted (full error logged) |
| Unexpected exception | 500 | `INTERNAL_ERROR` | `Internal server error` | omitted (full error logged) |

500s never leak internal messages — the full error is logged via `fastify.log.error`, and the response carries the generic message. This is enforced by the global error handler and unit-tested in Task 2.

---

## 10. Testing strategy

### Unit tests

- **Envelope helpers** — `tests/unit/http/envelopes.test.ts`: assert `success` returns `{ data, meta? }`; `failure` returns `{ error: { code, message, details? } }`; `details` omitted when absent.
- **Error handler** — `tests/unit/http/error-handler.test.ts`: drive a minimal Fastify instance that throws the various error types from a test route; assert status code and response body for each branch (validation, unique-constraint, 404, default).
- **Use cases** — one test file per use case in `tests/unit/use-cases/`:
  - `create-project.test.ts`: passes input to repo, returns repo result; lets `UniqueConstraintError` propagate.
  - `get-project.test.ts`: returns repo result (entity or `null`).
  - `list-projects.test.ts`: converts `page=1, limit=50` → `offset=0, limit=50`; converts `page=3, limit=20` → `offset=40, limit=20`; reshapes repo `{ items, total }` into `{ items, page, limit, total }`.

### Integration tests

`tests/integration/routes/projects.test.ts`, structured as one `describe` per endpoint:

- Test harness identical to existing repository integration tests: shared `createTestPool()`, `buildApp({ pool, logger: false })`, `truncateAll` in `beforeEach`, `await app.close()` in `afterEach`, `await pool.end()` in `afterAll`.
- Drive requests via `app.inject()` — no network listener.
- Assertions cover every row of the error-matrix table in §9 plus the happy paths for all three endpoints.

The integration suite is the contract — it locks down envelope shape, status codes, error codes, header content-type, and pagination math. Future epics shouldn't be able to silently break the projects API.

### What we are deliberately not doing

- **No supertest / real HTTP listener.** `app.inject()` is faster, deterministic, and gives the same coverage of the request lifecycle.
- **No snapshot tests** for response bodies. Snapshots rot; explicit assertions force a reviewer to confirm intent when the shape changes.
- **No fake `ProjectRepository` for integration tests.** The whole point of the integration test is the real wire, including the real repository against `tfi_test`. Use cases are the only layer that gets a mock repo in unit tests.

---

## 11. Task breakdown

Each task is one logical commit per `memory/workflow.md`. Acceptance criteria are objective and runnable.

---

### Task 1 — HTTP response envelopes

**Purpose:** Provide a single source of truth for the `{ data, meta? }` and `{ error: { code, message, details? } }` shapes from spec §7.

**Files affected:**
- `backend/src/http/envelopes.ts` *(new)*
- `backend/tests/unit/http/envelopes.test.ts` *(new)*

**Acceptance criteria:**
- Exports `SuccessEnvelope<T>`, `PaginationMeta`, `ErrorEnvelope` types
- Exports `success<T>(data, meta?)` returning `{ data }` or `{ data, meta }` (meta omitted when absent)
- Exports `failure(code, message, details?)` returning `{ error: { code, message } }` or `{ error: { code, message, details } }` (details omitted when absent)
- Unit tests assert: `success` omits `meta` when not provided; `success` includes `meta` when provided; `failure` omits `details` when not provided; `failure` includes `details` when provided
- `npm run typecheck` exits 0
- `npm run lint` exits 0
- `npm run test:unit` includes new tests, all pass

**Expected commit message:** `feat(backend): add HTTP response envelope helpers`

---

### Task 2 — Global Fastify error handler

**Purpose:** Map every error a route can produce to the spec's error envelope and the correct HTTP status code. Wire it into `buildApp`.

**Files affected:**
- `backend/src/http/error-handler.ts` *(new)*
- `backend/src/app.ts` *(register error handler plugin after `swaggerPlugin`, before route plugins)*
- `backend/tests/unit/http/error-handler.test.ts` *(new)*

**Acceptance criteria:**
- Exports a `fastify-plugin`-wrapped plugin that calls `fastify.setErrorHandler(...)`
- Handler logic:
  - **Path gate (precedes all wrapping branches):** if `request.url` does not start with `/api/v1`, the handler does **not** wrap the error — control falls through to Fastify's default error serialization. This preserves the existing `/health` response shape and any future non-`/api/v1` routes.
  - `err.validation` present → `400` + `failure('VALIDATION_ERROR', 'Request validation failed', err.validation)`
  - `err instanceof UniqueConstraintError && err.constraint === 'projects_slug_key'` → `409` + `failure('DUPLICATE_PROJECT_SLUG', \`A project with slug "${value}" already exists.\`, [{ field: 'slug', value }])` where `value` is parsed from `err.detail`
  - `err.statusCode === 404` and request path begins with `/api/v1/projects/` → `404` + `failure('PROJECT_NOT_FOUND', err.message)`
  - Otherwise → log full error, respond `500` + `failure('INTERNAL_ERROR', 'Internal server error')`
- Unit test exercises each wrapping branch by registering a route under `/api/v1/...` that throws the relevant error and asserting status + body
- Errors on non-`/api/v1` routes (e.g., `GET /health` with a simulated DB failure) are **not** wrapped in the domain error envelope — unit test asserts the response uses Fastify's default error shape, not `{ error: { code, message } }`
- 500 branch asserts that `fastify.log.error` was called with the original error
- `npm run typecheck && npm run lint && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): add global error handler with envelope mapping`

---

### Task 3 — Project request/response JSON schemas

**Purpose:** Declare the Ajv schemas that drive both validation and Swagger OpenAPI generation. Define the wire-format DTO once so route and tests share it.

**Files affected:**
- `backend/src/http/schemas/project.ts` *(new)*

**Acceptance criteria:**
- Exports `createProjectBodySchema` (JSON Schema): required `slug` (pattern `^[a-z0-9]+(-[a-z0-9]+)*$`, len 1–63), required `name` (len 1–200), optional `description` (len 0–2000), `additionalProperties: false`
- Exports `projectIdParamsSchema`: required `projectId` with `format: 'uuid'`
- Exports `listProjectsQuerySchema`: optional `page` (int, default 1, min 1, max 10000) and `limit` (int, default 50, min 1, max 100), `additionalProperties: false`
- Exports `projectResponseSchema`: object with `id` (uuid), `slug`, `name`, `description?`, `createdAt` (date-time), `updatedAt` (date-time)
- Exports `successResponseSchema(dataSchema)` and `listResponseSchema(itemSchema)` factories that wrap the entity schema in the envelope schema, including the `meta` block for list responses
- Exports `errorResponseSchema` describing the `failure(...)` envelope
- Exports `TypeScript` types derived from the schemas (`CreateProjectBody`, `ProjectIdParams`, `ListProjectsQuery`) so route handlers are typed
- `npm run typecheck` exits 0
- No runtime tests required (schemas are declarative)

**Expected commit message:** `feat(backend): add project request and response JSON schemas`

---

### Task 4 — `createProject` use case

**Purpose:** First use case. Establishes the use-case-as-function pattern.

**Files affected:**
- `backend/src/use-cases/create-project.ts` *(new)*
- `backend/tests/unit/use-cases/create-project.test.ts` *(new)*

**Acceptance criteria:**
- Exports `CreateProjectInput` interface matching the validated request body shape
- Exports `async function createProject(repo: ProjectRepository, input: CreateProjectInput): Promise<Project>`
- Implementation calls `repo.create(input)` and returns the result — no other logic
- Unit test: passes a mock repo whose `create` returns a fixed `Project`; assert the use case returns it verbatim and called `create` with the input
- Unit test: mock repo's `create` rejects with `UniqueConstraintError`; assert the use case re-throws the same error instance (does not wrap)
- `npm run typecheck && npm run lint && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): add createProject use case`

---

### Task 5 — `getProject` use case

**Purpose:** Single-record fetch use case. Returns `null` on miss; never throws for not-found.

**Files affected:**
- `backend/src/use-cases/get-project.ts` *(new)*
- `backend/tests/unit/use-cases/get-project.test.ts` *(new)*

**Acceptance criteria:**
- Exports `async function getProject(repo: ProjectRepository, id: string): Promise<Project | null>`
- Implementation calls `repo.findById(id)` and returns the result
- Unit test: mock repo returns a project — assert use case returns the same project
- Unit test: mock repo returns `null` — assert use case returns `null` (not `undefined`, not throw)
- `npm run typecheck && npm run lint && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): add getProject use case`

---

### Task 6 — `listProjects` use case (page/limit → offset)

**Purpose:** Paginated list use case. Owns the `page`/`limit` → `offset`/`limit` translation so route handlers stay declarative.

**Files affected:**
- `backend/src/use-cases/list-projects.ts` *(new)*
- `backend/tests/unit/use-cases/list-projects.test.ts` *(new)*

**Acceptance criteria:**
- Exports `ListProjectsInput { page: number; limit: number }`
- Exports `ListProjectsResult { items: Project[]; page: number; limit: number; total: number }`
- Exports `async function listProjects(repo: ProjectRepository, input: ListProjectsInput): Promise<ListProjectsResult>`
- Computes `offset = (page - 1) * limit`, calls `repo.list({ limit, offset })`, returns `{ items: repoResult.items, page, limit, total: repoResult.total }`
- Unit test: `page=1, limit=50` passes `{ limit: 50, offset: 0 }` to the repo
- Unit test: `page=3, limit=20` passes `{ limit: 20, offset: 40 }` to the repo
- Unit test: shape of result includes `page` and `limit` echoed back, plus `items` and `total` from the repo
- `npm run typecheck && npm run lint && npm run test:unit` all exit 0

**Expected commit message:** `feat(backend): add listProjects use case with pagination translation`

---

### Task 7 — POST /api/v1/projects route + integration tests

**Purpose:** First HTTP endpoint. Establishes the route module that Tasks 8 and 9 extend.

**Files affected:**
- `backend/src/http/routes/projects.ts` *(new — POST only)*
- `backend/src/app.ts` *(register projects routes with `prefix: '/api/v1'` after error handler)*
- `backend/tests/integration/routes/projects.test.ts` *(new — POST suite only)*

**Acceptance criteria:**
- Route registered at `POST /projects` under the `/api/v1` prefix → full path `POST /api/v1/projects`
- Uses `createProjectBodySchema` for `schema.body`; response schema declared so Swagger documents the 201 envelope
- Handler signature uses `CreateProjectBody` (derived from schema)
- Handler calls `createProject(req.server.repos.projects, req.body)` and replies `201` with `success(toResponse(project))`
- `toResponse(project)` maps the domain `Project` to the wire format with ISO-8601 date strings for `createdAt` and `updatedAt` (the JSON serializer does this automatically via `toJSON` on `Date`, so the helper is a type assertion rather than a transform — verify in tests)
- Integration tests cover:
  - 201 happy path: assert status, content-type, response body matches success envelope with the created project
  - 400 missing `slug`: assert status, `error.code === 'VALIDATION_ERROR'`, `details` is the Ajv array
  - 400 slug regex violation (`Foo-Bar`, `-leading`, `trailing-`): one test per case
  - 400 slug too short (`""`) and too long (64 chars)
  - 400 name too short / too long
  - 400 unknown field (`additionalProperties` rejection)
  - 409 duplicate slug: insert one, attempt again, assert status and `DUPLICATE_PROJECT_SLUG` envelope including `details: [{ field: 'slug', value: '<slug>' }]`
  - Response timestamps round-trip as ISO 8601 strings
- `npm run test:integration` passes locally against `tfi_test`
- No `--forceExit`

**Expected commit message:** `feat(backend): add POST /api/v1/projects endpoint`

---

### Task 8 — GET /api/v1/projects/:projectId route + integration tests

**Purpose:** Single-record fetch endpoint. Exercises the 404 path of the error handler.

**Files affected:**
- `backend/src/http/routes/projects.ts` *(extend with GET-by-id handler)*
- `backend/tests/integration/routes/projects.test.ts` *(extend with GET-by-id suite)*

**Acceptance criteria:**
- Route registered at `GET /projects/:projectId` → full path `GET /api/v1/projects/:projectId`
- Uses `projectIdParamsSchema` for `schema.params`
- Handler calls `getProject(req.server.repos.projects, req.params.projectId)`; on `null`, throws `fastify.httpErrors.notFound(\`Project with id "${id}" not found.\`)`; on success, replies `200` with `success(toResponse(project))`
- Integration tests cover:
  - 200 happy path: insert a project via the repo, GET by id, assert envelope and body
  - 404 unknown UUID: assert status, `error.code === 'PROJECT_NOT_FOUND'`, message contains the id
  - 400 non-UUID id (e.g. `not-a-uuid`): assert status and `VALIDATION_ERROR`
- `npm run test:integration` passes

**Expected commit message:** `feat(backend): add GET /api/v1/projects/:projectId endpoint`

---

### Task 9 — GET /api/v1/projects route (list) + integration tests

**Purpose:** Paginated list endpoint. Exercises envelope + meta.

**Files affected:**
- `backend/src/http/routes/projects.ts` *(extend with GET list handler)*
- `backend/tests/integration/routes/projects.test.ts` *(extend with GET list suite)*

**Acceptance criteria:**
- Route registered at `GET /projects` → full path `GET /api/v1/projects`
- Uses `listProjectsQuerySchema` for `schema.querystring`
- Handler calls `listProjects(req.server.repos.projects, { page, limit })` with values from query (defaults applied by Ajv)
- Replies `200` with `success(items.map(toResponse), { page, limit, total })`
- Integration tests cover:
  - 200 empty: assert `{ data: [], meta: { page: 1, limit: 50, total: 0 } }`
  - 200 with 3 records: assert `data.length === 3`, `meta.total === 3`, order is newest first (matches repo's `ORDER BY created_at DESC, id ASC`)
  - Pagination over 25 inserts: `?page=1&limit=10` returns 10 items + `total: 25`; `?page=3&limit=10` returns the 5-item tail + `total: 25`
  - Page beyond data: `?page=99&limit=10` against 3 records returns `{ data: [], meta: { page: 99, limit: 10, total: 3 } }`, NOT a 404
  - 400 `?page=0`: assert `VALIDATION_ERROR`
  - 400 `?limit=200`: assert `VALIDATION_ERROR`
  - 400 `?limit=abc`: assert `VALIDATION_ERROR`
  - 400 unknown query param `?foo=bar`: assert `VALIDATION_ERROR` (because `additionalProperties: false`)
- `npm run test:integration` passes

**Expected commit message:** `feat(backend): add GET /api/v1/projects list endpoint`

---

### Task 10 — Documentation pass

**Purpose:** Surface the new endpoints in the developer-facing docs, with copy-pasteable `curl` examples and an architecture note that captures the HTTP layer conventions.

**Files affected:**
- `README.md` *(add an "API: projects" section under the existing API documentation area; include three `curl` examples — one per endpoint — and a note pointing to the Swagger UI at `/documentation`)*
- `docs/architecture/api-layer.md` *(new — short, parallel to `data-layer.md`; describes envelopes, error handler, use-case-as-function pattern, validation strategy, and where to find each piece)*

**Acceptance criteria:**
- README "API: projects" section includes three `curl` examples (POST, GET list, GET by id) that work against a locally-running dev server
- README documents the success and error envelope shapes inline (no external link required to understand a response)
- `docs/architecture/api-layer.md` references the spec section anchors and the use cases / routes files
- No code changes in this task — docs only

**Expected commit message:** `docs: document projects API endpoints and HTTP layer conventions`

---

## 12. Definition of done

The epic is complete when all of the following hold simultaneously on `develop`:

- All ten tasks above are committed in order with the expected commit messages
- `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration` all pass locally and in CI
- CI green on the PR that merges the epic to `develop`
- `curl` against a locally-running backend (per the README) returns the documented envelopes for all three endpoints, including the 400/404/409 error cases
- Swagger UI at `http://localhost:3001/documentation` shows the three endpoints with request/response schemas (auto-generated from Task 3 schemas)
- The Epic 3 section of `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md` §9 is fully implemented
- No `Co-authored-by` lines, no AI attribution anywhere in the commit history, code comments, README, or architecture docs

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `additionalProperties: false` is forward-incompatible — adding a field later is a breaking change for strict clients | Documented in §2 as a deliberate MVP tradeoff. Phase 2 schema changes are versioned (`/api/v1` → `/api/v2`) per spec §7 base URL convention. |
| `UniqueConstraintError.detail` parsing for the slug value is fragile (depends on the Postgres error format `Key (slug)=(value) already exists.`) | Task 2 falls back to `value: undefined` if parsing fails; the 409 still maps correctly, just without `details`. Covered by a unit test. |
| The Fastify error handler matches `404` on `routerPath` prefix — future routes that share `/api/v1/projects/` (e.g. `/api/v1/projects/:projectId/runs` in Epic 5) would also be mapped to `PROJECT_NOT_FOUND` | Acceptable for this epic — every 404 under `/api/v1/projects/...` is a project-not-found by current spec semantics. Re-examined when Epic 5 adds project-scoped sub-resources; at that point, route handlers can throw an explicit `httpErrors.notFound` with a sentinel message that the error handler keys on. |
| Default `limit=50` may be too large for a frontend with heavy per-row rendering | Documented in §4.2. Frontend can override via query. Capped at 100 to prevent abuse. |
| Tests against `tfi_test` race when run in parallel with repository tests | Existing test infrastructure already runs `--runInBand` for integration tests (per `package.json`). No change needed. |
| `fastify-plugin` wrapping of the error handler — encapsulation rules might prevent it from catching errors thrown in plugins registered after it | `fastify-plugin` lifts the handler out of the encapsulation context, which is the standard pattern for global error handlers. Verified by Task 2's unit tests that drive errors from a sibling-registered route. |

---

## 14. Commit sequence (summary)

| # | Commit message |
|---|---|
| 1 | `feat(backend): add HTTP response envelope helpers` |
| 2 | `feat(backend): add global error handler with envelope mapping` |
| 3 | `feat(backend): add project request and response JSON schemas` |
| 4 | `feat(backend): add createProject use case` |
| 5 | `feat(backend): add getProject use case` |
| 6 | `feat(backend): add listProjects use case with pagination translation` |
| 7 | `feat(backend): add POST /api/v1/projects endpoint` |
| 8 | `feat(backend): add GET /api/v1/projects/:projectId endpoint` |
| 9 | `feat(backend): add GET /api/v1/projects list endpoint` |
| 10 | `docs: document projects API endpoints and HTTP layer conventions` |

Ten commits, each a small reviewable unit. The story across the history reads: "establish the HTTP shape (envelopes, error handler, schemas), define the use cases (create, get, list), wire each endpoint with integration tests, document."
