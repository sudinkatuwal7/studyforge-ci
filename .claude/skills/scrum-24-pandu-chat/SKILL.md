---
name: scrum-24-pandu-chat
description: Shared context for SCRUM-24 (Pandu chat threads, tools used, clickable citations, history from the backend, deletion) in StudyForge, covering the acceptance criteria, agreed decisions (saving questions before answering, retry, 2-minute timeout, auto titles, search_sources tool trace, one authenticated file endpoint, citations described at response time, PDF at page and PPTX/DOCX download), the as-built backend API contract, the frontend plan, tests and mutation checks, pitfalls, follow-ups, and the Sprint 2 Git workflow. Use when working on apps/conversations, knowledge answer_question, the document file endpoint, readable_documents, ConnectedCourseChat, CourseChat, conversations.ts or chat types, or when committing, pushing, rebasing, or opening a PR for this task.
---

# SCRUM-24: Pandu chat threads, tools used and citations

## Purpose

Keep durable task context available to the owner and teammates across sessions. Guide implementation and explain the reasoning as work proceeds. This file is not proof that a decision is approved or that code is complete; the Jira issue is the source of truth if it conflicts with these notes.

## Start and end each session

- Read this file and the latest SCRUM-24 acceptance criteria.
- Inspect the branch, working tree and current code before editing (`git status`, `git log`, `git diff`). The owner often commits ahead of the plan; build on what is there.
- At handoff, add newly learned durable context here: clarified criteria, agreed decisions, discoveries, pitfalls, verified progress. No secrets, tokens or personal data. Keep task notes in this file.

## Working style (same as SCRUM-124, confirmed by the owner)

- Apply the changes (not chat-only code). Build a whole step, run targeted tests while working, then the full suite; then walk through each changed file in chat (new files in full, edits as diffs, tests summarised by what they check). Do not stop for approval after each file.
- Raise genuine design choices as questions with a recommendation; never decide silently. Correct earlier statements plainly when they turn out wrong.
- Mutation checks for key behaviours: back up the file, mutate, run the suite, restore from the backup and verify the hash. Never use git stash/checkout on the owner's tree for this.
- The owner makes the commits and arranges related changes into commits. Do not commit or offer commit messages unless asked.
- Point out anything beyond the acceptance criteria before doing it.
- Say what a test does not show.

## Jira task

SCRUM-24, branch `feature/SCRUM-24-pandu-chat-threads-tools-citations`, created from `origin/development` (rebased onto SCRUM-22, c2415dd). Code review: Sanish (runs the branch locally, records a short walkthrough in docs/, requests changes before approving); then squashed into development.

Scope: Pandu chat thread list (new, switch, delete); tools Pandu used per answer; clickable citations opening the source at the cited location; answers without citations display normally; loading and error states when sending; deletion wired to the backend API with no stale messages; history loaded from the backend; chat-upload deletion through the authorized API where exposed.

## Acceptance criteria (Jira, word for word)

1. The student can start a new conversation and see it in the thread list.
2. Selecting a thread loads its earlier messages.
3. Deleting a thread removes it from the list after a confirmation.
4. Each answer shows the tools Pandu used, when any were used.
5. Clicking a citation opens the source document at the cited page or slide.
6. Answers with no citations display without errors or empty citation sections.
7. Conversation deletion calls the backend API and removes the deleted conversation from the UI.
8. Refreshing the page reloads conversation history from the backend.
9. Deletion failures display an appropriate error without incorrectly removing the conversation from the UI.
10. Where chat-uploaded document deletion is exposed, the UI calls the authorized backend deletion API and updates the displayed document list.

Agreed interpretation of 5: PDF opens at the cited page; PPTX shows "Slide N" and downloads (browsers cannot open a deck at a slide); DOCX has no location (see pitfalls) and downloads. Full "open at slide" needs PPTX-to-PDF conversion in the processing service; the owner is raising that with the team as a separate ticket or fix.

## Blockers found at the start (all on development at 9b90c07)

