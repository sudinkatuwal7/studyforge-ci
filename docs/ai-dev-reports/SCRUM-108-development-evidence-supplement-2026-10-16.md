# SCRUM-108 Development Evidence Supplement

## Scope and provenance

- Student: Sanish Shrestha
- Student ID: mpr92
- Assignment: SCRUM-108
- Date: 2026-10-16

This is a supplementary development-history and verification record, not a
complete curiosity-report transcript or a curiosity grade. The existing
[SCRUM-108 planning-session report](./curiosity-report-Shrestha-SCRUM-108-First-2026-10-16.md)
contains the verbatim planning conversation available for that session. It
predates implementation and accurately says that implementation and tests were
not performed in that session. It is preserved unchanged.

The active Copilot session record was subsequently located:
`ahp-session:/d5253bdc-e926-4b8c-8cf4-620b6e42c18a`, titled “Celery worker
implementation plan.” Its export contains 34 ordered turns and tool-call
inputs. It is not a complete transcript export: 15 AI responses are explicitly
cut off at 2,000 characters, and the tool-call inputs do not include the
corresponding tool outputs. The export reports `truncated: true`. User messages
and AI response text actually returned by that export are authentic; omitted
text and tool results cannot be recovered from it here and are not
reconstructed.

Accordingly, the chronology and acceptance table below remain a factual
supplement, not verbatim dialogue. The earlier planning-session curiosity
report remains unchanged and is not represented as the implementation
transcript.

## Conversation excerpts available verbatim

The planning report records the student asking:

> so step wise what would we do for this scrum
> in 5 steps

It also records the student asking:

> Propose the smallest implementation plan and stop for my approval.

The report records the plan being approved and a later request to keep the scope
small. These excerpts and the full planning transcript are in the linked
planning-session report; they are not evidence of implementation-session
dialogue.

The following implementation-session prompts are available verbatim in the
34-turn session record:

> Fix the SCRUM-108 internal result callback CSRF issue.
>
> 1. Inspect the existing InternalJobResultView and its authentication.
> 2. Add a focused test using APIClient(enforce_csrf_checks=True) that reproduces the CSRF rejection with a valid bearer token.
> 3. Apply the smallest secure fix: exempt only the internal result callback endpoint from CSRF while preserving bearer-token authentication.
> 4. Verify that valid bearer requests succeed and missing or invalid bearer tokens return 401.
> 5. Run the focused tests and report the exact results.
> Do not modify unrelated endpoints or teammate-owned functionality. Do not stage, commit, push, merge, or change branches.

The session also contains the student's request to review the uncommitted
SCRUM-108 changes without modifying files, followed by the request below:

> Complete Part 5 of SCRUM-108 now.
>
> Use the existing opt-in Docker Compose setup to run a real end-to-end test of Django → Redis → standalone worker → callback → PostgreSQL.
>
> Test a small PDF, verify its Job reaches SUCCEEDED, Document reaches READY, and chunks with embeddings are persisted.
>
> Confirm both independent worker containers can process jobs. Then run the minimum duplicate-delivery and failure/retry acceptance tests.
>
> Use existing infrastructure and test fixtures. If credentials or services are unavailable, identify the exact blocker. Do not substitute mocked tests for live verification.
>
> Do not modify code, stage, commit, push, merge, switch branches, or disable the legacy worker.
>
> Return PASS/FAIL/NOT TESTED for each criterion and the exact evidence.

The next report-preparation prompt asked to prepare professor-required SCRUM-108
AI development reports in `docs/ai-dev-reports/`, use authentic history, and
avoid implementation changes or Git operations. The latest prompt asked to
inspect the complete current conversation, preserve prompts and responses where
available, disclose inaccessible history, and reuse existing reports. Its
request and the AI response that followed are also present in the session
record. These examples are selected excerpts, not a substitute for the full
chronological transcript.

The live acceptance request was:

> Complete Part 5 of SCRUM-108 now.
>
> Use the existing opt-in Docker Compose setup to run a real end-to-end test of
> Django → Redis → standalone worker → callback → PostgreSQL.
>
> Test a small PDF, verify its Job reaches SUCCEEDED, Document reaches READY,
> and chunks with embeddings are persisted.
>
> Confirm both independent worker containers can process jobs. Then run the
> minimum duplicate-delivery and failure/retry acceptance tests.
>
> Use existing infrastructure and test fixtures. If credentials or services
> are unavailable, identify the exact blocker. Do not substitute mocked tests
> for live verification.
>
> Do not modify code, stage, commit, push, merge, switch branches, or disable
> the legacy worker.

The assistant inspected the existing opt-in configuration and available
credentials, then reported the live results in the conversation. The session
export retains only the beginning of that long AI response; the acceptance
evidence below is preserved from the contemporaneous development record, not
presented as a verbatim copy of the clipped response.

## Implementation history (summary, not transcript)

The implementation work recorded in the available project context proceeded
from the approved five-part plan:

1. Added the standalone Celery task and two separately named opt-in Compose
   workers consuming the `document-processing` Redis queue.
2. Reused extraction, chunking, and embedding logic in the standalone service
   without using the main application's models for worker processing.
3. Connected Django dispatch using `job_id`, `document_id`, and
   `source_sha256`; the worker retrieves the private PDF through an authenticated
   Django endpoint and submits authenticated callbacks.
4. Added Django callback validation and atomic persistence for result chunks,
   embeddings, page count, and Job/Document status. Tests cover idempotent
   terminal callbacks and stale attempts.
