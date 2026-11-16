# SCRUM-52 Teammate Validation Report

## Report purpose

This report records an independent teammate's experience running and reviewing
the SCRUM-52 branch, which adds the server-side game logic for Survival Quiz:
lives, score and the current question are kept on the server so they cannot be
reset or changed from the browser.

The teammate's feedback is the most important result. Record every problem they
encounter, including setup failures, unclear instructions, unexpected output,
slow behavior, missing prerequisites, and concerns about the design. Do not mark
the report complete only because automated tests pass.

## Review status

- Reviewer: Nischal
- Report status: `complete`
- Overall result: `satisfactory with changes`
- Final recommendation: `approve with changes`

## Branch under review

```text
SCRUM-52-survival-quiz-backend
```

## What this branch does

- Adds a Survival session: one game over its own newly generated quiz, with
  the current question, lives (starting at 3), score (starting at 0), status,
  and start and end times.
- Lets the student choose 5 or 10 questions, the same as a regular quiz.
- Removes a life for a wrong answer and adds 1 to the score for a correct one.
  Either way the game moves to the next question.
- Ends the game at 0 lives (`GAME_OVER`) or after the last question with lives
  left (`COMPLETED`). Losing the last life on the last question is `GAME_OVER`.
  Answers after the end are rejected.
- Rejects an answer to any question other than the current one, so a double
  click, a retry or a stale tab cannot answer the next question by accident.
  The session row is locked while an answer is graded.
- Returns `404` for another student's session, the same as a missing one.
- Sends only the current question, without its answer. The correct option and
  explanation are revealed only for the question just answered.
- Saves the finished game as an ordinary quiz submission, so quiz history and
  `GET /api/v1/quizzes/{quiz_id}/results/` work for both modes.
- Blocks the regular submit endpoint on a Survival quiz, which would otherwise
  reveal every answer mid-game.

Endpoints:

```text
POST /api/v1/courses/{course_id}/survival-sessions/   start a game
GET  /api/v1/survival-sessions/{id}/                   current state (after a refresh)
POST /api/v1/survival-sessions/{id}/answers/           answer the current question
```

Expected game examples (3 lives, 5 questions):

```text
right, wrong, wrong, wrong        -> GAME_OVER, score 1, lives 0, ends at question 4
right, right, wrong, right, right -> COMPLETED, score 4, lives 2
wrong, wrong, right, right, wrong -> GAME_OVER on the last question, score 2
same answer sent twice            -> second is 409 QUESTION_NOT_CURRENT, one life lost
```

## Main files touched

- `backend/apps/quizzes/models.py`
  - `SurvivalSession` and `SurvivalAnswer`, with database rules: lives at most
    3, a known status, `ended_at` set exactly when the game has ended, one
    session per quiz, and one answer per question.
- `backend/apps/quizzes/migrations/0004_survival_sessions.py`
  - Creates both tables and their constraints.
- `backend/apps/quizzes/services.py`
  - Starting a game, grading an answer under a row lock, ending the game, and
    saving the result as a `QuizSubmission`.
- `backend/apps/quizzes/selectors.py`
  - Owned-session lookup (404 for another student). The quiz lookup also loads
    the Survival link.
- `backend/apps/quizzes/serializers.py`
  - Answer input, session state (current question only), and answer feedback.
- `backend/apps/quizzes/views.py`, `backend/apps/quizzes/urls.py`
  - The three endpoints. The quiz-generation checks and errors are moved into
    a shared helper used by both start endpoints. Regular submit returns
    `409 QUIZ_IN_SURVIVAL_MODE` for a Survival quiz.
- `backend/apps/quizzes/tests/test_survival_models.py`
- `backend/apps/quizzes/tests/test_survival_services.py`
- `backend/apps/quizzes/tests/test_survival_endpoint.py`
- `backend/apps/quizzes/tests/test_submission_endpoint.py`
  - 42 new tests, listed under Test cases below.
- `docs/api-contract.md`, `docs/database-schema.md`
  - The Survival API contract and table definitions.

## Prerequisites

- Python 3.12 and the repository's `backend/venv` with dependencies installed.
- Docker Desktop running Linux containers, for the isolated test database and
  the local Postgres used by manual checks.
- For the manual API checks: `curl` and `jq` on macOS/Linux, or PowerShell's
  `Invoke-RestMethod` on Windows (both shown below). Postman also works.
