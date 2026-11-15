# Curiosity Grade — SCRUM-101

## 1. Executive summary

The report records questions about the SCRUM-101 processing migration, Pandu’s dependency on processed chunks, worker and callback behavior, database ownership, vector retrieval, and answer reliability. The student also requested verification of what changed and what could break. The evidence appendix contains assistant-run tests: an initial backend test failure under the local provider configuration, a passing rerun with RAG set to `fake`, and a live Redis/Celery/Django smoke test with AI providers mocked.

## 2. Curiosity rubric

### (i) Clarification / requests for detail — score: 2

**Evidence (Transcript, Student turn 18):** “so how does pandu decide that the document doesn't have enough information is it based on the similarity score or ai”

**Depth justification:** This asks for the specific decision mechanism and distinguishes retrieval scoring from model judgment; it is a substantive clarification.

**Ungraded events:** 8

### (ii) Challenge / skepticism [PRIORITY] — score: 3

**Evidence (Transcript, Student turn 8):** “so does my integration test actually check what happens if two workers send callbacks for the same document”

**Evidence (Transcript, Student turn 11):** “so why didn't we add a pgvector index when moving to the new processing service? was that outside my scrum 101 task or did we miss it?”

**Depth justification:** The student tests whether stated test coverage reaches a consequential concurrency case and whether a potential performance concern was omitted or out of scope.

**Ungraded events:** 7

### (iii) Why / tradeoffs — score: 3

**Evidence (Transcript, Student turn 9):** “why did we keep the document chunks in django's database instead of storing them in processing service database”

**Evidence (Transcript, Student turn 14):** “so if we add an index later, could it change which chunks pandu retrieves or will it only make retrieval faster”

**Depth justification:** These questions examine the data-ownership choice and the correctness/performance tradeoff of approximate retrieval, not just implementation steps.

**Ungraded events:** 7

### (iv) Error-response behavior [PRIORITY] — score: 1

**Evidence (Transcript, Student turn 6):** “can you check what actually changed and if everything in scrum 101 is working now? tell me if anything is still missing or could break.”

**Depth justification:** The report records two assistant-run failures, but no student follow-up that asks why those specific failures occurred or challenges the proposed resolution. The student requested broad verification; the transcript does not show deeper probing of the surfaced failures.

**Error episodes:** 2 (PROBED 0, ACCEPTED 2, LOOPED 0). Both episodes were surfaced and handled by the assistant; “ACCEPTED” here means no student challenge or follow-up is recorded, not that the student personally applied the workaround.

**Ungraded events:** 2 episodes

## 3. Notes for the grader (neutral)

- Curiosity in the included transcript concentrates on worker/test realism, callback concurrency, data ownership, and retrieval correctness.
- The test failures in Section 3 were discovered during assistant-run checks. The transcript records no student response specifically probing either failure.
- The transcript appears to omit intervening exchanges from this session after the SCRUM-101 audit and before the worker-concurrency question. Scores and event counts here are based on the report as provided and may undercount the full session.
- The metadata’s optional self-context is blank; no inference is made from that absence.

## 4. AI Sycophancy — No grade impact

- No clear flattery or over-praise is present in the report.
- No instance of the AI caving to an incorrect student challenge is evident.
- The AI initially advised leaving an index out of SCRUM-101, then recommended considering it for Sprint 3 after the student clarified the scope. That change follows the clarified scope rather than ungrounded agreement; the recommendation remained conditional on benchmarking.

## 5. Performativity (preliminary)

The included questions are specific to the system’s task queues, callback behavior, data ownership, and retrieval correctness, which gives them a substantive, task-connected appearance. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV score-row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
oeo36,Sudin Katuwal,SCRUM-101 — Adapt Integration Tests and Remove Legacy Processing,2,3,3,1,8,7,7,2,0,2,0,2026-11-15
```
