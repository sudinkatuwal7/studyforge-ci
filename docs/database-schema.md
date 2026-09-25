# Database Schema

These models are the intended Sprint 1 relationships. They are not implemented yet.

```text
User
 │
 │ 1:N
 ▼
Course
 │
 │ 1:N
 ▼
Document
 │
 ├── processing status
 ├── DocumentChunk
 └── Note
```

## Agreed relationship names

| Field | Meaning |
|---|---|
| `Course.owner` | The user who owns the course |
| `Document.course` | The course the document belongs to |
| `DocumentChunk.document` | The document a chunk was extracted from |
| `Note.document` | The document a note was generated for |

## Common fields

Models should generally include:

- `id`
- `created_at`
- `updated_at`

## Document processing states

| State | Meaning |
|---|---|
| `PENDING` | The PDF has been accepted and stored, and a Document record exists, but processing has not started. |
| `PROCESSING` | The background worker has started processing the document. |
| `READY` | Processing completed successfully and the document can be used by downstream study features. |
| `FAILED` | Processing failed and the document cannot currently be used. |

These are the only valid document status values, using the exact uppercase spelling shown. See the [Document status contract](api-contract.md#document-status-contract) for ownership, the processing handoff, and lifecycle details.

The SCRUM-8 contract also defines `PENDING -> FAILED` when upload-side processing dispatch definitely fails after persistence. Retain the Document/file and expose `PROCESSING_DISPATCH_FAILED` through the public `error` object (`code` and safe `message`). An uncertain dispatch outcome does not itself change the persisted status. This documents the API boundary only; it does not implement models or worker transitions.

## SCRUM-9: Document and Job design boundary

SCRUM-9 requires **both Document and Job models and migrations**. The existing relationship diagram does not define Job, and its omission does not remove Job from the Jira scope. This section records evidence and open decisions; it does not declare an agreed Job schema.

### Document: established integration requirements

| Concern | Evidence / constraint |
|---|---|
| Model location | Processing branch `99c9e3d` imports `apps.documents.models.Document`; notes branch `139e60c` references `documents.Document`. |
| Course relationship | Use `Document.course` as a ForeignKey to the real Course model. Notes already checks ownership through `course__owner`. Do not duplicate Course or store a free-standing course ID. |
| Course key and owner | Course branch `269420d` defines `Course.owner` against `settings.AUTH_USER_MODEL`, with no explicit primary key; its Django default is `BigAutoField`. No Course migration exists in that snapshot. |
| File | Processing explicitly reads `Document.file`; use a storage-backed field compatible with opening the file in binary mode. The physical storage name is independent of the public display name. |
| Status | Processing reads/writes `status` and supports `Document.Status` members. Upload initializes `PENDING`; processing owns subsequent lifecycle transitions. |
| Name and timestamps | The SCRUM-8 working API contract uses `name`, `created_at`, and `updated_at`. Status writers must update modification time. |

Processing currently checks for optional `error_code`, `error_message`, `extracted_text`, and `page_count` fields. Those checks are not an agreed requirement to add all four to Document. Decide storage ownership with Sanish, and keep public errors separate from internal exception text. Its current storage hook may write nothing and still proceed to `READY`; the required persisted output must be agreed before integration.

### Job: contract questions before migration

No Job/ProcessingJob/DocumentJob model, relationship, or field schema was found in the inspected local and remote branches on 2026-09-23. The current processing task accepts `document_id` only and updates Document directly.

Sudin and Sanish must agree:

1. What a Job represents: one processing lifecycle or one execution/attempt.
2. Whether a Document has one Job or can have several, and which app owns the model/migrations.
3. Who creates the Job, when it is committed, and how the processing task finds and updates it.
4. Which fields are necessary, where authoritative status/errors live, and how any repeated data stays consistent.
5. Whether a private task identifier or attempt metadata is actually needed; do not add them merely because Celery exists.
6. Job behavior for dispatch failures and worker retries, plus deliberate relationship deletion behavior needed by the initial schema.

Keep the resulting model minimal. Do not silently omit Job, choose one-to-one versus one-to-many, introduce new status names, or build retry history before this agreement. No public Job representation is required by existing repository evidence.

### Migration prerequisites and future compatibility

- Integrate the agreed custom User baseline before creating dependent migrations. Authentication branch `166784f` sets `AUTH_USER_MODEL = "users.User"` and includes its initial migration.
- Depend on Aashish's actual registered Course app and committed migration. Do not invent a Course migration name or reference a substitute model.
- Create Document/Job migrations only after their relationship and ownership decisions are recorded. Use normal Django relations and migrations rather than manually copied IDs.
- Specify necessary `on_delete` behavior deliberately with the affected owners; this does not implement the later rename/delete endpoint or cleanup policy tasks.
- Keep display naming separate from storage keys so future rename work does not require moving uploaded files.

## Migration rules

- Database changes must use Django migrations.
- Migration files must be committed.
- Each developer uses their own local database.
- Database data is not shared through Git.
- Models and migrations are shared through Git.
- Never manually synchronize schemas between team members.