- Two local student accounts, each with a course and one `READY` document.
  "Create test data" below makes them; no upload or processing worker is needed.

The tests use the fake quiz generator and do not call a paid model provider.
`scripts/check.py` sets `NOTES_LLM_BACKEND=fake` and `QUIZ_LLM_BACKEND=fake` and
removes provider API keys. Database-backed tests use a disposable database; do
not point them at a development database.

Commands below are shown for **macOS/Linux (bash/zsh)** and **Windows
(PowerShell)**. On Windows the venv's Python is `backend\venv\Scripts\python.exe`
and environment variables are set with `$env:NAME = 'value'`.

## Local setup

From the repository root:

```bash
git fetch origin
git checkout SCRUM-52-survival-quiz-backend
docker compose up -d
```

### Port 5432 already in use

If `migrate` fails with `password authentication failed for user "studyforge"`,
another Postgres (for example one installed directly on Windows or with
Homebrew) is already listening on port 5432 and is answering instead of
Docker's `db` container. Run Docker's database on another port, and point the
backend at it with the same port:

```bash
# macOS/Linux
POSTGRES_PORT=5433 docker compose up -d
export POSTGRES_PORT=5433        # in every terminal that runs manage.py
```

```powershell
# Windows
$env:POSTGRES_PORT = '5433'; docker compose up -d
$env:POSTGRES_PORT = '5433'      # in every terminal that runs manage.py
```

Alternatively set `POSTGRES_PORT=5433` in `backend/.env` (copied from
`backend/.env.example`). `docker-compose.yml` and `config/settings.py` both read
`POSTGRES_PORT`. `scripts/check.py` is unaffected: it starts its own test
database.

### Start the backend

Start the backend with the fake generator:

```bash
# macOS/Linux
cd backend
QUIZ_LLM_BACKEND=fake venv/bin/python manage.py migrate
QUIZ_LLM_BACKEND=fake venv/bin/python manage.py runserver
```

```powershell
# Windows
cd backend
$env:QUIZ_LLM_BACKEND = 'fake'
venv\Scripts\python.exe manage.py migrate
venv\Scripts\python.exe manage.py runserver
```

### Create test data

In a second terminal (with the same `POSTGRES_PORT` if you changed it), open a
Django shell from `backend/`:

```bash
venv/bin/python manage.py shell            # macOS/Linux
venv\Scripts\python.exe manage.py shell    # Windows
```

Paste this. It creates two students, each with a course and a `READY` document
that has one text chunk, and prints the ids used in the manual checks:

```python
from django.contrib.auth import get_user_model
from apps.courses.models import Course
from apps.documents.models import Document
from apps.knowledge.models import Chunk

for letter in "ab":
    user = get_user_model().objects.create_user(
        email=f"student-{letter}@example.edu", password="SurvivalCheck!2026"
    )
    course = Course.objects.create(owner=user, name="CS 3358")
    document = Document.objects.create(
        owner=user,
        course=course,
        title="Lecture 3",
        sha256=letter * 64,
        file="documents/2026/11/lecture-3.pdf",
        status=Document.Status.READY,
        page_count=1,
    )
    Chunk.objects.create(
        owner=user, document=document, page_number=1,
        content="A stack is last in, first out. A queue is first in, first out.",
    )
    print(user.email, "course", course.pk, "document", document.pk)
```

These are throwaway local accounts. The document has no real file behind it,
which is fine: quiz generation reads only the chunk text.

### Logging in

`POST /api/v1/auth/token/` is CSRF-protected. First call
`GET /api/v1/auth/csrf/` to receive the `csrftoken` cookie, then send the login
with that cookie and the same value in an `X-CSRFToken` header. The response's
`access` token goes in `Authorization: Bearer <token>`. The scripts below do
this for you.

Access tokens last **15 minutes**. If a request returns
`401 token_not_valid` ("Token is expired"), run the login step again.

With the fake generator the correct option is always the one whose text is
`Correct N`, so right and wrong answers can be chosen on purpose.

If `docker info` hangs, an old Docker Desktop process is probably stuck. Quit
every Docker process and start a single copy of Docker Desktop.

## Validation commands

Run the AI-learning suite, which includes every quizzes test:

```bash
# macOS/Linux
backend/venv/bin/python scripts/check.py --component backend --suite ai-learning
```

