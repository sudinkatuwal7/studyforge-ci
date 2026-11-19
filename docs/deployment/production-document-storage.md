# SCRUM-127: private document storage and service connections

## Data flow

Production Django uses `Document.file` with an S3-compatible `STORAGES["default"]`
backend. Its database value remains the relative key `documents/YYYY/MM/<uuid>.<ext>`;
the public document API does not return that key or a storage URL. The bucket must
be private. Django uploads, reads, and deletes objects. A processing worker uses
the existing `(job_id, document_id, source_sha256)` task arguments, authenticates
to `GET /internal/v1/jobs/{job_id}/object/`, receives the current job's key and
MIME type, reads the object with separate read-only S3 credentials, and verifies
its SHA-256 before parsing. The existing authenticated
`GET /internal/v1/jobs/{job_id}/document/` byte stream remains available and is
the default worker retrieval mode for local development.

`PROCESSING_SERVICE_TOKEN` authenticates both internal source routes and the
existing result callback. It must match in Django and workers, remain outside
the frontend, and travel over HTTPS or an equivalently protected private link.
Storage credentials are never returned by an endpoint. Use workload identity
when supported, or inject separate credentials through the deployment's secret
store. Scope backend access to the one private bucket's document prefix with
read/write/delete and bucket-scoped listing for existence checks; scope workers
to read plus the bucket-scoped check needed by readiness. Disable public bucket
access and enforce server-side encryption in
the bucket/provider policy. Do not put credentials in Git, command arguments,
logs, or browser environment variables.

## Settings

| Django setting | Production value |
|---|---|
| `DOCUMENT_STORAGE_BACKEND` | `s3`; local default is `filesystem` |
| `DOCUMENT_STORAGE_BUCKET`, `DOCUMENT_STORAGE_REGION` | Private bucket and region; required for S3 |
| `DOCUMENT_STORAGE_ENDPOINT_URL` | Optional HTTPS endpoint for S3-compatible providers; omit for AWS S3 |
| `DOCUMENT_STORAGE_ACCESS_KEY_ID`, `DOCUMENT_STORAGE_SECRET_ACCESS_KEY`, `DOCUMENT_STORAGE_SESSION_TOKEN` | Optional injected credentials; omit the pair for workload identity |
| `DOCUMENT_STORAGE_CA_BUNDLE` | Optional trusted CA file for a private provider |
| `DOCUMENT_STORAGE_CONNECT_TIMEOUT`, `DOCUMENT_STORAGE_READ_TIMEOUT` | Seconds; defaults `3`, `10` |
| `DOCUMENT_STORAGE_ADDRESSING_STYLE` | `path` for custom endpoints by default; `auto` for AWS |
| `POSTGRES_SSLMODE`, `POSTGRES_SSLROOTCERT` | Use `verify-full` and a trusted CA for remote PostgreSQL |
| `POSTGRES_CONNECT_TIMEOUT` | Seconds; default `3` |
| `CELERY_BROKER_URL` | Authenticated `rediss://` URL with `ssl_cert_reqs=required` for remote Redis |
| `PROCESSING_SERVICE_TOKEN` | Same long random secret as workers |
| `STUDYFORGE_REQUIRE_SECURE_CONNECTIONS` | `1` to reject non-TLS DB/Redis or non-S3 production configuration |

