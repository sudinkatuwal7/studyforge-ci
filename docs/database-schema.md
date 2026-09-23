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

## Migration rules

- Database changes must use Django migrations.
- Migration files must be committed.
- Each developer uses their own local database.
- Database data is not shared through Git.
- Models and migrations are shared through Git.
- Never manually synchronize schemas between team members.
