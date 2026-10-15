# Document Processing foundation — SCRUM-97

This directory is the independent service foundation described in the
[Sprint 2 contract](../../docs/architecture/document-processing-contract.md).
It has its own Django project, dependencies, migration, database, container image,
and infrastructure probes. It does not import the main backend.

Status: **SCRUM-97 foundation complete locally and team-approved.** Publication
and Jira workflow updates have not been performed.

The existing Django PDF upload, Celery dispatch, worker, and public status APIs
remain active and unchanged. This scaffold does **not** consume tasks, extract
PDFs, generate embeddings, retrieve private files, or accept processing requests.
Those integrations belong to SCRUM-99/100/108 and the still-unassigned Django
dispatch/callback work. SCRUM-106 multi-format support is not included.

## Start locally with Docker Compose

Run from the repository root with Docker Desktop using Linux containers:

```text
docker compose -f docker-compose.yml -f docker-compose.processing.yml up -d --build document-processing
docker compose -f docker-compose.yml -f docker-compose.processing.yml ps -a
```

The additional Compose file is opt-in. Running the original `docker compose up`
continues to start only PostgreSQL and Redis. The combined configuration adds:

| Component | Purpose |
|---|---|
| `processing-db-init` | One-shot setup of a separate logical database and restricted role on `db`. Only this container receives database administrator credentials. |
| `processing-migrate` | Applies the service's own migrations with its restricted role after setup succeeds. |
| `document-processing` | Runs the standalone Django WSGI application with Gunicorn as a non-root container user. |

Database and Redis health checks precede dependent startup. Successful setup and
migration containers exit with code 0; they are not additional microservices.
The service binds to host loopback at port 8001 by default.

```text
GET http://127.0.0.1:8001/health/
GET http://127.0.0.1:8001/ready/
```

`/health/` reports process liveness without querying dependencies. `/ready/`
checks access to the migrated execution table and Redis `PING`, returning 503
when either is unavailable. These unauthenticated infrastructure probes return
no document/job data or exception details. Readiness does not claim that a
processing worker, application callback, or end-to-end pipeline is operational.

Inspect startup errors with:

```text
docker compose -f docker-compose.yml -f docker-compose.processing.yml logs processing-db-init processing-migrate document-processing
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

Build the image first when service code or dependencies change. No Redis queues
are declared or consumed by this scaffold.

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

This is the agreed foundation schema for subsequent worker integration. It
provides uniqueness and persistence, not a claim/retry algorithm or callback
idempotency implementation. A new job can reference an already-seen document.
The application Job and public Document status remain in Django. Task schema
versions, execution claims, retry scheduling, and durable result-delivery state
can be added through service migrations once their behavior is agreed.

## Verification

From the repository root:

```text
python services/document-processing/check.py
```

The check needs Docker but no host Python packages. It builds the image in a
randomly named Compose project, uses disposable credentials and random ports,
ignores the developer's `.env`, and cleans up only that project's containers and
volumes. Cached images are retained. The checks cover:

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

No end-to-end independent processing acceptance is claimed by these foundation
checks. Authentication, secure PDF access, worker behavior, callbacks, and cutover
still require integration and the contract's end-to-end acceptance checklist.

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
- **Still unassigned:** Django publisher changes, callback handlers, and atomic
  application result persistence. No routes or wire schemas were implemented here.

References: [Django WSGI/Gunicorn deployment](https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/gunicorn/)
and the [pinned Gunicorn release](https://pypi.org/project/gunicorn/26.2.0/).