```powershell
# Windows
backend\venv\Scripts\python.exe scripts\check.py --component backend --suite ai-learning
```

Run the full backend check (system checks, migration drift, fresh migrations,
all backend tests):

```bash
# macOS/Linux
backend/venv/bin/python scripts/check.py --component backend
```

```powershell
# Windows
backend\venv\Scripts\python.exe scripts\check.py --component backend
```

Run the manual API checks. Replace the `<...>` values with the ids printed by
the test-data script and from earlier responses. To act as student B (for the
404 checks), repeat the login with `student-b@example.edu`.

macOS/Linux (`curl` and `jq`):

```bash
API=http://localhost:8000/api/v1
JAR=$(mktemp)

# Log in as student A (CSRF cookie first)
curl -s -c "$JAR" "$API/auth/csrf/" > /dev/null
CSRF=$(awk '$6 == "csrftoken" {print $7}' "$JAR")
A=$(curl -s -b "$JAR" -c "$JAR" -X POST "$API/auth/token/" \
  -H "X-CSRFToken: $CSRF" -H 'Content-Type: application/json' \
  -d '{"email":"student-a@example.edu","password":"SurvivalCheck!2026"}' | jq -r .access)

# 1. Start a game
curl -s -X POST "$API/courses/<course_id>/survival-sessions/" \
  -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d '{"document_ids":[<doc_id>],"num_questions":5}' | jq

# 2. Answer the current question
curl -s -X POST "$API/survival-sessions/<id>/answers/" \
  -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d '{"question_id":<current question id>,"selected_option_index":<i>}' | jq

# 3. Current state (repeat to simulate a refresh)
curl -s "$API/survival-sessions/<id>/" -H "Authorization: Bearer $A" | jq

# 4. Result after the game ends
curl -s "$API/quizzes/<quiz_id>/results/" -H "Authorization: Bearer $A" | jq
```

Windows (PowerShell). `Invoke-RestMethod` throws on `4xx` responses, so the
`Call` helper prints the status code and the error body instead. The `409` and
`404` bodies are part of what is being checked.

```powershell
$API = 'http://localhost:8000/api/v1'

function Login($email) {
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod "$API/auth/csrf/" -WebSession $s | Out-Null
  $csrf = ($s.Cookies.GetCookies('http://localhost:8000') | Where-Object Name -eq 'csrftoken').Value
  $body = @{ email = $email; password = 'SurvivalCheck!2026' } | ConvertTo-Json
  $r = Invoke-RestMethod -Method Post "$API/auth/token/" -WebSession $s `
    -Headers @{ 'X-CSRFToken' = $csrf } -ContentType 'application/json' -Body $body
  @{ Authorization = "Bearer $($r.access)" }
}

function Call($method, $path, $headers, $body = $null) {
  try {
    $params = @{ Method = $method; Uri = "$API$path"; Headers = $headers }
    if ($body) { $params.ContentType = 'application/json'; $params.Body = ($body | ConvertTo-Json) }
    Invoke-RestMethod @params | ConvertTo-Json -Depth 6
  } catch {
    "HTTP $([int]$_.Exception.Response.StatusCode)"
    $_.ErrorDetails.Message
  }
}

$A = Login 'student-a@example.edu'

# 1. Start a game
Call Post '/courses/<course_id>/survival-sessions/' $A @{ document_ids = @(<doc_id>); num_questions = 5 }

# 2. Answer the current question
Call Post '/survival-sessions/<id>/answers/' $A @{ question_id = <current question id>; selected_option_index = <i> }

# 3. Current state (repeat to simulate a refresh)
Call Get '/survival-sessions/<id>/' $A

