# SCRUM-22 Teammate Validation Report

## Report purpose

Record an independent teammate's experience running and reviewing the
SCRUM-22 branch, which makes citations optional for answers grounded in
selected course documents. The teammate's feedback is the primary result.
Record every problem they encounter, including setup failures, unclear
instructions, unexpected output, slow behavior, missing prerequisites, and
design concerns. Automated test success alone does not complete this report.

## Review status

- Report status: `not started`
- Overall result: `pending`
- Final recommendation: `pending`

## Branch under review

```text
feature/SCRUM-22-making-citation-optional
```

## What this branch does

- Allows an `ANSWERED` response to include an answer and an empty citations list.
- Continues to require retrieved document chunks to generate an answer.
- Returns `INSUFFICIENT_CONTEXT` when no supporting chunks are retrieved.
- Validates every citation against retrieved chunk metadata and text when
  citations are present.
- Allows the frontend API client to accept valid answered responses without
  citations while retaining citation validation.
- Leaves chat components able to display citations returned by the backend.

## Main files touched

- `backend/apps/knowledge/llm.py`
  - Updates the model instructions and answer validation to permit uncited
    answers while validating citations when present.
- `backend/apps/knowledge/serializers.py`
  - Removes the requirement for answered responses to contain at least one
    citation; preserves answer, authorization, and citation validation rules.
- `backend/apps/knowledge/tests/test_llm.py`
- `backend/apps/knowledge/tests/test_questions_api.py`
- `backend/apps/knowledge/tests/test_serializers.py`
  - Cover uncited answers, retrieved-chunk grounding, cited answers, and
    insufficient-context behavior.
- `frontend/src/api/conversations.ts`
  - Accepts answered responses with `citations: []` and validates included
    citations.
- `frontend/src/api/conversations.test.ts`
  - Covers the API response with an answered response and no citations.

## Prerequisites

- Python 3.12 and the repository's `backend/venv` with dependencies installed.
- Node.js 24.15.0 or newer within Node 24, and npm.
- Frontend dependencies installed from `frontend/package-lock.json`.
- Docker Desktop and Linux containers for the repository's isolated backend
  database test runner.

The focused LLM tests use deterministic test doubles and do not call a paid
model provider. Backend database-backed tests use the repository's disposable
test database runner; do not point them at a development database.

## Local setup

From the repository root, install frontend dependencies if they are not already
installed:

```bash
cd frontend
npm ci
cd ..
```

Make sure the backend virtual environment is available at `backend/venv`.
Backend checks that require database access should use the repository's
`scripts/check.py` runner, which provisions an isolated database with Docker.

## Validation commands

Run the focused frontend API test:

```bash
cd frontend
npm test -- src/api/conversations.test.ts
```

Run the frontend suite and production build:

```bash
cd frontend
npm test
npm run build
```

Run the focused deterministic backend LLM tests:

```bash
backend/venv/bin/python -m pytest -c backend/pytest.ini \
  backend/apps/knowledge/tests/test_llm.py -q
```

Run the backend AI-learning suite, including database-backed knowledge tests:

```bash
backend/venv/bin/python scripts/check.py \
  --component backend --suite ai-learning
```

The AI-learning suite creates a disposable database and requires Docker
Desktop/Linux containers. It does not use or modify the development database.

## Expected results

- Focused frontend API test passes, including acceptance of an answered
  response with `citations: []`.
- Frontend tests pass.
- Frontend production build passes.
- Backend LLM, serializer, and question API tests pass.
- An answered response without citations is accepted only when supported by
  retrieved chunks.
- A response without supporting chunks remains `INSUFFICIENT_CONTEXT`.
- Any citation that is returned remains valid and matches its retrieved chunk.

These are expected results, not a record of the teammate's run. Fill the
validation results below only after the teammate has tried the setup and tests.

## Teammate chat feedback — required

After the teammate has tried the setup and tests, ask only:

> Do you have any improvements, concerns, or suggestions for this branch?

Let the teammate explain freely in chat. Do not require answers to a question
list. Ask follow-up questions only when their feedback needs clarification,
such as the exact command that failed, expected behavior, or a recommended
change. The teammate does not need to edit this file while answering.

## Validation report from the chat

After the conversation, replace the placeholders below with a concise account
of the teammate's answers. Preserve important disagreement and uncertainty.

### Environment

- Name: `[teammate name]`
- Date: `[date]`
- Operating system: `[answer]`
- Docker version: `[answer or not applicable]`
- Node.js/npm version: `[answer]`
- Python version: `[answer]`
- Branch/commit tested: `[answer]`

### Results

- Focused frontend API validation: `[PASS / FAIL / NOT RUN]`
- Full frontend validation: `[PASS / FAIL / NOT RUN]`
- Frontend production build: `[PASS / FAIL / NOT RUN]`
- Backend LLM validation: `[PASS / FAIL / NOT RUN]`
- Backend AI-learning suite: `[PASS / FAIL / NOT RUN]`
- Uncited answer behavior: `[PASS / FAIL / NOT RUN]`
- Citation and insufficient-context behavior: `[PASS / FAIL / NOT RUN]`

### Teammate feedback summarized

`[Summarize the teammate's open-ended feedback, including improvements,
concerns, positive observations, and suggested changes.]`

## Problems encountered

Record every problem reported by the teammate, including problems resolved
during the session.

| # | Problem or unexpected behavior | Where it occurred | Evidence | Impact | Resolved? | Recommended action |
|---|---|---|---|---|---|---|
| 1 | `[description]` | `[setup / backend / frontend / tests / docs]` | `[output or observation]` | `[low / medium / high]` | `[yes / no / partial]` | `[action]` |

If no problems were reported, replace the table with:

```text
No problems were reported during the teammate validation.
```

## Positive observations

`[Record what the teammate found clear, useful, reliable, or well designed.]`

## Suggested improvements

| # | Suggested improvement | Reason given by teammate | Priority | Planned action |
|---|---|---|---|---|
| 1 | `[suggestion]` | `[reason]` | `[high / medium / low]` | `[action or decision]` |

## Evidence collected

Paste concise evidence from the teammate's run. Never include secrets, API
keys, tokens, passwords, or private connection strings.

```text
Commands run:

Test results:

Backend response observations:

Frontend/API observations:

Error messages or logs:
```

### Evidence and suggestions

Paste concise command output, screenshots, error messages, or log excerpts here.
Do not include secrets, API keys, tokens, passwords, or private connection
strings.

```text
Teammate result:

What worked:

What failed:

What was confusing:

Suggested changes:

Final recommendation: approve / approve with changes / do not approve
```

### Facilitator conclusion

`[List accepted suggestions, required fixes, unresolved questions, and the next
action.]`

## Final decision

- Problems requiring fixes before merge: `[list or none]`
- Accepted improvements: `[list or none]`
- Deferred improvements: `[list or none]`
- Follow-up owner: `[name]`
- Follow-up issue or task: `[identifier]`
- Final recommendation: `[approve / approve with changes / do not approve]`
