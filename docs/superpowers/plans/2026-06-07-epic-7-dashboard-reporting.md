# Epic 7 — Dashboard and Reporting Implementation Plan

**Status:** Draft — pending review
**Date:** 2026-06-07
**Spec reference:** `docs/superpowers/specs/2026-06-01-test-failure-intelligence-design.md` §1 (System Architecture — "Next.js frontend is a standalone app consuming the REST API"), §2 (frontend tree at lines 171–187), §7 (API contracts), §8 ("6 frontend pages: Projects List, Project Overview, Flaky/Broken Tests, Failure Trends, Run History, Run Detail"), §9 "Frontend Dashboard (was Epic 6 — moved to a later epic)"
**Predecessor:** Epic 6 Health Scoring and Failure Intelligence (released to `main` via PR #10 at `3430ca7`, back-merged into develop at `5703f09`) — supplies the populated `/overview`, `/health`, `/failure-patterns` endpoints with real pattern data, structured `warnings` and `criticalIssues` arrays, and `topCriticalIssues` on overview
**Epic-numbering note:** Spec §9 originally listed Epic 7 as "Quality and Documentation". The frontend dashboard work — originally Epic 6, then deferred when Epic 6 became Health Scoring — lands here as Epic 7. The user's brief added a dedicated **Failure Pattern Explorer** page that the original spec deliberately omitted ("surfaced within Project Overview page (no dedicated page)"). This plan includes it. Quality and Documentation work that the original spec §9 placed under Epic 7 is largely already done (it's distributed across Epics 1–6 commit-by-commit); any residual gap moves to a later epic.

---

## 1. Objective

Deliver the Next.js dashboard that consumes the API surface Epics 3–6 built. Browser-rendered, server-side-fetched, polished enough to demo a self-hosted deploy. Seven pages, one shared layout, one typed API client, one consistent visual language.

Pages:

```
/                                                  Projects list (+ create-project modal)
/projects/:projectId                               Project dashboard (health, metrics, top patterns, top issues)
/projects/:projectId/runs                          Run history (paginated, status filter)
/projects/:projectId/runs/:runId                   Run detail (metadata + cases)
/projects/:projectId/flaky                         Reliability report (flaky + broken tests)
/projects/:projectId/trends                        Failure trends (line/bar chart)
/projects/:projectId/patterns                      Failure pattern explorer (full pattern list)
```

The two load-bearing decisions:

- **Server Components by default.** Data fetching happens on the server (Next.js App Router RSC). The first byte already contains real content; no loading flicker on initial render. Client components exist only where interactivity demands them (forms, filter toggles that update URL state, the chart).
- **URL is the state.** Pagination cursor, status filter, bucket size, reliability-state filter — all live in `?searchParams`. Bookmarkable, shareable, back-button works. No client-side store, no Tanstack Query, no SWR — Next.js's server-side fetch and `router.refresh()` are enough.

---

## 2. Scope

### In scope

- Seven pages listed above, all under `frontend/src/app/`
- Shared root layout (`app/layout.tsx`) and project-scoped layout (`app/projects/[projectId]/layout.tsx`) with a sticky tab nav (Overview · Runs · Reliability · Trends · Patterns)
- Typed API client in `frontend/src/lib/api/` — one module per resource (`projects.ts`, `runs.ts`, `analytics.ts`, etc.), each exporting strongly-typed fetch functions that unwrap the `{ data }` envelope and throw `ApiError` on `{ error }` responses
- TypeScript response types mirroring `backend/src/http/schemas/` shapes — hand-written for MVP (one source of truth per file in `frontend/src/lib/api/types/`); no codegen
- Styling via **Tailwind CSS** (latest stable v4-line). Picked because it's the Next.js default and avoids a custom design-tokens module for MVP. Per-component class strings; no `@apply` ladders, no styled-components, no CSS modules.
- Chart visualization via **Recharts** for the failure-trends page (`<BarChart>` or `<LineChart>` with `<Tooltip>`). Recharts is declarative, tree-shakes well, and is the standard pick for React dashboards.
- Per-route `loading.tsx` and `error.tsx` boundaries so every page has a real loading skeleton and a real error UI (no white screen on a backend hiccup)
- Vitest + React Testing Library smoke tests at one test per page (`renders without crashing` against a stubbed fetch). Component-by-component test depth deferred to a later epic.
- README updates documenting the dashboard pages and dev workflow
- New `docs/architecture/frontend.md` covering the App Router structure, data-fetching pattern, error boundaries, API-client contract

### Explicitly out of scope (deferred, with justification)

