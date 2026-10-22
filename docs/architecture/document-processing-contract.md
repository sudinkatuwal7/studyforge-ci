# StudyForge — Sprint 2 Document Processing Service Contract v1.0

Status: **APPROVED — Architecture and SCRUM-118 integration contract agreed; recovery decisions remain open**

## SCRUM-106 format extension

Sanish approved extending source retrieval MIME handling, extraction dispatch,
normalized results, Office handlers, and minimum chunk/location compatibility.
The Celery task, queue, retries, service authentication, Job lifecycle, callback
delivery, and atomic callback persistence retain the SCRUM-108/SCRUM-118 design.

Validated PDF, DOCX, and PPTX files retain their stored suffix. Django serves the
source with server-controlled canonical MIME; the worker checks identity, size,
and SHA-256 before dispatching to the matching parser. Parsers produce ordered
text units for the shared chunker and embedding client. PDF units are pages,
PPTX units are slides, and DOCX is one ordered unpaginated unit. PPTX slide titles
and DOCX heading/table markers are included in persisted text. Speaker notes and
image-only content are outside extraction. Empty text is rejected by the existing
callback contract and becomes a controlled processing failure.

The callback's legacy `page_count` is an actual PDF page count, PPTX slide count,
or null for DOCX. `Chunk.page_number` means PDF page or PPTX slide; its required
value of 1 for DOCX is internal schema compatibility and must not be rendered as
a Word page citation. No migration or metadata JSON is needed.

The SCRUM-118 clarification supplied by Sanish on October 17, 2026 is recorded
in section 15. It supersedes earlier open ownership questions and the original
HTTP 200 handling of stale/terminal callbacks described in section 14.

Approval recorded: **October 14, 2026**, based on Sudin Katuwal's confirmation of team agreement.

Sprint: **October 14–30, 2026**

Reviewers:

- Sudin Katuwal
- Nischal Rimal
- Sanish Shrestha

## 1. Purpose and approval scope

This document records the agreed Sprint 2 architecture for an independently deployable Document Processing service. Sudin Katuwal confirmed team agreement on October 14, 2026. Approval covers the architectural direction and ticket-level responsibilities described here; it does not supply answers to the explicitly unresolved implementation decisions in section 12 or claim completed implementation.

Only Document Processing becomes an independent deployable service during Sprint 2. Authentication, courses, study guides, quizzes, AI retrieval, and the main application remain within the existing Django/DRF backend. Listing a responsibility here does not imply that the corresponding feature is already implemented.

This contract supplements the existing [architecture](../architecture.md), [public API contract](../api-contract.md), and [database schema](../database-schema.md). It does not authorize changes to the existing public API contracts.

## 2. Verified current implementation

The following describes repository source inspected on October 13, 2026. It is not a claim that runtime or end-to-end tests were executed for this document.

| Area | Existing behavior and source |
|---|---|
| Upload and status | Django exposes `POST /api/v1/courses/{id}/documents/` and `GET /api/v1/documents/{id}/`. Both require JWT authentication and ownership checks. Missing and foreign-owned resources receive the same 404 response. See [views](../../backend/apps/documents/views.py) and [routes](../../backend/apps/documents/urls.py). |
| Public representation | Upload returns a `201` creation snapshot with `PENDING`. Upload and retrieval use `id`, `course_id`, `name`, `status`, `created_at`, `updated_at`, and `error`. See [serializer](../../backend/apps/documents/serializers.py) and [upload service](../../backend/apps/documents/services.py). |
| Upload validation | Exactly one PDF is accepted, with a maximum file size of 20 MiB (20,971,520 bytes), inclusive. Validation checks PDF structure without extracting text. See [validation](../../backend/apps/documents/validation.py) and [views](../../backend/apps/documents/views.py). |
| Application records | Document has User and Course foreign keys; Job has a Document foreign key. Upload creates both records before dispatch. See [models](../../backend/apps/documents/models.py) and [upload service](../../backend/apps/documents/services.py). |
| Task publication | Django publishes `apps.processing.tasks.process_document_task` with one positional `document_id` after the database transaction commits. Publication retries are disabled and Celery results are ignored. See [dispatch](../../backend/apps/documents/dispatch.py). |
| Worker coupling | The worker loads application Document and Chunk models, opens `Document.file` through Django storage, generates chunks and embeddings, and writes directly to the application database. Chunk replacement and the `READY` transition share a transaction. See [processing service](../../backend/apps/processing/services.py). |
| Retries and Job tracking | The task allows three retries after the initial attempt, with a 60-second retry delay. The worker updates Document status but does not advance application Job status or attempts. See [tasks](../../backend/apps/processing/tasks.py), [constants](../../backend/apps/processing/constants.py), and [upload service](../../backend/apps/documents/services.py). |
| Knowledge and study guides | Chunk has Document and User foreign keys and a 768-dimensional embedding field. Study-guide content retrieval reads `document.chunks` ordered by page number and primary key. See [Chunk model](../../backend/apps/knowledge/models.py) and [notes selectors](../../backend/apps/notes/selectors.py). |
| Storage and deployment | Private uploads use `MEDIA_ROOT`; no public media route is registered. Compose currently starts only PostgreSQL 16 with pgvector and Redis 7. See [settings](../../backend/config/settings.py), [root routes](../../backend/config/urls.py), and [Compose](../../docker-compose.yml). |

