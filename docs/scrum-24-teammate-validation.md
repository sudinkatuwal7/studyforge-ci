# SCRUM-24 Teammate Validation Report

## Report purpose

This report records an independent teammate's experience running and reviewing
the SCRUM-24 branch. The branch turns Pandu's chat panel into a list of saved
chats: students can start, switch and delete chats, see what Pandu searched to
answer, and open each cited source at its page. Messages are now saved on the
server, so a refresh reloads them.

The teammate's feedback is the most important result. Record every problem they
encounter, including setup failures, unclear instructions, unexpected output,
slow behavior, missing prerequisites, and concerns about the design. Do not mark
the report complete only because automated tests pass. Opening sources, pop-ups,
and timing (switching or deleting chats while Pandu is answering) are browser
behavior the automated tests cannot fully check, so the browser checklist below
matters as much as the test run.

## Review status

- Reviewer: Sanish
- Report status: `complete`
- Overall result: `satisfactory`
- Final recommendation: `approve`

## Branch under review

```text
feature/SCRUM-24-pandu-chat-threads-tools-citations
```

## What this branch does

- **Chat list.** A "Chats" dropdown in Pandu's panel lists the course's chats,
  newest first, with "+ New chat", switching, and Delete with an inline
  confirmation. A new chat is called "New chat" until its first question names
  it (the first 60 characters, set once by the server).
- **History from the server.** Questions and Pandu's replies are saved in the
  database. Switching chats or refreshing the page reloads them from the
  backend. The browser keeps only the open chat's ID and the selected sources
  (in `sessionStorage`).
- **Failed questions stay.** A question is saved before Pandu is called. If
  answering fails, it stays in the chat with **Retry**, which re-answers the
  same question without adding a copy. A question still waiting after 2 minutes
  is shown as failed so it can be retried; if its answer arrives later, it is
  still saved.
- **Tools used.** Each answer shows what Pandu searched, for example "Searched
  course materials and your uploads", and expands to how many documents were
  searched and how many passages were used.
- **Citations open their source.** A PDF citation opens the file in a new tab at
  the cited page. A PowerPoint citation is labelled "Slide N" and downloads the
  file, because browsers cannot open a deck at a slide. A Word citation
  downloads the file and shows no page, because Word files have no reliable page
  numbers. A citation whose document was deleted, or is no longer the student's,
  says "Source no longer available". Each citation keeps an **Excerpt** toggle.
- **Answers without citations** show no sources section at all.
- **Deleting chats and chat uploads** calls the backend. A failure shows an error
  and keeps the item.
- **Answers in flight.** Switching chats, starting a new chat or deleting the
  open chat stops the browser waiting for the reply. The reply never appears in
  another chat; the server still saves it, and it shows when that chat is
  opened again.