- **PATCH/DELETE projects.** Backend doesn't expose them (spec §8 deferred to Phase 2). The dashboard surfaces create + read only.
- **Authentication / user accounts.** Spec §10 Phase 3. The dashboard is open-access; self-hosters protect it via reverse-proxy basic auth or network gating.
- **File-upload UI for ingestion.** Spec §1 calls out a `FileUpload` browser path, but the user-visible value of ingestion is via CI POSTs — a UI button to upload a JUnit XML is a nice-to-have, not load-bearing for the dashboard story. Backend supports it; the UI omits it.
- **Real-time updates / live polling.** Pages refetch only on navigation or explicit user action. Auto-refresh + WebSocket streaming is Phase 3.
- **Theme switching, dark mode, accessibility audit.** Default light theme only; ARIA labels on interactive elements; full accessibility pass deferred.
- **Per-component snapshot tests, visual regression, Storybook.** Smoke tests only — one `renders without crashing` per page.
- **End-to-end Playwright tests against a live backend.** Worth doing eventually; out of scope for this epic because it requires CI pipeline changes (Docker Compose service in GH Actions). Smoke tests on the frontend + integration tests on the backend cover the critical paths.
- **Environment / branch filter dropdowns** on Runs or Reliability. Backend `listByProject` accepts a `status?` filter only; branch/environment filtering is spec §10 Phase 2 ("Advanced filtering UI").
- **Run drill-down** beyond the run-detail page (no per-case execution history view). Spec §10 Phase 2 "Test case execution history drill-down".
- **i18n.** English only.

### Constraints

- KISS: no global state library, no client-side cache library, no design system framework. Server-side fetch + Tailwind utility classes + plain React.
- DRY: one `apiGet`/`apiPost` wrapper, one `ApiError` class, one envelope-unwrap site. Every resource module reuses them.
- YAGNI: no abstraction layer over Recharts, no theming machinery, no shared layout primitives library. Components are inline `<div className="...">` until they're duplicated three times.
- The frontend has zero direct dependency on backend internals — the only contract is the REST envelope. The hand-written type mirrors are intentional duplication; codegen can replace them later.
- One logical task = one logical commit. Conventional Commits per `memory/workflow.md`. No `Co-authored-by` trailer.
- Tailwind, Recharts, Vitest, RTL are pulled in as Task 1 — no other new top-level dependencies unless a downstream task explicitly justifies one.

---

## 3. Architecture

```
Browser
   │
   ▼
Next.js App Router (frontend/src/app/)
   │  app/layout.tsx                                    root chrome (html, body, nav)
   │  app/page.tsx                                      Projects list (RSC)
   │  app/projects/[projectId]/layout.tsx               project nav tabs (RSC)
   │  app/projects/[projectId]/page.tsx                 dashboard (RSC, fetches /overview)
   │  app/projects/[projectId]/runs/page.tsx            list (RSC, fetches /runs)
   │  app/projects/[projectId]/runs/[runId]/page.tsx    detail (RSC, fetches /runs/:id + cases)
   │  app/projects/[projectId]/flaky/page.tsx           RSC, fetches /flaky-tests
   │  app/projects/[projectId]/trends/page.tsx          RSC + 'use client' chart child
   │  app/projects/[projectId]/patterns/page.tsx        RSC, fetches /failure-patterns
   │
   │   each route also has loading.tsx + error.tsx
   ▼
API client (frontend/src/lib/api/)
   │  fetch.ts                                          apiGet / apiPost / ApiError
   │  projects.ts                                       getProjects, getProject, createProject
   │  runs.ts                                           listRuns, getRun, listRunCases
   │  analytics.ts                                      getOverview, getHealth, getFlakyTests,
   │                                                    getFailureTrends, getFailurePatterns
   │  types/                                            response shape mirrors
   ▼
Fastify backend (existing)
```

**Component organisation:**

```
frontend/src/components/
  ui/                  buttons, badges, cards, tables, modals
    Badge.tsx            severity, reliability state, health status colour-coding
    Card.tsx             generic boxed-content surface
    Table.tsx            generic table primitives (Header, Row, Cell)
    Modal.tsx            client component — dialog for the create-project form
    PaginationLinks.tsx  prev/next links that update searchParams
    StatusFilterTabs.tsx client component — toggles ?status= via router
    EmptyState.tsx       "no data yet" placeholder
  charts/
    FailureTrendChart.tsx  client component — Recharts wrapper, takes bucket array as prop
  layout/
    AppHeader.tsx        top bar with logo + active project crumb
    ProjectTabs.tsx      sticky tab nav for /projects/:id/*
```

`ui/` primitives are intentionally generic — no project knowledge. Page components import them and compose. The Modal and StatusFilterTabs are the only client components in `ui/`; the rest are server-compatible (no `'use client'`, no hooks).

**Data fetching pattern:**

