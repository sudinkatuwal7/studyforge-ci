# Curiosity Grade

- Report graded: `curiosity-report-Paneru-SCRUM-90-2026-11-20.md`
- Student: Gaurav Paneru · Student ID: gqq14 · Assignment: SCRUM-90 Quiz history and progress view
- Self-context: none provided (it's optional)

## 1. Executive summary

Over 5 student turns plus one multiple-choice answer (2026-11-20 22:04 UTC to 2026-11-21 06:26 UTC, with a gap of about 6 hours after turn 1), the student directed an AI to plan and build SCRUM-90 in a Django/DRF and React project:
- **Backend:** a quiz history endpoint with a course filter, and a per-course progress endpoint. Another student's course returns 404.
- **Frontend:** a Quiz History page with a URL-kept course filter, a progress panel, and links from the sidebar and the course Quizzes tab.

The AI wrote the code and tests, ran the checks, and made 9 commits. The full backend check ended with 1004 tests passing, and 737 frontend tests ran.

The student's input came in four places:
- **The opening request (turn 1):** blockers and dependencies, recommended steps, and *"Why those steps? Any other alternatives? Why your decisions?"*.
- **A commit plan (turn 2)**, then *"commit and test"* with a per-commit file explanation (turn 3).
- **One decision when Docker hung:** *"You restart Docker"*.
- **A scope change and an explanation request (turn 4):** dropping the teammate validation file, and asking how each commit meets each acceptance criterion.

## 2. Curiosity rubric (four raw numbers; no composite)

### (i) Clarification / requests for detail: **2 (substantive)**
- Evidence (turn 4): *"Explain each commits and how does it fulfill each acceptance criteria. What modifications did each commit have to do."*
- Evidence (turn 3): *"commit and test. Explain what files changed in each commit."*
- Why 2: turn 3 asked for a file list per commit, and the AI's answer was a table of commits and files. Turn 4 follows up on that answer by asking for more depth: how each commit meets each acceptance criterion, and what each one modified. That follows up on the answer given and scopes it to the ticket's criteria. It asks for explanation rather than disputing anything, so 2, not 3.
- Events (ungraded): 2 (turns 3, 4).

### (ii) Challenge / skepticism [PRIORITY]: **1 (surface)**
- Evidence (turn 4): *"I don't need a teammate validation file for this task."*
- Supporting verification: the student made testing part of the instruction (*"commit and test"*, turn 3). The Evidence Appendix shows tests before every commit, a mutation check on the ownership filter (4 tests failed when it was removed), baseline comparisons for flaky tests, and a full backend run passing 1004 tests. The AI ran all of these; the student required testing but didn't specify these checks.
- Why 1:
  - **Turn 4** pushes back on part of the AI's plan, but on scope, not on whether anything was correct.
  - **No claim was tested or questioned.** The AI made several claims the student could have checked, and none was examined in the transcript:
    - the existing frontend failures were flaky on the base commit too;
    - React Router's `startTransition` explains the URL race;
    - "4 of them fail if the owner filter is removed";
    - the route was implemented as `/quiz-history` after the AI had recommended `/history`.

  So the behavior is present but shallow.
- Events (ungraded): 1 (turn 4).

### (iii) Why / tradeoffs: **2 (substantive)**
- Evidence (turn 1): *"Recommend steps to complete the task acceptance criteria. Why those steps? Any other alternatives? Why your decisions?"*
- Why 2: the question asks for the reasoning behind each step and for alternatives, and the AI answered with a five-row table of alternatives. That scopes the depth of answer wanted, which meets anchor 2.
  - **Against a higher score:** the request is general rather than about a named design choice, and the student didn't follow up on any alternative.
  - **The open decision went unanswered:** the AI said *"The one thing to decide before you write code is where the history page lives"*, and the student didn't answer it.
  - **The other plan's alternatives:** the student didn't ask about those in turn 2 either.

  This is at the low edge of 2. An argument for 1 ("accepts the first answer without engaging its reasoning") exists, but the explicit request for alternatives and justification goes beyond a bare "why?".
- Events (ungraded): 3 (turn 1: three questions in one message).

### (iv) Error-response behavior [PRIORITY]: **1 (surface)**
- **Episode 1, Docker hung and blocked the backend tests (turn 3), ACCEPTED:** the AI described the problem and offered three options, and the student picked one: *"You restart Docker"*. The student didn't ask why it hung or what restarting would involve. The AI then escalated from a graceful quit to `kill -9` on the stuck processes, and said so as it went. That's a reasonable delegation of an environment problem, but it's acceptance without a question.
- Why 1: the only episode the student took part in was accepted as offered. No episode shows a loop of fixes.
- **AI-side episodes the student didn't experience as problems aren't counted**, consistent with earlier grades. These include:
  - the invalid default argument and the subtest cleanup bug;
  - the lint warnings;
  - the flaky frontend tests and the stale baseline ref.

  The flaky-test finding was reported to the student with an offer of a 1-line fix, and the student's next message didn't respond to it. It is described in the notes below rather than counted as an episode.
- **Error episodes: 1 (PROBED 0, ACCEPTED 1, LOOPED 0)**

## 3. Notes for the grader (neutral)

- **Where curiosity concentrated:** the opening turn, which asked for blockers, dependencies, reasoning and alternatives, and the final explanation turn, which mapped each commit to the acceptance criteria. Both scope the AI's explanations to the ticket.
- **Where the student worked by approval:**
  - **The 10-commit plan:** accepted and executed in one instruction (*"commit and test"*).
  - **The page-location decision:** not answered. The AI raised it in turn 1, and the student wasn't asked to confirm the route it then chose.
  - **The Docker restart:** delegated to the AI.
  - **The flaky Notes test fix:** the offer was not answered.

  This describes how the work was divided, not a deficiency.
- **Process ownership (not scored):** the student rebased the branch themselves between turns 1 and 2, as the AI had advised. They required testing with the commits, removed a deliverable they judged unnecessary, and requested this report and its grade.
- **An unflagged deviation (factual):** the AI recommended a `/history` route in turns 1 and 2 but implemented `/quiz-history`. It did not say it had changed the name. The student didn't ask about it.

## 4. AI Sycophancy (no grade impact; for your awareness)

- **No flattery.** No "great question", "excellent" or "you're right" phrases were found.
- **No caving.** The student made no correctness challenge, so there was no case of the AI giving in to an incorrect one. When the student dropped the teammate validation file, the AI deleted the uncommitted file and said the commit history was unchanged. That was a scope decision, not a disputed fact.
- **Owned its own errors (positive).** The AI reported its invalid default argument, its test cleanup bug, and its use of a stale `origin/development` ref for a baseline. It then reran the baseline on the correct commit, rather than leaving the wrong conclusion in place.
- **Backed a claim with evidence before stating it (positive).** The AI said the two frontend failures already existed only after running the suite on the base commit three times and seeing the same failures (2 of 3 runs).
- **Acted within a broad approval (factual).** "You restart Docker" was approved, and the AI escalated to force-killing processes without a further check. It narrated this step as it happened.

## 5. Performativity (preliminary)

The student's questions are few and mostly general requests for explanation:
- the "why, alternatives, why your decisions" triad in turn 1;
- the request to map each commit to the acceptance criteria in turn 4.

They are tied to the ticket and produced useful answers. They don't target specific claims or artifacts in the AI's work, and the turns in between are directive. This pattern fits a student who uses explanation requests to make the AI justify its work, more than one who probes it. *This is a preliminary signal, not a definitive judgment of intent.*

## 6. CSV score-row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
gqq14,Gaurav Paneru,SCRUM-90 Quiz history and progress view,2,1,2,1,2,1,3,1,0,1,0,2026-11-20
```
