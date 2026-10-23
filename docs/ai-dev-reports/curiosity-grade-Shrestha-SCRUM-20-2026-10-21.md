# Curiosity Grade

## 1. Executive Summary

- Student: Sanish Shrestha
- Student ID: mpr92
- Assignment: SCRUM-20 — Implement RAG questions API
- Session date: 2026-10-21
- Report assessed: [SCRUM-20 AI chat / curiosity report](./curiosity-report-Shrestha-SCRUM-20-2026-10-21.md)

> Assessment provenance: this is a provisional Codex-generated application of the repository's curiosity rubric, not an official professor grade or output from the configured Copilot/Claude grader. No professor approval of provider equivalence was found. A professor-approved grader's output is absent; it has not been simulated. This assessment is generated in the same working session that produced the report and should receive independent human review. Scores below are explicit qualitative judgments grounded in quoted report turns, not test-derived measurements or imported teammate scores.

The report contains 31 student messages and 56 AI messages covering retrieval, generation, authenticated routing, citation validation, testing, and reporting. The student's questions concentrated on what the implemented functions actually do, how Gemini retrieval connects to OpenAI generation, why a route is needed, and whether the security claim is justified. Other turns prescribe implementation scope and tests; those instructions are not treated as independent proof of the student's internal understanding. Counts below are descriptive, conservative selections of clearly identifiable turns, not score weights.

## 2. Curiosity Rubric

### (i) Clarification / requests for detail — 2/3 (substantive)

**Evidence:** STUDENT 13 asks, “but can open ai use gemini embedded form properly” and “answer ae provided in correct json form”. STUDENT 10 asks, “what happened int he mutli file retrieval explain”. STUDENT 16 asks, “so now using rag we have ceated files that can generate notes right”.

**Depth justification:** These questions request concrete clarification of the embedding-to-generation boundary and the actual purpose of the completed code. The AI distinguishes retrieved text from vectors and question answers from study notes. They engage specific prior work, but the record does not show these clarification turns independently demonstrating an implementation defect.

**Ungraded event count:** 8 selected clarification turns: STUDENT 4, 10, 11, 13, 15, 16, 19, and 22.

### (ii) Challenge / skepticism [PRIORITY] — 2/3 (substantive)

**Evidence:** STUDENT 19 asks, “we dont have route so how is everything working without it we never needed it ?why we need it now we accept 20 doc at once or totalrequest and resonse are in the same json contract style”. STUDENT 28 asks, “so what eve we did i is now secured end to end to break outs and what else in this last commit”. STUDENT 22 asks, “are the endpointa succesfully connected”.

**Depth justification:** These turns test the scope of “working”, “connected”, and “secured” against the components actually implemented. They prompt important distinctions between internal tests, HTTP wiring, frontend connection, and security guarantees. The score is substantive because they question concrete claims; it does not assume that every prescribed security test is a student-discovered exploit or that a failing implementation was independently exposed.

**Ungraded event count:** 3 selected challenge/verification turns: STUDENT 19, 22, and 28. Implementation directives requesting tests are recorded in the transcript but not added to this conservative question count.

**Supporting verification:** The appendix records real retrieval and API checks, a failed race-timing assertion, and the final 144-test/206-subtest passing run. These runs support the verification history; they were executed by the AI and do not create an additional rubric score or establish live-provider security.

### (iii) Why / tradeoffs — 2/3 (substantive)

**Evidence:** STUDENT 19 asks, “why we need it now”, in the context of the missing HTTP route. STUDENT 13 questions whether OpenAI can properly use the Gemini-embedded material. STUDENT 4 asks, “why can we have 3.12”.

**Depth justification:** The student probes why an HTTP boundary is necessary after function-level testing and whether the provider split is compatible. The AI explains that vectors are used for retrieval and only the resulting text is sent to generation. These are specific architectural/environment follow-ups; the transcript does not show the student explicitly weighing competing implementations or empirically testing those alternatives.

**Ungraded event count:** 3 selected why/architecture turns: STUDENT 4, 13, and 19. Overlap with other dimensions is descriptive, not double-weighted scoring.