Current flow:

```text
Browser -> Django upload -> private PDF + Document + Job
                         -> Redis/Celery -> existing worker
                                           -> shared Django storage and models
                                           -> application chunks and status
Browser -> Django status API -> application database
```

The internal endpoints designed in section 5 are not present in the inspected routes. Older documentation may describe earlier implementation stages; the source references above establish this contract's implementation baseline as of the inspection date.

## 3. Approved service boundary

| Existing Django application retains | Independent processing service owns |
|---|---|
| Authentication, users, courses, and ownership checks | PDF text extraction |
| Public document upload and status APIs | Page-aware chunking |
| Private source-document storage | Embedding generation |
| Document and application Job records | Processing execution, attempts, retries, and internal errors |
| Chunk and embedding persistence | Secure source retrieval and authenticated status/result delivery |
| Study guides, quizzes, and AI retrieval | Its own configuration and execution database |

Django remains the owner of application data and the source of truth for public document status. The processing service computes results and submits them to Django; it does not directly persist application Chunk rows or update application Document/Job rows.

Keeping chunks and embeddings in Django preserves the current study-guide content queries. Extracting knowledge storage or AI retrieval into another service is outside this contract.

The application Job identifies one logical processing run. The service execution record tracks execution of that run, including attempts and delivery state. They are distinct records with explicit correlation, not independently editable sources of public status. The precise execution schema and application Job update rules require agreement.

## 4. Approved database ownership

Reuse the existing PostgreSQL server and provision a separate logical database with restricted credentials for the processing service. Another PostgreSQL server/container is not required for the initial implementation.

- The service owns its execution tables and migrations.
- Its credentials must not grant access to application tables or database administration privileges.
- Store external application `job_id` and `document_id` values as identifiers, without cross-service foreign keys.
- Do not import Django application models, query application tables, or share the application's migration ownership with the service.
- Existing foreign keys among User, Course, Document, application Job, Chunk, and StudyGuide remain within the application database.
- Do not duplicate users, courses, source-document storage, or application vector tables in the execution database.
- Database names, credential configuration, execution fields, and provisioning commands remain implementation details requiring review.

Separate logical databases still share PostgreSQL server availability and resources. Provisioning must work with existing development volumes: the current [initialization SQL](../../infrastructure/postgres/init.sql) runs only when the PostgreSQL volume is first created. Setup must not require deleting existing data.

## 5. Agreed communication design

### 5.1 Job submission

Django validates and stores the upload, creates Document and application Job records, commits the transaction, and then publishes a task through the existing Redis/Celery infrastructure.

The architecture's illustrative task envelope contains the following fields;
its exact wire format remains open:

| Field | Meaning |
|---|---|
| `schema_version` | Version of the processing message schema; unsupported versions must not execute silently. |
| `job_id` | Application Job ID; the correlation and idempotency key for a logical processing run. |
| `document_id` | Application Document ID associated with that Job. |
| `source_sha256` | Expected SHA-256 of the stored source PDF. |

Illustrative payload only; exact encoding, version representation, task signature, queue, and task name require approval:

