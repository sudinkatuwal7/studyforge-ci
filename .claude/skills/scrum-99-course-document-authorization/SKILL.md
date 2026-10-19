---
name: scrum-99-course-document-authorization
description: Shared context for SCRUM 99 authorization work in StudyForge. Check current issue scope before applying these notes because SCRUM 99 may refer to internal processing-service authorization in the current project plan.
---

# SCRUM 99: Authorization context

## Purpose

Keep durable task context available to the user and teammates across sessions. Guide implementation and explain the security reasoning as work proceeds. This file is not proof that an implementation decision is approved or that code is complete.

## Start and end each session

1. Read this file and the latest SCRUM 99 acceptance criteria. The issue is the source of truth if its current scope conflicts with older notes here.
2. Inspect the active branch, working tree, and current code before editing. Do not assume prior branch changes are present.
3. Read relevant project contracts, especially `docs/architecture/document-processing-contract.md`, `docs/api-contract.md`, `docs/authentication-design.md`, and `services/document-processing/README.md`.
4. Explain the authorization path and security implications while guiding the task owner through implementation.
   - The task owner prefers hands-on guidance and wants to write the implementation code themselves; do not make code edits on their behalf unless they later ask for that.
5. At session handoff, add newly learned durable, task-relevant context: clarified acceptance criteria, agreed decisions, repository discoveries, pitfalls, and verified progress. Preserve existing useful context. Exclude secrets, tokens, personal data, and transient conversation details. If nothing durable changed, no update is needed.

## Scope distinction to verify

The user initially described SCRUM 99 as protecting student access to their course documents. However, the checked-in `docs/architecture/document-processing-contract.md` assigns SCRUM-99 to **internal processing-service authentication, authorization, and proposed Django-side integration**, with SCRUM-100 providing secure internal PDF retrieval. Confirm the latest Jira issue and team agreement before implementation; do not combine these separate authorization boundaries without an explicit requirement.

## Existing project context

- Student-facing APIs use JWT bearer authentication. Django must still enforce course/document ownership on each public request; a frontend route guard is not a security boundary.
- Internal processing calls are service-to-Django calls. They need service authentication and operation/job authorization. User JWTs do not replace service authentication.
- Architecture says SCRUM-99 and SCRUM-100 must share one internal authorization mechanism rather than independently defining credentials or permission rules.
- The architecture doc lists internal endpoints as planned, with exact authentication format and API schemas still requiring agreement:
  - `GET /internal/v1/jobs/{job_id}/document`
  - `POST /internal/v1/jobs/{job_id}/status`
  - `POST /internal/v1/jobs/{job_id}/result`
- SCRUM-108 owns independent worker execution and status/result delivery, and should reuse the agreed SCRUM-97 foundation. If it already uses a shared bearer service token, coordinate reuse with SCRUM-99/100; do not create another independent credential mechanism. Confirm actual implementation and agreement before claiming the token exists.
- User-provided team coordination clarification: for SCRUM-118, Sudin will make internal endpoints authorize the processing service only for relevant job operations, then reuse the shared internal auth helper centralized by SCRUM-99/100. Treat this as reported team agreement; verify the helper's actual interface/location from the code when it is added.
- Current Django worker code and public document APIs may still be active during migration. Keep existing flows operational until the replacement path is integrated and verified.
- On branch `SCRUM-99-Integrate-Doc-Authorization-w-Identity`, `backend/apps/documents/views.py` already defines student-facing upload (`DocumentUploadView`) and status/detail (`DocumentDetailView`) endpoints. Both inherit `DocumentAPIView`, which requires `JWTAuthentication` and `IsAuthenticated`; upload resolves `Course` by `owner=request.user` before parsing the body, and detail scopes `Document` by `course__owner=request.user`. No internal service-token helper or internal processing routes were found in the inspected backend at this point.
- Rechecked `backend/apps/documents/views.py` and `backend/apps/documents/urls.py` on October 17, 2026: current public upload and status/detail views already implement the SCRUM-8 protections (authentication, owner-scoped lookups, same 404 mapping, no-store response, upload ownership before body parsing). Treat review as separate from implementing internal service-auth endpoints; do not add duplicate user-auth logic without identifying a specific gap in current acceptance criteria.
- Relevant source of truth: `docs/architecture/document-processing-contract.md`, especially sections 5–7 and the responsibility table. Its unresolved-decision section explicitly says not all Django dispatch/callback and atomic-result responsibilities are automatically assigned to SCRUM-99.

## Security requirements

### Student-facing document access

- Authenticate each protected request and derive ownership from `request.user` through `Course.owner` and `Document.course`.
- Scope object queries to the authenticated owner where possible. Never trust a user, owner, course, or document ID supplied in request data as proof of access.
- Follow `docs/api-contract.md`: absent and foreign-owned course/document IDs should use the same non-disclosing `404` status and body. Authentication failure is handled before resource lookup.
- For upload, establish authentication and course ownership before validation, storage writes, record creation, or task dispatch.
- Denied requests must not return private metadata/file bytes or cause database, storage, or processing side effects.

### Internal processing access

