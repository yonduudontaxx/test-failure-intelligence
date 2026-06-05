# HTTP Layer

Maintainer reference for the HTTP layer added in Epic 3. The canonical
design lives in the spec and the Epic 3 plan, linked at the bottom —
this file is a scannable map of conventions when adding or modifying
routes.

## At a glance

```
HTTP request
   │
   ▼
Fastify route          (backend/src/http/routes/<resource>/<verb>-<resource>.route.ts)
   │  validates body / query / params via JSON Schema (Ajv)
   ▼
Use case               (backend/src/application/use-cases/<verb>-<resource>.ts)
   │  pure function: (repo, input) → result
   ▼
Repository (port)      (backend/src/domain/ports/<resource>.repository.ts)
   ▲
   │  implements
Pg<Resource>Repository (backend/src/infrastructure/repositories/...)
```

Dependency direction matches the data layer: HTTP → Use Cases → Domain
← Infrastructure. See [data-layer.md](./data-layer.md) for the layers
below the use cases.

## Response envelopes — `backend/src/http/helpers/envelope.ts`

Every `/api/v1` response uses one of two shapes.

**Success:**

```json
{ "data": { ... } }
```

`data` carries the entity, list payload, or other resource. Built via
`success(payload)`.

**Error:**

```json
{ "error": { "code": "STRING_CODE", "message": "Human readable." } }
```

Built via `failure(code, message)`. Both helpers are pure with no
imports — they exist only to give the rest of the codebase a single
construction site for the shapes.

## Error code reference

| HTTP | `error.code` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Ajv schema validation failed (body, query, or params) |
| 404 | `PROJECT_NOT_FOUND` | `GET /api/v1/projects/:projectId` for an unknown id |
| 409 | `DUPLICATE_PROJECT_SLUG` | `UniqueConstraintError` on the `projects_slug_key` constraint |
| 500 | `INTERNAL_ERROR` | Anything unhandled — full error logged via `fastify.log.error`, response carries a sanitized message |

The mapping lives in `backend/src/http/plugins/error-handler.ts`.

## Path gate

The global error handler wraps responses **only** when
`request.url.startsWith('/api/v1')`. Requests outside that prefix
(`/health`, `/documentation`, Swagger asset routes) bypass every
envelope branch and fall through to Fastify's default error
serialization. That preserves the existing health-check response
shape and any tooling that expects the default `{ statusCode, error,
message }` format.

The narrower 404 → `PROJECT_NOT_FOUND` mapping is gated further on
`/api/v1/projects/`. A future Epic 5 sub-resource such as
`/api/v1/projects/:projectId/runs` will need its own error mapping or
must throw with a sentinel the handler keys on.

## Schemas — `backend/src/http/schemas/<resource>.ts`

Plain JSON Schema objects declared with `as const`; no TypeBox
dependency. Each schema file exports:

- Request body / query / params schemas per endpoint
- Response payload schemas per endpoint
- Parallel TypeScript interfaces for handler typing (e.g.,
  `CreateProjectBody`, `ListProjectsQuery`, `ProjectResponse`)

`additionalProperties: false` is set on every request schema. The
Fastify Ajv compiler is configured with `removeAdditional: false` in
`app.ts` so unknown fields **reject** (400 `VALIDATION_ERROR`) instead
of silently stripping (Ajv's default would strip them, swallowing the
client's mistake).

## Adding a new endpoint

1. Define JSON Schemas and TypeScript types in
   `backend/src/http/schemas/<resource>.ts`. Request schemas set
   `additionalProperties: false`.
2. Write the use case in
   `backend/src/application/use-cases/<verb>-<resource>.ts` as a pure
   function `(repo, input) → result`. Domain types only — no Fastify,
   no `pg`, no http imports beyond the schema's TypeScript interfaces.
3. Add a unit test in
   `backend/tests/unit/application/use-cases/<verb>-<resource>.test.ts`
   driving a hand-rolled mock repo (`jest.fn<...>()` per port method).
4. Write the route handler in
   `backend/src/http/routes/<resource>/<verb>-<resource>.route.ts`.
   The handler should be two or three lines: call the use case, wrap
   in `success()`, set the status code. No business logic.
5. Register the route plugin in `backend/src/app.ts` with the
   `/api/v1` prefix, after `errorHandlerPlugin` and alongside the
   existing route registrations.
6. Add an integration test in
   `backend/tests/integration/routes/<resource>/<verb>-<resource>.test.ts`
   using `createTestPool()` + `buildApp({ pool, logger: false })` +
   `truncateAll(pool)` in `beforeEach` + `app.close()` in `afterAll`.
   Drive requests via `app.inject()` — no real HTTP listener.

The integration suite locks down envelope shape, status codes, error
codes, and pagination math. Future epics should not be able to
silently break the contract those tests describe.

## Where to read more

- **Design spec:**
  `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md`
  - §7 API conventions and projects endpoints
  - §9 Epic 3 scope
- **Epic 3 plan:**
  `docs/superpowers/plans/2026-06-05-epic-3-project-management.md`
  - §5 Envelope and error handler design
  - §6 Use case design
  - §8 Validation strategy
  - §9 Error handling matrix
- **Data layer below:** [data-layer.md](./data-layer.md)
- **Live OpenAPI spec:** Swagger UI at `/documentation` when the
  backend is running