```ts
// Server Component (default)
export default async function ProjectDashboardPage({ params }) {
  const overview = await getOverview(params.projectId);
  return <DashboardLayout overview={overview} />;
}
```

```ts
// Client interactivity for filters
'use client';
export function StatusFilterTabs({ current }: { current: string | null }) {
  const router = useRouter();
  const onChange = (v: string | null) => router.push(/* updated ?status= */);
  ...
}
```

**Mutation pattern:**

```ts
// app/page.tsx → CreateProjectModal (client) calls a server action
'use server';
export async function createProjectAction(formData: FormData) {
  await createProject({ slug, name, description });
  revalidatePath('/');
}
```

`revalidatePath` invalidates the projects-list cache after creation; the modal closes and the new project appears.

---

## 4. Page designs

### 4.1 Projects list — `/`

**Fetch:** `getProjects({ page, limit })` from `/api/v1/projects?page=&limit=`. Default `limit=50`; pagination via `?page=`.

**Render:** Table or card grid with rows of `{ slug, name, createdAt }`. Header has app title and a "New project" button. Clicking a row navigates to `/projects/:projectId`.

**Empty state:** "No projects yet. Create your first project to start ingesting test results." with a primary button that opens the modal.

**Create-project modal (client component):** Form with `slug` (auto-derived from name on blur, editable), `name`, `description?`. Submit calls `createProject(...)`, closes the modal, and refreshes the list. Error states: 400 `VALIDATION_ERROR` (display the message), 409 `DUPLICATE_PROJECT_SLUG` (inline error on the slug field).

**Loading:** Skeleton rows.
**Error:** "Couldn't load projects" + retry button.

### 4.2 Project dashboard — `/projects/:projectId`

**Fetch:** `getOverview(projectId)` from `/api/v1/projects/:projectId/overview`.

**Render — top to bottom:**

1. **Health banner** — full-width strip colour-coded by `healthStatus` (`HEALTHY` green, `WARNING` amber, `CRITICAL` red). Shows the status word, total runs in window, and `recentPassRate * 100 %` formatted to one decimal.
2. **Metric cards** — four cards in a responsive grid: Total Runs, Total Tests, Passed/Failed/Skipped breakdown (combined card), Recent Pass Rate.
3. **Top Critical Issues** — list of `topCriticalIssues` (max 3 from backend). Each shows `code` as a badge + `message`. Hidden entirely when array is empty.
4. **Top Flaky Tests** — table of `topFlakyTests` (max 5). Columns: full name, reliability state badge, pass / fail counts, last seen. "View all" link → `/projects/:id/flaky`.
5. **Top Failure Patterns** — table of `topFailurePatterns` (max 5). Columns: pattern (truncated), severity badge, occurrence count. "View all" link → `/projects/:id/patterns`.

**Empty project state:** When `totalRuns === 0`, show a centered card with "No test runs ingested yet" + a curl snippet of the ingestion endpoint.

### 4.3 Run history — `/projects/:projectId/runs`

**Fetch:** `listRuns(projectId, { page, limit, status? })` from `/api/v1/projects/:projectId/runs?page=&limit=&status=`. `status` comes from `?status=` search param, validated against `SUCCESS | FAILED | PARTIAL | null`.

**Render:**

1. **Status filter tabs** (client component) at the top — All / Success / Failed / Partial. Active tab matches the current `?status=` URL param; clicking pushes the new URL.
2. **Table** of runs: status badge, source type, executed-at (relative — "2 hours ago"), branch, total/passed/failed counts, run id (truncated, click → detail).
3. **Pagination** — Prev / Next links that update `?page=`.

**Empty:** "No runs match this filter."

### 4.4 Run detail — `/projects/:projectId/runs/:runId`

**Fetch:** `getRun(runId)` + `listRunCases(runId)` from `/runs/:runId` and `/runs/:runId/cases`. Both fetched in parallel via `await Promise.all([...])`.

**Render:**

1. **Metadata header card** — source type, status badge, executed-at (absolute timestamp), branch, commit SHA (short, monospace), pipeline name, build number, environment, duration.
2. **Cases table** — full name, status badge, duration, failure type, failure message (truncated, expandable). Sticky column header.

**404 handling:** If the run doesn't exist (`RUN_NOT_FOUND` from backend), the `error.tsx` boundary renders a "Run not found" page.

### 4.5 Reliability report — `/projects/:projectId/flaky`

**Fetch:** `getFlakyTests(projectId, { days, limit })` from `/api/v1/projects/:projectId/flaky-tests?days=&limit=`. `days` default 30 (validated 1–90), `limit` default 20 (validated 1–100). Both come from `?days=` and `?limit=` search params.

**Render:**

