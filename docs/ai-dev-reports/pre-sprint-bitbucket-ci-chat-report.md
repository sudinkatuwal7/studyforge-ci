# Pre-sprint Bitbucket CI chat report

- Branch: `chore/bitbucket-ci-setup`
- Jira ID: not assigned; none invented
- Date: 2026-10-12
- Tool: Codex assistant; exact serving model not independently verified
- Status: local implementation; no commit, push, PR, or merge authorized
- This is a condensed conversation/work log, not a verbatim transcript.

## Requests and decisions

1. The user requested a read-only CI audit. The audit identified existing pytest
   and Vitest suites, absent pipeline/hooks, shared Django apps, and test-isolation
   risks. Tests were not executed during that read-only audit.
2. The user requested an implementation plan and approval pause. The assistant
   reported branch state and the existing uncommitted deletion.
3. The user authorized fetching and creating `chore/bitbucket-ci-setup` from the
   latest `origin/development`, preserving the deletion and documentation branch.
   They required Oxlint, fake AI, disposable databases, Windows checks, and reports.
4. Fetch completed. Base `4c3f7de` was inspected; the deleted path's blob matched
   across branches. The branch switch preserved the deletion. The documentation
   branch was not merged, rebased, or moved.
5. Baseline was executed before fixes: backend 215 tests and 36 subtests passed;
   frontend 43 tests passed; Django checks, migration drift, fresh migrations,
   TypeScript and build passed. Oxlint reported its existing Fast Refresh warning.
6. The assistant implemented parallel CI jobs and the disposable check runner,
   replaced the global Celery mock with real-task synchronous tests, removed
   conditional skips for the existing Chunk model, and enforced offline AI tests.
7. Installation, troubleshooting, optional hook, Cloud configuration, domain test
   selection, and Sprint 2 reporting instructions were documented.

## Validation record

Baseline commands used Python 3.12.12 with the installed development requirements,
an isolated PostgreSQL 16/pgvector container, temporary media, and fake AI:
`manage.py check`, `makemigrations --check --dry-run`, `migrate --noinput`,
`python -m pytest -q`, `npm test`, `npm run lint`, and `npm run build`.

Post-change verification is recorded in `docs/ci-validation.md`. Human review and
the first actual Bitbucket run remain required. No real AI calls were requested.
