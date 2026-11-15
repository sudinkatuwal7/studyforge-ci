# SCRUM-119 Real PR Review Guide

## Task

**SCRUM-119 — Atomic Processing Result Persistence**

**Branch:** `feature/SCRUM-119-atomic-processing-result-persistence`

**Reviewer:** Sanish Shrestha

---

## What This PR Does

This task makes document-processing result delivery more reliable.

After extraction and embedding finish, the processing service saves the completed result and its callback delivery state.

If delivery back to Django fails, the completed processing result can be retried without repeating the expensive extraction and embedding work.

The main behavior to verify is:

**process once -> save result -> callback fails -> retry callback -> reuse saved result**

---

## 1. Checkout the Branch

From the StudyForge repository root:

```bash
git checkout feature/SCRUM-119-atomic-processing-result-persistence
git pull
git status
```

Expected:

```text
On branch feature/SCRUM-119-atomic-processing-result-persistence
nothing to commit, working tree clean
```

---

## 2. Run the Backend Checks

From the StudyForge repository root:

```bash
backend/venv/Scripts/python.exe scripts/check.py --component backend
```

The backend checks should pass.

---

## 3. Run the Document Processing Checks

From the StudyForge repository root:

```bash
python services/document-processing/check.py
```

The document-processing checks should pass.

If your Python command is `python3`, use:

```bash
python3 services/document-processing/check.py
```

---

## 4. What to Verify for SCRUM-119

### Normal successful processing

When document processing completes successfully:

- extraction completes;
- embeddings are generated;
- the completed result is saved;
- callback delivery state is stored;
- the result can be delivered back to Django.

### Callback failure

If processing completes but the callback to Django fails:

- the completed result should remain available;
- the callback should remain retryable;
- extraction should not run again;
- embeddings should not be generated again.

The expensive processing work should not be lost just because result delivery failed.

### Callback retry/replay

When the callback is retried:

- the previously saved result should be loaded;
- the saved payload should be reused;
- only delivery should be retried;
- extraction should not repeat;
- embedding should not repeat.

### Recovery

If the original callback attempt fails and a later retry succeeds:

- the job should recover normally;
- the saved result should be delivered;
- delivery state should reflect the successful callback.

### Duplicate/repeated retry

Repeated delivery attempts should not cause the document to be extracted and embedded again.

The saved processing result should remain the source used for callback replay.

---

## 5. Important SCRUM-119 Test Areas

While reviewing the automated test output, verify that the tests cover:

- persisted callback delivery state;
- callback failure;
- callback retry;
- callback replay;
- recovery after callback failure;
- reuse of the saved result;
- no unnecessary extraction on retry;
- no unnecessary embedding on retry;
- repeated callback attempts;
- safe recovery behavior.

The important idea is that a callback failure is a **delivery failure**, not a reason to repeat document processing.

---

## 6. Expected Behavior

### Before this behavior

A failure after expensive document processing could require processing work to be repeated.

### With SCRUM-119

The intended lifecycle is:

```text
Document
   |
   v
Extraction
   |
   v
Embedding
   |
   v
Save completed result
   |
   v
Attempt callback to Django
   |
   +---- success ----> complete
   |
   +---- failure ----> keep saved result
                           |
                           v
                      retry callback
                           |
                           v
                    reuse saved result
```

The retry should happen from the saved callback/result state rather than starting extraction and embedding again.

---

## 7. Final Git Check

After testing, run:

```bash
git status
```

Expected:

```text
nothing to commit, working tree clean
```

This confirms that testing the branch did not accidentally modify committed project files.

---

## Copy-Paste Test Commands

From the StudyForge repository root, the review can be done with:

```bash
git checkout feature/SCRUM-119-atomic-processing-result-persistence
git pull
git status

backend/venv/Scripts/python.exe scripts/check.py --component backend

python services/document-processing/check.py

git status
```

If `python` does not work for the processing-service check:

```bash
python3 services/document-processing/check.py
```

---

## What to Look For During Review

The most important question for this PR is:

> If processing already completed and only the callback fails, does StudyForge retry delivery using the saved result instead of performing extraction and embedding again?

If yes, the main SCRUM-119 behavior is working.

If not, please request a change before approving the PR.

---

## Real PR Video

For the required short timestamped Real PR video:

1. Show the current date and time.
2. Show that you are on `feature/SCRUM-119-atomic-processing-result-persistence`.
3. Show the automated checks running/passing.
4. Show the SCRUM-119 callback retry/recovery tests.
5. Explain that the result is saved before callback delivery.
6. Explain that a failed callback can be retried using the saved result.
7. Verify that extraction and embedding are not repeated during callback replay.
8. Run `git status` and show that the working tree is clean.
9. If you find a problem, request the change before approving the PR.

---

## Reviewer Feedback

If everything passes and the behavior works as expected, the PR can be approved.

If something fails, please include:

- what command/test failed;
- what behavior was expected;
- what actually happened;
- the small change you recommend.

After any requested change is made, rerun the failed test and the relevant automated checks before approving the PR.