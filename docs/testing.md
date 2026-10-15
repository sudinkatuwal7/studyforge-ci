# Automated testing and Bitbucket CI

StudyForge currently has one Django backend and one React frontend. CI tests the
whole application; domain selections below are preparation for future service
contracts, not a microservices migration.

## Install and run on Windows

Use Python 3.12, Node 24.19.0, and Docker Desktop with Linux containers running.
The lockfile requires Node 24 >=24.15.0. CI uses `node:24.19.0-bookworm`.
Use the existing `backend/venv` if it is Python 3.12; do not overwrite another
developer's environment. If no environment exists:

```powershell
py -3.12 -m venv backend/venv
```

From the repository root:

```powershell
backend/venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
npm.cmd --prefix frontend ci
backend/venv/Scripts/python.exe scripts/check.py
```

Activation is optional when using the explicit executable. On Linux/macOS, use
`python3.12 -m venv backend/venv`, `backend/venv/bin/python`, and `npm`.
The runner does not install packages, change Git configuration, or load `.env`.
`npm ci` replaces `node_modules`; run it when initially installing or updating
locked dependencies, not automatically inside a pre-push hook.

## Commands and test boundaries

```powershell
# Everything: backend checks/migrations/tests, then Oxlint/Vitest/build
backend/venv/Scripts/python.exe scripts/check.py

# One component
backend/venv/Scripts/python.exe scripts/check.py --component backend
backend/venv/Scripts/python.exe scripts/check.py --component frontend

# Backend domain subsets (each still checks the entire migration graph)
backend/venv/Scripts/python.exe scripts/check.py --component backend --suite identity-courses
backend/venv/Scripts/python.exe scripts/check.py --component backend --suite documents
backend/venv/Scripts/python.exe scripts/check.py --component backend --suite ai-learning

# Frontend watch mode, without a backend or database
npm.cmd --prefix frontend run test:watch
```

| Selection | Current paths | Future boundary to agree |
| --- | --- | --- |
| Identity/Courses | `backend/tests/users`, `backend/apps/courses` | Identity claims, token lifecycle, course ownership API |
| Documents | `backend/tests/documents`, `backend/apps/documents` | Private upload storage, authorization, processing handoff and status |
| AI Learning | `backend/apps/processing`, `backend/apps/knowledge`, `backend/apps/notes` | Content retrieval, chunk/vector persistence, generation contracts |

Processing currently spans document and AI concerns. These selections are not
separately deployable services: tests still initialize all installed Django apps.
Keep the full suite as the merge gate. Add consumer/producer contract tests before
replacing cross-app model references during Sprint 2.

## Database, storage, and AI isolation

The default backend mode starts a uniquely named `pgvector/pgvector:pg16`
container on a random **loopback-only** host port. Database files use tmpfs;
there are no project volume mounts. The container stops and removes itself after
checks, including ordinary test failures. Temporary uploads are also removed.
No running Compose database or development media directory is reused.

The runner creates `studyforge_ci_<random-id>`, checks fresh migrations there,
then pytest creates `test_studyforge_ci_<random-id>`. The role needs database and
vector-extension creation privileges; the disposable container provides them.
Migration drift runs with `--check --dry-run`; no migration files are generated.
Pytest's fixture directory and cache are also inside the per-run temporary root,
avoiding shared Windows temporary-directory permissions and stale cache state.

`config.test_settings` requires runner-supplied database/storage values and is
the default pytest settings module. Bare `pytest` without those values fails with
instructions instead of silently targeting a developer's database. Application
commands still default to `config.settings`; application behavior is unchanged.

`NOTES_LLM_BACKEND=fake` is forced. Provider keys are removed from child test
environments, and a backend autouse fixture blocks HTTPX requests (the transport
used by the current OpenAI and Gemini clients). Embedding tests inject fake
vectors or mock clients. Tests must never call paid APIs. Do not add real keys to
repository/workspace CI variables for these jobs.

Celery task tests call the real registered task synchronously with mocked retry
state. Broker settings use in-memory transport, while document dispatch tests
mock publication. This does not test actual Redis delivery or worker execution.
No Redis service is needed for this first pipeline.

### Bitbucket service mode

CI already supplies a PostgreSQL service, so it runs:

```text
python scripts/check.py --component backend --database service
```

This mode reads `CI_POSTGRES_HOST`, `CI_POSTGRES_PORT`, `CI_POSTGRES_USER`, and
`CI_POSTGRES_PASSWORD`, not application `POSTGRES_*` variables. Use only a
dedicated test server. It creates unique databases and drops only those names
on exit. The server itself is managed by Bitbucket. Local service-mode use is
supported for troubleshooting but is not needed for the normal Docker workflow.

## Reports and failure behavior

