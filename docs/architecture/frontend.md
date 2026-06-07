# Frontend Dashboard

Maintainer reference for the Next.js dashboard added in Epic 7. The
backend API surface is documented in [http-layer.md](./http-layer.md);
this file is a scannable map of how the browser consumes it.

## At a glance

```
Browser
   │
   ▼
Next.js App Router (frontend/src/app/)
   │  app/page.tsx                              Projects list (RSC)
   │  app/projects/[id]/layout.tsx              Project chrome + tab nav (RSC)
   │  app/projects/[id]/page.tsx                Dashboard (RSC)
   │  app/projects/[id]/runs/                   Run history + run detail (RSC)
   │  app/projects/[id]/flaky/                  Reliability report (RSC)
   │  app/projects/[id]/trends/                 Failure trends + Recharts chart
   │  app/projects/[id]/patterns/               Failure pattern explorer (RSC)
   ▼
API client (frontend/src/lib/api/)
   │  fetch.ts                  apiGet / apiPost + envelope unwrap + ApiError
   │  projects.ts               getProjects, getProject, createProject
   │  runs.ts                   getRuns, getRun, getRunCases
   │  analytics.ts              getOverview, getHealth, getFlakyTests,
   │                            getFailureTrends, getFailurePatterns
   │  types.ts                  hand-written mirrors of every backend response
   ▼
Fastify backend at NEXT_PUBLIC_API_URL (defaults to http://localhost:3001)
```

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) | RSC by default, Turbopack dev server |
| UI runtime | React 19 | Server + Client components |
| Styling | Tailwind CSS v3 | `@tailwind base/components/utilities` in `globals.css`; no design-system library |
| Charts | Recharts 3 | Used only on the trends page; rendered inside a `'use client'` boundary |
| Tests | Vitest 4 + React Testing Library + jsdom | One smoke test per page |
| Build | `next build` → `output: 'standalone'` | Production artifact for Docker |

## Pages

| Route | File | Endpoint(s) consumed |
|---|---|---|
| `/` | `app/page.tsx` | `GET /projects` (paginated) |
| Create-project modal | `app/page.tsx` + `components/projects/CreateProjectModal.tsx` | `POST /projects` |
| `/projects/:id` | `app/projects/[id]/page.tsx` | `GET /projects/:id/overview` |
| `/projects/:id/runs` | `app/projects/[id]/runs/page.tsx` | `GET /projects/:id/runs?page&limit&status` |
| `/projects/:id/runs/:runId` | `app/projects/[id]/runs/[runId]/page.tsx` | `GET /projects/:id/runs/:runId` + `/cases` |
| `/projects/:id/flaky` | `app/projects/[id]/flaky/page.tsx` | `GET /projects/:id/flaky-tests?days` |
| `/projects/:id/trends` | `app/projects/[id]/trends/page.tsx` | `GET /projects/:id/failure-trends?days&bucketSize` |
| `/projects/:id/patterns` | `app/projects/[id]/patterns/page.tsx` | `GET /projects/:id/failure-patterns?limit` |

The project layout (`app/projects/[id]/layout.tsx`) additionally
fetches `GET /projects/:id` for the chrome (project name + tab nav).

## API client

Three layers in `frontend/src/lib/api/`:

1. **`fetch.ts`** — `apiGet<T>(path, params?)` and `apiPost<T>(path, body)` plus the `ApiError` class. Both helpers:
   - prepend `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3001`)
   - serialise query params via `URLSearchParams`, skipping `undefined`
   - use `cache: 'no-store'` so each navigation gets fresh data (RSC default for `fetch()` in dynamic routes)
   - parse the JSON, unwrap the `{ data }` envelope, and `throw new ApiError(code, status, message)` on `{ error: { code, message } }`
   - throw `ApiError('UNKNOWN_ERROR', status, 'Unexpected error')` for malformed bodies
2. **Resource modules** (`projects.ts`, `runs.ts`, `analytics.ts`) — one typed function per backend endpoint. They build the path, forward query params, and return the already-unwrapped response. Pages never see the envelope.
3. **`types.ts`** — hand-written TypeScript mirrors of every backend response shape, plus the six string-literal unions used across the wire (`TestRunStatus`, `TestCaseStatus`, `ReliabilityState`, `FailureSeverity`, `ProjectHealthStatus`, `SourceType`). Codegen is deliberately deferred — match the backend's `schemas/` files by hand when they change.

## RSC by default, client where it has to be

Every page is a server component. Data fetching happens on the
server during render; the first byte already carries real content
and there is no client-side `useEffect` data-fetch flicker. Client
components are only introduced where the platform requires:

| Component | Why it's `'use client'` |
|---|---|
| `CreateProjectModal` | Form state, `useState` for open/closed, `useRouter().refresh()` after submit |
| `ProjectTabs` | `usePathname` for active-tab highlight |
| `Pagination` | `onPageChange` callback prop (currently unused — inline `<Link>` pagination is used on each list page; this primitive is staged for future client-driven flows) |
| `TrendChart` | Recharts uses DOM measurements (`ResizeObserver`) that need a browser |
| `error.tsx` boundaries | Next.js requires error boundaries to be client components |

