# API Contract

All StudyForge APIs are versioned under `/api/v1/`.

The only implemented endpoint in this bootstrap is:

```text
GET /api/v1/health/
```

```json
{
  "status": "ok"
}
```

The endpoints below are the planned Sprint 1 API. Do not treat them as implemented.

## Planned Sprint 1 endpoints

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
POST   /api/v1/courses/{id}/documents/

GET    /api/v1/documents/{id}/
PATCH  /api/v1/documents/{id}/
DELETE /api/v1/documents/{id}/

POST   /api/v1/documents/{id}/notes/
GET    /api/v1/documents/{id}/notes/
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

Person 4 (Processing and Knowledge Foundation) owns background processing, including the transition from `PENDING` to `PROCESSING`, PDF text extraction, page preservation, chunking, embeddings, pgvector processing, retries, and the final transition to `READY` or `FAILED`.

The ordinary processing lifecycle is:

```text
PENDING -> PROCESSING -> READY or FAILED
```

Retry transitions and the status behavior when a processing handoff fails remain to be agreed with Person 4 before the full contract is frozen. The exact processing completion criteria for `READY` and any API-visible processing error fields also remain to be agreed.

This section defines status semantics and ownership. The upload request, response, and error contracts still need to be completed under SCRUM-8.

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

```json
{
  "id": 42,
  "course_id": 12,
  "name": "Processes.pdf",
  "status": "READY",
  "created_at": "2026-09-21T20:10:00Z"
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
