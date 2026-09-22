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
