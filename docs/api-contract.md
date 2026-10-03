# API Contract

All StudyForge APIs are versioned under `/api/v1/`.

This file is the source of truth for the working SCRUM-8 API contract, incorporating Person 3's decisions on 2026-09-25. No `contracts/openapi.yaml` exists, and the repository instructions and supplied SCRUM-8 requirements do not require OpenAPI. SCRUM-8 covers the upload and individual document/status contracts below, not their implementation or the course-document listing contract.

Implemented endpoints on the SCRUM-10 branch are:

```text
GET /api/v1/health/
POST /api/v1/courses/{id}/documents/
GET /api/v1/documents/{id}/
```

The health response is:

```json
{
  "status": "ok"
}
```

The endpoints below remain planned or belong to other domain branches. They are
not implemented by SCRUM-10. The upload and individual document retrieval
endpoints above implement the unchanged SCRUM-8 contract described below.

## Planned Sprint 1 endpoints

Course integration update: `GET /courses/`, `POST /courses/`, and
`GET /courses/{id}/` are implemented under `/api/v1/`. All require bearer
authentication and are scoped to the current owner. Course detail returns the same
fields as course creation/listing. The frontend course page passes the selected
course ID to `CourseMaterials` for upload integration. Course PATCH/DELETE and
document collection GET remain planned.

```text
POST   /api/v1/auth/register/
POST   /api/v1/auth/token/
POST   /api/v1/auth/token/refresh/

GET    /api/v1/courses/
POST   /api/v1/courses/
GET    /api/v1/courses/{id}/
PATCH  /api/v1/courses/{id}/
DELETE /api/v1/courses/{id}/

GET    /api/v1/courses/{id}/documents/

POST   /api/v1/documents/{id}/notes/
GET    /api/v1/documents/{id}/notes/
```

Document rename and delete are deferred to later work; they are not part of Sudin's current Sprint 1 tasks:

```text
PATCH  /api/v1/documents/{id}/
DELETE /api/v1/documents/{id}/
```

## Document status contract

The document `status` field has exactly four valid values, using the uppercase spelling below.

| Status | Meaning |
|---|---|
| `PENDING` | The PDF has been accepted and stored, and a Document record exists, but processing has not started. |
| `PROCESSING` | The background worker has started processing the document. |
| `READY` | Processing completed successfully and the document can be used by downstream study features. |
| `FAILED` | Processing failed and the document cannot currently be used. |

### Ownership and handoff

Person 3 (Document Upload and Status) owns this boundary:

```text
Validate PDF -> store file -> create Document(status=PENDING) -> hand document_id to Person 4
```

Here, `document_id` means the ID of the created Document; it does not rename the `id` field in the Document response example below.

Person 4 (Processing and Knowledge Foundation) owns background processing, including the transition from `PENDING` to `PROCESSING`, PDF text extraction, page preservation, chunking, embeddings, pgvector processing, retries, and worker transitions to `READY` or `FAILED`. Person 3 owns the specific pre-worker failure case: when processing dispatch definitely fails after persistence, set `PENDING -> FAILED` with `PROCESSING_DISPATCH_FAILED`, as defined below.

The ordinary processing lifecycle is:

```text
PENDING -> PROCESSING -> READY or FAILED
```

The additional upload-side failure transition is:

```text
PENDING -> FAILED (definite processing dispatch failure)
```

Worker retry algorithms and processing output storage remain Person 4's implementation responsibility. Upload validation does not extract text or decide processing success. This contract adds no status names or retry/recovery endpoints.

## Document upload and retrieval contract (SCRUM-8)

### Authentication and ownership

Both endpoints require an authenticated student. Resolve the course through `Course.owner == request.user`; resolve a document through `Document.course.owner == request.user`. Never accept an owner from the request or authorize access merely because an ID exists.

Return the same `404 RESOURCE_NOT_FOUND` response for an absent resource and another student's resource. Check authentication and ownership before application-level PDF validation, file storage, or record creation. The upload URL supplies the course; a form field cannot override it.

Both endpoints require Bearer access-token authentication. The bootstrap `AllowAny` setting is not the document endpoint contract; authentication integration must enforce these responses when implemented.

The request header is `Authorization: Bearer <access_token>` on both endpoints. Missing, expired, or invalid tokens return `401 AUTHENTICATION_REQUIRED`, with `WWW-Authenticate: Bearer`. An authenticated non-owner receives the same `404 RESOURCE_NOT_FOUND` body as a missing resource, rather than a distinct `403` that reveals its existence. Authentication takes precedence over resource lookup.

### Upload request

`POST /api/v1/courses/{id}/documents/`