1. **Filter chips** — reliability state filter (All / Flaky / Broken). Note: backend doesn't filter by state — it returns both. The chip filter is **client-side** filtering of the already-fetched list. Acceptable for MVP because the list is capped at 100 items.
2. **Table** — full name, reliability state badge, pass count, fail count, run count, last seen.
3. **Window selector** — small dropdown for `?days=` (7 / 14 / 30 / 60 / 90).

### 4.6 Failure trends — `/projects/:projectId/trends`

**Fetch:** `getFailureTrends(projectId, { days, bucketSize })` from `/api/v1/projects/:projectId/failure-trends?days=&bucketSize=`. `bucketSize` is `'day' | 'week'`, default `'day'`. Both from search params.

**Render:**

1. **Bucket-size toggle** (client component) — Daily / Weekly buttons.
2. **Window selector** — same `?days=` dropdown as the reliability page.
3. **Chart** (client component, `FailureTrendChart`) — Recharts `<ComposedChart>` with bars for `totalRuns` and a line overlay for `passRate * 100`. X axis = bucket date, two Y axes (count + percent). Tooltip on hover shows the full bucket payload.
4. **Bucket table** below the chart — same data in tabular form for accessibility.

**Empty:** "No runs in this window."

### 4.7 Failure pattern explorer — `/projects/:projectId/patterns`

**Fetch:** `getFailurePatterns(projectId, { limit })` from `/api/v1/projects/:projectId/failure-patterns?limit=`. Default 50 (validated 1–100).

**Render:**

1. **Severity filter chips** — All / Critical / High / Medium / Low. Client-side filter against the fetched list.
2. **Sort dropdown** — Occurrence (default) / Recent / First Seen. Client-side sort.
3. **Table** — pattern (monospace, full text, click to expand if truncated), category badge, severity badge, occurrence count, first seen, last seen.
4. **Detail expansion** — clicking a row reveals a panel with the full pattern text plus a hint about how patterns are derived (link to `docs/architecture/analytics.md` if linked from a deployed-docs URL).

**Empty:** "No failure patterns yet — patterns are extracted from failing test cases during ingestion."

---

## 5. API client design

**File layout:**

```
frontend/src/lib/api/
  fetch.ts                base helpers
  errors.ts               ApiError class
  config.ts               API_BASE_URL (existing, moved here)
  projects.ts             getProjects, getProject, createProject
  runs.ts                 listRuns, getRun, listRunCases
  analytics.ts            getOverview, getHealth, getFlakyTests,
                          getFailureTrends, getFailurePatterns
  types/
    common.ts             ApiEnvelope<T>, ApiErrorBody, PaginationMeta
    project.ts            Project, NewProject, ProjectsListResponse
    run.ts                TestRun, TestCase, TestRunStatus, TestCaseStatus
    analytics.ts          OverviewResponse, HealthResponse, FlakyTestItem,
                          FailureTrendItem, FailurePattern, etc.
```

**Core helpers (`fetch.ts`):**

```ts
type Envelope<T> = { data: T } | { error: { code: string; message: string } };

async function rawFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store', // server components default; explicit for clarity
  });
  const body = (await res.json()) as Envelope<T>;
  if ('error' in body) {
    throw new ApiError(body.error.code, body.error.message, res.status);
  }
  return body.data;
}

export const apiGet = <T>(path: string, init?: RequestInit) =>
  rawFetch<T>(path, { ...init, method: 'GET' });

export const apiPost = <T>(path: string, body: unknown, init?: RequestInit) =>
  rawFetch<T>(path, { ...init, method: 'POST', body: JSON.stringify(body) });
```

`ApiError` carries `code`, `message`, `statusCode`. Page error boundaries use `code === 'PROJECT_NOT_FOUND' | 'RUN_NOT_FOUND'` to render specific 404 UI.

**Resource module example (`projects.ts`):**

```ts
export async function getProjects(opts?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (opts?.page) qs.set('page', String(opts.page));
  if (opts?.limit) qs.set('limit', String(opts.limit));
  return apiGet<ProjectsListResponse>(`/projects?${qs}`);
}

export async function getProject(id: string) {
  return apiGet<Project>(`/projects/${id}`);
}

export async function createProject(input: NewProject) {
  return apiPost<Project>('/projects', input);
}
```

Every function returns the already-unwrapped data — pages never see the envelope.

**Cache strategy:** Default `cache: 'no-store'` on all server-side fetches — the dashboard is read-current. If a page becomes hot enough to need caching, we can flip to `next: { revalidate: 30 }` per call site without changing types. Mutations call `revalidatePath` to bust the relevant route cache.

---

## 6. Styling and theme

**Tailwind CSS v4** via the official Next.js setup (`@tailwindcss/postcss` plugin + `@import "tailwindcss"` in `app/globals.css`).

