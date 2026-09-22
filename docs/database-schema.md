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
| `PENDING` | Uploaded, not processed yet |
| `PROCESSING` | Processing is in progress |
| `READY` | Processing succeeded |
| `FAILED` | Processing failed |

## Migration rules

- Database changes must use Django migrations.
- Migration files must be committed.
- Each developer uses their own local database.
- Database data is not shared through Git.
- Models and migrations are shared through Git.
- Never manually synchronize schemas between team members.
