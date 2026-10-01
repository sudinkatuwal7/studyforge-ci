# Study Guide API

Task: SCRUM-68
Owner: Gaurav Paneru

## Generate a study guide

POST /api/v1/documents/{document_id}/study-guide/

Authentication required.

### 200 OK
{
  "key_concepts": ["...", "..."],
  "important_points": ["...", "..."],
  "summary": "..."
}

### 409 Conflict — document has not finished processing
{"code": "DOCUMENT_NOT_READY", "detail": "This document is still processing."}

### 404 Not Found
Returned when the document does not exist **or** belongs to another user.
404 rather than 403, so the API never reveals that someone else's
document exists.

### 401 Unauthorized
No valid credentials.

## Notes
- The guide is persisted, so a repeat request does not re-run the model.
- Generation reads the document's chunks in document order (SCRUM-69),
  never by similarity search — this is a full-document summary, not a search.

## Open dependencies
- SCRUM-9 (Document model) — needed before this endpoint can be enabled.
- SCRUM-8 (status constants) — READY is currently a local placeholder string.