### (iv) Error-response behavior [PRIORITY] — 2/3 (substantive)

**Evidence:** In the first-commit expectation episode, STUDENT 9 asks, “this was our first commit what happened here”, followed by STUDENT 10, “what happened int he mutli file retrieval explain”. In the environment episode, STUDENT 4 asks, “why can we have 3.12”, followed by the instruction to set it up and continue. Following Docker failure, STUDENT 6 says, “run now”.

**Depth justification:** The student asks for explanation of an unexpected Git state and an alternative Python setup, rather than only requesting that every fix be applied. The Docker continuation requests a retry without a recorded diagnostic probe. This supports substantive error-response behavior, without assuming that the student personally performed unseen environment repairs or challenged the race assertion corrected by the AI.

**Error episodes scored:** 3 (PROBED 2, ACCEPTED 1, LOOPED 0).

| Episode | Transcript pointer | Classification and evidence |
| --- | --- | --- |
| Python environment/test execution mismatch | Report Episode 2; STUDENT 4–5 | PROBED: asks about Python 3.12 before requesting setup/continuation. The wording is brief; no detailed root-cause argument is inferred. |
| Docker/Rosetta startup blocker and retry | Report Episode 3; STUDENT 6 | ACCEPTED: asks “run now” after the diagnosis; no explanation/alternative question is recorded. This labels the observed continuation, not unseen manual installation actions. |
| Expected first commit was not present | Report Episode 4; STUDENT 9–10 | PROBED: asks what happened and requests an explanation; inspection distinguishes uncommitted work from later manual commits. |

**Ungraded event count:** 3 assessable student-engaged episodes. The initial wrong-path correction and race-test failure were AI-handled, with no recorded immediate student reaction to those specific errors; they remain in the factual report but are not silently classified as student acceptance. Notes-versus-Q&A, HTTP/frontend scope questions, and Jira-login limitations are not counted as extra runtime-error episodes.

**Four raw scores:** (i) 2, (ii) 2, (iii) 2, (iv) 2. No composite, weighting, or course letter grade is calculated.

## 3. Notes for the Grader (neutral)

Questioning concentrated on system boundaries and interpreting completion/security claims. Many student turns are scoped implementation instructions with explicit file limits, read-only gates, and no-stage/commit/push constraints. Those constraints document control over the workflow but are not evidence of unseen testing or internal comprehension. The student provided the Jira acceptance-criteria text; authenticated Jira retrieval was not available.

The report preserves imperfect spelling and terse exchanges rather than rewriting them into stronger questions. Its snapshot excludes this assessment and report-generation outputs, and its source note describes possible record/replay limitations. Raw logs and tool-output availability differ from older teammate reports that used condensed exports; grades should not be inferred from report length or test count. The same-session/provisional Codex status must remain visible if the report is submitted.

## 4. AI Sycophancy — No grade impact, for your awareness

No substantial flattering language is identified in the selected evidence. The AI held an appropriate boundary when STUDENT 28 asked whether the work was secured end-to-end: “The backend now has layered security checks, but **we cannot claim it is completely secure against every breakout or attack**.” It also corrected the student's notes/Q&A expectation with “Not quite—these new files generate **answers to questions using retrieved document passages**, with source citations.”

The earlier repeated “successfully connected” statements were qualified as backend-only and mocked-provider verification. The follow-up clarified that frontend wiring was absent, and the student deferred it. This is a scope clarification rather than proof that a frontend integration had been completed. No incorrect student challenge followed by clear AI capitulation is established by these excerpts.

## 5. Performativity (preliminary)

The questions refer to concrete work in the session: provider compatibility, JSON, route necessity, document limits, Git state, and security coverage. Some are brief confirmations; others connect directly to previous explanations. No intent is inferred from the use of detailed task directives. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV score-row

Provisional Codex assessment only; the numbers below match the quoted-evidence judgments above. They are not an official Canvas award or a substitute for the professor's review.

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
mpr92,Sanish Shrestha,SCRUM-20,2,2,2,2,8,3,3,3,2,1,0,2026-10-21
```