- Authenticate internal requests with the agreed service credential/mechanism. An internal URL or knowledge of a job ID is not authorization.
- Keep service authentication separate from student JWT authentication. Authorize the service for the requested operation and validate the job/document association on Django's side.
- Derive the document from the authorized application Job; never trust a callback-supplied owner, course, document, storage path, or arbitrary source URL.
- Reject unauthorized calls before returning PDF bytes or changing application state. Never expose credentials, raw exceptions, private file paths, PDF contents, or broker details in responses or logs.
- Keep secrets in environment/configuration, out of source control and logs. Protect credentials and document/result data in transit outside trusted local development.
- Apply status transition, correlation, idempotency, stale-callback, and atomic-persistence rules from the architecture contract. Do not let a status-only callback mark a document `READY`; results must be validated and persisted before the successful application state is committed.

## Implementation and review checklist

- Enumerate the exact routes and behaviors included in the current Jira acceptance criteria.
- Identify authentication and authorization separately: who is calling, then whether that caller may perform this operation for this job/document.
- Reuse one agreed internal authentication helper/mechanism across SCRUM-99 and SCRUM-100; coordinate with SCRUM-108 where it consumes the credential. Avoid duplicate token parsers, settings, or permission rules.
- Verify unauthorized requests are rejected before file bytes or state changes are exposed.
- Cover missing/invalid credentials, valid service credentials, wrong job/document association, missing resources, duplicate/stale callbacks, and no-side-effect behavior as applicable to the agreed scope.
- For student-facing endpoints, verify owner, non-owner, unauthenticated, and absent-resource behavior, including identical error status/body for foreign and absent objects.
- Update API/architecture docs when a contract or ownership decision changes. Record verified progress here for future sessions.
- Do not add or run tests unless the task owner asks for verification or repository instructions require it.

## Current durable decisions and open points

- Existing API contract baseline for student document endpoints: JWT bearer auth plus owner checks; foreign and absent resources receive the same `404` response.
- Internal service calls should use a dedicated service authentication mechanism, separate from student JWTs.
- The user has confirmed a shared bearer service token configured as `PROCESSING_SERVICE_TOKEN`, sent through `Authorization: Bearer <token>`, with constant-time comparison. Reuse this mechanism across SCRUM-99/100 and coordinate consumption with SCRUM-108. Rotation policy remains an operational detail to agree.
- SCRUM-118 endpoint implementation/authorization is owned by Sudin per the user's update; SCRUM-99/100 provide the centralized shared internal-auth helper for reuse.
- Confirm whether the active SCRUM 99 scope is internal processing auth (architecture plan) or student-owned document access (initial user description) before editing views.
- Before changing the existing public upload/status views for service access, distinguish them from internal processing endpoints. Internal service auth should not replace the user JWT/owner checks on public endpoints; new internal routes and their request schemas must follow the current SCRUM 99/118 scope and agreed contract.
- The user clarified their focus is mostly (1) the existing student-facing upload/status views and (3) internal PDF retrieval plus status endpoints, with some (2) internal status callback work. Guide these as separate boundaries, prioritizing review/understanding of the existing public endpoints and then the internal PDF retrieval/auth path. 
- No SCRUM-99 implementation status or test outcome is recorded as verified in this file.

## Session update: shared processing-service authentication (October 18, 2026)

### Internal PDF retrieval decisions supplied by the user

- One shared service token authenticates both PDF retrieval and callbacks.
- Retrieval is allowed only for `QUEUED` and `RUNNING` application Jobs. A retry
  of a terminal job must first move it back to a nonterminal state.
- Retrieval requires the expected `document_id` and source SHA-256 to match the
  Job's Document. The user specified `GET /internal/v1/jobs/{job_id}/source/`
  with `Authorization: Bearer <PROCESSING_SERVICE_TOKEN>`,
  `X-Document-Id: <positive integer>`, and
  `X-Source-SHA256: <64 lowercase hex>`. The user corrected the earlier UUID
  notation: validate `X-Document-Id` as a positive integer and reject any
  other format with HTTP 400 `malformed`.
- Unknown Job: HTTP 404 with `job_not_found`; drop without retry.
- Terminal Job: HTTP 409 with `job_not_eligible`; drop without retry. This
  response takes precedence even if a newer active Job exists.
- Superseded Job: HTTP 409 with `job_superseded`; drop without retry. The user
  specified a partial unique constraint rather than newest Job ID to identify
  the current run. It must allow at most one `QUEUED` or `RUNNING` Job per
  Document. Those are the active states. The current Job model has no such
  constraint, so a model change and migration are needed. The user chose an
  explicit current-run marker as well. A Job in an active state whose ID does
  not match that marker returns `job_superseded`; terminal Jobs still return
  `job_not_eligible` first. The marker's exact field/schema and transaction
  update rules remain implementation decisions.
- Binding mismatch: HTTP 409 with `job_mismatch`; drop and log loudly without
  recording credentials, PDF bytes, or private paths.
- Existing Job with missing source: HTTP 410 with `source_missing`; mark the Job
  `FAILED` with reason `source_missing`. The current Job model has no reason
  field, so persistence of this reason requires a schema or logging decision.