Here, `{id}` is the positive integer **course ID**. For retrieval at `/api/v1/documents/{id}/`, it is the positive integer **document ID**. An authenticated request with a malformed or nonpositive resource ID receives the same JSON `404 RESOURCE_NOT_FOUND` as an unknown ID.

Content type: `multipart/form-data`, containing exactly one file part named `file`. The browser must generate the multipart boundary. Reject duplicate file parts and unexpected fields with `400 INVALID_UPLOAD`; clients cannot set `status`, `owner`, IDs, errors, or timestamps.

Example multipart body (the boundary shown is illustrative):

```http
POST /api/v1/courses/12/documents/
Authorization: Bearer <access_token>
Content-Type: multipart/form-data; boundary=studyforge-example

--studyforge-example
Content-Disposition: form-data; name="file"; filename="Processes.pdf"
Content-Type: application/pdf

<PDF file bytes>
--studyforge-example--
```

The file part's `filename` supplies the initial display name; there is no separate `name` or `course_id` form field. A text part named `file` does not satisfy the required file upload and returns `400 INVALID_UPLOAD`.

Maximum file size: **20 MiB (20,971,520 bytes), inclusive**. No different explicit limit was found in the available repository/task requirements. If an existing Jira requirement specifies a different limit, reconcile this contract before implementation. Backend validation is authoritative; the UI may precheck the same limit. A matching request-body limit must allow multipart overhead. Infrastructure-generated errors may need separate configuration to match the JSON contract.

PDF validation rules:

- Require a nonempty file and a filename ending in `.pdf`, case-insensitively. Store only a safe basename as the initial display name; do not use a client-supplied path as a storage key.
- Do not trust the extension or reported MIME type alone. Check the PDF header and use a PDF parser to validate readable document structure and page references without extracting page text.
- Reject fake, structurally malformed, and zero-page PDFs. Reject encrypted PDFs as unsupported.
- Accept structurally valid scanned/image-only PDFs that satisfy the other upload rules. Do not require extractable text during upload. An accepted PDF may later fail processing under the processing owner's supported-content policy.
- Rewind the validated stream before storage. Validation does not perform text extraction, chunking, embeddings, or retries.

Parser selection and representative malformed-file fixtures belong to implementation and upload testing. They must enforce these rules without extracting text. These checks do not promise that every accepted PDF will process successfully.

### Upload success and Document representation

Successful upload returns `201 Created` with the Document representation below. Validate and store the PDF, create the Document with `PENDING`, and hand its `document_id` to processing only after the database transaction commits so the worker can read the record. Dispatch failures use the `503` responses defined below. Internal Job design is outside this API contract and does not add fields or prerequisites to its public response.

The upload response is the creation snapshot, with `PENDING`. A fast worker may already have advanced the current state; a subsequent GET returns the latest saved state. `PENDING` means processing has not started at that snapshot, not that it must remain pending until the browser polls.

```json
{
  "id": 42,
  "course_id": 12,
  "name": "Processes.pdf",
  "status": "PENDING",
  "created_at": "2026-09-23T18:00:00Z",
  "updated_at": "2026-09-23T18:00:00Z",
  "error": null
}
```

All seven fields are required in upload and retrieval JSON responses (`Content-Type: application/json`). Only `error` is nullable; clients cannot write any of these response fields through the upload form.

| Field | JSON type | Meaning |
|---|---|---|
| `id` | positive integer | Document primary key; Django's existing default is `BigAutoField`. |
| `course_id` | positive integer | Related Course primary key. Aashish's current Course code implies `BigAutoField`; use the actual ForeignKey and migration, not a duplicated ID field. |
| `name` | nonempty string | User-visible name, initially the safe uploaded basename including `.pdf`. Preserve the existing API field name. Physical storage keys are independent so future renaming need not move files. |
| `status` | string enum | Exactly `PENDING`, `PROCESSING`, `READY`, or `FAILED`. |
| `created_at` | string | Server-generated creation time, serialized as an ISO 8601 UTC timestamp ending in `Z`; fractional seconds are allowed. |
| `updated_at` | string | Same format as `created_at`; server-generated last modification time, including persisted status changes. Initially equals `created_at` and must not precede it. |
| `error` | object or null | `null` for `PENDING`, `PROCESSING`, and `READY`; a safe object with required nonempty string fields `code` and `message` for `FAILED`. |

Do not expose storage paths, raw exception messages, Celery task IDs, retry counters, or broker details. No public Job fields or Job endpoint are part of SCRUM-8. The safe API error object does not require identically named database fields.

### Document/status retrieval