5. Investigated the callback's CSRF behavior with an
   `APIClient(enforce_csrf_checks=True)` regression test. The valid worker-style
   POST returned 403 before the change. The fix exempts only
   `InternalJobResultView` from CSRF; bearer-token authentication remains
   required. The focused callback suite subsequently passed all 14 tests,
   including valid bearer success and missing/invalid bearer 401 responses.
6. Ran the live Compose acceptance checks below. The legacy worker was not
   disabled or removed.

These points summarize available implementation context and repository state;
they do not reproduce the omitted prompt-and-response sequence. No code was
changed during the live acceptance/reporting portion documented here.

## Corrections and decisions observed

- The first direct Django test invocation could not connect to PostgreSQL.
  Testing was rerun using the repository's disposable-database approach; all 14
  focused internal callback tests passed.
- The first live test harness attempt had an inline-script indentation error.
  It did not run application code and was replaced by a corrected harness.
- PostgreSQL initially had no working host port mapping. The existing Compose
  database container was recreated with its existing persistent volume, after
  which host access worked. The volume was preserved.
- The checked-in `lecture_memory.pdf` emitted malformed-xref warnings and the
  initial upload attempt returned HTTP 400. To avoid treating that fixture as
  valid evidence, the successful live run used a small strict-valid,
  one-page PDF generated in memory. It did not alter repository fixtures.
- The live run used an isolated, temporary application database and
  process-local service token. The database was dropped afterward; it did not
  target development application records.
- The student explicitly required real, non-mocked verification, no
  implementation edits or Git operations, and that the legacy worker remain
  enabled. Those constraints were followed.

## Live acceptance evidence

The final live run used the opt-in `docker-compose.yml` plus
`docker-compose.processing.yml` configuration, Django, Redis, the standalone
worker containers, PostgreSQL, and the configured Gemini embedding path. A
small strict-valid PDF was uploaded through Django. The workers fetched it and
returned authenticated results; the checks queried Job, Document, Chunk, and
embedding rows in PostgreSQL.

| Criterion | Result | Observed evidence |
|---|---|---|
| Django upload → Redis queue → worker → callback → PostgreSQL | PASS | Django returned HTTP 201 for three uploads. Jobs 1, 2, and 3 reached `SUCCEEDED`; Documents 1, 2, and 3 reached `READY`. Each had one page, one persisted chunk, and a 768-dimensional embedding. |
| Two independent workers can process jobs | PASS | Celery ping identified both workers, and worker task/queue inspection showed the standalone task subscribed to `document-processing`. Worker 1 completed Job 1 with task ID `67e8d154-2573-435a-a126-1af446d518b1`; worker 2 completed Job 2 with task ID `b9a1f677-68cb-463e-976b-059ffafe3f57`. Each worker was tested with the other stopped. |
| Duplicate delivery does not change persisted terminal results | PASS | Redis-delivered task ID `685eafee000b4d9f87ccccf0848e2dbf` was consumed and rejected because Job 1 was terminal. Job/Document state, attempts, chunk IDs, and embeddings remained unchanged. The snapshot SHA-256 before and after was `a2d22dabe1dafffdabb4284fa46ae464ef855882b2270a82b6abd5fd9797a98f`. |
| Transient callback failure retries and recovers | PASS | Django was stopped after Job 3 was queued. The worker logged a Celery retry while Django was unavailable. After Django was restored, Job 3 reached `SUCCEEDED` and Document 3 reached `READY`; the callback recorded attempt 2, with one chunk and a 768-dimensional embedding. |
| Exhausted retries / terminal failure callback | NOT TESTED | The failure acceptance check exercised a transient outage followed by successful retry recovery, not exhaustion of all retries or a final `FAILED` callback. |

The final run's PostgreSQL test database was dropped and verified absent. The
test-started Compose containers were stopped; named volumes were preserved.
The live check did not disable the legacy worker. It did not establish
production cutover readiness, durable callback recovery after prolonged
outages, behavior after worker process loss, or retry exhaustion.

## Curiosity observations (ungraded and limited)

The planning transcript contains questions about whether the independent workers
belong in SCRUM-108, whether to target the new service, and how to keep the
implementation plan small. The live acceptance prompt specified concrete
observable conditions and explicitly rejected mocked substitutes. The later
CSRF prompt specified an enforced-CSRF regression test and preserved
service-token authentication. These observations are limited to the retrieved
record; they are not a score and do not assess curiosity during inaccessible
parts of the conversation.

The repository's separate curiosity-grading workflow was not run.

## Git workflow evidence

The student repeatedly prohibited staging, committing, pushing, merging, and
branch switching, including during the CSRF and live acceptance work. In the
captured tool-call inputs, Git commands are read-only inspection commands
(`git status`, `git diff`, `git branch --show-current`, and `git diff --check`);
no staging, commit, push, merge, or branch-switch command is recorded. Tool
outputs for these commands are not included in the session export, so this is a
statement about the captured inputs, not a reconstructed terminal transcript.
The current reporting work has likewise made no Git history or index changes.

## Course-reporting status

The existing planning-session transcript remains available and unchanged. The
[implementation-session curiosity report](./curiosity-report-Shrestha-SCRUM-108-Implementation-2026-10-16.md)
preserves the 34-turn session record as returned, with explicit markers for
clipped AI responses. This supplement records implementation outcomes and live
acceptance evidence and explains the session-record limits.

**The reporting package is not a complete professor-required implementation
curiosity transcript or curiosity grade.** The retrieved record omits the ends
of 15 AI responses and does not contain the outputs of tool calls, so a
verbatim complete transcript and fully evidenced chronological appendix cannot
be produced from it without inventing content. This supplement must not be
submitted as a replacement for a complete transcript or as evidence that a
grade was assigned. The transcript report and this supplement are the files
available for submission; the instructor should be told about the capture
limitations.
