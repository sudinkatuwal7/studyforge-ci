# API Contract

All StudyForge APIs are versioned under `/api/v1/`.

This file is the source of truth for the working SCRUM-8 API contract, incorporating Person 3's decisions on 2026-09-25. No `contracts/openapi.yaml` exists, and the repository instructions and supplied SCRUM-8 requirements do not require OpenAPI. SCRUM-8 covers the upload and individual document/status contracts below, not their implementation or the course-document listing contract.

## Internal processing-service source route

This route is an internal service-to-service endpoint. It is **not public**, is
not mounted under `/api/v1/`, and must not be called by browsers or ordinary
student clients. It uses the processing-service bearer credential, not a student
JWT and not the public course/document ownership authorization.

### Request

```http
GET /internal/v1/jobs/{job_id}/document/
Authorization: Bearer <PROCESSING_SERVICE_TOKEN>
```

The route has no request body. `{job_id}` is the positive integer primary key of
the application `Job`, not a Document ID. Django resolves the associated
Document through `Job.document`; callers cannot supply an independent storage
path or document selector. A newer Job for the same Document supersedes an older
Job and the older Job cannot fetch the source.

### Successful response

The response is `200 OK` and streams the exact bytes stored in the Document's
private file. The MIME type is server-controlled from the stored validated suffix:

| Suffix | `Content-Type` |
|---|---|
| `.pdf` | `application/pdf` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |

The response also includes `X-Document-ID`, `X-Source-SHA256`, and
`Cache-Control: no-store`. It does not expose the storage key or local filesystem
path. The processing client verifies the document ID, digest header, body digest,
size, MIME type, and redirect behavior before parsing.

### Authentication, statuses, and safe failures

| Situation | HTTP response | Meaning/client behavior |
|---|---:|---|
| Valid service token and current Job with readable file | `200` streamed bytes | Worker consumes and verifies the source. |
| Missing, malformed, or invalid service credential | `401` `{"error":"unauthorized"}` | Do not retry with a student JWT; treat as permanent. |
| Django has no configured service token | `503` `{"error":"service_unavailable"}` | Service configuration is unavailable; worker may retry only according to its task policy. |
| Missing or unknown Job | `404` `{"error":"not_found"}` | No source bytes or storage details; worker treats it as permanent. |
| Non-positive Job ID reaching the view | `404` `{"error":"not_found"}` | Rejected before Job lookup. |
| Nonempty malformed, non-ASCII, negative, or out-of-range Job ID | `404` `{"error":"not_found"}` after service authentication | Rejected before Job lookup; valid IDs are ASCII decimal integers from 1 through 9223372036854775807. |
| Newer Job exists for the same Document | `409` `{"error":"stale_job"}` | Worker stops this execution; no file is opened. |
| Empty/missing stored filename | `404` `{"error":"not_found"}` | No storage read is attempted. |
| Unsupported stored suffix | `415` `{"error":"unsupported_source"}` | Worker treats the source as permanently unsupported. |
| Missing blob or storage-open failure | `503` `{"error":"source_unavailable"}` | No path, exception text, or traceback is returned; retrieval may retry. |
| Non-GET method | `405` | Not a source-download operation. |

An absent path segment (for example `/internal/v1/jobs//document/`) does not
match the route and retains the framework's 404 response; JSON is not guaranteed
for URLs outside this route. The result callback route is unchanged.

The worker calls this exact job-scoped URL from
`processing_service.source_client.fetch_source_document(job_id, document_id,
source_sha256)`. It rejects redirects, uses a bounded timeout, classifies 404,
409, and 415 as permanent failures, and classifies 408, 429, and 5xx responses as
retryable. A body digest mismatch is an integrity failure, not a permission
response. A storage failure after streaming has begun may terminate the stream;
the worker must detect incomplete or invalid content and must not persist it.

Student ownership remains enforced by the public `/api/v1/` document endpoints;
the internal route authorizes the trusted processing service and the Job-to-
Document relationship. No separate internal Document-ID route is defined.

## SCRUM-106 multi-format extension