SCRUM-75 (PR #77) was frontend-only and chose sessionStorage for messages. There was no message persistence, no tool data on answers, and no way to fetch a document's file. The owner chose to build all three on this ticket rather than split a backend ticket.

## Team decisions (November 2026)

History (blocker 1):
- Save the question as PENDING before calling Pandu; a failure leaves it FAILED so a refresh still shows it. Pandu's reply is saved only on success, linked one-to-one to the question.
- The AI call never runs inside a database transaction: both question routes are wrapped in `transaction.non_atomic_requests` (ATOMIC_REQUESTS is off today; a test switches it on to prove the guard).
- Thread title: set once on the server from the first question when blank (60 chars, whitespace collapsed, "…"), via one conditional UPDATE (`title=""` filter). Never overwrites a title.
- Retry re-answers the same FAILED question (no duplicate). Body sends only `document_ids`; the saved text is re-asked.
- A PENDING question older than 2 minutes is shown as FAILED (read-time, no DB write) and can be retried. Measured from `attempted_at` (set on ask and each retry).
- First finished attempt wins: an answer arriving after the timeout is still saved; if two attempts finish, the first saved reply is returned to both. `mark_failed` only fails its own attempt (matches `attempted_at`).
- An INSUFFICIENT_CONTEXT reply is saved with empty content; the frontend supplies the sentence ("I couldn't find enough information in the selected references to answer that question.") so live and refreshed replies read the same.

Tools used (blocker 2):
- One trace entry per search that actually ran: `{"tool": "search_sources", "sources": {"course_materials": {...}, "chat_uploads": {...}}}` with `documents_searched` and `passages_used`. Only selected kinds appear. Retrieval is one embedding and one ranked top-5 search, so it is one entry, not one per kind.
- `passages_used: 0` can mean "outranked in the shared top results", not "nothing relevant".
- Failed answers keep no trace (criterion is about answers; logs are for debugging).
- The generic `/rag/questions/` endpoint (SCRUM-20) keeps its contract: the trace is stripped there.

Opening sources (blocker 3):
- One endpoint `GET /documents/{id}/file/` for course materials and chat uploads, since a citation only has `document_id`.
- Citations are described when the response is built (current name, format, availability), not snapshotted.

## Backend API contract (as built)

All conversation routes return 404 `{"code": "RESOURCE_NOT_FOUND", "message": "Resource not found."}` for foreign and missing IDs alike.

- `GET /conversations/` — threads, most recent activity first (asking bumps `updated_at`).
- `POST /conversations/` — `{course_id?, title?}`; blank title is filled from the first question.
- `DELETE /conversations/{id}/` — 204; deletes its messages (cascade) and chat uploads.
- `GET /conversations/{id}/messages/` — oldest first. Message: `{id, role: "user"|"assistant", status, content, citations, tool_trace, reply_to, created_at}`. Questions: PENDING | ANSWERED | FAILED (timed-out PENDING shown as FAILED), `tool_trace: []`. Replies: ANSWERED | INSUFFICIENT_CONTEXT, `reply_to` = question id.
- `POST /conversations/{id}/questions/` — `{question, document_ids}`. 200: `{status, answer, citations, tool_trace, question, reply}` (built from the saved reply). 503: `{code: "RAG_GENERATION_FAILED", detail, question}` with the FAILED question. Other failures (e.g. 404 for a document no longer available) also leave the question FAILED.
- `POST /conversations/{id}/messages/{message_id}/retry/` — `{document_ids}`. Same responses as questions; 409 `{code: "QUESTION_NOT_RETRYABLE"}` for answered or still-pending questions.
- Citation (in responses and history): `{chunk_id, document_id, page_number, excerpt, document_name, source_format: "pdf"|"docx"|"pptx"|null, available}`. Unavailable (deleted or no longer the student's): name and format null.
- `GET /documents/{id}/file/` — PDF `inline`, DOCX/PPTX `attachment`, filename = title + extension (not doubled); `Cache-Control: no-store`, `nosniff`; 404 shared body; 401 `AUTHENTICATION_REQUIRED`; 503 `MATERIAL_UNAVAILABLE` if the stored file is missing.
- `GET/DELETE /conversations/{id}/documents/{document_id}/` — chat uploads (existing).

## Architecture (as built, backend)

- `apps/conversations/models.py`: `ConversationMessage` (role, status, content, citations, tool_trace, reply_to one-to-one, created_at, attempted_at). Check constraint ties role, status, reply_to and attempted_at together. Index (conversation, created_at, id). Migrations 0002 (model), 0003 (tool_trace).
- `apps/conversations/services.py`: `start_question`, `start_retry` (row lock), `mark_failed`, `save_answer` (row lock; accepts PENDING or FAILED; returns an existing reply), `shown_status`, `title_from_question`, `citation_sources` (one query through `readable_documents`), `PENDING_TIMEOUT`, `TITLE_LENGTH`.
- `apps/conversations/views.py`: `ConversationMessagesView`, shared `answer_and_save`, `ConversationQuestionView`, `QuestionRetryView`.
- `apps/conversations/serializers.py`: `ConversationMessageSerializer` (status via `shown_status`; citations described from `context["sources"]`, required when a message has citations), `QuestionRetrySerializer` (RAGQuerySerializer with `question = None`).
- `apps/knowledge/services.py`: `_search_trace`, `SEARCH_SOURCES`; `answer_question` returns `{...validated answer, "tool_trace"}`. `apps/knowledge/views.py` strips it.
- `apps/identity/ownership.py`: `readable_documents(user)` = owner is the user AND (course material in an owned course, or upload in a reachable conversation). Stricter than `owned_documents` (course owner only), matching `question_documents`.
- `apps/documents/models.py`: `Document.source_format`. `apps/documents/views.py`: `DocumentFileView`.

## Frontend plan (not built yet)

Order: API client and types → thread list and history loading → retry and timed-out questions → tools used and citations → conversation and upload deletion.

Opening a cited source (the API uses a bearer token, not cookies, so a plain link cannot authenticate):
- Unavailable citation (`available: false`): show "This source is no longer available"; do not request the file.
- PDF: in the click handler, open a blank tab synchronously first (`window.open` after an `await` is blocked as a popup), then fetch the file with the token, make an object URL from the blob, and set the tab to `${url}#page=${page_number}`. Revoke the URL later, not immediately (the tab must load it). On failure close the tab and show the error (404 → no longer available; 503/network → could not open, try again).
- PPTX: label "Slide N"; fetch → blob → temporary `<a download="name.pptx">` click → revoke. DOCX: no location label; same download.
- Files are fully loaded into memory (uploads are at most 20 MB).

## Tests

- `backend/tests/documents/test_conversation_messages.py`: history order and linking; INSUFFICIENT_CONTEXT shape; failures keep FAILED; question committed before the AI call; AI call outside transactions even with ATOMIC_REQUESTS on; invalid/foreign requests save nothing; titles; ordering by activity; deleted-thread cases (no reply, 404 not 500); retry (same question, sources, 409s, 404s, saved text used); timeout at 1:55 vs 2:00 without DB writes; late answers; first answer wins (unit and end to end); old attempt cannot fail a newer retry; DB constraints; trace saved on replies; failed answers keep no trace.
- `backend/apps/knowledge/tests/test_questions_api.py`: trace from real retrieval (one entry with breakdown, outranked shows 0, nothing found keeps the trace); generic endpoint does not expose the trace.
- `backend/tests/documents/test_document_file.py`: file headers and bytes; DOCX/PPTX downloads and filenames; both kinds of chat upload; shared 404 including revoked course access; 401; 503; citation details live and after refresh, renamed and deleted sources, foreign source reveals nothing, history uses at most 5 queries; real PPTX upload → CORS preflight from the frontend origin → identical download.
- `backend/tests/documents/test_conversations.py`: messages and retry routes added to the shared foreign/missing 404 test.
- Mutation checks M1–M16 all caught by their intended tests (old attempt failing a retry, late answers dropped, atomic question route, timeout display, title overwrite, deleted-thread 500, response built from result instead of saved reply, trace counts/kinds/shape, generic endpoint leaking the trace, trace not saved, ownership rule, PDF inline, citation lookup ownership, one query per citation).
- Not shown by tests: concurrent retries with real simultaneous requests (row locks); real AI timing; opening a PDF at a page in a real browser; Safari's handling of `#page` on blob URLs.

## Repository discoveries

- PPTX `page_number` is the 1-based slide position (verified by running the processing service parser and chunker on a generated deck): empty slides keep their number but produce no chunks; hidden slides are numbered like PowerPoint; every chunk of a slide carries its number and starts with `[Slide N: title]`.
- DOCX `page_number` is always 1, an internal compatibility value, never a page citation (services/document-processing/processing_service/document_parser.py).
- Gemini calls: 30 s timeout × 2 attempts, plus one citation-repair call, so a live answer can exceed 2 minutes. Hence late answers are kept.
- `owned_documents` excludes chat uploads; chat uploads are reachable through conversation routes and `question_documents`.
- CORS: `authorization` is allowed by django-cors-headers defaults; `http://localhost:5173` is the default allowed origin.

## Pitfalls learned

- Backend tests need Docker Desktop running: `backend/venv/Scripts/python.exe scripts/check.py --component backend [--suite documents|ai-learning]`.
- Repo uses `core.autocrlf=true`; working files may be CRLF or LF. Git stores LF, so diffs are unaffected; mutation scripts must match either line ending.
- Bash heredocs turned `\n` escapes inside Python strings into real newlines; write helper scripts to the scratchpad with a file write instead.
- A streamed FileResponse that a failing test never reads stays open; on Windows the temp media folder then cannot be deleted (WinError 32), adding a confusing error. The file tests read the body immediately.
- A long background test run once took 2 h 48 min (machine asleep); results were still valid.
- SCRUM-124 renames `.claude/skills/scrum-123-landing-page`; this task uses a new folder to avoid a rename conflict.
- Frontend (from SCRUM-124): run Vitest from PowerShell, not Git Bash (drive-letter case loads Vitest twice). jsdom has no CSS or layout.

## Known limits (accepted so far)

- PPTX citations download instead of opening at the slide (team ticket pending).
- Retry may return an answer from the older attempt's sources if that attempt finishes first (first finished wins).
- A failed attempt's search is not recorded.

## Follow-up tickets (suggested; the owner creates them)

- PPTX (and possibly DOCX) to PDF conversion so citations open at the slide/page.
- Optional: show failed attempts' traces; reconcile `owned_documents` and `readable_documents` rules if course transfer becomes a feature.

## Progress (November 16, 2026)

Committed by the owner:
- 25b4c07 feat(SCRUM-24): persist Pandu conversation messages and retries
- fdcc5f6 feat(SCRUM-24): trace searches in knowledge answers
- d9f7608 feat(SCRUM-24): persist tool traces on Pandu replies

- ab00f12 feat(SCRUM-24): serve authorized source files for citations
- c5d8430 feat(SCRUM-24): enrich saved citations with current source details

Done, uncommitted: frontend (below). Last runs: full frontend suite 462/462, tsc -b, oxlint (no warnings in changed files), build; full backend suite 788 passed; frontend mutations F1–F8, R1–R4 (refreshThreads) and D1–D2 (reload after a failed delete) all caught.

Review guide written: `docs/scrum-24-teammate-validation.md` (same structure as SCRUM-124's). It includes a PowerShell seed script (a "SCRUM-24 review" course with a real 3-page PDF, PPTX and DOCX, saved chats with citations and tool traces, a failed and a pending question, a chat upload and a deleted cited source; re-running it only restarts the 2-minute window and prints the IDs for the cross-student check). The exact copy in the doc was trialled on a throwaway pgvector container (never the dev DB) with 23 API checks passing; the section C console snippet parses with Node; the Gemini-key check prints True/False only. Section F (real Gemini answers) was not run (no key).

Remaining: Sanish runs the guide and the report is filled in from the chat; browser checks the tests cannot do (PDF at page in Chrome/Edge/Firefox; Safari; dropdown and confirmations at 375/768/1440); AI report under docs/ai-dev-reports/; push and PR (state that backend blockers were built on this ticket).

## Frontend as built (November 16, 2026)

Owner's decisions: thread list is a "Chats" dropdown in the Pandu panel (course's chats only); sessionStorage keeps only the active chat ID and selected sources, messages always reload from the backend; "+ New chat" creates on the server at once ("New chat" until titled); inline delete confirmation; deleting the active chat switches to the most recent remaining one, or an empty state (no auto-create; auto-create only on first load with no chats); chat-upload delete in Sources with inline confirmation; tools used as a one-line summary expandable to per-source details; citations open the source, excerpt kept behind an "Excerpt" toggle; a PENDING question shows "Pandu is still answering…" with "Check again" (no polling).

- `api/conversations.ts`: message/citation/tool-trace types and validation; `listConversationMessages`, `retryConversationQuestion`, `deleteConversation`, `deleteConversationUpload`; answers return `question` and `reply`; `QuestionRequestError` keeps the saved FAILED question from a 503.
- `api/sourceFiles.ts`: `fetchSourceFile` (bearer token → Blob).
- `components/chat/chatHistory.ts`: `toChatMessage`, `citationView` (Page N for PDF, Slide N for PPTX, name only for DOCX, "Source no longer available"), `toolUses`, `replaceMessage` (in place, no duplicates), `NO_CONTEXT_TEXT`.
- `components/chat/ChatThreads.tsx`: dropdown list, new, select, inline delete confirm.
- `components/chat/CourseChat.tsx`: message states with per-question Retry / Check again, tools, citation list (none rendered when empty), history loading/error, no-chat empty state, notice, upload delete.
- `components/chat/ConnectedCourseChat.tsx`: threads and history state. In-flight rules: switching, new chat and deleting the active chat abort the browser request first; replies are ignored unless the request is live and its chat is still active; history loads are aborted by newer loads and checked against the active chat; Stop and unknown failures reload history. Loads read the token from a ref so an access-token refresh does not reload anything. A lifetime AbortController is recreated in an effect (StrictMode-safe). After an answer (or a 503 that saved the question) `refreshThreads` re-reads the list for server titles and order and merges it with what is shown: server titles/order for chats still shown; chats deleted meanwhile (here or in another tab) dropped; a chat created after the server answered kept at the top; uses `tokenRef` (an answer can outlast its token); a run counter makes an older refresh that finishes last a no-op. (Fixed November 16, 2026: the first version kept only chats on both lists, so a chat created during a refresh vanished from the list for the rest of the session; it also used the token captured at send time.) Known limit: if the active chat is deleted in another tab it leaves the list but stays open; the next send gets a 404. A failed delete of the open chat reloads its history only if the delete cancelled a send (to show that question as saved); otherwise the shown messages are current and are kept (fixed November 16, 2026: it used to always reload, so deleting the open chat while offline showed a second "could not be loaded" error).
- Tests updated where they mock chat APIs: `CourseWorkspace.test.tsx`, `CourseDetailPage.test.tsx` (both also touched by SCRUM-124; edits kept minimal).

Frontend pitfalls: a PDF tab must be opened synchronously in the click handler; jsdom Blob is not recognised by Node's Response (use string bodies in tests); `/Title/` role queries also match "Delete chat Title" (anchor with `^`); oxlint output is only reliable from Bash, Vitest only from PowerShell; mutation scripts must check the needle before creating the backup.

## Commands

- Backend (Docker running): `backend/venv/Scripts/python.exe scripts/check.py --component backend` (or `--suite documents` / `ai-learning`).
- Migrations without a database: `DATABASE_ENGINE=sqlite3 backend/venv/Scripts/python.exe backend/manage.py makemigrations --check --dry-run`.
- Frontend (PowerShell): `cd frontend; npx tsc -b; npm run lint; npm test; npm run build`.

## Team Git workflow (Sprint 2, still in use)

- Rebase + pull request + squash fast-forward merge; each Jira task becomes one commit on development; the task branch keeps its commits for grading.
- Task branches `feature/SCRUM-<id>-<short-description>` from the latest `origin/development` (never main). The workflow doc says "dev"; the branch is `development`.
- Commit regularly, each a meaningful step; do not squash locally.
- Before the PR: `git fetch origin`, `git rebase origin/development`, re-run tests. Never rebase development onto a task branch.
- After a rebase of pushed commits: `git push --force-with-lease`, only on your own task branch.
- Push to GitHub first (`github` remote, GitHub Actions CI), confirm the build, then to Bitbucket (`origin`), where PRs are opened. CI runs on feature/**, chore/**, development and main.
- PR into development with reviewers; Bitbucket "Squash, fast forward", message `SCRUM-24: <task name>`. Keep the task branch.
- AI curiosity report and grade go under docs/ai-dev-reports/, labelled with the Jira ID, in a separate final commit.
