# Notes API

Tasks: SCRUM-68, SCRUM-112
Owner: Gaurav Paneru

Both generators read a document's chunks in reading order (SCRUM-69), never by
similarity search, because they summarize whole materials instead of answering
a query. All routes require authentication.

## Generate notes from course materials

POST /api/v1/courses/{course_id}/notes/

    {"document_ids": [12, 13]}

Accepts 1 to 20 unique ids. Every id must be a READY material the student owns
in this course; chat uploads are not accepted.

### 201 Created
{
  "id": 5,
  "title": "Notes: Lecture 1, Lecture 2",
  "course": 42,
  "overview": "...",
  "sections": [
    {
      "heading": "...",
      "key_concepts": [{"term": "...", "explanation": "..."}],
      "points": ["..."]
    }
  ],
  "source_documents": [{"id": 12, "name": "Lecture 1"}, {"id": 13, "name": "Lecture 2"}],
  "created_at": "2026-10-30T12:00:00Z"
}

Materials are read in upload order, regardless of the order of `document_ids`.
Each request calls the model and saves a new row; it is not idempotent.

### Errors

Branch on `code`, because several errors share a status.

| Status | `code` | Meaning |
|---|---|---|
| 400 | none | Empty, duplicate, malformed, or more than 20 ids. |
| 401 | none | No valid credentials. |
| 404 | none | The course or any id is missing, not the student's, in another course, or a chat upload. A material deleted during generation also returns 404. The response does not say which id. |
| 409 | `DOCUMENT_NOT_READY` | Some materials are not READY. `document_ids` lists them. |
| 409 | `DOCUMENT_HAS_NO_TEXT` | Some READY materials have no readable text. `document_ids` lists them. |
| 422 | `NOTES_INPUT_TOO_LARGE` | The selection exceeds the total size limit. Select fewer materials. |
| 503 | `NOTES_GENERATION_FAILED` | The provider failed or returned invalid output. Nothing was saved, so retrying is safe. |

### Input limits

Sizes are characters, roughly 4 per token. Generation runs inside one HTTP request.

| Setting | Default | Effect |
|---|---|---|
| `NOTES_BATCH_CHAR_LIMIT` | 60000 | Maximum size of one notes batch. A larger selection is split into batches, summarized batch by batch, and merged in a final call. A material split across batches keeps its title on every part. |
| `NOTES_TOTAL_CHAR_LIMIT` | 300000 | Maximum selection size. Larger selections are rejected, not sampled, so notes never knowingly omit content. |

A batch of about 200,000 characters occasionally came back as a brief summary
that dropped most topics while still being valid, which is why batches are small.

### Output checks

Each model call is repeated once if its output is invalid or too short for its
input (under 2% of a batch, or 25% of a merge, for input of 20,000 characters or
more). If the repeat also fails, the request returns 503 and saves nothing.

The length check catches a model that skimmed. It cannot prove that every topic
was covered, so a selection can still lose individual details.

## Read saved notes

GET /api/v1/notes/{notes_id}/

Returns the same body as generation, with status 200, and never calls the model.
Returns 404 when the notes do not exist or belong to another student.

## Deletion

Deleting a material deletes all notes built from it, including notes that also
used other materials, so its content does not outlive it. Deleting the course
deletes its notes. Renaming a material keeps them, and `source_documents` shows
the new name.

## Generate a single-document study guide

POST /api/v1/documents/{document_id}/study-guide/

Used by the panel shown after an upload. Every request calls the model and
replaces the document's saved guide; no route reads a saved guide back.

### 200 OK
{
  "key_concepts": ["...", "..."],
  "important_points": ["...", "..."],
  "summary": "..."
}

### Errors

| Status | `code` | Meaning |
|---|---|---|
| 401 | none | No valid credentials. |
| 404 | none | The document does not exist or is not the student's. 404 rather than 403, so the API never reveals that someone else's document exists. |
| 409 | `DOCUMENT_NOT_READY` | The document is still processing. |
| 409 | `DOCUMENT_HAS_NO_TEXT` | The document reached READY with no readable text, such as a scanned PDF. |
| 503 | `STUDY_GUIDE_GENERATION_FAILED` | The provider failed or returned invalid output. Retrying is safe. |