```json
{
  "schema_version": 1,
  "job_id": 101,
  "document_id": 42,
  "source_sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

The current Django publisher sends `job_id`, `document_id`, and
`source_sha256` as positional arguments to
`processing_service.tasks.process_document_task` on the
`document-processing` queue; the queue message does not yet carry
`schema_version`. This is an internal integration change. Old and new workers
must not consume incompatible messages during migration.

### 5.2 Internal Django endpoints

These interfaces are part of the agreed architecture. All are hosted by Django
and called by the processing service; implementation status and remaining schema
decisions are noted below.

| Method and planned path | Intended behavior |
|---|---|
| `GET /internal/v1/jobs/{job_id}/document/` | Authenticate the service, authorize the job, resolve its Document, and return the private source PDF. **Implemented:** shared bearer token; PDF stream includes document ID and source SHA-256 headers. |
| `POST /internal/v1/jobs/{job_id}/result/` | **Implemented:** authenticate, validate the versioned status/result envelope and source correlation, then atomically persist chunks/page count and Job/Document state. The same endpoint accepts `RUNNING`, `SUCCEEDED`, and `FAILED`. |

The standalone task verifies the returned document ID and source hash and checks
the PDF body digest before processing. The shared `PROCESSING_SERVICE_TOKEN`
must be set independently in Django and the processing workers. Internal
endpoints return 503 if Django has no token configured and 401 for invalid
credentials. Result callbacks require `schema_version: 1`, matching `job_id`,
`document_id`, and `source_sha256`, and an attempt number. Success payloads
include page count, scan indicator, and page-aware chunks with finite
768-dimensional embeddings. The receiver rejects payloads over 2 MiB. Use
HTTPS or equivalently protected private transport outside local development.

### 5.3 End-to-end flow

1. Django authenticates the student, checks course ownership, validates the PDF, and commits the stored source, Document, and application Job.
2. Django publishes the processing message. The browser retains the existing upload response and polls Django's existing status endpoint.
3. The worker validates the message and claims or resumes the correlated execution record without creating another logical run for a duplicate delivery.
4. The worker retrieves the PDF from the authenticated internal Django endpoint and verifies the source hash before processing.
5. The worker posts `RUNNING`, extracts text, performs page-aware chunking, and generates embeddings.
6. The worker posts `SUCCEEDED` with the results or `FAILED` with a safe error code. Django validates the current job/source and atomically replaces chunks, persists page count and embeddings, updates the application Job, and marks Document `READY`.
7. Repeated terminal callbacks are acknowledged without duplicate chunks or status regression. Callback delivery uses the task's bounded Celery retry policy; the service does not yet durably stage results for recovery after prolonged Django outages.

## 6. Status, security, and reliability requirements

These are agreed integration requirements; they are not claims about completed service behavior. Specific policies explicitly identified below remain open.

### 6.1 Status lifecycle and persistence

```text
PENDING -> PROCESSING -> READY or FAILED
PENDING -> FAILED      (definite upload-side dispatch failure)
```

Django remains the source of truth for public status. `READY` is set only after processing results have been successfully persisted in the application database. Result replacement, relevant application Job updates, and the `READY` transition must share one application transaction. A partial result must not appear as ready to downstream features.

Application Job mapping is `QUEUED -> RUNNING -> SUCCEEDED or FAILED`. Django tracks the greatest callback attempt number received. Internal delivery/execution states do not introduce new public Document status values.

### 6.2 Authentication and authorization

- Authenticate every internal PDF, status, and result request using an agreed service mechanism. An internal-looking URL or knowledge of an ID is not authorization.
- Keep user JWT authentication and document/course ownership enforcement in Django. User tokens do not replace service authentication for these endpoints.
- Django must validate the authenticated service's permission for the requested operation and the job/document association. Never trust a callback's supplied owner or course.
- Use a configured Django base URL and job-derived source endpoint; do not accept arbitrary source URLs or expose private storage paths.
- Protect credentials and PDF/result data in transit outside trusted local development. Keep secrets out of source control, logs, and public responses.
- Reject unauthorized internal calls before releasing PDF bytes or changing state. Exact internal error responses remain subject to schema approval.

### 6.3 Idempotency, duplicate delivery, and stale callbacks

- Correlate task execution, PDF access, callbacks, and logs using the application `job_id`, associated `document_id`, and expected source hash.
- Enforce one logical service execution per application Job. Duplicate or concurrent deliveries must not produce duplicate committed results or parallel ownership of the same execution.
- Reusing a job ID with conflicting document/source data must be rejected rather than silently overwriting the previous execution.
- Repeated result delivery after a lost HTTP response must recognize an already committed result without inserting duplicate chunks or regressing status.
- Validate callbacks against the current authorized run/source. The Django receiver rejects source mismatches, older jobs, older attempts, and conflicting terminal callbacks with HTTP 409. Only an identical terminal callback for the current job and attempt receives an idempotent acknowledgement.
- The result receiver uses one bounded callback (2 MiB maximum). Larger results fail explicitly; durable batched staging is not implemented.
- A new intentional processing run requires its own application Job. The rule for identifying the current run and resolving concurrent runs must be agreed.
- A deleted or unavailable document must not be recreated by a late callback. Agree cancellation and execution-record retention behavior.

### 6.4 Retries, errors, and crash recovery

- Preserve the existing distinction between definite dispatch failure and an unconfirmed handoff. A failed send response may follow successful publication; do not infer processing failure or blindly create another run.
- Preserve existing public errors: `PROCESSING_DISPATCH_FAILED` for definite dispatch failure, `PROCESSING_HANDOFF_UNCONFIRMED` for uncertain handoff, and `PROCESSING_FAILED` for terminal processing failure. Keep the saved document ID available in existing handoff-error responses.
- Use bounded retries for transient source-fetch, processing, and callback failures. Permanent input/authorization failures need explicit handling rather than unlimited retries. Exact limits, delays, and classifications require approval.
- Separate processing failure from result-delivery failure. Retain sufficient durable execution/result state to retry delivery after an ambiguous response or restart without unnecessarily repeating embedding generation.
- Recover interrupted work and abandoned claims after worker crashes. Agree acknowledgement behavior, claim expiry, and recovery scheduling; a Celery task retry alone does not cover every process crash.
- Provide reconciliation for commit-before-publish crashes, lost/unconfirmed submissions, and callbacks that remain undelivered. Define an operator or automated recovery path so jobs do not remain pending or processing indefinitely.
- Public responses must contain only agreed safe error codes/messages, never raw exceptions, credentials, PDF contents, filesystem paths, or broker details.
- Recovery mechanisms, durable result retention, and their implementation owner must be agreed before production cutover; this contract does not select additional infrastructure.

## 7. Compatibility and migration constraints

Preserve the existing public contract while integrating the service:

- Keep the public upload and document/status endpoint paths, HTTP behavior, seven-field response, uppercase statuses, and `Cache-Control: no-store` behavior.
- Keep JWT authentication, course/document ownership checks, and privacy-preserving 404 responses for missing and foreign-owned resources.
- Preserve the 20 MiB inclusive PDF limit and current validation/privacy requirements. SCRUM-106 must not silently relax these rules or change existing PDF responses.
- Preserve the `201` upload creation snapshot with `PENDING`, even when processing advances before the next status request.
- Keep the current PDF processing path operational until service authentication, source retrieval, worker execution, callbacks, result persistence, and relevant tests are integrated.
- Preserve application Chunk relationships and study-guide content retrieval. Document ownership must remain consistent with course ownership; current document status and notes selectors use different ownership paths.
- Coordinate routing/cutover so old and new workers do not race to update the same document through incompatible paths. Agree rollback behavior before switching live dispatch.

This documentation change does not modify existing APIs or authorize implementation of another teammate's tasks.

## 8. Deployment foundation

Use Docker Compose with the existing PostgreSQL and Redis infrastructure initially. Add the independent service runtime and its configuration through subsequent approved implementation work. Kubernetes is not a prerequisite for the first working implementation.

The foundation should provide an independent build/start configuration, execution-database migrations, restricted database credentials, documented environment variables, and a health/readiness check that accurately reports the dependencies it checks. The service must not require importing the main application to start or migrate.

Current Compose defines only database and Redis services; it does not already start the independent worker. Redis has no explicit persistent volume in the current Compose file. Queue durability and recovery expectations need review before relying on restart recovery. Reusing infrastructure does not imply that recovery is already configured.

## 9. Team responsibilities and open integration ownership

The ticket-level responsibilities below include Sanish's October 17 clarification
relayed by Sudin. This records agreed ownership, not verified Jira completion.

| Ticket | Owner | Responsibility and boundary |
|---|---|---|
| SCRUM-97 | Sudin Katuwal | Independent service scaffold, execution database, configuration, health check, and Docker Compose foundation. Agree the execution schema with Sanish; do not implement worker extraction or teammate authorization work here. |
| SCRUM-99 | Nischal Rimal | Shared service authentication and authorization; verification is centralized under `backend/apps/identity/service_auth.py` using the existing `PROCESSING_SERVICE_TOKEN`. |
| SCRUM-100 | Sanish Shrestha | PDF-fetch client and source integrity checks, using the existing authenticated document endpoint. |
| SCRUM-108 | Sanish Shrestha | Independent worker execution, extraction/chunking/embedding, execution attempts/retries, and status/result delivery. Reuse the agreed SCRUM-97 foundation. |
| SCRUM-118 | Sudin Katuwal | Django-side job lifecycle, callback validation, and atomic result persistence. Extend SCRUM-108's merged dispatch and handlers rather than introducing duplicate components. |
| SCRUM-106 | Sudin Katuwal | Multi-format upload and extraction after the existing PDF pipeline is stable. Supported formats, validation, extraction ownership, and compatibility require separate agreement. |

Dispatch and both internal routes already exist in merged SCRUM-108. SCRUM-118
extends those handlers and owns callback correlation, lifecycle, and persistence.
SCRUM-99 retains shared authentication ownership. Worker retry changes remain
with SCRUM-108 and fetch/integrity changes remain with SCRUM-100.

Potential duplication to avoid:

- SCRUM-97 and SCRUM-108 must share one service foundation and execution schema.
- SCRUM-99 and SCRUM-100 must share one internal authorization mechanism rather than independently defining credentials or permission rules.
- SCRUM-106 extraction work overlaps the processing code owned under SCRUM-108; agree extension points and ownership before adding formats.

SCRUM-97's three-hour foundation estimate does not include completing this entire end-to-end migration. Its foundation increment is scaffold, database/model/migration, configuration, health check, Compose foundation, and setup verification while existing dispatch remains active. This document does not claim that Jira acceptance criteria have been updated or that implementation has started.

## 10. End-to-end Definition of Done

This checklist applies to the integrated Sprint 2 processing service, not to SCRUM-97 alone. All items are pending; this document records no test results.

- [ ] Existing authenticated PDF upload works with unchanged validation, file-size limit, response shape, and initial status behavior.
- [ ] Django commits Document and application Job before dispatching the agreed correlated processing message.
- [ ] The independent worker starts without application-model imports or access to application tables and securely retrieves the correct PDF through Django.
- [ ] The worker verifies the source hash and performs extraction, page-aware chunking, and embedding generation.
- [x] Django validates and atomically persists results, including ordered chunks, embeddings, page count, and application Job state.
- [x] Document reaches `READY` only after successful persistence, and the existing status API exposes the result correctly.
- [ ] Study-guide content retrieval and generation continue working from persisted application chunks.
- [x] Unauthorized processing-service callbacks and mismatched job/document/source requests are rejected without state changes.
- [ ] Duplicate/concurrent jobs, repeated results, stale callbacks, and conflicting source identities are handled without duplicate committed results or status regression.
- [ ] Definite and uncertain dispatch failures, processing failures, delivery failures, worker crashes, and recovery paths are exercised with safe public errors.
- [ ] Docker Compose starts the agreed components using the existing PostgreSQL/Redis infrastructure and the isolated processing database; startup/health checks and existing-volume setup work without data deletion.
- [ ] Relevant upload/status, ownership, processing, internal-interface, database-isolation, study-guide, and end-to-end tests pass, with results recorded during implementation.

## 11. Implementation gaps and risks at the inspection baseline

This table describes the original implementation baseline. The SCRUM-97
foundation delivery is recorded separately in section 13.

| Current implementation | Proposed change or integration risk |
|---|---|
| Legacy worker imports application models and opens shared storage; standalone worker now uses execution-service code and authenticated PDF retrieval | Result callbacks, execution lifecycle, and cutover remain. Packaging the legacy worker alone would retain the coupling. |
| Task accepts one positional document ID | New versioned job envelope requires coordinated publisher/consumer changes. |
| Worker does not advance application Job records | Agree execution-to-application Job synchronization rather than introducing two competing status authorities. |
| Worker directly commits chunks and `READY` | Move application writes into the Django result receiver while preserving their atomicity. |
| Authenticated internal PDF retrieval and a standalone extraction/chunking/embedding task exist; status/result callbacks and publisher cutover are absent | Result delivery, execution lifecycle, and coordinated dispatch/cutover remain prerequisites for production processing. |
| Compose starts only PostgreSQL and Redis | Service runtime/configuration and separate logical database provisioning are new work. |
| Existing study guides depend on application chunks | Preserve content ordering and ownership; moving chunk storage would require a separate contract beyond this architecture. |
| Current public upload accepts PDF only | SCRUM-106 must follow a stable PDF integration and agree multi-format compatibility with worker and public API owners. |

## 12. Team approval and unresolved decisions

Status: **APPROVED — Architecture agreed; implementation decisions remain open**.

Sudin Katuwal confirmed that his teammates agreed to the contract and requested this update on October 14, 2026. The record below is based on that confirmation; it does not claim separate direct sign-offs or individual approval timestamps from Nischal or Sanish.

| Reviewer | Architecture approval | Record |
|---|---|---|
| Sudin Katuwal | Approved | Recorded October 14, 2026 through his request to update the agreed contract. |
| Nischal Rimal | Approved, as reported by Sudin | Team agreement recorded October 14, 2026. |
| Sanish Shrestha | Approved, as reported by Sudin | Team agreement recorded October 14, 2026. |

Architecture approval did not originally resolve the following decisions. Local
implementation now records some of those choices in section 14; unimplemented
items remain open.

1. **Queue and task names:** routing, message version representation/signature, and old/new worker cutover.
2. **Internal authentication mechanism:** shared bearer token is implemented for PDF retrieval and result callbacks; production transport protection and token rotation remain open.
3. **Exact internal API schemas:** local callback schema, validation, and 2 MiB limit are recorded in section 14; other request/response details remain open.
4. **Retry and recovery policy:** task retries and duplicate/stale callback handling are implemented locally; durable result retention, execution claims, reconciliation, and deleted-document handling remain open.
5. **Django dispatch and callback integration ownership:** resolved by the SCRUM-118 clarification; see sections 9 and 15.
6. **SCRUM-106 scope and compatibility:** supported formats, upload limits/validation, extraction ownership, and preservation of the existing PDF contract.

Record the agreed values and owners here as these decisions are resolved, before implementing the dependent interfaces or switching processing traffic. The end-to-end checklist remains pending; this approval update changes documentation only.

## 13. SCRUM-97 foundation delivery

The SCRUM-97 foundation is **complete locally and team-approved**. It includes
the independent service scaffold, configuration, execution database and migration,
restricted database role, health/readiness probes, opt-in Compose setup, and
verification and handoff instructions. See the
[service guide, recorded verification, and completion checklist](../../services/document-processing/README.md).

Verification passed: nine service tests, isolated Compose startup, repeat
provisioning, application-table access denial, restart persistence, dependency
outage behavior, and the existing backend suite of 219 tests and 36 subtests.

The original SCRUM-97 scope did not include the integrated worker path. The
subsequent local SCRUM-108 integration state and its remaining gaps are recorded
in section 14. Commit, push, pull request, merge, and Jira workflow updates have
not been performed as part of this local delivery.

## 14. Local dispatch and result callback integration

As of October 16, 2026, Django's upload path publishes the standalone task with
`job_id`, `document_id`, and `source_sha256` to `document-processing`. The
workers post a versioned JSON envelope to
`POST /internal/v1/jobs/{job_id}/result/`, authenticated with the shared bearer
token:

- `RUNNING` transitions the application Job to `RUNNING` and Document to
  `PROCESSING`, recording the greatest attempt number observed.
- `SUCCEEDED` includes `page_count`, `likely_scanned`, and ordered chunks with
  page number, content, and a finite, nonzero 768-value embedding. Django
  validates all fields and atomically replaces the Document's chunks, sets `page_count`,
  Job `SUCCEEDED`, and Document `READY`.
- `FAILED` accepts only the safe `PROCESSING_FAILED` code and sets the
  application Job/Document to `FAILED`.

Embedding compatibility is part of the retrieval contract: document chunks and
questions use the same `gemini-embedding-2` model with 768 output dimensions.
That model does not use the legacy `task_type` parameter; changing models
requires re-embedding existing chunks before comparison, as described in the
[Gemini Embeddings guidance](https://ai.google.dev/gemini-api/docs/embeddings).
Retrieval's optional
cosine-similarity cutoff remains disabled until it is calibrated against labeled
production-like queries; boundary tests do not establish a reliable cutoff.

### SCRUM-16 internal retrieval contract (not a public endpoint)

[`retrieve_chunks`](../../backend/apps/knowledge/retrieval.py) has the signature
`retrieve_chunks(user, document_id: int, question: str, top_k: int = 5) -> list[dict]`.
Its caller must supply a trusted authenticated User; the function does not
authenticate requests. `document_id` must be positive, `question` nonempty after
trimming, and `top_k` an integer from 1 through 10. Missing, non-owned, or
non-`READY` selected documents all raise `Http404` before the Gemini call.
The SQL candidate set requires matching Chunk and Document owners, the selected
document, `READY` status, a non-null vector, and finite cosine distance before
ordering by distance and chunk ID and applying top-K. A successful search with
no eligible chunks returns `[]`; Gemini/provider failures remain errors.

Each retrieval result has `chunk_id`, `document_id`, `page_number`, `content`,
and `score`, where `score = 1 - cosine_distance`. The planned JSON schemas in
[`serializers.py`](../../backend/apps/knowledge/serializers.py) specify a query
with `question` and 1-20 distinct selected `document_ids`, retrieval results,
citations (`chunk_id`, `document_id`, `page_number`, `excerpt`), and either an
`ANSWERED` response with citations or `INSUFFICIENT_CONTEXT` with no answer.
The internal retrieval function searches one document; no multi-document
adapter, RAG endpoint, or answer generator is implemented here. Citation
validation requires an authorized-document allowlist derived from owner-scoped
selection, never from an untrusted answer. The serializer uses Django
`models.TextChoices`; its JSON/citation tests pass in the ai-learning suite.

The stored Chunk schema records 768 values but not the producing model/version.
Compatibility with the configured Gemini model is an operational assumption,
not proven for legacy rows by their dimension. The optional similarity cutoff
is disabled by default. Production calibration remains unverified and requires
labeled queries and measured retrieval quality before assigning a threshold.
Focused tests mock Gemini; they are not live-provider compatibility tests.

Callbacks are limited to 2 MiB, reject mismatched job/document/source identity,
ignore callbacks for older jobs or attempts, and acknowledge
repeated terminal callbacks without rewriting chunks or regressing state.
Focused backend document tests passed with 122 tests and 22 subtests; the
disposable service Compose verification passed with 39 service tests in each
worker and confirmed both workers register and consume the task queue.

This is not yet production cutover approval. The service Execution model is not
yet used to claim tasks or durably stage results. A prolonged Django outage,
an oversized single-callback result, or worker crash can therefore leave an
application Job in `PROCESSING`; recovery/reconciliation and retry cost
behavior still need work and end-to-end failure testing. The shared token also
requires protected transport and rotation outside local development. The
legacy worker implementation remains in the repository but upload dispatch now
targets the standalone task.

## 15. SCRUM-118 callback contract

Sanish's clarification supplied by Sudin on October 17, 2026 confirms the ownership
in section 9 and the following contract. SCRUM-118 builds on the merged
SCRUM-108 implementation, retaining the task arguments, queue, and both routes:

- `GET /internal/v1/jobs/{job_id}/document/`
- `POST /internal/v1/jobs/{job_id}/result/`

Both handlers use `authorize_processing_service` from
`backend/apps/identity/service_auth.py`. The existing bearer header and
`PROCESSING_SERVICE_TOKEN` remain unchanged. An absent server token returns 503;
missing or invalid caller credentials return 401. Shared authentication remains
owned by SCRUM-99; this change moves the existing verification into that module.

### Attempts, lifecycle, and terminal receipts

The callback JSON retains its positive integer `attempt`. One logical job retains
its `job_id` across processing retries. A new processing attempt advances the
number; resending a callback retains its original attempt. Django records the
greatest accepted attempt, never increments it on receipt, and rejects older
attempts. Repeated `RUNNING` callbacks do not increment attempts. As in the merged
implementation, a terminal callback may arrive directly from `QUEUED`; receiving
a prior `RUNNING` callback is not required for safe persistence.

Callbacks lock Document then Job so callbacks for the same document serialize
and use the same lock order as dispatch-failure handling. A newer Job primary key
supersedes every older Job for that document. Stale/conflicting requests make no
changes to chunks, attempts, or public status.

Accepted terminal callbacks store a SHA-256 receipt of their complete validated
JSON, serialized with sorted object keys and consistent separators. JSON whitespace
and object key order do not affect equality; attempt, status, identity, page count,
scan indicator, ordered chunks, and embeddings do. The receipt, result replacement,
and Job/Document transitions commit in one transaction. Exact redelivery returns
`{"status":"duplicate"}` without rewriting chunks or timestamps.

Apply `documents.0002_job_terminal_callback_sha256` before serving updated code.
Existing jobs retain their states and attempts. Historical terminal jobs have no
receipt, so their callbacks receive `terminal_conflict`; equality cannot safely be
inferred from status or reconstructed from rounded stored vectors. No existing
job is reopened and no data is backfilled speculatively.

### Responses and validation

| HTTP | Body | Meaning |
|---|---|---|
| 200 | `{"status":"applied"}` | Valid callback persisted. |
| 200 | `{"status":"duplicate"}` | Identical terminal callback already persisted for the current job/attempt. |
| 409 | `{"error":"stale_job"}` | A newer Job exists for the document. |
| 409 | `{"error":"stale_attempt"}` | A newer attempt was accepted. |
| 409 | `{"error":"terminal_conflict"}` | Terminal job; callback is not provably identical. |
| 409 | `{"error":"source_mismatch"}` | Document/source does not match the Job. |
| 404 | `{"error":"job_not_found"}` | Job was deleted or does not exist. |
| 400 | `{"error":"empty_extracted_content"}` | Empty chunk list cannot become READY. |
| 400 | `{"error":"<validation_code>"}` | Invalid envelope, chunk, or embedding; no state changes. |
| 413 | `{"error":"callback_too_large"}` | Callback exceeds 2 MiB. |
| 415 | `{"error":"unsupported_content_type"}` | Callback is not JSON. |
| 503 | `{"error":"result_unavailable"}` | Database operation failed and rolled back; delivery may retry. |

The 2 MiB UTF-8 body limit and 1,000-character chunk limit remain inclusive.
Blank chunk content, invalid page references, wrong vector dimensions, and
non-finite vector values are rejected. Owner identity always comes from Document.
The existing SCRUM-108 result client treats 400/409/413 as permanent failures.
On empty or oversized success results, its task submits the safe `FAILED` callback
with `PROCESSING_FAILED`, allowing Django to persist a controlled failure without
a processing retry. An unsuccessful delivery of that failure remains a worker
recovery concern.

### Worker dependency and validation boundary

SCRUM-108 still uses a single Celery retry counter for processing and callback
delivery. Delivery failure currently reruns the task with an incremented attempt;
it does not redeliver the saved callback at its original attempt. The Django
receiver now supports the agreed redelivery semantics, but durable result staging
and separate delivery retries require a SCRUM-108 follow-up. No worker retry or
PDF-fetch implementation is changed by SCRUM-118.

Backend contract tests exercise strict validation, limits, concurrent delivery,
receipt equality, and rollback. Worker integration tests run the existing task,
PDF parser, source-integrity client, and result client against Django's actual
handlers and PostgreSQL. HTTP transport, broker publication, and paid embeddings
are replaced in these tests; they do not claim live Redis delivery or crash recovery.

### Local verification on October 17, 2026

Based on fetched `origin/development` at `4b51c2b` (merged SCRUM-108):

- `backend/venv/Scripts/python.exe scripts/check.py --component backend`:
  **321 tests and 79 subtests passed** against a disposable pgvector/PostgreSQL
  database. Django system checks, migration drift, and fresh migrations passed.
- `backend/venv/Scripts/python.exe services/document-processing/manage.py test processing_service.tests --noinput`:
  **41 tests passed**, using disposable service settings, an in-memory broker,
  and mocked external calls. No real provider keys or application database were used.
- The five worker/Django integration cases cover successful upload through READY,
  duplicate result delivery, empty extraction, superseded work, oversized output,
  and redelivery of the original attempt after a persistence outage.
- `git diff --check` passed.

This completes the local Django scope of SCRUM-118. Joint live-worker validation,
SCRUM-108's separate delivery retry implementation, and the existing recovery
decisions remain distinct from these automated checks.

## 16. SCRUM-99 shared authentication and course ownership

SCRUM-99 keeps two separate credential boundaries and one ownership rule, all
under `backend/apps/identity/`:

| Boundary | Credential | Module | Rejection |
|---|---|---|---|
| Student document API (`/api/v1/...`) | Access JWT for an active user | DRF `JWTAuthentication` | `401 AUTHENTICATION_REQUIRED`, `WWW-Authenticate: Bearer` |
| Internal processing API (`/internal/v1/...`) | `PROCESSING_SERVICE_TOKEN` bearer | `service_auth.authorize_processing_service` | `401 {"error":"unauthorized"}`, `WWW-Authenticate: Bearer realm="studyforge-internal"`; unset server token `503 service_unavailable` |
| Course ownership | Derived from `request.user` only | `ownership.owned_course`, `ownership.owned_documents` | Foreign and missing resources share `404 RESOURCE_NOT_FOUND` |

- Neither credential works across boundaries: the service token is not a JWT,
  and a student JWT never matches the service token.
- The service-token comparison is constant-time. An unset or empty configured
  token fails closed. Rejections log the method and path, never the supplied or
  configured credential.
- Every document list, upload, detail, rename, and delete resolves access through
  `Course.owner` via `apps.identity.ownership`. `Document.owner` alone grants no
  access. Upload ownership is checked before the body is parsed or stored.
- If the identity store is unavailable while authenticating the user or checking
  ownership, the request fails closed with the endpoint's existing 503 code
  (`UPLOAD_UNAVAILABLE` or `MATERIAL_UNAVAILABLE`), exposes no exception detail,
  and causes no storage, database, or dispatch side effect.
- Identity and Courses still share the Django database. When SCRUM-98 removes the
  cross-service foreign keys, `apps.identity.ownership` is the single place to
  replace with an Identity-service call. That call must keep the fail-closed 503 and
  non-disclosing 404 behavior above.
- SCRUM-118's rule that the newest Job primary key supersedes older Jobs remains
  the only current-run rule. SCRUM-99 adds no job-lifecycle constraint.

Verification: `tests/identity/test_service_auth.py` covers credential parsing,
fail-closed configuration, and log redaction.
`tests/documents/test_identity_authorization.py` covers credential separation,
identity-store outages, and the ownership rule. Both run in the full backend suite.
