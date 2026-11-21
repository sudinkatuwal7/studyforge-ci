# Curiosity Grade

- Report graded: `curiosity-report-Paneru-SCRUM-91-2026-11-19.md`
- Student: Gaurav Paneru · Student ID: gqq14 · Assignment: SCRUM-91 Notes library: list, edit and delete notes
- Self-context: none provided (it's optional)

## 1. Executive summary

Over 9 student turns (2026-11-19, about 16:00 to 17:10 local time), the student directed an AI to plan and build SCRUM-91 in a Django/DRF and React project:
- **Backend:** list, get, PATCH and delete endpoints for saved notes. Another student's note returns 404 and a missing login 401. Edited content goes through the same structure validation as generated notes.
- **Frontend:** a notes library with a course filter, a note page with a structured editor and delete confirmation, and links from the course Notes tab.

The AI wrote the code and tests and ran the checks. The student set the rules up front: 404 not 403, read-only fields, the same validation, and ask before editing, running commands or committing. They approved each of the five commits after its tests passed, and asked for a per-file account of what changed, why, and which acceptance criteria each change serves.

Their curiosity shows in three places:
- **The plan (turn 3):** why PATCH instead of PUT, and what happens when two tabs edit the same note.
- **Verifying ownership (turn 5):** they asked to see the exact line that blocks another student's note.
- **A testing gap the AI disclosed (turn 11):** why a deliberate break wasn't caught at first, and what "tightening the test" meant and changed.

The student's device was force-quit mid-session, and they asked the AI to rerun the last prompt (turn 7). The session ended with the full backend and frontend checks passing.

## 2. Curiosity rubric (four raw numbers; no composite)

### (i) Clarification / requests for detail: **2 (substantive)**
- Evidence (turn 11): *"what do you mean by tightening the test and what you changed?"*
- Evidence (turn 5): *"Also show me the exact line that stops another student's note from being read, edited or deleted."*
- Evidence (turn 5): *"For each file you changed: what changed, why and which acceptance criteria it serves."* This was carried into commits 3, 4 and 5 by *"do the same"* (turns 9 and 13).
- Why 2:
  - **Turn 11** picks up a term the AI introduced in its own report ("tightened the test") and asks both what it means and what concretely changed. That's a follow-up on the answer given.
  - **Turn 5** narrows the answers wanted to an exact line and a file-by-file mapping to the acceptance criteria.

  These engage with the AI's work rather than accepting a summary. They ask for explanation rather than disputing it, so the score is 2, not 3.
- Events (ungraded): 3 (turn 5 ×2, turn 11).

### (ii) Challenge / skepticism [PRIORITY]: **2 (substantive)**
- Evidence (turn 3): *"What happens if two tabs edit the same note?"*
- Evidence (turn 5): *"show me the exact line that stops another student's note from being read, edited or deleted."*
- Evidence (turn 11): *"explain why removing the step that drops old responses was not caught at first."*
- **Supporting verification:**
  - The student required a test run before every commit (*"Start with commit 1 and stop after its tests pass"*, turn 3; *"Run the tests for commit 2. Ask before commit."*, turn 5). They finished with the full checks (*"run the full backend and frontend checks"*, turn 15).
  - The Evidence Appendix shows the checks behind each commit, deliberate-break checks for commits 3–5, and a final full run: 830 backend tests passing (1 opt-in skip) and 673 frontend tests passing.
- Why 2:
  - **The two-tabs question** is a specific concurrency edge case, and it surfaced a real limitation the plan didn't mention: *"the last save wins with no warning"* (turn 4).
  - **The "exact line" request** checks the AI's ownership claim against the code instead of taking the summary on trust.
  - **Turn 11** asks about a weakness in the AI's own tests.

  In each case the student accepted the answer without pressing further: they didn't ask for the concurrency check or weigh leaving it out, and the ownership claim held. As in SCRUM-86, this is 2, not 3.
- Events (ungraded): 3 (turns 3, 5, 11).

### (iii) Why / tradeoffs: **2 (substantive)**
- Evidence (turn 3): *"Why a patch request instead of update or Put?"*
- Evidence (turn 11): *"explain why removing the step that drops old responses was not caught at first."*
- Evidence (turn 5): *"what changed, why and which acceptance criteria it serves."*
- Why 2: turn 3 asks why a design choice was made over a named alternative (PUT). The AI answered with the tradeoff: partial updates, one code path, and PUT also being workable. Turn 11 asks why a test failed to detect a fault. Both are why-questions about consequences, not just how-to requests. The student approved all three plan decisions as recommended (*"I approve the three decisions."*, turn 3) and didn't follow up on the PATCH answer or weigh the tradeoff further, so the score is 2, not 3.
- Events (ungraded): 3 (turns 3, 5, 11).

### (iv) Error-response behavior [PRIORITY]: **2 (substantive)**
- **Episode 1, first frontend run failing (turns 6–8), ACCEPTED:** 18 Vitest failures (mostly timeouts) and 2 TypeScript errors caused by the AI's change. The AI fixed the errors, called the timeouts load-related, and reported a clean rerun (turn 8). The student committed without questioning the cause. It's worth noting that the student had independently reported the machine was overloaded (*"multiple apps running in the background"*, turn 7).
- **Episode 2, device force quit interrupting a test run (turn 7), ACCEPTED:** *"can you rerun last prompt. My device had to force quit because of multiple apps running in the background."* This was a request to repeat, without further questions. It's an environment problem the student diagnosed themselves.
- **Episode 3, a deliberate break not caught by the tests (turns 10–12), PROBED:** *"also explain why removing the step that drops old responses was not caught at first. what do you mean by tightening the test and what you changed?"* The student asked both why the fault went undetected and how the fix changed the test.
- Why 2:
  - **The one probed episode** is the only one about the code's correctness, and the probe engages the reasoning: it asks why the fault went undetected and how the fix works.
  - **The two accepted episodes** were environment-related. In both, the student's own report of an overloaded machine matched the AI's explanation.

  One could argue for 1, since two of three episodes were accepted. I scored on the depth of the probing that happened, as the rubric directs. No episode shows a back-and-forth loop of fixes.
- AI-side episodes the student didn't experience as problems aren't counted: the cut-off output, the zsh glob, the Node version, the weak stable-keys test, and the skipped-test attribution.
- **Error episodes: 3 (PROBED 1, ACCEPTED 2, LOOPED 0)**

## 3. Notes for the grader (neutral)

- **Where curiosity concentrated:** three moments.
  - **Before implementation (turn 3):** the HTTP method choice and concurrent editing.
  - **Verifying the AI's ownership claim (turn 5):** the exact line.
  - **The AI's own test-quality disclosure (turn 11):** why a break slipped through and what "tightening" changed.

  Each question is tied to a specific artifact or claim.
- **Where the student worked by approval:**
  - **Commits 3, 4 and 5:** approved with *"commit, then start commit N. do the same"* (turns 9 and 13).
  - **The three plan decisions:** approved as recommended (turn 3).
  - **The AI's offer of a concurrency check:** not answered (turn 4).
  - **A link the AI added beyond the plan:** not answered either (turn 14).

  This describes how the work was divided, not a deficiency. The per-file "what, why, which acceptance criteria" requirement kept each approval tied to an explanation.
- **Process ownership (not scored):**
  - The student set non-negotiable rules before any code: 404 not 403, read-only fields, the same validation, a specific Python interpreter, and asking before edits, commands and commits.
  - They required a five-commit split with tests per commit, and a final full check.
  - After the force quit, they had the interrupted step redone rather than skipped.
- **Transcript reconstruction (no grade impact):** the saved session log stored many short AI progress messages only in reworded form or not at all, so the report's AI turns come from the conversation record. A branch written by the old process during the force quit is excluded, and Section 3 of the report describes it. None of this affects the student's turns, which match the log word for word.

## 4. AI Sycophancy (no grade impact; for your awareness)

- **Admitted a limitation when asked (positive).** On the two-tabs question, the AI said plainly that *"the last save wins with no warning"* and described the standard fix. It didn't present the design as complete.
- **Disclosed its own testing gap without being asked (positive).** In turn 10, the AI reported that one of its deliberate breaks *"not caught at first"* and that it tightened the test. In turn 12 it reported a second weak test it had found and rewritten. These disclosures led to the student's turn 11 question.
- **Owned its own errors (positive).** In turn 6, the AI separated the TypeScript errors *"caused by my change"* from unrelated timeouts. In turn 4, it said it could not show two check results whose output was cut off, instead of claiming they passed.
- **Overstated certainty (minor, factual).** In turn 8 the AI wrote *"The earlier timeouts came from the overloaded machine, not the code."* The evidence was a clean full rerun and the student's own report of an overloaded machine. It was not a comparison run without the changes. In the excluded force-quit branch, the AI had said *"I haven't proven that, though."* The conclusion is plausible, and the final full check passed, but the statement was firmer than the verification behind it.
- **No flattery and no caving.** No flattery phrases were found ("great question", "excellent", "you're right"). The student made no incorrect challenge, so there was no case of the AI giving in to one.

## 5. Performativity (preliminary)

The questions are few, specific, and tied to the artifact. They name:
- the HTTP method alternative;
- a concrete concurrency scenario;
- the security property to be shown in code;
- the exact testing gap the AI had reported.

Each led to a substantive answer the student could act on. Most later turns are directive (commit, continue, run checks), but the questioning turns don't read as asked for show. *This is a preliminary signal, not a definitive judgment of intent.*

## 6. CSV score-row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
gqq14,Gaurav Paneru,SCRUM-91 Notes library: list edit and delete notes,2,2,2,2,3,3,3,3,1,2,0,2026-11-19
```
