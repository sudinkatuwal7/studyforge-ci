# StudyForge — Sprint 2 Document Processing Service Contract v1.0

Status: **APPROVED — Architecture agreed; implementation decisions remain open**

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

The agreed task envelope contains the following fields; its exact wire format remains open:

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

The existing task accepts only `document_id`. Introducing this envelope is an internal integration change, not existing behavior. Old and new workers must not consume incompatible messages during migration. Task naming, routing, and cutover must be agreed before dispatch changes.

### 5.2 Internal Django endpoints

**These interfaces are part of the agreed architecture, not existing implemented endpoints.** Exact API schemas and authentication details still require agreement. All three are hosted by Django and called by the processing service.

| Method and planned path | Intended behavior |
|---|---|
| `GET /internal/v1/jobs/{job_id}/document` | Authenticate the service, authorize the job, resolve its Document, and return the private source PDF. |
| `POST /internal/v1/jobs/{job_id}/status` | Accept an authorized, correlated execution update and apply an allowed application Job/Document transition. A status-only callback cannot independently mark a document `READY`. |
| `POST /internal/v1/jobs/{job_id}/result` | Validate a correlated result, atomically persist application results, and set the successful application Job/Document state. |

Exact request/response schemas, HTTP status codes, headers, content types, payload limits, timeouts, and authentication format are unresolved. Result data must represent page count and ordered page-aware chunks with their embeddings; agree validation and ordering rules that preserve current 768-dimensional storage and study-guide reading order.

### 5.3 End-to-end flow

1. Django authenticates the student, checks course ownership, validates the PDF, and commits the stored source, Document, and application Job.
2. Django publishes the processing message. The browser retains the existing upload response and polls Django's existing status endpoint.
3. The worker validates the message and claims or resumes the correlated execution record without creating another logical run for a duplicate delivery.
4. The worker retrieves the PDF from the authenticated internal Django endpoint and verifies the source hash before processing.
5. The worker reports processing status, extracts text, performs page-aware chunking, and generates embeddings.
6. The worker delivers results to Django. Django validates the current job/source and atomically replaces chunks, persists page count and embeddings, updates the application Job, and marks Document `READY`.
7. The worker records successful delivery only after Django confirms persistence. Failure and uncertain-response handling follow section 6.

## 6. Status, security, and reliability requirements

These are agreed integration requirements; they are not claims about completed service behavior. Specific policies explicitly identified below remain open.

### 6.1 Status lifecycle and persistence

```text
PENDING -> PROCESSING -> READY or FAILED
PENDING -> FAILED      (definite upload-side dispatch failure)
```

Django remains the source of truth for public status. `READY` is set only after processing results have been successfully persisted in the application database. Result replacement, relevant application Job updates, and the `READY` transition must share one application transaction. A partial result must not appear as ready to downstream features.

Proposed application Job mapping is `QUEUED -> RUNNING -> SUCCEEDED or FAILED`; exact retry and attempt synchronization requires approval. Internal delivery/execution states must not introduce new public Document status values.

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
- Validate callbacks against the current authorized run/source. Reject or safely ignore stale callbacks from superseded runs and out-of-order updates that would regress a terminal state.
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

The ticket-level responsibilities below reflect team agreement reported by Sudin on October 14, 2026. This records architecture-level agreement, not verified Jira completion or changes to Jira acceptance criteria. The explicitly unconfirmed integration assignments remain open.

| Ticket | Owner | Responsibility and boundary |
|---|---|---|
| SCRUM-97 | Sudin Katuwal | Independent service scaffold, execution database, configuration, health check, and Docker Compose foundation. Agree the execution schema with Sanish; do not implement worker extraction or teammate authorization work here. |
| SCRUM-99 | Nischal Rimal | Internal service authentication, authorization, and proposed Django-side integration. The specific integration responsibilities below still need confirmation. |
| SCRUM-100 | Sanish Shrestha | Secure internal PDF retrieval, coordinated with Nischal's authentication/authorization mechanism. |
| SCRUM-108 | Sanish Shrestha | Independent worker execution, extraction/chunking/embedding, execution attempts/retries, and status/result delivery. Reuse the agreed SCRUM-97 foundation. |
| SCRUM-106 | Sudin Katuwal | Multi-format upload and extraction after the existing PDF pipeline is stable. Supported formats, validation, extraction ownership, and compatibility require separate agreement. |

