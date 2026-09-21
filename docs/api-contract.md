# Document Upload API Contract — SCRUM-8

## Status Values

| Status | Meaning |
|---|---|
| PENDING | Document uploaded and stored; not yet picked up for processing. |
| PROCESSING | Background worker is extracting text and building chunks. |
| READY | Processing finished successfully; document can be used for notes/Q&A. |
| FAILED | Processing failed (e.g. scanned PDF with no text layer, corrupted file). Includes an error_code. |

## Upload Endpoint

`POST /api/courses/{course_id}/documents`

### Request
- Multipart form upload
- Field: `file` (PDF only, max 25 MB)

### Response (202 Accepted)
```json
{
  "document_id": "uuid",
  "course_id": "uuid",
  "filename": "lecture1.pdf",
  "status": "PENDING",
  "created_at": "2026-09-21T10:00:00Z"
}
```

### Error Responses
- `400` — file too large, not a valid PDF, or missing file
- `404` — course does not belong to the authenticated user
- `401` — not authenticated

## Status Check Endpoint

`GET /api/documents/{document_id}`

### Response
```json
{
  "document_id": "uuid",
  "status": "READY",
  "page_count": 12,
  "error_code": null
}
```