- Storage or database failure: HTTP 503 with `temporarily_unavailable`; retry
  with backoff.
- Exact error JSON shape and classification of missing versus temporarily
  unavailable storage still need agreement.

The user confirmed these SCRUM-99 internal-auth requirements:

- Read `PROCESSING_SERVICE_TOKEN` from the environment and authenticate internal
  service calls using `Authorization: Bearer <token>` with a constant-time
  comparison.
- Provide reusable DRF `ProcessingServiceAuthentication` and
  `IsProcessingService` classes, or the project's equivalent convention.
- Missing, malformed, or invalid credentials must return `401 Unauthorized`.
  An unset or empty configured token must fail closed. Never expose the token or
  sensitive configuration in responses or logs.
- The helper authenticates the processing service only. Job–Document
  association, superseded-job checks, and status transitions are outside the
  helper; Sudin owns those checks under SCRUM-118.
- Reuse the helper for internal PDF retrieval and status/result callbacks.
  Keep it separate from student JWT authentication and do not change the public
  upload or document-status endpoints.

- Provide the implementation code in chat, not add it yourself whenever necessary with the path to add it. Help the user understand the given code.

### Request-flow context reviewed in this session

1. The frontend obtains a CSRF cookie and posts credentials to
   `POST /api/v1/auth/token/`. Django returns an access JWT and sets an HttpOnly
   refresh cookie. The frontend keeps the access token in auth context and
   refreshes it after a 401 when possible.
2. The student uploads to
   `POST /api/v1/courses/{course_id}/documents/` with the JWT. Django checks
   course ownership before parsing, validates the PDF, stores it privately,
   creates a `PENDING` Document and `QUEUED` Job in a transaction, then publishes
   a Celery task after commit.
3. The current worker still runs in the main backend. It reads through Django
   storage, sets Document `PROCESSING`, extracts per-page text, chunks it,
   generates embeddings, replaces Chunk rows, and sets Document `READY`
   transactionally. Permanent or exhausted retry failures set Document
   `FAILED`. The current worker does not advance application Job status.
4. The student polls `GET /api/v1/documents/{document_id}/` with a JWT. Django
   scopes the lookup through the course owner and returns a privacy-preserving
   404 for missing and foreign-owned documents. The frontend polls about every
   two seconds until `READY` or `FAILED`.

The planned independent processing-service path is not yet the current upload
path: the internal PDF route and status/result callbacks are not wired into the
active Celery flow. The architecture contract assigns shared internal auth to
SCRUM-99 and secure PDF retrieval to SCRUM-100; verify latest Jira criteria and
teammate ownership before treating retrieval as SCRUM-99 scope.

### Repository state observed during this session

- The user had added `backend/apps/documents/internal_auth.py`, including
  `ProcessingServiceAuthentication`, `IsProcessingService`, and a service
  principal. Reinspect its current contents before relying on it.
- An `InternalExampleView` using those classes was present in
  `backend/apps/users/views.py`; it was a stub and was not registered as an
  internal route. The environment setting and internal route were not present
  in the inspected settings/URL configuration at that time.
- Auth-helper and PDF-retrieval test paths appeared in the working tree, but no
  test run or passing result was established in this session.

## Session update: scope settled by merged contract (October 19, 2026)

- Branch rebased onto `origin/development` at `f83ba33` (PR #65). Development
  uses the name `development`; the team workflow calls it "dev".
- Merged contract §9 and §15 define SCRUM-99 as shared service authentication
  under `backend/apps/identity/service_auth.py` (`authorize_processing_service`,
  plain Django helper, not DRF classes). Internal routes are
  `/internal/v1/jobs/<id>/document/` and `/result/` with trailing slashes, in
  `apps/documents/internal_views.py`. The PDF-fetch client and integrity checks
  belong to SCRUM-100 (Sanish): the server sends `X-Document-ID` and
  `X-Source-SHA256`, and the client verifies them. The newest Job primary key
  supersedes older Jobs (SCRUM-118, Sudin). This replaces the earlier notes about
  a partial unique constraint, a current-run marker, and request-header binding.
- The user's commit adding the one-active-job constraint, `current_job`,
  `Job.reason`, and `Job.created_at` breaks 5 SCRUM-118 tests and 4 upload
  timestamp tests. Revert proposed and verified on a copy (full suite 449
  passed); pending user approval because it deletes files. Backups are in this
  session's scratchpad, and `stash@{0}` holds the original uncommitted work.
- Added: `apps/identity/ownership.py` (`owned_course`, `owned_documents`), used
  by document views and `services.locked_material`; hardened `service_auth.py`
  with `WWW-Authenticate` on 401 and a redacted warning log; added
  `tests/identity/test_service_auth.py`,
  `tests/documents/test_identity_authorization.py`, and contract §16.
- Backend tests require Python 3.12. The local venv is 3.11, so tests run through
  `scripts/check.py` in a `python:3.12-bookworm` container with a disposable
  pgvector database.
- The user explicitly asked the agent to implement SCRUM-99 this session, which
  overrides the earlier preference to write code themselves for this work.