# 4. Result after the game ends
Call Get '/quizzes/<quiz_id>/results/' $A
```

## Test cases

All 42 tests live in `backend/apps/quizzes/tests/`.

### Model rules — `test_survival_models.py` (8)

| # | Test | What it proves |
|---|---|---|
| M1 | `test_new_session_starts_with_3_lives_score_0_at_question_1` | Defaults: 3 lives, score 0, question 1, `ACTIVE`, no end time |
| M2 | `test_lives_cannot_exceed_the_maximum` | The database rejects 4 lives |
| M3 | `test_position_must_be_positive` | The database rejects question position 0 |
| M4 | `test_status_must_be_a_known_value` | The database rejects an unknown status |
| M5 | `test_ended_at_is_set_exactly_when_the_game_has_ended` | No end time on a running game; an ended game must have one |
| M6 | `test_a_quiz_has_at_most_one_survival_session` | One game per quiz |
| M7 | `test_deleting_the_course_deletes_the_session_and_answers` | Course delete cascades to sessions and answers |
| M8 | `test_a_question_can_be_answered_only_once_per_session` | The database rejects a second answer to one question |

### Game logic — `test_survival_services.py` (15)

| # | Test | What it proves |
|---|---|---|
| S1 | `test_correct_answer_adds_to_score_and_keeps_lives` | Right answer: score +1, lives unchanged, next question |
| S2 | `test_wrong_answer_removes_one_life_and_moves_on` | Wrong answer: lives -1, score unchanged, next question |
| S3 | `test_game_over_at_zero_lives` | Third wrong answer ends the game as `GAME_OVER` with an end time |
| S4 | `test_completed_after_the_last_question_with_lives_left` | Last question answered with lives left is `COMPLETED` |
| S5 | `test_losing_the_last_life_on_the_last_question_is_game_over` | Running out of lives wins over running out of questions |
| S6 | `test_answers_after_the_game_ends_are_rejected` | No answer is saved after the end |
| S7 | `test_answering_a_question_that_is_not_current_changes_nothing` | A future question cannot be answered; nothing changes |
| S8 | `test_the_same_question_cannot_be_answered_twice` | A repeated answer is rejected and costs no second life |
| S9 | `test_a_question_from_another_session_is_not_current` | Questions from another game are rejected |
| S10 | `test_option_out_of_range_costs_no_life` | A non-existent option is rejected and costs no life |
| S11 | `test_nothing_is_saved_to_history_while_the_game_is_running` | No submission until the game ends |
| S12 | `test_game_over_saves_the_result_with_unreached_questions_unanswered` | Result saved with total = all questions; unreached are null |
| S13 | `test_completed_game_saves_every_answer` | Every chosen option is copied into the result |
| S14 | `test_creates_a_new_quiz_and_an_active_session` | Start generates a new quiz with the chosen question count |
| S15 | `test_generation_failure_creates_nothing` | A failed AI call leaves no quiz and no session |

### API — `test_survival_endpoint.py` (18)

| # | Test | What it proves |
|---|---|---|
| E1 | `test_returns_the_first_question_with_3_lives_and_score_0` | Start returns `201`, 3 lives, score 0, question 1 without its answer |
| E2 | `test_student_chooses_5_or_10_questions` | Both question counts work |
| E3 | `test_other_question_counts_are_rejected` | Any other count is `400`; nothing is created |
| E4 | `test_never_sends_more_than_the_current_question` | No list of questions is ever sent |
| E5 | `test_document_not_ready_returns_409` | `409 DOCUMENT_NOT_READY`; nothing is created |
| E6 | `test_another_students_course_returns_404` | Cannot start a game on another student's course |
| E7 | `test_unauthenticated_request_is_rejected` | A login is required |
| E8 | `test_wrong_answer_removes_a_life_and_reveals_only_that_answer` | Lives -1; feedback reveals only the answered question |
| E9 | `test_correct_answer_increases_the_score` | Score +1 over HTTP |
| E10 | `test_game_over_at_zero_lives_and_further_answers_are_rejected` | `GAME_OVER`, then `409 SURVIVAL_SESSION_ENDED` |
| E11 | `test_game_completes_after_the_last_question` | `COMPLETED` with no current question |
| E12 | `test_finished_game_is_saved_for_quiz_history` | `/results/` returns the saved score |
| E13 | `test_double_answer_is_rejected_and_costs_one_life_only` | `409 QUESTION_NOT_CURRENT` with the real state; one life lost |
| E14 | `test_option_out_of_range_returns_400_and_costs_no_life` | `400`; lives unchanged |
| E15 | `test_invalid_body_returns_400` | Empty, missing, null and negative input are `400` |
| E16 | `test_refresh_returns_the_same_lives_score_and_question` | `GET` after answers matches the last state exactly |
| E17 | `test_another_student_cannot_see_or_answer_the_session` | `404` for GET and answer; the owner's game is unchanged |
| E18 | `test_missing_session_looks_the_same_as_another_students` | A missing id is also `404`, so ids cannot be probed |

### Regular submit block — `test_submission_endpoint.py` (1)

| # | Test | What it proves |
|---|---|---|
| R1 | `test_submitting_a_survival_quiz_returns_409_and_reveals_nothing` | `409 QUIZ_IN_SURVIVAL_MODE`; no answers in the body; nothing saved |

## Success criteria for SCRUM-52

The task is successful when every ticket acceptance criterion below passes both
its automated tests and its manual check, and the whole backend check passes.

| # | Acceptance criterion | Automated tests | Manual check passes when |
|---|---|---|---|
| AC1 | Starting a session returns the first question with 3 lives and score 0 | E1, M1, S14 | Start returns `201`, `lives: 3`, `score: 0`, `current_position: 1`, and `current_question` has only `id`, `position`, `text`, `options` |
| AC2 | A wrong answer reduces lives by 1. A correct answer increases the score | E8, E9, S1, S2 | A wrong answer takes lives from 3 to 2; a right answer adds 1 to score; both move to the next question |
| AC3 | The session ends at 0 lives or after the last question, and further answers are rejected | E10, E11, S3–S6 | Three wrong answers give `GAME_OVER`; finishing with lives left gives `COMPLETED`; any later answer is `409 SURVIVAL_SESSION_ENDED` |
| AC4 | Getting the session state after a refresh returns the same lives, score and question | E16 | Repeated `GET` returns exactly the `session` from the last answer response |
| AC5 | A student cannot access or answer another student's session | E17, E18, E6 | With student B's token, GET and answer on A's session are `404`, and A's game is unchanged |
| AC6 | The finished session's result is saved for quiz history | E12, S11–S13 | After the game ends, `/quizzes/{quiz_id}/results/` returns `200` with the same score; unreached questions are null |

Also required for success:

- Answers never leave the server before they are revealed: E1, E4, E8, R1.
- Double answers and stale tabs cannot cost an extra life: E13, S7–S9, M8.
- Regular quizzes behave exactly as before: the existing quiz generation and
  submission tests pass unchanged.
- `scripts/check.py --component backend` passes all four steps: Django system
  checks, migration drift, fresh database migrations, and all backend tests.

## Expected results

- AI-learning suite passes, including all 42 tests listed above.
- Full backend check passes all four steps. The author's run on 2026-11-12
  had 732 passed and 468 subtests. The branch was later rebased onto a newer
  `development`, which brought in new tests from SCRUM-79 and SCRUM-109, so
  expect **738 passed, 468 subtests passed**, in about 2.5–4 minutes.
- Migration `quizzes.0004_survival_sessions` applies on a fresh database.
- Every manual check in the success criteria table behaves as described.
- No response from start, state or answer includes `correct_option_index` or
  `explanation` for a question that has not been answered.
- Sending the same answer twice gives `409 QUESTION_NOT_CURRENT` and costs only
  one life.

These are expected results, not a record of the teammate's run. Fill the
validation results below only after the teammate has tried the setup and tests.

## Teammate chat feedback — required

After the teammate has tried the setup and tests, ask only:

> Do you have any improvements, concerns, or suggestions for this branch?

Let the teammate explain freely in chat. Do not require answers to a question
list. Ask follow-up questions only when their feedback needs clarification, such
as the exact command that failed, the expected behavior, or the change they
recommend.

The teammate does not need to edit this file while answering. The facilitator
should turn the conversation into the documentation record below afterward.

## Validation report from the chat

After the conversation, replace the placeholders below with a concise account of
the teammate's answers. Preserve important disagreement and uncertainty. The
teammate's feedback is the primary outcome of this exercise.

### Environment

- Name: Nischal
- Date: 2026-11-14 (automated checks), 2026-11-15 (manual API checks)
- Operating system: Windows 11 Home 10.0.26200
- Docker version: 29.7.2
- Python version: 3.12.10 (system and `backend\venv`)
- Branch/commit tested: `SCRUM-52-survival-quiz-backend` @ `a8ef651`, up to
  date with `origin`

### Results

- AI-learning suite: `PASS`
- Full backend check: `PASS`
- AC1 start with 3 lives and score 0: `PASS`
- AC2 lives and score changes: `PASS`
- AC3 game over, completion and rejected answers: `PASS`
- AC4 same state after refresh: `PASS`
- AC5 another student's session is 404: `PASS`
- AC6 result saved for quiz history: `PASS`
- Double answer costs one life only: `PASS`
- Answers hidden until revealed: `PASS`

### Teammate feedback summarized

The branch works as described. Every acceptance criterion and extra check
passed, both in the automated suites and in the manual API checks.

- Positive: the error codes are well written. `QUESTION_NOT_CURRENT`,
  `SURVIVAL_SESSION_ENDED` and `QUIZ_IN_SURVIVAL_MODE` are clear, and the `409`
  responses include the real session state.
- Concern: abandoned games stay `ACTIVE` forever. A student who closes the tab
  leaves a game that never ends and is never saved to quiz history. This is
  documented in `docs/api-contract.md`, but it is not resolved.
- Concern: several documented test steps did not work as written on Windows,
  and the reviewer needed AI help to work around them (problems 1, 3, 4 and 5
  below).

## Problems encountered

Record every problem reported by the teammate, including problems that were
resolved during the session.

| # | Problem or unexpected behavior | Where it occurred | Evidence | Impact | Resolved? | Recommended action |
|---|---|---|---|---|---|---|
| 1 | Commands are bash-only (`venv/bin/python`, `VAR=x cmd`, `jq`) | docs | They fail in Windows PowerShell; used `venv\Scripts\python.exe` and `$env:VAR` instead | low | yes (local workaround) | Add Windows commands before merge |
| 2 | The full check ran 738 tests; the report expects 732 | docs | 738 passed in two separate runs; subtests match (468) | low | no | Gaurav to confirm where the 6 extra tests come from and update the count |
| 3 | `migrate` failed with "password authentication failed for user studyforge" | setup | A Windows-installed Postgres listening on 5432 took `localhost` connections before Docker's `db` container | medium | yes (ran Docker's db on 5433 via `POSTGRES_PORT`) | Document port conflicts and the `POSTGRES_PORT` / `backend\.env` setup before merge |
| 4 | The documented login fails: `/api/v1/auth/token/` is CSRF-protected | docs | No access token until `/api/v1/auth/csrf/` was called first and `X-CSRFToken` was sent | medium | yes (local workaround) | Add the CSRF step to the manual checks before merge |
| 5 | No instructions for creating two students with a course and a `READY` document | docs | A Django seed script was needed; a real upload needs the processing worker | low | yes (seed script) | Add a seed script or management command before merge |
| 6 | Access tokens expired during the manual checks | docs | `401 token_not_valid`, "Token is expired" | low | yes (logged in again) | Note in the manual checks that an expired token means logging in again |
| 7 | The `404` body names an internal model | API | "No SurvivalSession matches the given query." (identical for missing and foreign sessions, so ids cannot be probed) | low | no | Consider a generic "Not found." message |

## Positive observations

- Clear, specific error codes, and every `409` returns the real session state,
  so a client can always recover.
- Answers never left the server before being revealed: start, state, answer
  feedback and the blocked regular submit were all checked.
- The game logic matched every expected example exactly, including losing the
  last life on the last question (`GAME_OVER`, not `COMPLETED`).
- Migration `quizzes.0004_survival_sessions` applied cleanly on both a fresh
  database and an existing local database.
- Results were the same across two runs of each automated check.

## Suggested improvements

| # | Suggested improvement | Reason given by teammate | Priority | Planned action |
|---|---|---|---|---|
| 1 | Fix the validation instructions (problems 1, 3, 4 and 5) | Steps did not work as written; the reviewer needed AI help to work around them | high | Before merge |
| 2 | Handle abandoned games, for example by expiring them or saving them to history | Games left open stay `ACTIVE` forever and never reach quiz history | medium | Follow-up ticket |
| 3 | Update the expected test count, add a token-expiry note, and use a generic 404 message (problems 2, 6 and 7) | Small accuracy and polish issues | low | Deferred |

## Evidence collected

Paste concise evidence from the teammate's run. Never include secrets, API keys,
tokens, passwords, or private connection strings.

```text
Commands run (Windows PowerShell 5.1, from the repository root):
> backend\venv\Scripts\python.exe scripts\check.py --component backend --suite ai-learning
> backend\venv\Scripts\python.exe scripts\check.py --component backend
> $env:POSTGRES_PORT='5433'; docker compose up -d
> cd backend; $env:QUIZ_LLM_BACKEND='fake'; venv\Scripts\python.exe manage.py migrate
    Applying quizzes.0004_survival_sessions... OK