With the secure-connections switch enabled, Django also requires
`DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `POSTGRES_PASSWORD`,
and `PROCESSING_SERVICE_TOKEN` in its process environment. This prevents
development defaults from being used at production startup.

| Processing worker setting | Production value |
|---|---|
| `PROCESSING_SOURCE_MODE` | `s3`; local default is `django` |
| `PROCESSING_STORAGE_BUCKET`, `PROCESSING_STORAGE_REGION` | Same bucket and region as Django |
| `PROCESSING_STORAGE_ENDPOINT_URL` | Same provider endpoint, if applicable |
| `PROCESSING_STORAGE_ACCESS_KEY_ID`, `PROCESSING_STORAGE_SECRET_ACCESS_KEY`, `PROCESSING_STORAGE_SESSION_TOKEN` | Read-only credentials or workload identity |
| `PROCESSING_STORAGE_CA_BUNDLE` | Optional trusted CA file |
| `PROCESSING_STORAGE_CONNECT_TIMEOUT`, `PROCESSING_STORAGE_READ_TIMEOUT` | Seconds; defaults `3`, `10` |
| `PROCESSING_STORAGE_ADDRESSING_STYLE` | Match the provider's addressing style |
| `PROCESSING_DJANGO_API_URL` | Deployment-configured HTTPS internal Django base URL |
| `PROCESSING_SERVICE_TOKEN` | Same secret as Django |
| `PROCESSING_DB_SSLMODE`, `PROCESSING_DB_SSLROOTCERT` | Use `verify-full` and trusted CA for remote PostgreSQL |
| `PROCESSING_REDIS_URL` | Authenticated `rediss://` URL with `ssl_cert_reqs=required` for remote Redis |
| `STUDYFORGE_REQUIRE_SECURE_CONNECTIONS` | `1` for production PostgreSQL/Redis TLS and HTTPS URL validation |
| `PROCESSING_REQUIRE_DIRECT_STORAGE` | `1` on workers to reject missing S3 mode, HTTPS Django URL, or token |

`DOCUMENT_STORAGE_ALLOW_HTTP=1` and `PROCESSING_STORAGE_ALLOW_HTTP=1` permit an
isolated local S3-compatible service. The secure-connections switch rejects HTTP
storage endpoints even when those local overrides are set. Local development
needs no object-storage credentials: retain filesystem storage and
`PROCESSING_SOURCE_MODE=django`. The local kind manifest and Compose host address
defaults are development examples; set real internal DNS names and URLs in the
deployment environment.

## Health probes

| Service | Liveness | Readiness |
|---|---|---|
| Django | `GET /api/v1/health/` returns `200 {"status":"ok"}` | `GET /api/v1/ready/` checks PostgreSQL, Redis, configured S3 bucket, and service-token configuration; returns 200 or 503 |
| Processing HTTP service | `GET /health/` returns 200 without dependency calls | `GET /ready/` checks its migrated database table, Redis, and S3 bucket when configured in direct source mode; returns 200 or 503 |

Readiness bodies contain only `ok` or `unavailable` per dependency. Do not expose
these probes through a public diagnostic dashboard. The processing HTTP probe
does not prove that a Celery worker or Gemini is healthy; monitor worker queue
consumption separately. Use readiness for traffic and deployment probes, and
liveness for process restart probes. S3 bucket checks may require bucket-scoped
permission; a 503 after a credential change is expected until access is restored.

## Isolated S3 integration check

With Docker running, set `SCRUM127_S3_INTEGRATION=1` and run
`python scripts/check.py --component backend --suite s3-integration` with the
project's Python 3.12 environment. The opt-in test uses a disposable PostgreSQL
database, a SeaweedFS S3 container and volume, and credentials generated at test
runtime. It uploads through Django, fetches from a separate processing-service
Python process, exercises rejected credentials and storage failures, restarts the
storage container, and verifies the same database key and object bytes afterward.
The test removes only its own generated containers and volume. It does not use
production credentials or prove production deployment behavior.

## Full S3 end-to-end check

The harness never pulls images. With Docker running, fetch the pinned
SeaweedFS image once:

```
docker pull chrislusf/seaweedfs@sha256:ccad23e18639c8b98cee17e7100b95830a06077b56d8e5b006d6dcf8ec5e94a0
```

Then run `python scripts/check_processing_live.py --storage s3` with an environment that
has both backend and document-processing requirements. Without `--storage`, or
with `--storage filesystem`, the harness keeps its original Django-stream run.

The S3 run starts a disposable Compose PostgreSQL and Redis, a disposable
SeaweedFS container and volume, a real Django HTTP server and a standalone
Celery worker. SeaweedFS gets two runtime-generated identities: Django can read,
write and list the bucket; the worker can only read. Gemini and the answer
provider are replaced with fakes. It checks, in order:

