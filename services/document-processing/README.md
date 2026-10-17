# Document Processing foundation — SCRUM-97

This directory is the independent service foundation described in the
[Sprint 2 contract](../../docs/architecture/document-processing-contract.md).
It has its own Django project, dependencies, migration, database, container image,
and infrastructure probes. It does not import the main backend.

Status: **SCRUM-97 foundation complete locally and team-approved.** Publication
and Jira workflow updates have not been performed.

The Django upload publisher now sends `job_id`, `document_id`, and
`source_sha256` to the standalone task on the `document-processing` queue.
Workers fetch the PDF through Django's authenticated internal endpoint, verify
the source digest, extract and chunk text, and generate embeddings. They report
running, success, and failure callbacks to Django. Django atomically persists
chunks/page count and Job/Document status on success. Production cutover,
durable callback recovery, and service execution claims remain separate work.
SCRUM-106 multi-format support is not included.

## Start locally with Docker Compose

Run from the repository root with Docker Desktop using Linux containers:

```text
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.processing.yml up -d --build document-processing processing-worker-1 processing-worker-2
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.processing.yml ps -a
```

Compose does not load `backend/.env` by default. Supplying it with `--env-file`
makes the backend's Gemini and processing service settings available for
interpolation. Set a long random `PROCESSING_SERVICE_TOKEN` in `backend/.env`;
Django and the worker containers must receive the same value. Django does not
load `backend/.env` automatically: export that token into the backend process
environment (or configure it in the backend's deployment environment) before
starting Django. For a host-run backend, use `python manage.py runserver
0.0.0.0:8000` from `backend` after exporting its settings. The worker
services are passed only the Gemini settings, processing token, internal Django
base URL, and processing environment—not the backend database password or
legacy broker URL. Compose's default base URL is `http://host.docker.internal:8000`,
and that host is in Django's allowed-host list.
The same file's `POSTGRES_*` values configure the base `db` service, so they
must match the credentials for the existing local database volume. Do not
commit the real `backend/.env`.

The additional Compose file is opt-in. Running the original `docker compose up`
continues to start only PostgreSQL and Redis. The combined configuration adds:

| Component | Purpose |
|---|---|
| `processing-db-init` | One-shot setup of a separate logical database and restricted role on `db`. Only this container receives database administrator credentials. |
| `processing-migrate` | Applies the service's own migrations with its restricted role after setup succeeds. |
| `document-processing` | Runs the standalone Django WSGI application with Gunicorn as a non-root container user. |
| `processing-worker-1`, `processing-worker-2` | Identical Celery worker containers using the standalone service image and Redis broker. |

Database and Redis health checks precede dependent startup. Successful setup and
migration containers exit with code 0; they are not additional microservices.
The service binds to host loopback at port 8001 by default. The workers register
`processing_service.tasks.process_document_task` and consume the isolated
`document-processing` queue, separate from the legacy backend's default queue.

The task accepts `job_id`, `document_id`, and `source_sha256`. It fetches
`GET /internal/v1/jobs/{job_id}/document/` using the shared Bearer token,
validates the correlation headers and source digest, then runs extraction,
page-aware chunking, and Gemini embeddings. Retryable retrieval/provider errors
use Celery retries. The worker posts authenticated `RUNNING`, `SUCCEEDED`, and
`FAILED` callbacks to
`POST /internal/v1/jobs/{job_id}/result/`. Django validates correlation and
768-dimensional vectors, then atomically stores chunks and page count and
updates the application Job/Document. Repeated terminal callbacks are
idempotent, and callbacks for older jobs or attempts are ignored. One callback is limited
to 2 MiB; larger results fail explicitly rather than being partially persisted.
Callback delivery uses bounded Celery retries, but results are not durably
staged in the service database, so a prolonged Django outage can leave a job
in `PROCESSING` for later reconciliation.

```text
GET http://127.0.0.1:8001/health/
GET http://127.0.0.1:8001/ready/
```

`/health/` reports process liveness without querying dependencies. `/ready/`
checks access to the migrated execution table and Redis `PING`, returning 503
when either is unavailable. These unauthenticated infrastructure probes return
no document/job data or exception details. Readiness does not claim that a
processing worker or external Gemini provider is operational.

Inspect startup errors with:

```text
docker compose -f docker-compose.yml -f docker-compose.processing.yml logs processing-db-init processing-migrate document-processing processing-worker-1 processing-worker-2
```

## Configuration and data ownership

Compose reads overrides from the root `.env` or exported variables. The local
defaults below are development credentials, not production secrets. The existing
PostgreSQL administrator variables must match the credentials used when the
database volume was created. Changing `.env` does not reset that administrator.

| Variable | Default / usage |
|---|---|
| `PROCESSING_DB_NAME` | `studyforge_processing` |
| `PROCESSING_DB_USER` | `studyforge_processing` |
| `PROCESSING_DB_PASSWORD` | `processing_local_dev` in Compose; required by Django settings |
| `PROCESSING_SECRET_KEY` | Development-only value in Compose; required by Django settings |
| `PROCESSING_HTTP_PORT` | `8001`, bound to `127.0.0.1` |
| `PROCESSING_IMAGE` | `studyforge-document-processing:local` |
| `PROCESSING_DB_HOST`, `PROCESSING_DB_PORT` | Compose uses `db:5432`; host commands use `127.0.0.1:5432` by default |
| `PROCESSING_REDIS_URL` | Compose uses `redis://redis:6379/0`; host commands default to `127.0.0.1` |
| `PROCESSING_ALLOWED_HOSTS` | Compose allows `localhost,127.0.0.1,document-processing` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Existing application database and bootstrap administrator values; used by `db` and the provisioning job, never the service runtime |
| `GEMINI_API_KEY` | Read from `backend/.env` via the documented `--env-file` command and passed to the workers; do not commit a real key |
| `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, `EMBEDDING_BATCH_SIZE` | Existing backend embedding settings forwarded to workers; default to `gemini-embedding-2`, `768`, and `16` |
| `PROCESSING_SERVICE_TOKEN` | Shared Bearer token for the internal PDF endpoint; configure the same random value for backend and workers |
| `PROCESSING_DJANGO_API_URL` | Internal Django base URL seen by worker containers; defaults to `http://host.docker.internal:8000` |

The service's [.env.example](.env.example) documents host configuration. Django
does not automatically load it. For host development, use Python 3.12, install
this directory's `requirements.txt` in its own virtual environment, export the
listed settings, and run `python manage.py check` from this directory. Gunicorn
runs in Linux containers; Windows developers can use `python manage.py runserver
127.0.0.1:8001` for local development after provisioning/migrating the database.

Provisioning is explicit and works with both fresh and existing PostgreSQL
volumes. It does not depend on `/docker-entrypoint-initdb.d` running again, does
not drop databases, and does not migrate or change application tables. It refuses
to take over an existing database/role unless its ownership and management marker
match this service. A conflicting name requires investigation or a new dedicated
name, not deleting the developer's database volume.

The restricted role owns the processing database so it can run its migrations.
It has no superuser, database-creation, role-creation, replication, or row-security
bypass privileges, and no inherited role memberships. Public access to the
processing database is revoked. Ordinary application tables must retain their
normal restricted grants; the service account must never receive application
table grants. PostgreSQL administrators can still access both databases.

Rerunning provisioning preserves records and updates the managed service role's
password to the supplied value. For an explicit credential change or schema
update, rerun the one-shot jobs and recreate the service with its new settings:

```text
docker compose -f docker-compose.yml -f docker-compose.processing.yml run --rm --no-deps processing-db-init
docker compose -f docker-compose.yml -f docker-compose.processing.yml run --rm --no-deps processing-migrate
docker compose -f docker-compose.yml -f docker-compose.processing.yml up -d --no-deps --force-recreate document-processing
```

Build the image first when service code or dependencies change. Workers consume
the `document-processing` queue from the shared Redis broker.

## Minimal execution schema

| Field | Meaning |
|---|---|
| `id` | Service-local primary key |
| `job_id` | Unique positive application Job identifier; plain integer, not a foreign key |
| `document_id` | Indexed positive application Document identifier; plain integer |
| `source_sha256` | Validated lowercase 64-character digest |
| `status` | `QUEUED`, `RUNNING`, `SUCCEEDED`, or `FAILED`; defaults to `QUEUED` |
| `attempts` | Non-negative count; defaults to zero |
| `error_code` | Optional internal error code; no raw exception field |
| `created_at`, `updated_at` | Service timestamps maintained by ordinary model saves |

This is the agreed foundation schema. The application Job and public Document
status remain in Django. The worker does not yet use Execution rows to claim
duplicate tasks or retain results for delivery recovery. Task schema versions,
execution claims, retry scheduling, and durable result-delivery state can be
added through service migrations once their behavior is agreed.

## Verification

From the repository root:

```text
python services/document-processing/check.py
```

The check needs Docker but no host Python packages. It builds the image in a
randomly named Compose project, uses disposable credentials and random ports,
ignores the developer's `.env`, and cleans up only that project's containers and
volumes. Cached images are retained. The checks cover:

- Standalone PDF extraction and page-aware chunking unit tests.
- Gemini embedding validation and retry classification tests, plus source-fetch
  authentication, digest, size, HTTP-failure, and task-pipeline tests.
- Both Compose worker processes respond to Celery ping with distinct hostnames,
  register the standalone document task, subscribe to the isolated queue, and
  pass the service tests inside each worker container.
- Fresh migrations, migration drift, execution uniqueness/constraints, and the
  absence of application tables and cross-service foreign keys.
- Liveness/readiness and safe dependency-failure responses.
- Repeat provisioning with existing data, denied application-table access,
  restricted role attributes, and absence of administrator credentials in the
  runtime container.
- Execution persistence across a service restart and a real Redis outage.

Tests use an administrator-precreated disposable test database with `--keepdb`;
the runtime role does not need `CREATEDB`. Do not point these tests at development
data. Existing application regression checks remain:

```text
backend/venv/Scripts/python.exe scripts/check.py --component backend
```

The foundation checks validate workers, task registration, queue subscriptions,
service isolation, and service unit tests. Backend callback integration is
covered by the backend document suite. Production cutover, durable result
recovery, execution claims, and retry/duplicate end-to-end acceptance remain.

### Recorded foundation verification — October 14, 2026

These results were recorded during the original SCRUM-97 implementation and
are retained here from the former development summaries. They are historical
results, not new test runs performed during the reporting-documentation cleanup.

| Command or action | Recorded result |
|---|---|
| Service `manage.py makemigrations executions --no-header` | Created the initial migration. The initial local database-history check warned that no configured service database was available; subsequent Docker checks applied and checked the migration successfully. |
| Service `manage.py check` | Passed. |
| `python services/document-processing/check.py` | Passed: Compose build/startup, repeat provisioning, migrations/drift, nine service tests, denied SELECT on an application-owned table, restricted role attributes, absence of administrator credentials in the runtime, restart persistence, and actual Redis-outage behavior. Disposable containers, network, and volume were removed. |
| `backend/venv/Scripts/python.exe scripts/check.py --component backend` | System checks, migration drift, and fresh migrations passed; 219 tests and 36 subtests passed using disposable PostgreSQL and fake AI. |
| Python compilation, README relative links, and whitespace checks | Passed. |

The application-table probe directly verified denied reads; it did not separately
exercise denied writes. Restart checks verified persisted execution records,
not recovery of running jobs. During the Redis outage, liveness remained 200
and readiness returned 503. No browser testing, paid AI calls, production
hardening, or independent end-to-end processing was verified.

### Foundation design findings

- The existing worker uses application models and shared private storage, so
  moving its module alone would not establish the agreed service boundary.
- A separate logical database and restricted role reuse PostgreSQL while giving
  the service its own migrations; they do not isolate the underlying server.
- Explicit repeatable provisioning supports existing volumes. A second run
  preserved application sentinel data; ownership and management-marker checks
  prevent taking over unrelated database or role names.
- Unique job identifiers and plain document identifiers support independent
  execution records. They do not implement worker claims, retries, or callback
  idempotency, which remain integration work.

## SCRUM-97 completion checklist

These items cover the foundation scope only. Results come from the historical
verification recorded above.

- [x] Independent service configuration, dependencies, image, and entry point.
- [x] Separate logical PostgreSQL database and restricted service role.
- [x] Service-owned execution model and migration without application foreign keys.
- [x] Process liveness and database/Redis readiness probes.
- [x] Opt-in Compose startup with database provisioning and migration jobs.
- [x] Repeat provisioning preserves existing application data.
- [x] Database isolation, restart persistence, and dependency-failure checks pass.
- [x] Nine service tests pass; existing backend regression passes with 219 tests and 36 subtests.
- [x] Setup, verification, and teammate handoff instructions are documented.
- [x] Team approval received for the foundation.

No application code, existing public API, original Compose configuration, or
processing dispatch was changed. Commit, push, pull request, merge, and Jira
closure are separate workflow actions and are not claimed by this checklist.

## Teammate handoff

- **Nischal / SCRUM-99:** agree service credentials and permissions with Sanish;
  do not add user authentication models to this service.
- **Sanish / SCRUM-100:** provide the authenticated Django PDF retrieval endpoint.
- **Sanish / SCRUM-108:** extend this image/configuration with the worker and
  execution lifecycle, using the agreed queue and message contract.
- **SCRUM-108 integration now present:** Django publisher handoff, authenticated
  status/result receiver, and atomic application chunk/status persistence.
  Durable callback recovery, service execution claims, and production cutover
  remain follow-up work.

References: [Django WSGI/Gunicorn deployment](https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/gunicorn/)
and the [pinned Gunicorn release](https://pypi.org/project/gunicorn/26.2.0/).