`GET /api/v1/documents/{id}/` returns `200 OK` with the same Document shape and the latest persisted state. It is the status-polling endpoint; no separate `/status/` endpoint is defined. Return `Cache-Control: no-store` so cached responses do not hide state changes or retain private document metadata.

A document whose processing failed still returns `200 OK`. Example full response to `GET /api/v1/documents/42/`:

```json
{
  "id": 42,
  "course_id": 12,
  "name": "Processes.pdf",
  "status": "FAILED",
  "created_at": "2026-09-23T18:00:00Z",
  "updated_at": "2026-09-23T18:01:00Z",
  "error": {
    "code": "PROCESSING_FAILED",
    "message": "This PDF could not be processed."
  }
}
```

The public failure codes are `PROCESSING_FAILED` for terminal worker failure and `PROCESSING_DISPATCH_FAILED` for definite upload-side dispatch failure. Each has a fixed safe `message`, shown in the examples. Further public processing codes require a contract change. This API mapping does not prescribe the worker's internal error fields or retry algorithm. An HTTP/network failure while polling does not mean document processing failed and must not change its stored status.

### Request error responses

Common shape for authentication, resource-lookup, and upload validation/persistence failures:

```json
{
  "code": "INVALID_PDF",
  "message": "Upload a valid, readable PDF."
}
```

| Condition | HTTP | Code |
|---|---|---|
| Missing, invalid, or expired authentication | 401 | `AUTHENTICATION_REQUIRED` |
| Missing or foreign-owned course/document | 404 | `RESOURCE_NOT_FOUND` |
| Missing `file` part | 400 | `FILE_REQUIRED` |
| Empty file | 400 | `EMPTY_FILE` |
| Duplicate file parts, a text-only `file` part, or unexpected fields | 400 | `INVALID_UPLOAD` |
| Malformed multipart body | 400 | `INVALID_REQUEST` |
| Wrong request content type | 415 | `UNSUPPORTED_MEDIA_TYPE` |
| Non-PDF filename, fake PDF, malformed PDF, or zero pages | 400 | `INVALID_PDF` |
| Encrypted PDF | 400 | `UNSUPPORTED_PDF` |
| File exceeds the agreed byte limit | 413 | `FILE_TOO_LARGE` |
| File storage or database persistence unavailable | 503 | `UPLOAD_UNAVAILABLE` |
| Processing dispatch definitely fails after persistence | 503 | `PROCESSING_DISPATCH_FAILED` |
| Processing dispatch outcome is uncertain after persistence | 503 | `PROCESSING_HANDOFF_UNCONFIRMED` |

The error shape is scoped to these endpoints, not a change to other domains' APIs. Parse/authentication errors also need explicit coverage; ordinary DRF defaults alone do not establish this shape. Messages are safe user-facing text, never exception strings.

All request errors use `Content-Type: application/json`. The common error object has required nonempty string fields `code` and `message`. Dispatch errors after persistence wrap that object under `error` alongside `document_id`, as shown below. Clients branch on the HTTP status and error code, not the human-readable message. Both endpoints share the authentication and resource-lookup errors; file validation, persistence, and dispatch errors apply to POST only. For example, both a missing document and a document owned by another student return `404` with `{"code":"RESOURCE_NOT_FOUND","message":"Resource not found."}`; invalid authentication returns `401` with `{"code":"AUTHENTICATION_REQUIRED","message":"Authentication is required."}`.

For an owner-authorized, well-formed request, check file presence/cardinality, size, and then PDF validity in that order. Parser or infrastructure failures may occur before application-level checks.

### Persistence and dispatch failure boundary

Validation or ownership rejection must leave no new Document or stored file. Database creation is atomic. File storage is outside database rollback: if persistence fails after writing a new file, remove that upload's newly written file. If cleanup also fails, log it for operational recovery; do not return internal paths or claim rollback removed the file.

If processing dispatch **definitely fails** after the file and Document have been stored:

- Retain the Document and file.
- Persist `status = FAILED`, set the Document's `error` to `PROCESSING_DISPATCH_FAILED` with the safe message below, and update `updated_at`.
- Return `503 Service Unavailable` with the created positive integer `document_id` and that same error object. The ID refers to the already-created resource; ownership checks still apply to subsequent retrieval.
- A subsequent authorized GET returns `200 OK` with all seven Document fields, `status: FAILED`, and the same error object. The failed dispatch does not make the saved Document a missing resource.

Example `503` response after definite dispatch failure for document 42:

```json
{
  "document_id": 42,
  "error": {
    "code": "PROCESSING_DISPATCH_FAILED",
    "message": "The PDF was saved, but processing could not be started."
  }
}
```

