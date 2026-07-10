---
name: fix
description: Start a bug fix in an isolated git worktree branch. Use when beginning any new fix so work stays off the main checkout and follows the review-gated merge workflow.
disable-model-invocation: true
---

# /fix <short-description>

Start a new fix in its own git worktree + branch, per the repo workflow rules in CLAUDE.md.

## Steps

1. Derive a branch name from the description: `fix/<kebab-case-description>`.
2. Create an isolated worktree branched off `develop` (the default working branch):
   ```bash
   git fetch origin
   git worktree add ../tfi-<kebab-case-description> -b fix/<kebab-case-description> origin/develop
   ```
   (If `origin/develop` is unavailable, branch from local `develop`.)
3. Work in the new worktree directory. Implement the fix following TDD where practical.
4. Verify before committing — from the relevant package dir:
   - Backend: `npm run lint && npm run typecheck && npm test`
   - Frontend: `npm run lint && npm run typecheck && npm test`
   - Run `npm run format` in any package you touched.
5. Commit in small, logical, conventional-commit chunks. **No AI attribution** — never add `Co-authored-by` or "Generated with Claude" lines.
6. Push the branch and open a PR (base `develop`). Then run `/review-pr <PR#>` to trigger the required review.

## Reminders

- Merge to `main` only after a positive review from both review agents (see `/review-pr`).
- Clean up when done: `git worktree remove ../tfi-<kebab-case-description>`.