The following responsibilities remain explicitly **unconfirmed**:

| Integration responsibility | Confirmation required |
|---|---|
| Django dispatch integration | Who changes publication to the agreed task envelope/queue and manages compatibility and cutover? |
| Internal callback handling | Who implements Django status/result receivers, job correlation, and stale/duplicate callback handling? |
| Atomic result persistence | Who validates and persists chunks/embeddings/page count with application Job and Document transitions in one transaction? |

SCRUM-99's proposed integration scope does not automatically assign all three items to Nischal. Confirm them with Nischal and Sanish before coding. Coordinate application knowledge changes with the existing knowledge owner and verify study-guide consumers remain compatible.

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
- [ ] Django validates and atomically persists results, including ordered chunks, embeddings, page count, and application Job state.
- [ ] Document reaches `READY` only after successful persistence, and the existing status API exposes the result correctly.
- [ ] Study-guide content retrieval and generation continue working from persisted application chunks.
- [ ] Unauthorized users/services and mismatched job/document requests are rejected; private PDFs and other users' resource existence are not disclosed through public APIs.
- [ ] Duplicate/concurrent jobs, repeated results, stale callbacks, and conflicting source identities are handled without duplicate committed results or status regression.
- [ ] Definite and uncertain dispatch failures, processing failures, delivery failures, worker crashes, and recovery paths are exercised with safe public errors.
- [ ] Docker Compose starts the agreed components using the existing PostgreSQL/Redis infrastructure and the isolated processing database; startup/health checks and existing-volume setup work without data deletion.
- [ ] Relevant upload/status, ownership, processing, internal-interface, database-isolation, study-guide, and end-to-end tests pass, with results recorded during implementation.

## 11. Current implementation gaps and risks

| Current implementation | Proposed change or integration risk |
|---|---|
| Worker imports application models and opens shared storage | Replace these dependencies with execution-database access and authenticated internal PDF/result interfaces. Packaging the current worker alone would retain the coupling. |
| Task accepts one positional document ID | New versioned job envelope requires coordinated publisher/consumer changes. |
| Worker does not advance application Job records | Agree execution-to-application Job synchronization rather than introducing two competing status authorities. |
| Worker directly commits chunks and `READY` | Move application writes into the Django result receiver while preserving their atomicity. |
| Internal endpoints and service authentication are absent | SCRUM-99/100/108 and confirmed Django integration ownership are prerequisites for cutover. |
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

Architecture approval does not resolve the following decisions. No values or additional owners have been inferred from the confirmation:

1. **Queue and task names:** routing, message version representation/signature, and old/new worker cutover.
2. **Internal authentication mechanism:** credentials, operation permissions, job scoping, transport protection, and rotation.
3. **Exact internal API schemas:** request/response fields, HTTP behavior, chunk ordering, source/result validation, embedding dimensions, and payload limits.
4. **Retry and recovery policy:** retry bounds, acknowledgement/claim behavior, duplicate and stale updates, durable result retention, reconciliation, and deleted-document handling.
5. **Django dispatch and callback integration ownership:** explicitly assign dispatch adaptation, internal callback handling, and atomic result persistence; confirm application Job synchronization.
6. **SCRUM-106 scope and compatibility:** supported formats, upload limits/validation, extraction ownership, and preservation of the existing PDF contract.

Record the agreed values and owners here as these decisions are resolved, before implementing the dependent interfaces or switching processing traffic. The end-to-end checklist remains pending; this approval update changes documentation only.
