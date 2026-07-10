---
name: review-pr
description: Review a PR with the code-reviewer and critic agents and return a merge verdict. Use when a PR is created for a fix, before any merge to main.
disable-model-invocation: true
---

# /review-pr <PR#>

Dispatch the review agents required before merging a fix to `main`.

## Steps

1. Fetch the PR diff and context:
   ```bash
   gh pr view <PR#> --json title,body,baseRefName,headRefName
   gh pr diff <PR#>
   ```
2. Dispatch **both** agents in parallel (single message, two Agent tool calls), giving each the diff and PR description:
   - `code-reviewer` — correctness, logic defects, SOLID, style, performance.
   - `critic` — multi-perspective scrutiny of the change and its risks.
3. Collect both verdicts. Summarize findings grouped by severity, and state each agent's overall stance.
4. **Merge gate:** merge to `main` is allowed ONLY when both agents return a positive verdict with no unresolved blocking (high/critical) findings.
   - Positive → offer to merge: `gh pr merge <PR#> --squash` (only after the user confirms).
   - Not positive → list the blocking findings and stop. Do not merge.

## Reminders

- Never bypass the gate, even if the diff looks trivial.
- Keep PR bodies free of AI attribution.