**Palette:** semantic colour roles, mapped to Tailwind defaults:

| Role | Tailwind | Used for |
|---|---|---|
| Success / Healthy / Passed | `emerald-500` / `emerald-600` | health banner, passed status |
| Warning | `amber-500` / `amber-600` | warnings, partial status |
| Critical / Failed | `red-500` / `red-600` | critical issues, failed runs, broken tests |
| Flaky | `orange-500` | flaky reliability state |
| Skipped / Unknown | `gray-400` | skipped status, unknown category |
| Background | `gray-50` (page) / `white` (cards) | layout |
| Text | `gray-900` (primary) / `gray-600` (secondary) | text |

**Spacing:** Tailwind defaults. No custom design tokens. **Typography:** system font stack (`font-sans`); monospace for code (pattern strings, commit SHAs) via `font-mono`.

**Component primitives** (`components/ui/`):

- `Badge` — accepts `tone: 'success' | 'warning' | 'critical' | 'flaky' | 'neutral'` and renders a small pill.
- `Card` — `<div className="rounded-lg border border-gray-200 bg-white p-4">{children}</div>`. That's it.
- `Table` — header + row + cell components that compose into a striped table. Sticky thead.
- `EmptyState` — centered icon + text, configurable action button slot.

No design system framework. If a primitive grows beyond ~50 lines, we extract; otherwise inline Tailwind classes.

---

## 7. Loading and error states

Per Next.js App Router conventions, every page directory carries a `loading.tsx` and `error.tsx`:

- **`loading.tsx`** — page-shaped skeleton. Table pages get rows of grey bars; the dashboard gets card outlines.
- **`error.tsx`** — `'use client'` component. Reads the thrown `Error`. If `error.message` matches a known code (`PROJECT_NOT_FOUND`, `RUN_NOT_FOUND`, `VALIDATION_ERROR`), renders the specific UI; otherwise renders "Something went wrong" with a retry button calling the `reset` prop.

The `ApiError` thrown by the API client carries the code as its `message` for downstream branching. The error boundary inspects it via a small helper in `components/ErrorScreen.tsx`.

---

## 8. Testing strategy

**Smoke tests only** for MVP. One test per page asserting `renders without crashing` against a stubbed fetch. This catches:
- Type-level breakage (page no longer compiles)
- Top-level render crashes (a missing prop, an import path typo)
- Trivial regressions in routing structure

What we are **not** testing (deferred):
- Interactive behaviour (filter clicks, modal submit) — would benefit from RTL `userEvent` but is not load-bearing for shipping
- Chart rendering — Recharts uses ResizeObserver which is awkward in jsdom; skip the chart in tests
- Full happy-path browser flows — Playwright E2E is its own epic

**Tooling:**
- **Vitest** (paired with `@vitejs/plugin-react`; supports ESM and TS out of the box; faster than Jest for a small frontend suite)
- **React Testing Library** (`@testing-library/react`, `@testing-library/jest-dom`)
- **jsdom** environment
- A global `vi.mock('@/lib/api/fetch', ...)` stub in `vitest.setup.ts` that returns canned envelope data so pages can render without hitting the network
- New scripts: `npm test` (Vitest run), `npm run test:watch` (Vitest watch)

**CI:** `frontend` GitHub Actions job adds `npm test` after `npm run lint` and `npm run typecheck`.

---

## 9. Pages-to-endpoints traceability

| Page | Endpoint(s) consumed | Type(s) imported |
|---|---|---|
| `/` | `GET /projects` (paginated) | `ProjectsListResponse` |
| Create-project modal | `POST /projects` | `Project`, `NewProject` |
| `/projects/:id` | `GET /projects/:id/overview` | `OverviewResponse` |
| `/projects/:id/runs` | `GET /projects/:id/runs?page&limit&status` | `RunListResponse` |
| `/projects/:id/runs/:runId` | `GET /projects/:id/runs/:runId` + `GET /projects/:id/runs/:runId/cases` | `TestRun`, `TestCase[]` |
| `/projects/:id/flaky` | `GET /projects/:id/flaky-tests?days&limit` | `FlakyTestsResponse` |
| `/projects/:id/trends` | `GET /projects/:id/failure-trends?days&bucketSize` | `FailureTrendsResponse` |
| `/projects/:id/patterns` | `GET /projects/:id/failure-patterns?limit` | `FailurePatternsResponse` |

