# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two **independent** npm packages in one repo — NOT npm workspaces (no root `package.json`). Run commands from within `backend/` or `frontend/`.

- `backend/` — Fastify 5 + TypeScript, **ES modules** (`"type": "module"`), PostgreSQL 16 via node-pg-migrate. Layered: `domain/` (zero external deps) → `application/`/`use-cases/` → `infrastructure/` → `http/`.
- `frontend/` — Next.js 15 (App Router), React 19, Tailwind, Recharts.

## Commands (run from the package dir)

Standard scripts (`dev`, `build`, `start`, `lint`, `lint:fix`, `format`, `typecheck`) exist in both. Non-obvious ones:

- Backend tests need ESM VM flags — always use the npm scripts, not bare `jest`:
  - `npm run test:unit` — fast, no DB
  - `npm run test:integration` — needs the `tfi_test` DB, runs serially (`--runInBand`)
  - `npm test` — unit + integration, serially
  - Single test: `NODE_OPTIONS=--experimental-vm-modules npx jest -t 'test name'`
- Backend DB migrations: `npm run migrate:up` / `npm run migrate:down`
- Frontend tests: `npm test` (Vitest).

## Testing gotchas

- Backend Jest runs with `NODE_OPTIONS=--experimental-vm-modules` and `testEnvironment: allure-jest/node` (not the default `node`).
- Integration tests require a `tfi_test` database and must run `--runInBand` (cross-file truncation races otherwise). Start it with:
  ```bash
  docker compose -f docker-compose.dev.yml up postgres -d
  docker compose -f docker-compose.dev.yml exec postgres \
    psql -U tfi -d postgres -c "CREATE DATABASE tfi_test OWNER tfi"
  ```
- Both suites feed Allure reporters; CI publishes HTML to GitHub Pages.

## Code style

- Prettier (both packages, identical config): `singleQuote`, `trailingComma: all`, `printWidth: 100`, `tabWidth: 2`, semicolons on. Run `npm run format` before committing.
- Keep the `domain/` layer free of external dependencies.

## Environment

- Backend requires `DATABASE_URL` (see `backend/.env.example`). Frontend optionally uses `NEXT_PUBLIC_API_URL` (default `http://localhost:3001/api/v1`).

## Workflow rules (required)

- **No AI attribution.** Never add `Co-authored-by`, "Generated with Claude", or any AI-attribution line to commits or PR bodies. Use conventional-commit messages; prefer many small logical commits.
- **A new fix gets its own git worktree branch.** Before starting a fix, create an isolated worktree + branch off the current base (see the `/fix` skill) rather than working directly in the main checkout. Branch from `develop` (the default working branch); `main` is production.
- **On PR creation, run review agents.** When a PR is opened for a fix, dispatch the `code-reviewer` and `critic` agents to review the diff (see the `/review-pr` skill).
- **Merge to `main` only after a positive review.** Do not merge until both review agents return a positive verdict with no unresolved blocking findings.