Manual checks used Invoke-WebRequest with a CSRF login helper (curl/jq not used).
Test data: 2 students seeded with a Django script, each with 1 course and 1 READY
document plus 1 text chunk. The upload and processing flow was not used.

Test results:
AI-learning: system checks PASS | migration drift PASS (no changes) |
  fresh migrations PASS | 313 passed, 282 subtests passed in 122.34s
  (practice run: 313 passed, 282 subtests in 136.70s)
Full backend: system checks PASS | migration drift PASS | fresh migrations PASS |
  738 passed, 468 subtests passed in 227.30s
  (practice run: 738 passed in 248.52s; report expects 732 / 468 / ~2.5 min)

Game state observations (lives, score, status):
Game 1 (session 1, 5 q): start -> 201, ACTIVE, lives 3, score 0, position 1/5
  W -> lives 2, score 0, pos 2 | R -> lives 2, score 1, pos 3
  W -> lives 1, score 1, pos 4 | W -> GAME_OVER, lives 0, score 1, pos 4,
  ended_at set, current_question null
  late answer -> 409 SURVIVAL_SESSION_ENDED (body shows GAME_OVER)
  /quizzes/1/results/ -> 200, score 1/5 (20%), Q5 selected_option_index null
Game 2 (5 q): R R W R R -> COMPLETED, score 4, lives 2, saved 4/5
Game 3 (10 q): R x7, W W W -> GAME_OVER on Q10, score 7, lives 0, saved 7/10
Refresh: two GETs identical to the last answer state (lives 2, score 1, Q3)
Double answer: re-sent Q2 -> 409 QUESTION_NOT_CURRENT, session lives 2 /
  score 1 / pos 3; future Q4 -> 409 QUESTION_NOT_CURRENT, nothing changed