**Note for reviewers: the backend work is on purpose.** SCRUM-75 (PR #77) kept
Pandu's messages only in the browser, and the backend had no record of what
Pandu searched and no way to download a document. The task owner chose to build
all three on this ticket:

- The `ConversationMessage` model with migrations `conversations.0002` and
  `0003`, `GET /conversations/{id}/messages/` and
  `POST /conversations/{id}/messages/{message_id}/retry/`. Both question routes
  are non-atomic, so the AI call never runs inside a database transaction.
- A `tool_trace` on Pandu's answers. The generic `POST /rag/questions/` response
  is unchanged: the trace is removed there.
- `GET /documents/{id}/file/` for course materials and the student's own chat
  uploads, and `document_name`, `source_format` and `available` on every
  citation.

**Also note:** `components/courses/CourseWorkspace.test.tsx` and
`pages/CourseDetailPage.test.tsx` only have their mocks updated here, and
SCRUM-124 also changes both files. Whichever branch merges second needs a small
rebase there.

## Acceptance criteria

1. The student can start a new conversation and see it in the thread list.
2. Selecting a thread loads its earlier messages.
3. Deleting a thread removes it from the list after a confirmation.
4. Each answer shows the tools Pandu used, when any were used.
5. Clicking a citation opens the source document at the cited page or slide.
6. Answers with no citations display without errors or empty citation sections.
7. Conversation deletion calls the backend API and removes the deleted
   conversation from the UI.
8. Refreshing the page reloads conversation history from the backend.
9. Deletion failures display an appropriate error without incorrectly removing
   the conversation from the UI.
10. Where chat-uploaded document deletion is exposed, the UI calls the authorized
    backend deletion API and updates the displayed document list.

Agreed interpretation of criterion 5: a PDF opens at the cited page; a
PowerPoint citation shows "Slide N" and downloads; a Word citation has no page
and downloads. Opening a deck at its slide would need PowerPoint-to-PDF
conversion in the processing service, which the team is considering as a
separate ticket.

Also in scope: loading and error states when sending a message.

## Main files touched

- Backend (`backend/`)
  - `apps/conversations/models.py`: `ConversationMessage`.
  - `apps/conversations/services.py` (new): saving a question before the AI call
    and the reply after it, Retry, the 2-minute rule, chat titles, and looking up
    cited documents.
  - `apps/conversations/views.py`, `serializers.py`, `urls.py`: the history,
    question and retry endpoints.
  - `apps/conversations/migrations/0002_conversation_message.py` and
    `0003_message_tool_trace.py` (new).
  - `apps/knowledge/services.py`: builds the `tool_trace` from the search that
    ran. `apps/knowledge/views.py`: keeps the generic endpoint's response
    unchanged.
  - `apps/documents/models.py` (`source_format`), `views.py`
    (`DocumentFileView`), `urls.py`.
  - `apps/identity/ownership.py`: `readable_documents`, which decides whose
    files can be opened.
  - Tests: `tests/documents/test_conversation_messages.py` (new),
    `tests/documents/test_document_file.py` (new),
    `tests/documents/test_conversations.py`,
    `apps/knowledge/tests/test_questions_api.py`.
- Frontend (`frontend/src/`)
  - `api/conversations.ts`: history, retry and delete calls, and checks on what
    the server returns. `api/sourceFiles.ts` (new): downloads a cited file with
    the login token.
  - `components/chat/ConnectedCourseChat.tsx`: chats, history, sending, retries,
    deletion and opening sources.
  - `components/chat/CourseChat.tsx`: message states, tools used, citations and
    upload deletion.
  - `components/chat/ChatThreads.tsx` (new): the Chats dropdown.
    `components/chat/chatHistory.ts` (new): labels for citations and tools.
  - `types/chat.ts`, `styles/course-workspace.css`.
  - Tests: `components/chat/ConnectedCourseChat.test.tsx`,
    `components/chat/chatHistory.test.ts` (new), `api/conversations.test.ts`,
    and mock updates in `components/courses/CourseWorkspace.test.tsx` and
    `pages/CourseDetailPage.test.tsx`.
- Other: `.claude/skills/scrum-24-pandu-chat/SKILL.md`, the task's working notes
  for AI-assisted sessions.

## Prerequisites

- Windows PowerShell (the commands below are written for it), or adapt them for
  bash.
- Node.js and npm, with `frontend/node_modules` installed (`npm install`).
- Python 3.12 and the repository's `backend\venv` with dependencies installed.
- Docker Desktop running Linux containers, for the local Postgres and Redis and
  for the backend test runner.
- Chrome or Edge, for DevTools. Firefox too for check B3, if you have it.
- Two student accounts, Student A and Student B. Setup step 5 creates them.

No paid AI provider is needed. Pandu needs a Gemini API key to search. Without
one, every new question fails, which is how section D checks the error and Retry
states. If your `backend\.env` already has a key, Pandu searches but finds
nothing in the review files, and section D lists that outcome too. To see which
applies to you, run this in `backend\`. It prints `True` or `False`, never the
key:

```powershell
[bool]$env:GEMINI_API_KEY -or ((Test-Path .env) -and (Select-String -Path .env -Pattern '^\s*GEMINI_API_KEY\s*=\s*\S' -Quiet))
```

## Local setup

Use two terminals: Terminal 1 runs the backend, Terminal 2 runs the frontend.

### 1. Get the branch (Terminal 1, repository root)

```powershell
cd <repository root>
git fetch origin
git checkout feature/SCRUM-24-pandu-chat-threads-tools-citations
git pull
git log -1 --format="%h %an %ad %s" --date=short
```

Record the commit hash for the Environment section.

### 2. Start the database

```powershell
docker compose up -d
docker compose ps
```

**If another Postgres is installed on your machine** and already uses port 5432,
Django will connect to it instead of Docker's and fail with "password
authentication failed for user studyforge". Check with:

```powershell
Get-NetTCPConnection -LocalPort 5432 -State Listen | ForEach-Object { (Get-Process -Id $_.OwningProcess).ProcessName }
```

If this prints `postgres`, move Docker's database to 5433 for this session, and
set the same variable in every terminal that runs Django:

```powershell
$env:POSTGRES_PORT = '5433'
docker compose up -d
```

### 3. Start the backend (Terminal 1)

```powershell
cd backend
venv\Scripts\python.exe manage.py migrate
venv\Scripts\python.exe manage.py runserver
```

`migrate` should apply `conversations.0002_conversation_message` and
`conversations.0003_message_tool_trace`. Leave the server running.

### 4. Start the frontend (Terminal 2)

```powershell
cd <repository root>\frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm run dev
```

`frontend\.env` must contain `VITE_API_BASE_URL=http://localhost:8000/api/v1`.
Open the address Vite prints (usually `http://localhost:5173`).

### 5. Create the two students

Register **Student A** and **Student B** through the app's sign-up page.

### 6. Add the review data

This script gives Student A a course called **SCRUM-24 review** containing:

- Course materials, all `READY`: **Paging lecture** (a 3-page PDF whose pages
  say PAGE 1, PAGE 2 and PAGE 3 in large letters), **Week 2 slides** (3 slides)
  and **Reading** (a Word file).
- Chats, newest first: **Paging questions** (two answers with citations and
  tools used, one failed question, and a chat upload, **My notes**), **Still
  answering** (a question waiting for its answer) and **Memory replacement** (one
  answer).
- **Old handout**, cited by the first answer and then deleted, so that citation
  shows as unavailable.

The files are saved in `backend\media`, like real uploads. The processing worker
is not needed. Because the review files have no search vectors, Pandu finds
nothing in them when you ask new questions.

Run it in a third terminal, with `$env:POSTGRES_PORT = '5433'` first if you used
it in step 2:

```powershell
cd <repository root>\backend
$seed = "$env:TEMP\scrum24_seed.py"
@'
"""SCRUM-24 review data for one student: a course with real PDF, PPTX and DOCX
files, saved Pandu chats with citations and tool traces, and a chat upload.
Run it again to restart the 2-minute window of the "Still answering" chat."""
import hashlib
import os
import sys
from io import BytesIO
from uuid import uuid4

sys.path.insert(0, os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django

django.setup()
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.utils import timezone
from docx import Document as WordDocument
from pptx import Presentation
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from apps.conversations.models import Conversation, ConversationMessage
from apps.courses.models import Course
from apps.documents.models import Document
from apps.knowledge.models import Chunk

COURSE = "SCRUM-24 review"
PENDING = "Is this answer still coming?"
user = get_user_model().objects.get(email=sys.argv[1])


def report(course):
    """The IDs used by the access check between two students (checklist section C)."""
    chat = Conversation.objects.filter(course=course, title="Paging questions").first()
    failed = ConversationMessage.objects.filter(conversation=chat, role="user", status="FAILED").first()
    lecture = Document.objects.filter(course=course, title="Paging lecture").first()
    upload = Document.objects.filter(conversation=chat).first()
    print(f"IDs for section C: chat={chat and chat.pk} question={failed and failed.pk} "
          f"document={lecture and lecture.pk} upload={upload and upload.pk}")


course = Course.objects.filter(owner=user, name=COURSE).first()
if course:
    restarted = ConversationMessage.objects.filter(
        conversation__course=course, role="user", status="PENDING", content=PENDING
    ).update(attempted_at=timezone.now())
    print(f"Already seeded: course {course.pk}. Restarted the 2-minute window ({restarted} question).")
    report(course)
    sys.exit(0)
course = Course.objects.create(owner=user, name=COURSE, description="Pandu chat review data")


def pdf(pages):
    writer = PdfWriter()
    font = writer._add_object(DictionaryObject({
        NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    }))
    for heading, line in pages:
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
        })
        stream = DecodedStreamObject()
        stream.set_data(f"BT /F1 40 Tf 60 680 Td ({heading}) Tj /F1 16 Tf 0 -60 Td ({line}) Tj ET".encode("latin-1"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    out = BytesIO()
    writer.write(out)
    return out.getvalue()


def pptx(slides):
    deck = Presentation()
    for title, body in slides:
        slide = deck.slides.add_slide(deck.slide_layouts[1])
        slide.shapes.title.text = title
        slide.placeholders[1].text = body
    out = BytesIO()
    deck.save(out)
    return out.getvalue()


def docx(paragraphs):
    document = WordDocument()
    for text in paragraphs:
        document.add_paragraph(text)
    out = BytesIO()
    document.save(out)
    return out.getvalue()


def material(title, suffix, data, passages, conversation=None):
    item = Document(
        owner=user, course=None if conversation else course, conversation=conversation, title=title,
        sha256=hashlib.sha256(data).hexdigest(), status=Document.Status.READY,
        page_count=None if suffix == ".docx" else len(passages),
    )
    item.file.save(f"{uuid4().hex}{suffix}", ContentFile(data))
    chunks = [Chunk.objects.create(owner=user, document=item, page_number=page, content=text)
              for page, text in passages]
    return item, chunks


def cite(item, chunk):
    return {"chunk_id": chunk.pk, "document_id": item.pk, "page_number": chunk.page_number,
            "excerpt": chunk.content}


def search(course_materials, uploads=None):
    sources = {"course_materials": {"documents_searched": course_materials[0], "passages_used": course_materials[1]}}
    if uploads:
        sources["chat_uploads"] = {"documents_searched": uploads[0], "passages_used": uploads[1]}
    return [{"tool": "search_sources", "sources": sources}]


def ask(conversation, text, status="ANSWERED", reply=None, citations=(), trace=(), reply_status="ANSWERED"):
    question = ConversationMessage.objects.create(
        conversation=conversation, role="user", status=status, content=text, attempted_at=timezone.now())
    if reply is not None:
        ConversationMessage.objects.create(
            conversation=conversation, role="assistant", status=reply_status, content=reply,
            citations=list(citations), tool_trace=list(trace), reply_to=question)


lecture, lecture_chunks = material("Paging lecture", ".pdf", pdf([
    ("PAGE 1", "Virtual memory gives each program one large address space."),
    ("PAGE 2", "A page table maps virtual pages to physical frames."),
    ("PAGE 3", "A page fault happens when a requested page is not in memory."),
]), [
    (1, "Virtual memory gives each program one large address space."),
    (2, "A page table maps virtual pages to physical frames."),
    (3, "A page fault happens when a requested page is not in memory."),
])
slides, slide_chunks = material("Week 2 slides", ".pptx", pptx([
    ("Week 2", "Memory management"),
    ("TLB", "The TLB caches recent address translations."),
    ("Replacement", "LRU evicts the least recently used page."),
]), [
    (1, "[Slide 1: Week 2]\nMemory management"),
    (2, "[Slide 2: TLB]\nThe TLB caches recent address translations."),
    (3, "[Slide 3: Replacement]\nLRU evicts the least recently used page."),
])
reading, reading_chunks = material("Reading", ".docx", docx([
    "Thrashing happens when the working set does not fit in memory.",
]), [(1, "Thrashing happens when the working set does not fit in memory.")])
handout, handout_chunks = material("Old handout", ".pdf", pdf([("OLD", "This handout was deleted.")]),
                                   [(1, "This handout was deleted.")])

# Oldest first: the list shows the most recent chat at the top.
replacement = Conversation.objects.create(owner=user, course=course, title="Memory replacement")
ask(replacement, "Which page does LRU evict?", reply="The least recently used page.",
    citations=[cite(slides, slide_chunks[2])], trace=search((2, 1)))

still = Conversation.objects.create(owner=user, course=course, title="Still answering")
ask(still, PENDING, status="PENDING")

paging = Conversation.objects.create(owner=user, course=course, title="Paging questions")
notes, _ = material("My notes", ".pdf", pdf([("MY NOTES", "Frames are fixed-size blocks of memory.")]),
                    [(1, "Frames are fixed-size blocks of memory.")], conversation=paging)
ask(paging, "What does a page table do?",
    reply="A page table maps virtual pages to physical frames. The TLB caches recent translations, "
          "and thrashing happens when the working set does not fit in memory.",
    citations=[cite(lecture, lecture_chunks[1]), cite(slides, slide_chunks[1]),
               cite(reading, reading_chunks[0]), cite(handout, handout_chunks[0])],
    trace=search((4, 4), uploads=(1, 0)))
ask(paging, "Summarise this chat in one sentence.",
    reply="Page tables translate addresses, and the TLB makes that fast.", trace=search((4, 2), uploads=(1, 0)))
ask(paging, "Why do page faults happen?", status="FAILED")

# Cited above, then deleted: its citation shows "Source no longer available".
handout.file.delete(save=False)
handout.delete()

print(f"Seeded course {course.pk} for {user.email}: 3 materials (PDF, PPTX, DOCX), "
      f"chats 'Paging questions', 'Still answering', 'Memory replacement', and upload 'My notes'.")
report(course)
'@ | Set-Content -Path $seed -Encoding ascii
venv\Scripts\python.exe $seed "<student A email>"
```

It prints a line such as `IDs for section C: chat=3 question=8 document=1
upload=5`. Keep it for section C. Running the script again adds nothing: it
restarts the 2-minute window of **Still answering** (used in A6) and prints the
IDs again. To repeat the whole checklist from scratch, register another student
and run the script for them.

## Validation commands

Backend, from the repository root with Docker running. The runner makes its own
throwaway database and does not touch your development database:

```powershell
backend\venv\Scripts\python.exe scripts\check.py --component backend
```

To run part of it: `--suite documents` covers history, retries and the file
endpoint; `--suite ai-learning` covers the search trace.

Frontend, from `frontend\`, in PowerShell. Run Vitest from PowerShell, not Git
Bash: from Git Bash the `c:` vs `C:` drive letter can load Vitest twice and fail
with "Vitest failed to find the current suite".

```powershell
npx tsc -b
npm run lint
npm test
npm run build
```

Run one test file on its own:

```powershell
npx vitest run src/components/chat/ConnectedCourseChat.test.tsx
```

## Test cases

The backend tests replace Gemini with test doubles, and the frontend tests
replace the network, so neither shows a real browser opening a PDF at a page,
real pop-up blocking, or real timing. Those are in the browser checklist.

| Test file | What it proves | Criteria |
|---|---|---|
| `backend/tests/documents/test_conversation_messages.py` | The question is saved before Pandu is called and the reply after it; the AI call runs outside a database transaction, even with `ATOMIC_REQUESTS` on; a failure leaves the question FAILED after a refresh; titles are set once; Retry re-answers the same question without a copy (409 if it has not failed, 404 for another chat's question); after 2 minutes a waiting question shows as failed; a late answer is still saved and only the first answer is kept; deleting a chat deletes its history; the tool trace is saved and failed answers keep none | 1, 2, 4, 7, 8 |
| `backend/tests/documents/test_document_file.py` | PDFs open inline; slides and Word files download with their names; a student's own chat uploads open; another student's, missing and revoked files share one 404; 401 when signed out; 503 if the stored file is missing; citations show current names and formats, renamed and deleted sources, and nothing about another student's document; loading history uses at most 5 database queries; a real PPTX upload passes the browser's CORS check and downloads unchanged | 5, 10 |
| `backend/tests/documents/test_conversations.py` | The history and retry routes give another student the same 404 as a missing chat | access |
| `backend/apps/knowledge/tests/test_questions_api.py` | The trace comes from the real search: one entry per search, split into course materials and uploads, with 0 passages when outranked or when nothing is found; the generic `/rag/questions/` response is unchanged | 4 |
| `frontend/src/api/conversations.test.ts` | Endpoint URLs and methods; an answer must contain a saved question and a reply that belong together; malformed citations are rejected; a 503 keeps the saved failed question; a failed delete reports its status; the file request sends the login token | 5, 7, 9, 10 |
| `frontend/src/components/chat/chatHistory.test.ts` | Labels: "Page N" for PDFs, "Slide N" for slides, the name only for Word files, "Source no longer available"; the tools summary; the no-context sentence; question states; replacing a message in place without duplicates | 4, 5, 6 |
| `frontend/src/components/chat/ConnectedCourseChat.test.tsx` | Restoring after a refresh with only the chat ID and sources stored; new chat; switching, where a slower earlier load never shows in the newer chat; a reply in flight never lands in another chat when switching or deleting; delete with Cancel and Delete, a failure (one error when offline), a 404 treated as already deleted, and the empty state after the last chat; a failed question with Retry and no copies; an unknown outcome reloads the history; Stop; a question still being answered, with Check again; tools used, and no empty citation section; the PDF tab opened before the file arrives, slide and Word downloads, unavailable sources and blocked pop-ups; upload deletion; refreshing the list after an answer (server titles, a chat created meanwhile, the latest login token, an older response ignored) | 1–10 |
| `frontend/src/components/courses/CourseWorkspace.test.tsx`, `frontend/src/pages/CourseDetailPage.test.tsx` | A question in flight survives hiding Pandu and an access-token refresh, and the token refresh does not reload the history | sending |

The author also broke each key safeguard on purpose, one at a time, and checked
that the intended test failed: 32 such mutation checks, 18 in the backend and 14
in the frontend.

## Browser checklist

Setup: sign in as Student A in Chrome or Edge, open **SCRUM-24 review** from the
dashboard or My Courses, and open DevTools (the Network and Application tabs).
Pandu is the panel on the right. In a narrow window it starts hidden; open it
with **AI Assistant**.

Report each item as pass or fail by its number, with a screenshot of any
failure. Do the sections in order: section E deletes the review data.

### A. Chats and saved history (criteria 1, 2 and 8)

| # | Check | Expected |
|---|---|---|
| A1 | Open the **Chats** dropdown in Pandu | The summary reads "Chats · Paging questions". The list shows Paging questions, Still answering and Memory replacement, newest first, with the open one highlighted |
| A2 | Click **Memory replacement**, then **Paging questions** | Each shows only its own messages: "The least recently used page." in one, the page-table answers in the other |
| A3 | Reload the page | Paging questions opens again with the same messages. Network shows `GET /api/v1/conversations/<id>/messages/`. Application → Session Storage → the key `studyforge:course-chat:<userId>:<courseId>` holds only `conversationId` and `selected`, no messages |
| A4 | Click **+ New chat** | "New chat" appears at the top of the list and opens with Pandu's welcome. Network shows `POST /api/v1/conversations/` returning 201 |
| A5 | In the new chat, tick **Paging lecture** in Sources and ask a question | The chat is renamed after the question (its first 60 characters) and stays at the top, whether or not Pandu answers (see D1) |
| A6 | Open **Still answering** within 2 minutes of running the seed script | "Pandu is still answering…" with **Check again**. Once 2 minutes have passed, click Check again: it changes to "Pandu didn’t answer this question." with **Retry**. Run the seed script again to restart the 2 minutes |

### B. Tools used and citations (criteria 4, 5 and 6), in Paging questions

| # | Check | Expected |
|---|---|---|
| B1 | Under the first answer ("A page table maps virtual pages…"), find the tools line and click it | "Searched course materials and your uploads"; expanded, "4 course materials · 4 passages used" and "1 upload · 0 passages used" |
| B2 | Look at the first answer's sources | "Paging lecture · Page 2", "Week 2 slides · Slide 2", "Reading" and "Source no longer available", each with an **Excerpt** toggle that shows the quoted passage |
| B3 | Click **Paging lecture · Page 2** in Chrome or Edge, and again in Firefox if you have it | A new tab opens the PDF at page 2, which says PAGE 2 in large letters. If you have Safari, record whether it opens at page 2 or page 1 |
| B4 | Click **Week 2 slides · Slide 2** | No new tab; `Week 2 slides.pptx` downloads. Its slide 2 is the TLB slide |
| B5 | Click **Reading** | `Reading.docx` downloads. The label shows no page |
| B6 | Click **Source no longer available** | "This source is no longer available." with **Dismiss**. No tab, no download, and no `/file/` request in Network |
| B7 | Look at the second answer ("Page tables translate addresses…") | It has the tools line, but no sources list and no empty space where one would be |
| B8 | In Network, open the `/file/` requests from B3 and B4 | `GET /api/v1/documents/<id>/file/` with an `Authorization: Bearer …` request header. The response's `Content-Disposition` is `inline` for the PDF and `attachment` for the slides |
| B9 | Open **Memory replacement** and click **Week 2 slides · Slide 3** | The deck downloads; its slide 3 is "Replacement" |

### C. Another student cannot reach Student A's chats or files

Do this before section E, while Student A's chat and upload still exist.

| # | Check | Expected |
|---|---|---|
| C1 | Sign in as Student B in a private (InPrivate or Incognito) window, so both students stay signed in. Open DevTools → Network, click any request to `localhost:8000`, and copy the token after `Bearer ` in its `Authorization` header | — |
| C2 | In that window's console, paste the snippet below with Student B's token and the IDs from setup step 6 | Five lines, each starting with `404` |
| C3 | Back in Student A's window, reload | Paging questions and My notes are still there |

Chrome may ask you to type `allow pasting` before it accepts a paste. Do not put
the token in this report.

```js
const token = "<Student B's token>";
const ids = { chat: 0, question: 0, document: 0, upload: 0 }; // from "IDs for section C"
const call = (method, path, body) => fetch(`http://localhost:8000/api/v1${path}`, {
  method,
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: body && JSON.stringify(body),
}).then((response) => `${response.status} ${method} ${path}`);
console.log((await Promise.all([
  call("GET", `/conversations/${ids.chat}/messages/`),
  call("GET", `/documents/${ids.document}/file/`),
  call("POST", `/conversations/${ids.chat}/messages/${ids.question}/retry/`, { document_ids: [ids.document] }),
  call("DELETE", `/conversations/${ids.chat}/documents/${ids.upload}/`),
  call("DELETE", `/conversations/${ids.chat}/`),
])).join("\n"));
```

### D. Sending, errors and Retry, in Paging questions

Before starting, tick only **Paging lecture** in Sources. Some results depend on
whether a Gemini key is set (see Prerequisites).

| # | Check | Expected |
|---|---|---|
| D1 | Ask any question | While waiting: "Sending your message to Pandu…" with **Stop response**. **Without a key:** the alert "The question could not be answered right now. Please try again." and, under the question, "Pandu didn’t answer this question." with **Retry**. **With a key:** "I couldn’t find enough information in the selected references to answer that question.", the tools line "Searched course materials" (1 course material · 0 passages used), and no sources list |
| D2 | Reload the page | The question from D1 is still there, as it was saved |
| D3 | On "Why do page faults happen?", click **Retry** | Network shows `POST …/messages/<id>/retry/`, not `…/questions/`. There is still one copy of the question: without a key it fails again; with a key the reply appears under it |
| D4 | DevTools → Network → throttling **3G** (called Slow 3G in older versions). Ask a question, and while "Sending your message to Pandu…" shows, switch to **Memory replacement** | Memory replacement shows only its own messages, and nothing from the other chat appears in it. Switch back: once it loads, the question shows as the server saved it |
| D5 | Still throttled: ask a question, then click **Stop response** | Sending stops. The question then shows once, as the server saved it (failed, still answering or answered). Turn throttling off afterwards |

### E. Deleting uploads and chats (criteria 3, 7, 9 and 10)

| # | Check | Expected |
|---|---|---|
| E1 | In Sources → Conversation Uploads, tick **My notes**, click its **Delete**, then **Cancel** | Nothing changes, and it is still ticked |
| E2 | Click its **Delete** again, then **Delete** | Network: `DELETE /api/v1/conversations/<id>/documents/<id>/` returns 204. My notes disappears and the "Sources · N selected" count drops by one |
| E3 | Optional: **+ Add conversation upload** with any PDF, then delete it | It is listed but not `READY` (no processing worker runs in this setup), and deleting it works the same way |
| E4 | With Paging questions open, delete **Memory replacement** from the Chats dropdown: **Cancel** first, then **Delete** | Cancel keeps it. Delete: `DELETE /api/v1/conversations/<id>/` returns 204, the row disappears, and Paging questions stays open |
| E5 | DevTools → Network → **Offline**. Delete **Still answering**, then the open chat | Each time, "This chat could not be deleted. Please try again." appears in the dropdown and the chat stays. The open chat keeps its messages, with no second "This chat could not be loaded" error. Go back online and delete Still answering: it works |
| E6 | Throttle to 3G. In the open chat, ask a question, and while it is sending, delete that chat | The chat disappears and the next chat opens. Pandu's reply never appears in it |
| E7 | Delete every remaining chat | "No chats yet" with **Start a new chat**. The message box cannot send, and no chat is created by itself. Click **Start a new chat**: a new chat opens. Reloading with no chats also creates one, as before this branch |

### F. Optional: a real answer from Gemini

This needs a Gemini key and the document processing worker (see
`docker-compose.processing.yml` and `docs/kind-local-worker.md`). Start the
backend with `$env:RAG_LLM_BACKEND = 'gemini'`, upload a PDF to the course's
Materials, wait until it is `READY`, select it in Sources and ask about it.
Check the answer's tools line, and that its citations open at their pages. The
author could not run this check for this report, because no Gemini key was
available.

## Success criteria for SCRUM-24

The task is successful when every acceptance criterion passes both its automated
tests and its browser checks, and the backend check, `tsc -b`, lint, the
frontend tests and the build all pass.

| # | Acceptance criterion | Automated tests | Browser checks |
|---|---|---|---|
| AC1 | Start a new conversation and see it in the list | ConnectedCourseChat, test_conversation_messages (titles) | A4, A5 |
| AC2 | Selecting a chat loads its earlier messages | ConnectedCourseChat | A2 |
| AC3 | Deleting a chat removes it after a confirmation | ConnectedCourseChat | E4 |
| AC4 | Each answer shows the tools Pandu used | test_questions_api, test_conversation_messages, chatHistory, ConnectedCourseChat | B1, B7, D1 |
| AC5 | A citation opens its source at the page or slide | test_document_file, chatHistory, ConnectedCourseChat | B2–B6, B8, B9 |
| AC6 | Answers without citations display cleanly | conversations.test, ConnectedCourseChat | B7, D1 |
| AC7 | Deletion calls the API and updates the list | conversations.test, ConnectedCourseChat, test_conversation_messages | E2, E4 |
| AC8 | Refreshing reloads history from the backend | ConnectedCourseChat, test_conversation_messages | A3, D2 |
| AC9 | A failed deletion shows an error and keeps the chat | ConnectedCourseChat | E5 |
| AC10 | Chat-upload deletion uses the authorized API | ConnectedCourseChat, test_conversations, test_document_file | C2, E1–E3 |
| Scope | Loading and error states when sending | ConnectedCourseChat, CourseWorkspace, CourseDetailPage | A6, D1–D5 |
| Scope | A reply in flight never lands in the wrong chat | ConnectedCourseChat | D4, E6 |
| Access | Another student gets 404 everywhere | test_conversations, test_document_file, test_conversation_messages | C1–C3 |

## Expected results

- The backend check passes: Django system checks, migration drift, fresh
  migrations and the backend tests. The author's last full run: 788 passed.
- `npx tsc -b`, `npm run lint` and `npm run build` finish without errors. Lint
  shows existing warnings in other files, and none in the files this branch
  changes.
- `npm test`: the author's last full run passed 462 of 462. If
  `CourseDetailPage.test.tsx > opens the selected course, uploads…` times out at
  about 5 seconds under full-suite load, that is a known slow test that also
  does so before this branch. It passes when run alone:

  ```powershell
  npx vitest run src/pages/CourseDetailPage.test.tsx
  ```

- Every browser check passes, except that Safari may open the PDF at page 1 in
  B3. Record what you see.

These are expected results, not a record of the teammate's run.

## Known limits (accepted)

- PowerPoint citations download instead of opening at the slide, and Word
  citations show no page. The team is considering a separate ticket to convert
  slides to PDF.
- If a retry and an older attempt both finish, the first answer is kept, so it
  may come from the older attempt's sources.
- A failed attempt's search is not shown; only answers show the tools used.
- A question still being answered is not refreshed automatically; use **Check
  again**.
- A chat is named from its first question and cannot be renamed.
- If the open chat is deleted in another tab, it leaves the list but stays open
  here. The next question then gets "This conversation is unavailable or you no
  longer have access to it."

## Teammate chat feedback — required

After the teammate has tried the setup, tests and browser checks, ask only:

> Do you have any improvements, concerns, or suggestions for this branch?

Let the teammate explain freely in chat. Do not require answers to a question
list. Ask follow-up questions only when their feedback needs clarification, such
as the exact step that failed, the expected behavior, or the change they
recommend.

The teammate does not need to edit this file while answering. The facilitator
should turn the conversation into the documentation record below afterward.

## Validation report from the chat

After the conversation, replace the placeholders below with a concise account of
the teammate's answers. Preserve important disagreement and uncertainty. The
teammate's feedback is the primary outcome of this exercise.

### Environment

- Name: `Sanish Shrestha`
- Date: `2026-11-16`
- Operating system: `macOS (Apple Silicon, Sanish-M4)`
- Browser and version: `[not reported]`
- Node.js version: `26.13.0`
- Python version: `3.12.15` (`backend/venv`)
- Gemini key set for the backend: `No`
- Branch/commit tested: `feature/SCRUM-24-pandu-chat-threads-tools-citations` (commit not recorded)

### Results

- Backend check: `PASS`
- TypeScript check: `PASS`
- Frontend lint: `PASS`
- Frontend tests: `PASS`
- Frontend build: `PASS`
- A. Chats and saved history (A1–A6): `PASS`
- B. Tools used and citations (B1–B9): `PASS`
- C. Access between students (C1–C3): `PASS`
- D. Sending, errors and Retry (D1–D5): `PASS`
- E. Deleting uploads and chats (E1–E7): `PASS`
- F. Optional real answer and PDF processing: `NOT RUN` (no Gemini API key)
- Failed item numbers: `None reported`; live answer generation/PDF processing was not verified because no Gemini API key was available.

### Teammate feedback summarized

The reviewer reported that all backend and frontend checks passed, as did the
chat, history, tools, citations, student access-control, sending/retry and
deletion checks. The failed test reported against the previous PR was fixed in
this branch. Real answer generation and PDF processing were not run because no
Gemini API key was available. The reviewer had no further improvements,
concerns or suggestions and approved the branch.

## Problems encountered

Record every problem reported by the teammate, including problems that were
resolved during the session.

| # | Problem or unexpected behavior | Where it occurred | Evidence | Impact | Resolved? | Recommended action |
|---|---|---|---|---|---|---|
| 1 | A test failure had been reported against the previous PR. | tests | Final reviewer feedback: the previous PR's failed test was fixed in this branch; current backend and frontend checks passed. | medium | yes | None. |
| 2 | Live answer generation and real PDF processing could not be checked without a Gemini API key. | sending / citations | Final reviewer feedback: no Gemini API key was available. | low | not applicable | Optional follow-up when a Gemini key and processing worker are available. |

If no problems were found, write:

```text
No problems were reported during the teammate validation.
```

## Positive observations

The reviewer reported passing backend checks, TypeScript, frontend lint, tests
and build, as well as all chat, citation, access-control, retry and deletion
checks. The previously reported failed test was fixed in this branch.

## Suggested improvements

The reviewer reported no improvements, concerns or suggestions.

## Evidence collected

Paste concise evidence from the teammate's run. Never include secrets, API keys,
tokens, passwords, or private connection strings.

```text
Commands run: not recorded.

Backend check: PASS
TypeScript check: PASS
Frontend lint: PASS
Frontend tests: PASS
Frontend build: PASS
Browser checks: chats/history, tools/citations, student access control,
sending/retry and deletion all PASS; real answer generation/PDF processing
NOT RUN because no Gemini API key was available.
Reviewer feedback: no improvements, concerns or suggestions. Approved.
```

### Facilitator conclusion

The reviewer approved the branch after reporting that backend and frontend
checks and the chat, citation, access-control, retry and deletion checks passed.
The test failure reported against the previous PR was fixed in this branch.
Real answer generation and PDF processing remain unverified because no Gemini
API key was available; this did not prevent the reviewer from approving.

## Final decision

- Problems requiring fixes before merge: `None reported.`
- Accepted improvements: `None.`
- Deferred improvements: `None.`
- Follow-up owner: `Sanish Shrestha`
- Follow-up issue or task: `None.`
- Final recommendation: `approve`