The same owner-protected course upload endpoint accepts exactly `.pdf`, `.docx`,
and `.pptx`, each up to 20 MiB inclusive. Browser MIME is advisory. Django
checks PDF structure or bounded OOXML ZIP structure and the correct Office package
type before deriving the format from the validated suffix. Unsupported extensions
return `INVALID_FORMAT`; malformed, mismatched, or ordinary ZIP Office uploads
return `INVALID_OFFICE`. Encrypted or password-required Office packages are rejected.
The stored file retains its validated suffix, exact bytes, and SHA-256 digest;
renaming a material changes only its display name.

The authenticated internal source route returns the canonical MIME for the stored
suffix: `application/pdf`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`, or
`application/vnd.openxmlformats-officedocument.presentationml.presentation`. The worker verifies
the source digest and uses one extraction, chunking, embedding, callback, and
persistence path. `READY` follows committed chunks and finite 768-dimensional
pgvector embeddings.

`page_number` is a legacy chunk location field. For PDF it is the actual page;
for PPTX it is the actual slide. `Document.page_count` is the actual PDF page or
PPTX slide count. DOCX has no page citation: `Document.page_count` is null and
`Chunk.page_number = 1` is only a schema compatibility value. DOCX heading level
and table row/cell order, and PPTX slide title and number, remain in chunk text.
Consumers must never show DOCX chunks as “Page 1.” No public metadata field or
search endpoint is introduced; existing notes/quiz retrieval uses the chunks.

Implemented document endpoints (including SCRUM-61 material management) are:

```text
GET /api/v1/health/
POST /api/v1/courses/{id}/documents/
GET /api/v1/courses/{id}/documents/
GET /api/v1/documents/{id}/
PATCH /api/v1/documents/{id}/
DELETE /api/v1/documents/{id}/
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
course ID to `CourseMaterials` for upload and material management. Course
PATCH/DELETE remain planned. Document collection GET is implemented by SCRUM-61.

```text
POST   /api/v1/auth/register/
POST   /api/v1/auth/token/
POST   /api/v1/auth/token/refresh/

GET    /api/v1/courses/
POST   /api/v1/courses/
GET    /api/v1/courses/{id}/
PATCH  /api/v1/courses/{id}/
DELETE /api/v1/courses/{id}/

POST   /api/v1/documents/{id}/notes/
GET    /api/v1/documents/{id}/notes/
```

## Course material management (SCRUM-61)

All three operations use the existing student Bearer JWT authentication and
`Course.owner == request.user` scope. Missing/invalid credentials return
`401 AUTHENTICATION_REQUIRED`; missing, malformed, or foreign resource IDs return
the same `404 RESOURCE_NOT_FOUND`. Responses use `Cache-Control: no-store`.

```text
GET    /api/v1/courses/{id}/documents/
PATCH  /api/v1/documents/{id}/
DELETE /api/v1/documents/{id}/
```

- **List:** returns `200` with an array (possibly empty) of the existing seven-field
  Document representation: `id`, `course_id`, `name`, `status`, `created_at`,
  `updated_at`, `error`. Ordered by newest creation time, then descending ID for
  ties. No storage paths, hashes, job history, or service credentials are exposed.
- **Rename:** accepts JSON containing exactly `{"name": "New display name"}`.
  Trims surrounding whitespace; requires a string of 1–255 characters without
  ASCII control characters. Invalid names return `400 INVALID_NAME`; unsupported
  fields or malformed/non-JSON bodies return `400 INVALID_MATERIAL_UPDATE`.
  Returns `200` with the updated Document. Only `title` and `updated_at` change;
  the UUID-backed source filename, hash, identity, processing state, jobs,
  embeddings, and generated results stay intact.
- **Delete:** returns an empty `204` only after the database transaction commits.
  Locks the Document row before cascading deletion, matching SCRUM-118's
  Document-before-Job lock order. Existing cascades remove application Jobs,
  Chunks (including their vectors), StudyGuide, and quiz-source join rows.
  Quiz records/questions, Course, User, other documents and their resources
  remain. Processing-service Execution rows are not accessed. A callback that
  commits first is subsequently deleted with the document; one that loses the
  race, or arrives later, receives `404 job_not_found`. Internal PDF retrieval
  also returns 404 after deletion. Repeating the public DELETE returns 404.