Mutations from the modal use a direct `await createProject(...)` call
from the client component followed by `router.refresh()`. Server
actions are not used in this epic — they're easy to retrofit if a
form-heavy flow lands later.

## URL is the state

Pagination cursors, status filters, day-window selectors, bucket
size, and severity filters all live in `?searchParams`. Server
components read them via the `searchParams` prop (a `Promise` since
Next.js 15+). Filter UIs are server-rendered `<Link>` anchors that
build the next URL — no client-side state needed for navigation.

The two functions that handle this everywhere:

- `parse<X>(raw)` per page (e.g. `parseDays`, `parseStatus`,
  `parseSeverity`) — clamps and narrows the raw string to a typed
  value or a default.
- `buildHref(basePath, opts)` — constructs the next URL, omitting
  defaulted params so URLs stay clean (e.g. `?days=30` is dropped
  when 30 is the default).

Bookmarking, sharing, and the back button all work for free.

## Error handling

- **`ApiError.code`** branches in the API client throw site. Pages
  call `notFound()` from `next/navigation` on `PROJECT_NOT_FOUND`
  (and `RUN_NOT_FOUND` on the run-detail page); anything else
  re-throws and lands at the closest `error.tsx` boundary.
- **`error.tsx`** files exist at the root and project-segment
  levels. The project-segment one inspects the surfaced error
  message for the project-not-found shape and renders a "Back to
  projects" link instead of a "Try again" retry — retrying a 404
  doesn't help.
- **`not-found.tsx`** at the root renders for any `notFound()` call
  that bubbles up without a closer match.
- **`loading.tsx`** at each route segment renders a centered
  `<Spinner>` while the server fetches.

## UI primitives

`frontend/src/components/ui/`:

- **`Badge`** — pill with `success | warning | critical | neutral | info` tones. Pages map domain enums (TestRunStatus, ReliabilityState, FailureSeverity, ProjectHealthStatus) to a tone via small per-page `xxxVariant(value): BadgeVariant` helpers.
- **`Card`** — rounded white surface with optional `title` slot.
- **`Table<T>`** — generic over the row type, `columns: { key, header, render? }[]`. Empty state built in.
- **`Spinner`** — `sm | md | lg` animated border ring.
- **`Pagination`** — `'use client'` prev/next buttons driven by `onPageChange`. List pages currently use inline `<Link>` pagination instead; this component is here for future client-driven flows.

## Testing

`vitest run` runs one smoke test per page (`page.test.tsx` colocated
next to each `page.tsx`). Each test mocks the resource module
(`@/lib/api/runs`, `@/lib/api/analytics`, `@/lib/api/projects`) via
`vi.mock(...)`, awaits the async server component to a JSX tree,
calls `render(jsx)`, and asserts on a stable string from the
resulting markup.

Global stubs live in `frontend/vitest.setup.ts`:

- `@testing-library/jest-dom/vitest` matchers
- `next/navigation` mock (`useRouter`, `usePathname`,
  `useSearchParams`, `notFound`)

The trends test additionally mocks `@/components/projects/TrendChart`
to `null` so Recharts's `ResizeObserver` requirement doesn't fire in
jsdom.

What we are **not** testing yet: interactive flows (filter clicks,
modal submit), chart rendering, full browser end-to-end. Add a
Playwright epic when those become load-bearing.

## Adding a new page

1. **API type** — add the response shape to `frontend/src/lib/api/types.ts` matching the backend `schemas/<resource>.ts` file.
2. **Resource function** — add a typed wrapper in the matching resource module (`projects.ts`, `runs.ts`, or `analytics.ts`) that calls `apiGet` / `apiPost` and returns the typed shape.
3. **Route page** — create `app/<segment>/page.tsx` as an async RSC: `await params` / `await searchParams`, fetch via the resource function, handle `ApiError` (`PROJECT_NOT_FOUND` etc.) by calling `notFound()`, render with primitives from `components/ui/`.
4. **Loading boundary** — `app/<segment>/loading.tsx` exports a centered `<Spinner size="lg" />`.
5. **Error boundary** — `app/<segment>/error.tsx` (`'use client'`) accepts `{ error, reset }` and shows a retry button (or branches on a known error message for tailored copy).
6. **Smoke test** — `app/<segment>/page.test.tsx` mocks the resource module, awaits the page, renders, and asserts on stable copy.
7. **Nav link** (if the page lives under `projects/[id]/`) — add a tab to `components/projects/ProjectTabs.tsx`.

## Where to read more

- **HTTP layer (backend API):** [http-layer.md](./http-layer.md)
- **Analytics & reliability engine:** [analytics.md](./analytics.md)
- **Ingestion pipeline:** [ingestion.md](./ingestion.md)
- **Data layer:** [data-layer.md](./data-layer.md)
- **Epic 7 plan:** `docs/superpowers/plans/2026-06-07-epic-7-dashboard-reporting.md`
- **Live OpenAPI spec:** Swagger UI at `/documentation` (backend)