An acknowledgement timeout or connection loss does not by itself prove dispatch failed: the worker may have received the task. For an **uncertain** dispatch outcome, retain the Document/file and its current status/error; do not overwrite a potentially processing Document with `FAILED`. Return `503` with the same wrapper, `error.code: PROCESSING_HANDOFF_UNCONFIRMED`, and `error.message: "The PDF was saved, but processing could not be confirmed. Check its status before uploading again."`. This request error does not become the Document's persisted processing error. A later GET reports the saved state.

SCRUM-8 defines these observable responses only. Retry/recovery mechanisms, outboxes, reconciliation, and worker algorithms are not implemented or required to complete this documentation task.

Normal uploads have no idempotency-key contract yet. Do not automatically replay a POST after an ambiguous network failure; explain that it may already have created a document.

### Status-consumer guidance for later UI work

The future UI can display the upload result immediately, then poll GET every two seconds while `PENDING` or `PROCESSING`. Schedule the next request after the previous one finishes; maintain only one active request/timer for the current document. These are implementation guidelines for SCRUM-14, not UI implementation in SCRUM-8.

- Stop on `READY` or `FAILED`; display the safe processing error for `FAILED`.
- Clear timers and cancel or ignore stale requests on unmount or when the document changes, including React Strict Mode cleanup.
- On an unrecoverable authentication error, stop and defer sign-in handling to the shared auth flow. Do not implement a second token-refresh loop in this component.
- On `404`, stop and show that the document is unavailable.
- On polling network/5xx errors, keep the last known status, show a connection error, and pause automatic polling after three consecutive failures. Offer an explicit status refresh that can resume polling; never automatically re-upload.
- For an upload `503` containing `document_id`, show its safe error and allow retrieval of that saved Document. Definite dispatch failure is a persisted `FAILED` state; an uncertain handoff is not evidence of a terminal processing failure.
- A `PENDING` or `PROCESSING` document has no defined terminal time limit. A long wait must not invent a `TIMEOUT` status or mark processing failed.

The form includes file selection, client-side type/size hints, submitting state, validation errors, and the created filename/status. It does not include document rename/delete controls.

### SCRUM-8 completion and later integration

The working contract is defined by Person 3's decisions: the upload endpoint and multipart field, 20 MiB limit and PDF policy, Bearer authentication and ownership behavior, seven response fields, four statuses, safe errors, success responses, and definite dispatch-failure behavior. No API-design decisions remain blocking SCRUM-8 under these requirements.

Authentication integration, actual Course/User migrations, Document storage, processing dispatch integration, and processing output storage remain later implementation work with the respective owners. Internal Job design does not block this public API documentation. These statements record the working contract, not implementation completion or separate teammate approvals.

### Implementation and verification mapping

| Jira | Later implementation work (outside SCRUM-8) |
|---|---|
| SCRUM-9 | Document model/migrations, integrated with actual Course/User dependencies; any internal Job requirements belong to that task's separately confirmed scope. |
| SCRUM-10 | Owner-protected upload and document retrieval needed by polling; validation, storage, required record creation, and agreed processing dispatch. |
| SCRUM-12 | pytest coverage for valid/missing/non-PDF/fake/malformed/oversized uploads; owner/non-owner/unauthenticated/missing-course cases; IDs, records and initial status; protected retrieval; storage/database/dispatch failure boundaries. Mock the processing interface. |
| SCRUM-14 | Upload form and polling UI, including terminal states, safe errors, single-timer behavior, request failures, and unmount cleanup. |

Do not implement the processing owner's extraction, chunking, embedding, or retry algorithms as part of these upload tasks. Document rename/delete work remains outside this Sprint 1 scope.

## Example contracts

### Course

```json
{
  "id": 12,
  "name": "Operating Systems",
  "created_at": "2026-09-21T20:00:00Z"
}
```

### Document

This example uses the working SCRUM-8 representation above.

```json
{
  "id": 42,
  "course_id": 12,
  "name": "Processes.pdf",
  "status": "READY",
  "created_at": "2026-09-21T20:10:00Z",
  "updated_at": "2026-09-21T20:11:00Z",
  "error": null
}
```

### Note

```json
{
  "id": 91,
  "document_id": 42,
  "content": {
    "key_concepts": [],
    "important_points": [],
    "summary": ""
  },
  "created_at": "2026-09-21T20:15:00Z"
}
```

## Contract changes

If an API contract changes later, update all of the following:

- `docs/api-contract.md`
- backend serializer / response logic
- frontend TypeScript type
- affected tests