Ownership and hidden-answer observations:
Student B GET and answer on A's session 1 -> 404; GET /survival-sessions/99999/
  -> 404; both bodies identical; A's game unchanged afterwards
Start and state: current_question fields are only id, position, text, options;
  correct_option_index not present anywhere in the response
Answer feedback reveals correct_option_index/explanation only for the question
  just answered
Regular submit on the Survival quiz -> 409 QUIZ_IN_SURVIVAL_MODE,
  survival_session_id 1, no answers in the body
/quizzes/1/results/ while the game was ACTIVE -> 404 (nothing saved mid-game)

Error messages or logs:
migrate: password authentication failed for user "studyforge" (problem 3)
login: no access token without the CSRF step (problem 4)
manual checks: 401 token_not_valid "Token is expired" (problem 6)
```

### Evidence and suggestions

```text
Teammate result: every automated check and manual acceptance check passed.

What worked: game rules, ownership 404s, double-answer protection, hidden
answers, regular-submit block, saved results, and migration 0004.

What failed: no branch behaviour failed. The documented setup and login steps
failed as written (problems 1, 3, 4 and 5).

What was confusing: getting the local database, login and test data working on
Windows needed AI help.

Suggested changes: fix the validation instructions before merge; handle
abandoned games in a follow-up.

Final recommendation: approve with changes
```

### Facilitator conclusion

The Survival backend meets all six acceptance criteria and the extra
requirements (hidden answers, double-answer protection, unchanged regular
quizzes). Nothing wrong was found in the branch's code. The required changes
are to the validation documentation: Windows commands, the database port and
`.env` setup, the CSRF login step, and a way to create test data. The design
concern about abandoned games staying `ACTIVE` is accepted as a follow-up, not a
merge blocker. Still open: where the 6 extra tests in the full check come from.

Next action: Gaurav updates the validation instructions (problems 1, 3, 4 and 5),
then the branch can be merged.

## Final decision

- Problems requiring fixes before merge: 1 (Windows commands), 3 (database port
  and `.env` setup), 4 (CSRF login step), 5 (test data creation)
- Accepted improvements: fix the validation instructions
- Deferred improvements: 2 (expected test count), 6 (token-expiry note),
  7 (generic 404 message), abandoned games staying `ACTIVE`
- Follow-up owner: Gaurav
- Follow-up issue or task: to be created for abandoned Survival games
- Final recommendation: `approve with changes`