- Backend JUnit XML: `test-results/backend-<suite>.xml`.
- Frontend JUnit XML: `frontend/test-results/frontend.xml`.
- Both locations are ignored by Git and uploaded as pipeline artifacts.
- Nonzero test, lint, migration, or build exit codes fail the check runner/step.
- Setup failures fail immediately. Individual check failures are printed and
  reflected in the runner's final exit code; they are never converted to success.
- `npm run build` includes TypeScript checks (`tsc -b`) and the Vite build.
- Oxlint is the existing linter. Its current Fast Refresh warning in
  `AuthContext.tsx` is not silenced or changed by this CI setup.

## Optional pre-push hook

Hooks are opt-in and are not enabled automatically. First inspect your current
configuration and preserve any existing hook installation:

```powershell
git config --get core.hooksPath
```

If none is configured and you want this hook:

```powershell
git config --local core.hooksPath .githooks
```

Git for Windows provides the shell for `.githooks/pre-push`. It prefers
`backend/venv/Scripts/python.exe`, then the Unix virtual environment, then `python`.
Set `STUDYFORGE_PYTHON` to an alternate Python 3.12 executable if necessary. On
Linux/macOS, also run `chmod +x .githooks/pre-push` when installing the hook.
The tracked attributes keep hook line endings LF.

The hook runs the full suite against the working tree and blocks a push if checks
fail. Commit the intended tested changes before pushing; it cannot prove that an
arbitrary ref being pushed matches dirty working-tree contents. It can also be
bypassed locally, so CI and Cloud branch restrictions remain authoritative.
To uninstall, unset local `core.hooksPath` only if it still points to `.githooks`.

## Bitbucket Cloud setup (repository administrator)

1. Review and merge the CI change using the authorized branch/PR workflow.
   Ensure the YAML also reaches active PR source branches.
2. Enable Pipelines and confirm the plan's available build minutes.
3. Validate the YAML in Bitbucket, then inspect the first actual pipeline run.
4. Confirm both parallel steps run on PR creation/source updates and on pushes
   to `development` and `main`. The `pull-requests: "**"` pattern matches source
   branches, including task-to-domain PRs, not just PRs into `development`.
5. Protect `development` and `main`: restrict direct pushes, require teammate
   review and resolved PR tasks, and require successful current-commit builds
   with none failed or in progress. Inspect actual build statuses before choosing
   the required build count; pipeline steps are not automatically separate statuses.
6. Confirm enforcement, not just warnings. Atlassian documents Premium as required
   to prevent merges with unresolved merge checks. Your subscription is a manual
   verification item. If unavailable, explicitly assign human gatekeeping.
7. Prove the gate with a temporary failing-test PR, fix it, and verify rerunning
   clears the failure. This must be done by the team after local implementation.
8. Rerun/update PRs after relevant destination-branch changes; do not rely on a
   stale successful build. No deployment steps or production credentials are used.

PR pipelines test a checkout with the destination merged in. Fork PRs do not
trigger this PR configuration. Full checks also run after integration updates;
ordinary feature pushes before opening a PR do not run duplicate pipelines.

References: [triggers](https://support.atlassian.com/bitbucket-cloud/docs/pipeline-start-conditions/),
[services](https://support.atlassian.com/bitbucket-cloud/docs/databases-and-service-containers/),
[JUnit reports](https://support.atlassian.com/bitbucket-cloud/docs/test-reporting-in-pipelines/),
[merge checks](https://support.atlassian.com/bitbucket-cloud/docs/suggest-or-require-checks-before-a-merge/).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Docker pipe/daemon error | Start Docker Desktop with Linux containers. Check `docker version`. |
| Python version rejected | Use Python 3.12 `backend/venv`; an existing `backend/.venv` may use a different version. |
| Node engine errors | Use Node 24.19.0, then reinstall from the lockfile with `npm ci`. |
| PostgreSQL readiness timeout | Check Docker startup; in service mode verify the dedicated `CI_POSTGRES_*` values. Never substitute production values. |
| Missing vector extension | Use `pgvector/pgvector:pg16`, not plain `postgres:16`. |
| Test settings complain about missing values | Use `scripts/check.py`, which supplies disposable database and storage settings. |
| Missing dependencies | Install backend development requirements and frontend lockfile dependencies. The hook does not install them. |
| AI/HTTP blocked assertion | Mock the provider boundary or inject fake vectors/output. Do not enable network access to make the test pass. |
| Migration drift | Review model changes and create/review the appropriate migration as part of its feature task. |
| Forced termination leaves a container | Inspect `docker ps` for the exact `studyforge-ci-<id>` created by that run, then stop only that container. Do not prune Docker resources. |

Dependency downloads require network access; application tests do not require
external services except their disposable database. Container tags and unpinned
Python transitive dependencies can change: record and review upgrades separately.

For coursework AI reports, follow the [professor's reporting workflow](ai-dev-reports/README.md).
Coding branches do not require an additional pair of AI-generated summary reports.

The initial baseline, executed validation results, and remaining findings are in
[ci-validation.md](ci-validation.md).
