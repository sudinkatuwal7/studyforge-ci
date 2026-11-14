# SCRUM-119 Reviewer Guide

## Task

Atomic Processing-Result Persistence API

## What this change does

The processing worker saves its terminal callback result in Execution before sending it to Django. If Django is temporarily unavailable, a retry sends that saved result without repeating source fetch, extraction, chunking, or embedding.

## Branch

`feature/SCRUM-119-atomic-processing-result-persistence`

## What to review

1. Execution tracks processing state separately from callback-delivery state.
2. The terminal result is saved before its HTTP callback.
3. A temporary callback failure leaves the saved result pending.
4. A retry reuses the saved payload and its original processing attempt without recomputing the document.
5. Django acknowledges identical callbacks without duplicating chunks.
6. Permanent callback rejection marks delivery rejected without restarting processing.

## How to run the tests

From the repository root on Windows, run:

```powershell
python services/document-processing/check.py
backend/venv/Scripts/python.exe scripts/check.py --component backend --suite documents
```

The backend check requires Python 3.12; the command above uses the repository's Python 3.12 virtual environment. Both checks use Docker.

## Important tests to observe

- Successful callback staging and delivery.
- Temporary Django outage and retry of the saved result.
- No repeated source fetch, extraction, chunking, or embedding on replay.
- Lost response after Django commits, followed by an idempotent duplicate callback.
- Failed-processing callback recovery after a temporary outage.
- Permanent rejection retaining the processing result.

## Expected result

Worker startup, service tests, migrations, and the backend document suite should pass. Replays should leave one logical set of chunks and the correct job/document status.

## Real PR Review

Run the branch yourself and record the required very short time-stamped video for Team Slack #announcements. Then inspect the implementation and request at least one genuine code improvement or issue on the Bitbucket PR.