Deletion executes the database cascades, then calls the existing storage
backend's `delete` inside the same durable transaction. A missing file counts
as already removed. Storage exceptions cause database rollback and a safe
`503 MATERIAL_UNAVAILABLE`; SQL failures before storage deletion leave the file
untouched. The UI keeps the material on any failed deletion and shows an error.

**Filesystem/database atomicity limitation:** the filesystem does not participate
in PostgreSQL transactions. If file deletion succeeds but the subsequent commit
fails (or the process crashes), database rows may remain with a missing source
file. A storage backend that deletes a file and then raises has the same risk.
The endpoint does not silently acknowledge failure, but cannot restore removed
bytes. A later successful DELETE can remove those remaining rows because missing
files are accepted. No background cleanup, automatic retries, queue, or migration
is introduced for SCRUM-61.

The course workspace loads persistent materials once, adds newly saved uploads
to that list, and reuses `DocumentStatus` for each item's processing polling.
Rename/deletion cancel obsolete polling so late responses cannot restore deleted
items or revert a display name. Renaming is inline; deletion requires explicit
confirmation, with duplicate mutations disabled while pending.

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

## Study-session calendar endpoints

Study sessions belong to courses; access follows `session.course.owner`.
Every endpoint requires a valid Bearer JWT and is restricted to the signed-in
student. Task records remain available through the existing To-Do endpoints.

| Method | Endpoint | Success |
|---|---|---|
| GET | `/api/v1/study-sessions/` | `200`, array of owned sessions |
| POST | `/api/v1/study-sessions/` | `201`, saved session; `200` for a matching retry |
| GET | `/api/v1/study-sessions/{id}/` | `200`, owned session |
| PATCH | `/api/v1/study-sessions/{id}/` | `200`, updated session |
| DELETE | `/api/v1/study-sessions/{id}/` | `204`, empty body |

Creation input:

```json
{
  "creation_key": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Review recursion",
  "course": 7,
  "date": "2026-10-22",
  "time": "09:30"
}
```

- Title, owned course, date, and UUID creation key are required. Titles are
  trimmed, must be nonblank, and have a maximum length of 200 characters.
- Time is optional and accepts `HH:MM`, `HH:MM:SS`, or `null`. Empty strings and
  timezone offsets are rejected. Date/time represent the entered calendar date
  and clock time without timezone conversion. Past dates are allowed.
- Responses contain `id`, `title`, `course`, `date`, `time`, `created_at`, and
  `updated_at`. Dates use `YYYY-MM-DD`; times use `HH:MM:SS` or `null`.
  The creation key is never returned.

```json
{
  "id": 4,
  "title": "Review recursion",
  "course": 7,
  "date": "2026-10-22",
  "time": "09:30:00",
  "created_at": "2026-10-18T02:15:00Z",
  "updated_at": "2026-10-18T02:15:00Z"
}
```

- Listing returns all owned sessions, including past ones, ordered by date,
  untimed entries first, then time and ID. An empty list returns `[]`.
- PATCH accepts only title, course, date, and time. Omitted fields retain their
  values; `"time": null` clears the time. Changing courses requires another
  course owned by the same student. IDs, timestamps, owner, creation keys on
  updates, and other unsupported input fields are rejected.
- POST uses the unique creation key to avoid duplicate inserts. A retry with
  matching stored title, course, date, and time returns the existing session.
  Reusing a key with different stored details or another student's session
  returns a generic `409` without exposing or changing that session. If a
  session has since been edited, the original creation request can conflict;
  keys are not retained after deletion.
- Missing, invalid, or expired authentication returns `401`. Invalid input or
  an unavailable course returns `400` with field errors. Missing, foreign, or
  out-of-range session IDs return `404` for all detail operations. A repeated
  deletion returns `404`. PUT is not supported; edits use PATCH.

## Contract changes

If an API contract changes later, update all of the following:

- `docs/api-contract.md`
- backend serializer / response logic
- frontend TypeScript type
- affected tests

## RAG questions — SCRUM-20

`POST /api/v1/rag/questions/` requires an authenticated user with a valid JWT
access token (`Authorization: Bearer <access-token>`). This is a query-only
endpoint: it does not save answers, create notes, or modify documents. The route
is mounted through `apps.knowledge.urls` under the existing `/api/v1/` prefix.

