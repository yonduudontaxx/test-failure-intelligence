# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository ([direct link](https://github.com/yonduudontaxx/test-failure-intelligence/security/advisories/new)). Do not open a public issue for a suspected vulnerability.

Include the affected endpoint, page or file, steps to reproduce, and the impact you expect. The aim is to acknowledge reports within 5 working days and to post an update on the advisory at least every 14 days until it is resolved or declined.

Reports about the ingestion API (file uploads and parsers for JUnit XML, Jest, Vitest and Playwright results), the dashboard, and the CI templates in `.github/` are all in scope.

## Supported versions

Only the latest commit on `main` is supported. Fixes are not backported.

## Automated security checks

[`.github/workflows/security.yml`](.github/workflows/security.yml) runs on every push to `main`, every pull request to `main` or `develop`, weekly on Monday, and on demand:

| Job | Tool | Fails the run when |
|-----|------|--------------------|
| CodeQL | `github/codeql-action` with the `security-extended` query suite for JavaScript/TypeScript (backend and frontend) | Results are uploaded to code scanning; alerts are triaged there |
| Semgrep | Semgrep CE with the `p/owasp-top-ten` and `p/typescript` rule packs | Any finding; SARIF is uploaded to code scanning |
| Secret scan | gitleaks over the full git history (checksum-verified release binary) | Any secret is detected |
| npm audit | `npm audit --audit-level=high`, once for `backend/` and once for `frontend/` | A high or critical advisory affects any dependency |

Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)) proposes weekly updates for both npm packages and for GitHub Actions after a 7-day cooldown. Every third-party action in `.github/`, including `INGEST_TEMPLATE.yml`, is pinned to a full commit SHA, and workflow expressions reach shell scripts only through `env`.

## Suppressed findings

None.
