# Database Schema

User, Course, StudySession, Document, and Job have model definitions. DocumentChunk and Note remain planned relationships. SCRUM-9 adds persistence only, not upload or processing behavior.

```text
User
 │
 │ 1:N
 ▼
Course
 │
 ├── 1:N Document
 │    ├── processing status
 │    ├── Job (1:N)
 │    ├── DocumentChunk
 │    └── Note
 └── 1:N StudySession
```

## Agreed relationship names

| Field | Meaning |
|---|---|
| `Course.owner` | The user who owns the course |
| `StudySession.course` | The course a study session belongs to; the session owner is that course's owner |
| `Document.course` | The course the document belongs to |
| `Document.owner` | The owning user, explicitly required by SCRUM-9 Jira |
| `Job.document` | The document for one logical processing run |
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

## SCRUM-9: Document and Job schema

The Jira requirement is Document (`owner`, `course`, `title`, `sha256`, `file`, `status`, `error_code`, `page_count`) and Job (`type`, `status`, `attempts`, `run_after`), with owner/status indexes and clean migrations on local PostgreSQL.

### Dependency provenance

The existing schema dependencies are integrated without their API implementations:

- Course model/package and `courses/0001_initial.py`: SCRUM-31 commit `5958401`, which includes SCRUM-30. The migration explicitly uses `BigAutoField` and depends on the configured user model.
- User model/app configuration and `users/0001_initial.py`: authentication commit `166784f`. The existing custom User uses `BigAutoField`, and its migration depends on `auth/0012_alter_user_first_name_max_length`.
- `AUTH_USER_MODEL = "users.User"`; owner relations use `settings.AUTH_USER_MODEL`. User and Course implementation files are retained from those commits.

### Document

Defined in `apps.documents.models.Document`. The automatically generated `id` is a `BigAutoField`, matching the documents app and project configuration.

| Field | Storage and default |
|---|---|
| `owner` | Required FK to `settings.AUTH_USER_MODEL`, `CASCADE`, reverse name `documents`; automatically indexed. |
| `course` | Required FK to the actual `courses.Course`, `CASCADE`, reverse name `documents`; automatically indexed. |
| `title` | Required `CharField(255)`; display filename including its extension. Supplies the API's `name`. |
| `sha256` | Required `CharField(64)` with a lowercase hexadecimal digest validator. Not unique or indexed; duplicate content is not prohibited. Hash calculation is outside this task. |
| `file` | Required `FileField`, storage-name length 255, under `documents/%Y/%m/`, using Django's configured default storage. No file writes, PDF validation, or extraction occur merely by declaring the field. |
| `status` | Indexed `CharField(10)` with `Document.Status` choices; defaults to `PENDING`. A database check permits only the four SCRUM-8 statuses. |
| `error_code` | Nullable `CharField(64)`, defaults to `None`; choices and database check allow `PROCESSING_FAILED` and `PROCESSING_DISPATCH_FAILED`. |
| `page_count` | Nullable `PositiveIntegerField`, defaults to `None` until known. Validation and a database check require at least one page when populated. |
| `created_at` | Non-editable datetime; initialized when the Document is saved for the first time. |
| `updated_at` | Non-editable datetime; updated on normal and partial model saves. |

A normal initial save assigns the same timestamp to `created_at` and `updated_at`. A partial `save(update_fields=[...])` also includes `updated_at`; an empty `update_fields` remains a no-op. Bulk creation/update and `QuerySet.update()` bypass the model's timestamp maintenance: callers using those operations must supply timestamps themselves. No lifecycle transition is performed by `save()`.

`Document.owner_id` must equal `Document.course.owner_id`. Both FKs are required by the schema, but ordinary FK constraints do not enforce equality across the related Course row. Creation/update callers must preserve that invariant; this task does not implement request authorization or silently choose an owner.

SCRUM-8's public representation is unchanged: map `title` to `name`, and map a terminal `error_code` to its fixed safe `{code, message}` response. No separate name or error-message column is needed. There is no raw exception text, extracted text, or embedding storage in this model. Serializers and processing behavior are outside SCRUM-9.

The nullable code supports a missing error normally. The schema does not enforce a status/error pairing or execute state transitions; the agreed upload/processing writers must maintain the API contract's failure semantics.

### Job

Defined in `apps.documents.models.Job`, owned with the document persistence schema. This does not register or implement Person 4's processing app.

A Document has zero or more Jobs; each Job belongs to exactly one Document. Each row represents a logical processing run/handoff, with execution attempts counted within that run. A future separate run may create another Job. This is the provisional design authorized for SCRUM-9; no worker currently updates it in this branch.

| Field | Storage and default |
|---|---|
| `id` | Automatically generated `BigAutoField` primary key. |
| `document` | Required FK to Document, `CASCADE`, reverse name `jobs`; automatically indexed. |
| `type` | `CharField(32)` with `Job.Type`; defaults to `DOCUMENT_PROCESSING`, currently the only allowed value. |
| `status` | Indexed `CharField(16)` with `Job.Status`; defaults to `QUEUED`. Allowed values: `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`. |
| `attempts` | Non-negative `PositiveIntegerField`, defaults to zero. Future execution code owns counting attempts. |
| `run_after` | Nullable datetime, defaults to `None`, meaning no scheduled delay. A value denotes earliest execution eligibility. |

Job status describes a run, whereas Document status describes usability of the document. Job type/status have database checks. Job has no public API, owner duplicate, error duplicate, Celery task ID, automatic attempt increment, scheduler, or retry algorithm. Extra Job timestamps and scheduling indexes are omitted from this minimal schema.

