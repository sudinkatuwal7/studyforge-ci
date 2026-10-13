# Initial CI validation record

Date: 2026-10-12. Branch: `chore/bitbucket-ci-setup`, based on fetched
`origin/development` at `4c3f7de22c6a976b24488f7eaf96d8baaf398cf5`.
These are executed local results, not a claim that Bitbucket Cloud has run.

## Before implementation

The branch was created with a normal switch after verifying the existing deleted
path had the same blob on both branches. The original documentation branch stayed
at `b85d6bc`; its content/history were not merged or rebased. The existing deletion
was retained and never staged. No stash, reset, clean, commit, push, or PR was used.

Baseline used Python 3.12.12, Node 24.19.0, a dedicated disposable PostgreSQL
16/pgvector container on localhost port 55439, temporary media, and fake AI.

| Baseline command | Result |
| --- | --- |
| `python -m pytest -q` (original settings, isolated environment) | 215 tests and 36 subtests passed |
| `npm --prefix frontend test` | 43 tests in 7 files passed |
| `npm --prefix frontend run lint` | Passed, one existing Fast Refresh warning |
| `npm --prefix frontend run build` | TypeScript and production build passed |
| `python backend/manage.py check` | No issues |
| `python backend/manage.py makemigrations --check --dry-run` | No changes detected |
| `python backend/manage.py migrate --noinput` | All migrations applied on the disposable database |

## Implementation verification

| Check | Executed result |
| --- | --- |
| Windows shared backend runner | 219 tests and 36 subtests passed; no skips |
| Windows optional hook, executed directly using Git's `sh` | Full backend/frontend checks passed; hook was not installed and no push occurred |
| Windows frontend | 43 tests passed; Oxlint and TypeScript/build passed |
| Clean Linux `python:3.12-bookworm` installation | Development dependencies installed; `pip check` passed |
| Linux backend service mode | System checks, migration drift, fresh migrations, 219 tests and 36 subtests passed |
| Clean Linux `node:24.19.0-bookworm` installation | `npm ci` succeeded; 43 tests, Oxlint and TypeScript/build passed |
| Node image validation | Docker manifest resolved and container printed `v24.19.0` |
| JUnit generation | Backend and frontend XML generated at the configured report paths |
| Pipeline YAML | Parsed with PyYAML; PR, development and main triggers resolved both parallel job anchors and expected images |
| Frontend manifest/lockfile | Dependency sections still match; no dependency changes were needed |

The four additional backend tests verify real Celery task registration, fake notes
provider/key isolation, and synchronous/asynchronous HTTP blocking. Existing tests
and assertions were retained. Obsolete Chunk import skips were removed.

Linux checks used a read-only source mount, copied code into temporary container
filesystems, and installed dependencies there. They did not replace Windows
`node_modules` or the virtual environment. Service-mode backend checks created
unique databases on the dedicated baseline container.

## Failures investigated during implementation

The first Windows runner invocation encountered 92 fixture setup errors because
pytest's shared temporary directory was inaccessible across sandbox/elevated
execution contexts. The runner now assigns pytest a fresh per-run `--basetemp`.
A subsequent shared cache-directory warning was resolved by placing pytest's
cache in the same per-run temporary root. The final direct hook run passed with
no backend warnings. No existing directory permissions or unrelated files were
changed to resolve these issues.

## Remaining findings and verification limits

- Oxlint retains the pre-existing Fast Refresh warning at
  `frontend/src/context/AuthContext.tsx:162`. It is not suppressed; there are no
  lint errors. Application restructuring is outside this task.
- Clean `npm ci` reported one high-severity advisory. `npm audit --json` confirmed
  the existing transitive `source-map-js` finding:
  [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), event-loop
  denial of service for affected versions below 1.2.2. `npm audit` exits 1.
  No automatic fix or dependency upgrade was performed; review separately.
- `openai`, `python-dotenv`, and Python transitive dependencies remain unpinned.
  A clean install passed, but complete Python lockfile reproducibility is future work.
- No live AI APIs, Redis worker integration, or real-browser end-to-end tests ran.
  The existing mocked suites are the first merge gate, not proof of those integrations.
- YAML parsing and container execution do not replace Bitbucket's own validator,
  first Cloud run, report-upload verification, and deliberate failing-PR check.
- Pipelines enablement, plan/build minutes, branch restrictions, reviewer rules,
  successful-build merge checks, and actual enforcement require administrator
  verification. See [testing.md](testing.md).
- No local hook configuration was changed. All implementation changes remain
  available for review before any authorized commit/push.