The request selects the source documents explicitly:

```json
{
  "question": "What causes a page fault?",
  "document_ids": [42, 57]
}
```

`question` is a nonblank string up to 2,000 characters. `document_ids` is a
nonempty, duplicate-free list of at most 20 positive integer Document IDs.
IDs are bounded by the signed 64-bit integer maximum (9,223,372,036,854,775,807).
The 20-document limit applies per request, not per user or across requests.
The server validates the whole selection as owned and READY before any embedding
or generation call. A single unavailable ID rejects the entire selection; it is
never silently dropped. Client-supplied passages, citations, or owner IDs are not
used as evidence. `top_k` is server-controlled, currently five globally ranked
chunks across the selection, not five per document. A selected document is not
guaranteed a place among those five chunks.

Internal retrieval produces evidence with stable stored Chunk ID, Document ID,
and page number (one-based PDF page). This evidence shape is not an additional
top-level field in the HTTP answer:

```json
{
  "chunk_id": 901,
  "document_id": 42,
  "page_number": 2,
  "content": "A page fault occurs when the requested page is not in RAM.",
  "score": 0.8842
}
```

A supported answer requires at least one citation:

```json
{
  "status": "ANSWERED",
  "answer": "A page fault occurs when a requested page is not in RAM.",
  "citations": [
    {
      "chunk_id": 901,
      "document_id": 42,
      "page_number": 2,
      "excerpt": "requested page is not in RAM"
    }
  ]
}
```

An empty citation list means the response must explicitly abstain:

```json
{
  "status": "INSUFFICIENT_CONTEXT",
  "answer": null,
  "citations": []
}
```

### Evidence and citation checks

Gemini (`gemini-embedding-2`, 768 dimensions) embeds the question once. PostgreSQL/
pgvector filters Chunk and Document ownership and READY status before applying
the optional similarity cutoff, global cosine-distance/chunk-ID ordering, and
top-K. The generator receives text, not embedding vectors. It bounds input to at
most ten passages, 4,000 characters each and 24,000 passage characters total;
normal endpoint retrieval currently supplies at most five passages.

OpenAI generation requests strict structured JSON. The system instruction treats
passage text as untrusted data, not instructions; source text appears only in a
JSON user-data envelope. The server rejects malformed, refused, incomplete, or
unsupported output rather than fabricating citations or converting errors into
successful abstentions.

Before an answer is returned, each citation must:

- Reference an exact chunk ID in the retrieved evidence allowlist. An owned chunk
  in a selected document is still invalid if it was not retrieved.
- Belong to an authorized selected document, with both current Chunk.owner and
  Document.owner matching the authenticated user and Document.status still READY.
- Match the stored document ID and page number. These are canonical identifiers,
  not page numbers or source names invented by the model.
- Include a nonblank verbatim excerpt present in the bounded passage actually
  sent to the model and in the current stored chunk. Excerpts are not paraphrased
  or silently repaired. Stored chunk text must still match the retrieval snapshot
  at the service's verification step.

The generator and service enforce the retrieved-ID allowlist; the final serializer
independently verifies current ownership, readiness, page and excerpt. Its document
allowlist alone does not establish retrieval membership. The entire selected
document set is rechecked after provider calls and at final answer validation,
including selected documents that did not contribute a citation.

`ANSWERED` with no citations, or `INSUFFICIENT_CONTEXT` with answer text or
citations, is invalid. Empty retrieval returns `200` with the exact abstention
object above without constructing or calling the generation client. A model can
also explicitly abstain after receiving evidence.

### HTTP results and errors

| Status | Meaning |
| --- | --- |
| `200` | Valid `ANSWERED` or `INSUFFICIENT_CONTEXT` object shown above. |
| `400` | Malformed JSON or invalid question/document selection; DRF parse or field errors. |
| `401` | Missing, invalid, or expired JWT credentials. |
| `404` | At document authorization, any selected document is missing, foreign, or non-READY. Generic `{"detail":"No such documents."}`; no failing ID is disclosed. |
| `405` | Unsupported application method, such as GET. DRF OPTIONS metadata remains available under its normal permission checks. |
| `503` | Embedding/generation failure, incompatible retrieval configuration, malformed output, or unverifiable citations. |