1. Django readiness and the worker's own readiness probe report storage `ok`.
2. An HTTP upload reaches `READY` through Redis, the worker and the callback, and
   its chunks are used by retrieval, Pandu and notes.
3. The source exists only in the bucket under its `documents/` key with a
   matching SHA-256; nothing is written to `MEDIA_ROOT`; the API response does
   not expose the key or endpoint; Django served
   `GET /internal/v1/jobs/{id}/object/` and never `.../document/`.
4. The worker identity can read the object but `PutObject` and `DeleteObject`
   are denied.
5. After stopping and starting SeaweedFS and replacing the worker process, the
   first source is unchanged and downloadable, and a second upload reaches
   `READY` through the locator.
6. Deleting the first material through the API removes its object and keeps
   the second one.

The harness removes only its own Compose project, SeaweedFS container and
volume. It is outside `scripts/check.py` and CI. It does not cover TLS, OCI
Object Storage behavior (IAM policies, Customer Secret Keys, S3 compatibility
of newer boto3 checksum defaults) or `PROCESSING_REQUIRE_DIRECT_STORAGE=1`,
which requires an HTTPS Django URL; verify those against an approved staging
bucket before production cutover.

## Cutover and restart verification

1. Provision a private, persistent S3-compatible bucket, separate backend and
   worker identities, TLS trust, PostgreSQL/Redis connections, and secret injection.
   Do this outside the repository; no cloud resources are created by this code.
2. Back up the existing local media directory and database using the deployment's
   approved backup procedure. Keep writes on the old backend during the initial
   copy. Configure the new S3 settings in a staging process against the same
   database, then run `python manage.py copy_document_sources
   --source-media-root <old-media-root>` for a dry run. Review the counts.
3. Run the same command with `--apply`; it copies missing objects under their
   existing keys and verifies each SHA-256. Rerun the dry run until `pending 0`.
   The command never changes database keys and never removes local files. Pause
   uploads briefly and repeat this step immediately before cutover so no recent
   upload is missed.
4. Configure Django S3 mode and worker S3 mode with the same bucket, distinct
   credentials, HTTPS internal URL, token, and secure-connections switch. Restart
   Django and workers using the deployment supervisor. Apply any already-approved
   SCRUM-119 processing migrations before starting a SCRUM-119 worker build.
5. Verify both liveness and readiness endpoints. Upload a test document as a real
   user; confirm its API response contains no object key, reaches `READY`, and
   notes/quiz/retrieval can use the persisted chunks. Restart or replace the
   backend and worker processes, then confirm the stored document still resolves
   and a new processing job can read it. Confirm a foreign user still receives 404.
6. Keep the old media backup until object counts, hashes, and application behavior
   are verified. Roll back by restoring the prior storage settings and keeping
   the old files. Coordinate any uploads made after cutover before rollback.

SCRUM-119 is already on `development` and provides durable terminal callback
staging and delivery tracking. This branch does not duplicate that mechanism.
The PR must preserve SCRUM-119's `serialize_callback` and execution-store logic
when the overlapping processing files are integrated. Existing Celery late
acknowledgement still covers worker crash redelivery, subject to Redis
durability and visibility-timeout configuration.

## Troubleshooting

- **Readiness reports storage unavailable:** verify bucket name, endpoint TLS
  trust, region, role/key permissions, and bucket policy. The probe does not
  reveal provider errors in its response.
- **Upload returns `UPLOAD_UNAVAILABLE`:** inspect backend logs without printing
  credentials; check storage reachability and write permission. No job is sent
  when storage save fails.
- **Worker cannot fetch an object:** verify its read-only bucket access, the
  matching bucket/endpoint, internal HTTPS URL, and shared service token. The
  worker retries temporary object and transport failures with its existing
  bounded retry policy.
- **Old documents fail after cutover:** rerun the dry-run copy command against
  the original media root and investigate missing or mismatched SHA-256 records.
- **Callback remains pending after an outage:** check the deployed SCRUM-119
  recovery version and its execution database; do not publish duplicate jobs
  blindly.