The `/health` endpoint is **not directly consumed** by any page — its data is already inside `/overview`'s `topCriticalIssues` for the dashboard's purposes. If a future iteration wants a standalone health page (per the user's "health overview" request), `/health` exposes the full `warnings`/`criticalIssues` lists; we can add that page later by promoting one of the dashboard's sections into its own route. For now: dashboard *is* the health overview.

---

## 10. Task breakdown

Each task = one logical commit. Setup tasks first (1–4), then per-page (5–11), then loading/error (12), testing (13), docs (14). Fourteen commits.

### Task 1 — Tailwind + global styles + shared layout

- Install: `tailwindcss@latest`, `@tailwindcss/postcss`, `postcss` as dev deps. Add `postcss.config.mjs` with `'@tailwindcss/postcss': {}`.
- Create `frontend/src/app/globals.css` with `@import "tailwindcss";` and a few base resets if needed.
- Update `frontend/src/app/layout.tsx` to import `./globals.css` and apply `className="min-h-screen bg-gray-50 text-gray-900"` to `<body>`.
- Create `frontend/src/components/layout/AppHeader.tsx` — a sticky top bar with the app title and a link back to `/`. Render it inside `layout.tsx` above the page content.
- Verify: `npm run dev`, navigate to `/`, see styled header above the placeholder page.
- Commit: `feat(frontend): add Tailwind setup and shared app layout`

### Task 2 — API client types and base fetch helpers

- Create `frontend/src/lib/api/config.ts` — move `API_BASE_URL` from the existing `api-client.ts` stub.
- Create `frontend/src/lib/api/errors.ts` — `ApiError` class with `code`, `message`, `statusCode`.
- Create `frontend/src/lib/api/fetch.ts` — `apiGet` / `apiPost` as in §5, throwing `ApiError` on `{ error }` responses.
- Create `frontend/src/lib/api/types/common.ts` — `ApiEnvelope<T>`, `PaginationMeta`, `ApiErrorBody`.
- Delete the old `frontend/src/lib/api-client.ts` stub (its line is fully covered by `config.ts`).
- Commit: `feat(frontend): add API client error class and fetch helpers`

### Task 3 — API resource modules + response types

- Create `frontend/src/lib/api/types/project.ts`, `run.ts`, `analytics.ts` — TS interface mirrors of every response shape from `backend/src/http/schemas/`. Match field names exactly.
- Create `frontend/src/lib/api/projects.ts`, `runs.ts`, `analytics.ts` — typed wrapper functions (one per backend endpoint).
- Each function takes the path/query params, calls `apiGet` or `apiPost`, returns the typed result.
- No tests yet; downstream pages exercise these.
- Commit: `feat(frontend): add typed API client modules for projects, runs, and analytics`

### Task 4 — Shared UI primitives (`components/ui/`)

- `Badge.tsx` — generic pill with `tone` and `children`. Colour-coding lookup by tone.
- `Card.tsx`, `EmptyState.tsx` — render-only.
- `Table.tsx` — exports `Table`, `THead`, `TBody`, `TR`, `TH`, `TD`. Styled, semantic.
- `PaginationLinks.tsx` — server component that takes `{ page, totalPages, basePath }` and renders Prev/Next anchor tags whose hrefs preserve other query params.
- `StatusFilterTabs.tsx` — `'use client'` — `{ current, options, basePath }`. Uses `useRouter` and `useSearchParams` to update `?status=` on click.
- `Modal.tsx` — `'use client'` — controlled dialog (open prop, onClose). Used by the create-project flow.
- `ErrorScreen.tsx` — error boundary content, branches on known error codes.
- Commit: `feat(frontend): add shared UI primitives`

### Task 5 — Projects list page + create-project modal

- `app/page.tsx` (RSC) — calls `getProjects()`, renders the list as a `Card` grid or `Table`. Includes an empty state.
- `app/_components/CreateProjectModal.tsx` (`'use client'`) — form fields, submit calls a server action.
- `app/actions/projects.ts` (`'use server'`) — `createProjectAction(formData)`, calls `createProject(...)`, `revalidatePath('/')`.
- Error handling: server action catches `ApiError`, returns `{ error: ApiError }` to the client. Modal displays the inline message and prevents close on error.
- Commit: `feat(frontend): add projects list page and create-project modal`

### Task 6 — Project layout + tab nav

- `app/projects/[projectId]/layout.tsx` — fetches `getProject(id)` for the project name in the crumb. Renders `<ProjectTabs current=…/>` above `{children}`.
- `components/layout/ProjectTabs.tsx` — server component reading active path from props; tabs: Overview, Runs, Reliability, Trends, Patterns. Each is a Next.js `<Link>` with active-state highlight.
- Handles `PROJECT_NOT_FOUND` by throwing — caught by the layout's `error.tsx` (added in Task 12).
- Commit: `feat(frontend): add project layout and tab navigation`

### Task 7 — Project dashboard page (`/projects/:id`)

- `app/projects/[projectId]/page.tsx` (RSC) — calls `getOverview(id)`. Composes:
  - `<HealthBanner status={...} passRate={...} totalRuns={...} />`
  - `<MetricCards counts={...} />`
  - `<TopCriticalIssues items={overview.topCriticalIssues} />`
  - `<TopFlakyTestsTable items={overview.topFlakyTests} />`
  - `<TopFailurePatternsTable items={overview.topFailurePatterns} />`
- All five sub-components are server components rendered inline in this page or in `_components/dashboard/`.
- Empty-project state when `overview.totalRuns === 0`.
- Commit: `feat(frontend): add project dashboard page`

### Task 8 — Run history page (`/projects/:id/runs`)

- `app/projects/[projectId]/runs/page.tsx` (RSC) — reads `?page`, `?limit`, `?status` from props. Calls `listRuns(id, opts)`.
- Renders `<StatusFilterTabs current={searchParams.status ?? 'all'} />`, then the `Table` of runs, then `<PaginationLinks />`.
- Each row's last cell is a `<Link>` to `/projects/:id/runs/:runId`.
- Commit: `feat(frontend): add run history page`

### Task 9 — Run detail page (`/projects/:id/runs/:runId`)

- `app/projects/[projectId]/runs/[runId]/page.tsx` (RSC) — parallel `Promise.all([getRun, listRunCases])`.
- `<RunMetadataCard run={...} />` — definition list of all metadata fields.
- `<RunCasesTable cases={...} />` — table with status badge, duration, optional failure type and message.
- Commit: `feat(frontend): add run detail page`

### Task 10 — Reliability report page (`/projects/:id/flaky`)

- `app/projects/[projectId]/flaky/page.tsx` (RSC) — reads `?days` (default 30) from props. Calls `getFlakyTests(id, { days })`.
- `<ReliabilityFilterChips currentState={searchParams.state ?? 'all'} />` (`'use client'`, in-page filter via URL).
- `<WindowDropdown currentDays={searchParams.days ?? 30} />` (`'use client'`).
- Table of items; in-page filter by state happens after the fetch.
- Commit: `feat(frontend): add reliability report page`

### Task 11 — Failure trends page + chart (`/projects/:id/trends`)

- `app/projects/[projectId]/trends/page.tsx` (RSC) — reads `?days` (default 30), `?bucketSize` (default `'day'`) from props. Calls `getFailureTrends(id, opts)`.
- Renders the bucket-size toggle, window dropdown, and:
  - `<FailureTrendChart buckets={...} bucketSize={...} />` — `'use client'`, `recharts` `<ResponsiveContainer>` + `<ComposedChart>` with `<Bar dataKey="totalRuns" />` and `<Line dataKey="passRatePercent" yAxisId="right" />`.
- Install: `recharts` as a regular dep.
- Bucket data table below the chart.
- Commit: `feat(frontend): add failure trends page with chart`

### Task 12 — Failure pattern explorer page (`/projects/:id/patterns`)

- `app/projects/[projectId]/patterns/page.tsx` (RSC) — calls `getFailurePatterns(id, { limit: 50 })`.
- `<SeverityFilterChips currentSeverity={...} />` (`'use client'`).
- Sortable table (sort state in URL).
- Row-click expands the panel with the full pattern text.
- Commit: `feat(frontend): add failure pattern explorer page`

### Task 13 — Loading and error boundaries per route

- Add `loading.tsx` and `error.tsx` files at each route segment that owns a fetch:
  - `app/loading.tsx`, `app/error.tsx`
  - `app/projects/[projectId]/loading.tsx`, `error.tsx`
  - `app/projects/[projectId]/runs/loading.tsx`, `error.tsx`
  - `app/projects/[projectId]/runs/[runId]/loading.tsx`, `error.tsx`
  - similar for flaky, trends, patterns
- `loading.tsx` files render skeletons matching their page's shape.
- `error.tsx` files use `<ErrorScreen error={error} reset={reset} />` from Task 4.
- Commit: `feat(frontend): add loading and error boundaries for every route`

### Task 14 — Vitest + RTL smoke tests + CI wiring

- Install: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as dev deps.
- Create `vitest.config.ts` with React plugin + `jsdom` environment + `setupFiles: ['./vitest.setup.ts']`.
- Create `vitest.setup.ts` — `@testing-library/jest-dom` import + global fetch mock pointing at canned envelope data.
- Write one test per page: `<page>.test.tsx` that imports the page, mocks the relevant API client function with a canned response, asserts the page renders without throwing.
- Add `npm test` and `npm run test:watch` to `package.json`.
- Update `.github/workflows/ci.yml` — frontend job runs `npm test` after `npm run typecheck`.
- Commit: `test(frontend): add Vitest setup and per-page smoke tests`

### Task 15 — Documentation pass

- Create `docs/architecture/frontend.md` — maintainer reference for the dashboard. Sections: App Router layout, data-fetching pattern (RSC default, client for interactivity, URL as state), API-client contract, error boundaries, Tailwind conventions, "Adding a new page" checklist.
- Update `README.md`: dashboard section (the seven page paths and one-line descriptions), mention `npm test` in the frontend scripts table, add `recharts` and `vitest` to the dependency list.
- Update `docs/architecture/http-layer.md` — note that the dashboard now consumes every `/api/v1/projects/...` endpoint.
- Update the design spec §9 — annotate the "Frontend Dashboard (was Epic 6 — moved to a later epic)" heading to point at this plan.
- Commit: `docs: document the dashboard and reporting frontend`

---

## 11. Definition of done

The epic is complete when all of the following hold simultaneously on `develop`:

- All fifteen tasks above are committed in order with the expected commit messages.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (frontend) all pass locally and in CI.
- The Epic 7 PR is green on CI (frontend job runs typecheck + lint + test + build).
- Running `npm run dev` in `frontend/` against a locally-running backend, all seven pages render real data without console errors:
  - Projects list shows seeded projects; the create-project modal works.
  - A project dashboard shows the actual health banner, metric cards, and top-N tables from `/overview`.
  - Runs page paginates and the status filter narrows the list.
  - Run detail shows metadata + cases for any ingested run.
  - Reliability, trends, and patterns pages all render the corresponding endpoint data.
  - Errors (project not found, run not found) render the right `error.tsx` UI.
- Release PR has merged to `main` via the `--admin` release flow; develop has been back-merged.
- No `Co-authored-by` lines anywhere.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Tailwind v4 + Next.js 16 has a sharp edge that bites mid-implementation | Task 1 installs and verifies before any page work. If the latest stable Tailwind shows up broken with this Next version, fall back to Tailwind v3 stable. |
| Recharts SSR / hydration mismatch (charts only render in the browser) | Wrap the chart component in `'use client'` and let it suspend during SSR. The page is still SSR'd; the chart hydrates in the browser. Verified-by-design pattern. |
| `cache: 'no-store'` makes the dashboard slow because every nav re-fetches | Each backend endpoint already returns in <100 ms on realistic volumes (Epic 5 perf). If perf becomes an issue, add `next: { revalidate: 30 }` per call site without changing types. |
| Hand-written response types drift from backend schemas | The task includes a sentence-level audit of each response shape against the backend's `analytics.ts`/`ingest.ts`/`test-run.ts`. Future epic can add Zod or `openapi-typescript` codegen; not blocking MVP. |
| Date formatting inconsistency (ISO strings everywhere on the wire) | One small utility `formatDateAgo` and `formatDateAbsolute` in `frontend/src/lib/format.ts`. All pages route through them. |
| Severity / health colour-coding diverges between pages | Single `Badge tone` enum in `Badge.tsx` is the only colour-mapping authority. All pages import from it. |
| `useSearchParams` causes pages to opt into client rendering when used at the root | The dashboard's pattern is RSC parents reading searchParams via the `searchParams` prop (server-safe), and only **filter widgets** going `'use client'` and calling `useSearchParams`. Verified-by-design pattern. |
| Smoke tests miss interactive bugs | Acknowledged. Deferred to a follow-up component-test epic if interactive regressions show up in practice. |

---

## 13. Commit sequence (summary)

| # | Commit message |
|---|---|
| 1 | `feat(frontend): add Tailwind setup and shared app layout` |
| 2 | `feat(frontend): add API client error class and fetch helpers` |
| 3 | `feat(frontend): add typed API client modules for projects, runs, and analytics` |
| 4 | `feat(frontend): add shared UI primitives` |
| 5 | `feat(frontend): add projects list page and create-project modal` |
| 6 | `feat(frontend): add project layout and tab navigation` |
| 7 | `feat(frontend): add project dashboard page` |
| 8 | `feat(frontend): add run history page` |
| 9 | `feat(frontend): add run detail page` |
| 10 | `feat(frontend): add reliability report page` |
| 11 | `feat(frontend): add failure trends page with chart` |
| 12 | `feat(frontend): add failure pattern explorer page` |
| 13 | `feat(frontend): add loading and error boundaries for every route` |
| 14 | `test(frontend): add Vitest setup and per-page smoke tests` |
| 15 | `docs: document the dashboard and reporting frontend` |

Fifteen commits — setup first (1–4), pages second (5–12), polish + tests + docs last (13–15). Every step leaves the system in a working state: after Task 1, the layout is live; after Task 3, the API client compiles; after each page task, that page renders real data; after Task 13, every route has loading + error UIs; after Task 14, the smoke suite locks in non-regression; after Task 15, the docs reflect the shipped surface.