All handled upstream and answer-validation failures return only:

```json
{
  "code": "RAG_GENERATION_FAILED",
  "detail": "The question could not be answered right now. Please try again."
}
```

Provider errors never become `200 INSUFFICIENT_CONTEXT`. Responses do not include
SDK exception messages, keys, raw model output, or private passage text. If a
document changes during processing, the selection recheck can return generic
`404`; revocation or citation changes caught at the later final-validation step
return sanitized `503`. No partial answer or citations are returned on failure.

### Configuration, verification and limitations

- `RAG_LLM_BACKEND` defaults to `fake`, which always abstains. Real text generation
  requires `RAG_LLM_BACKEND=openai`, `OPENAI_API_KEY`, and optionally `RAG_LLM_MODEL`
  (default `gpt-4o-mini`). Gemini embedding configuration remains separate.
- Endpoint integration tests use real JWT and PostgreSQL/pgvector with mocked
  Gemini vectors and OpenAI responses. They verify evidence flow, strict requests,
  validation, and safe failures, not live-provider behavior or answer quality.
- Verbatim citation provenance does not prove that every answer claim logically
  follows from its quote. Prompt/data separation reduces injection risk but is
  not a formal guarantee that a model will ignore every malicious passage.
- Final checks use separate database reads, without a lock spanning validation
  and response delivery. They detect changes observed at those checks but do not
  guarantee atomic revocation: changes after a final check remain a race window.
  If one selected document becomes non-READY during embedding while another
  still supplies eligible evidence, generation can run on the remaining evidence
  before the full-selection recheck rejects the request. No answer is returned.
- The similarity cutoff is disabled by default pending relevance calibration;
  top-K passages may not cover all facts or every selected document. Bounds can
  truncate evidence. No frontend chat integration is included in this backend work.
- The supplied SCRUM-20 acceptance criteria require retrieved-content answers,
  structured citations, rejection of invalid references, and handling insufficient
  information/generation errors. They do not separately specify this route name.

## Conversation scope and APIs (SCRUM-76)

SCRUM-76 provides the private `Conversation` and upload contract for SCRUM-75.
Message persistence and chat history are not part of this model. A conversation
has an authenticated owner, an optional course, a title, and timestamps. A course
conversation is accessible only when both `Conversation.owner` and `Course.owner`
match the caller. Missing and foreign conversation IDs return the same
`404 {"code":"RESOURCE_NOT_FOUND","message":"Resource not found."}` body.
Requests without a valid JWT return 401.

| Route | Method | Contract |
| --- | --- | --- |
| `/api/v1/conversations/` | GET | List only the caller's accessible conversations, newest updated first. |
| `/api/v1/conversations/` | POST | Create from optional `course_id` and `title`; omitted/null course means standalone. A foreign or missing course is 404. |
| `/api/v1/conversations/{id}/` | GET, DELETE | Read or delete one accessible conversation. |
| `/api/v1/conversations/{id}/documents/` | GET, POST | List conversation uploads or upload one validated PDF, DOCX, or PPTX as multipart `file`. Uploads use the existing processing handoff and status values. |
| `/api/v1/conversations/{id}/documents/{document_id}/` | GET, DELETE | Read upload status or delete an upload in this exact conversation. |
| `/api/v1/conversations/{id}/questions/` | POST | Ask with `{"question":"...","document_ids":[...]}`; selected IDs must be READY uploads in this conversation or, for course chat, normal materials in its course. Response matches the RAG questions contract. |

Each Document has exactly one scope: a course material has `course_id` and no
conversation; a chat upload has `conversation_id` and no `course_id`. A chat upload
is never returned by normal course material lists or accepted by study-guide,
quiz, or ordinary RAG document selection. Moving a chat upload into course
materials requires a separate, explicit action; this API does not provide one.
Deleting a conversation or its course cascades to its uploads. Chat upload files
are deleted from private storage as part of the database deletion transaction.
As with normal material deletion, a later database commit failure cannot restore
a file already removed from storage.