### Relationships, indexes, and migrations

`User -> Course -> Document -> Job` uses one-to-many relationships; User also has a direct one-to-many relationship to Document. All dependent FKs use Django `CASCADE` for database rows. This does not delete physical files or implement any delete endpoint.

The owner FK provides the Jira owner index without a duplicate explicit index. Document and Job status fields each use `db_index=True`; Course and Job-document FKs also receive Django's normal indexes. No digest, timestamp, or `run_after` index is added without a current query requirement.

`documents/0001_initial.py` creates Document and Job with their FKs, indexes, and checks. Its dependencies are `courses/0001_initial` and `migrations.swappable_dependency(settings.AUTH_USER_MODEL)`, resolving to the integrated User baseline. No processing migration is needed.

### Local PostgreSQL verification

Backend settings use `django.db.backends.postgresql` and read `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, and `POSTGRES_PORT` from the process environment. `backend/.env.example` documents those names; Django does not automatically load an `.env` file. Keep actual credentials out of Git.

Use Python 3.12 with `backend/venv`, install `backend/requirements.txt`, and provide a running local PostgreSQL database plus its connection variables. Then run from `backend`:

```text
python manage.py check
python manage.py makemigrations
python manage.py makemigrations --check
python manage.py migrate
python manage.py test apps.documents
```

`apps.documents.tests` contains only focused model/schema checks. Upload/ownership API tests and worker execution are outside this task. Successful SQLite checks do not satisfy Jira's PostgreSQL acceptance criterion.

Verified locally with Python 3.12.12, Django 6.1.1, and PostgreSQL 16.15: system checks passed, no migration drift remained, all initial migrations applied, and all seven schema tests passed on PostgreSQL.

## SCRUM-38: Quiz and Question schema

Defined in `apps.quizzes.models`. Persistence only: quiz generation, hiding correct answers before submission, and scoring belong to SCRUM-42 and SCRUM-51. Quizzes stay in the main Django backend (see the [processing contract](architecture/document-processing-contract.md)), so `Quiz.course` is an ordinary FK.

```text
User 1:N Quiz N:1 Course
Quiz 1:N Question
```

### Quiz

| Field | Storage and default |
|---|---|
| `owner` | Required FK to `settings.AUTH_USER_MODEL`, `CASCADE`, reverse name `quizzes`. |
| `course` | Required FK to `courses.Course`, `CASCADE`, reverse name `quizzes`. |
| `title` | Required `CharField(255)`. |
| `created_at` / `updated_at` | Set automatically on create / every save. |

`Quiz.owner_id` must equal `Quiz.course.owner_id`. `full_clean()` enforces it; callers that skip validation must preserve it, as with Document.

### Question

| Field | Storage and default |
|---|---|
| `quiz` | Required FK to Quiz, `CASCADE`, reverse name `questions`. |
| `position` | `PositiveSmallIntegerField`, 1-based display order. Unique per quiz and checked `>= 1` in the database. Default ordering. |
| `text` | Required question text. |
| `options` | `JSONField` list of at least two non-empty strings, in display order. |
| `correct_option_index` | 0-based index into `options`; exactly one correct answer per question. |
| `explanation` | `TextField`, may be blank. |

The `options` shape and the index range are validated by `full_clean()`, not by database constraints. Neither `save()` nor DRF's `ModelSerializer` calls `Model.clean()`, so SCRUM-42 must call `full_clean()` on each Quiz and Question before saving (or repeat these checks in the serializer's `validate()`). Source documents are not linked yet; that is deferred to SCRUM-42 pending SCRUM-98.

## SCRUM-82: Study session schema

Defined in `apps.courses.models.StudySession`. This stores one dated study session. The calendar reads these rows together with existing To-Do due dates; there is no separate calendar or aggregate table.

```text
User 1:N Course 1:N StudySession
```

### StudySession

The automatically generated `id` is a `BigAutoField`.

| Field | Storage and default |
|---|---|
| `creation_key` | Required `UUIDField`, default `uuid.uuid4`, `unique=True`, `editable=False`. Identifies one create request so a matching retry does not insert a second row. Not returned by the API. |
| `title` | Required `CharField(200)`. |
| `course` | Required FK to `courses.Course`, `CASCADE`, reverse name `study_sessions`; automatically indexed. |
| `date` | Required `DateField`. Stores the calendar date as entered (`YYYY-MM-DD`). It is not a timezone-aware timestamp. |
| `time` | Nullable `TimeField` (`blank=True`, `null=True`). Stores the entered clock time with no timezone conversion. Omitted and `null` both mean no time. |
| `created_at` | Non-editable datetime; set on the first save. With `USE_TZ`, this is a timezone-aware timestamp. |
| `updated_at` | Non-editable datetime; updated on each normal save. |

There is no owner column. Access follows `StudySession.course.owner`, the same ownership path as a To-Do. Deleting a course deletes its study sessions through `CASCADE`. The unique `creation_key` is the only extra constraint; date and time are not indexed.

`courses/0004_studysession.py` creates the model and depends on `courses/0003_todoitem_creation_key`. Request fields, status codes, and retry behavior are in the [study-session API contract](api-contract.md#study-session-calendar-endpoints).

## Migration rules

- Database changes must use Django migrations.
- Migration files must be committed.
- Each developer uses their own local database.
- Database data is not shared through Git.
- Models and migrations are shared through Git.
- Never manually synchronize schemas between team members.
