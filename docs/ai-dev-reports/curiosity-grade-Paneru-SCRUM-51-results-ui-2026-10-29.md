# Curiosity Grade

- Report graded: `curiosity-report-Paneru-SCRUM-51-results-ui-2026-10-29.md`
- Student: Gaurav Paneru (gqq14)
- Assignment: SCRUM-51, part 2: quiz results UI (frontend)
- Session date: 2026-10-29 (session began 2026-10-28)

## 1. Executive Summary
The student gave the AI the SCRUM-51 acceptance criteria and their own task list for the
frontend half. They asked for a workflow and told the AI not to commit without
checking with them first. The AI added the results tests and an accessibility focus fix,
and checked the backend against a live server with curl. The planned browser check never
ran, because the Chrome extension was not connected. The curl run showed that results
could not be recovered after a page reload. The student chose to fix this inside the
ticket instead of opening a follow-up.

Over 9 student turns, most of the questions came after the fix:
- whether the quiz was stored only in memory
- what had actually gone wrong before the fix
- how and why a reload uses `sessionStorage`
- what browser storage mechanisms are called, and what kinds exist
- whether they are specific to React

In the last working turn, the student pointed out that the AI's commit messages broke
the team's `type(SCRUM-N): ...` convention, and asked for each commit's purpose and
files. The AI confirmed the convention in git history and reworded the three local
commits.

## 2. Curiosity Rubric (four raw numbers, no composite)

### (i) Clarification / requests for detail — **2**
- Evidence (STUDENT turn 6): "what are sessionStorage, localStorage called? what are other examples along with their types and their usages?"
- Evidence (STUDENT turn 7): "are these two browser storage only for react?"
- Evidence (STUDENT turn 9): "what does each commit do and which files do they change for your reason?"
- Justification:
  - The turn-6 request names exactly what it wants: the name, the types and the uses.
  - Turn 7 follows up on that answer, testing a boundary (React-only or not).
  - Turn 9 asks for the reasoning behind a specific artifact the AI produced.
  - All three are substantive and engage the answers given. None of them, on its own,
    tests a claim.
- Events (ungraded): 3

### (ii) Challenge / skepticism [PRIORITY] — **3**
- Evidence (STUDENT turn 9): "also, you didn't follow commit naming pattern. E.g: feat(SCRUM-51): ...."
- Evidence (STUDENT turn 2): "so right now the quiz is only memory based and is not saved in disk. Is that right?"
- Justification:
  - The turn-9 challenge was correct. It **exposed a real error** in the AI's output:
    the AI had proposed and made `SCRUM-51: Add ...` subjects, against a convention
    that this same ticket's earlier commits follow.
  - It **redirected the work**: the AI rebuilt all three commits.
  - The error is about process and formatting rather than code correctness. It still
    meets the anchor "exposes a gap/error ... or redirects the work".
  - Turn 2 states a hypothesis and asks the AI to confirm it, rather than assuming it.
- Supporting evidence: none from the student. The Evidence Appendix shows that the AI
  ran all the tests, curl checks and builds. The student did not report running the
  browser check, which the AI handed back to them twice (see Notes).
- Events (ungraded): 2

### (iii) Why / tradeoffs — **2**
- Evidence (STUDENT turn 4): "So, what was the earlier problem ? The sessionstorage didn't save quiz id?? If it did, then what was the reason the quiz wasn't saved."
- Evidence (STUDENT turn 5): "How does a reload of page fetches everything from sessionStorage and why does it do it?"
- Evidence (STUDENT turn 3): "Yes, I think for this fix, follow up ticket would be quite small. Can you do the fix right here"
- Justification:
  - Turn 4 asks for the root cause, and lists the competing explanations the student
    had in mind.
  - Turn 5 asks *why* as well as *how*. The answer covered the design tradeoffs:
    storing only the id versus the whole quiz, and `sessionStorage` versus
    `localStorage`.
  - In turn 3 the student made a scope decision, choosing in-ticket over a follow-up.
    They gave a reason ("quite small") but did not explore the alternative further.
  - These engage the reasoning. Neither the student nor the AI weighed alternatives
    the student raised themselves, so this is substantive rather than incisive.
- Events (ungraded): 2

### (iv) Error-response behavior [PRIORITY] — **2**
- Evidence (PROBED, STUDENT turns 2 and 4): "so right now the quiz is only memory based and is not saved in disk. Is that right?" / "If it did, then what was the reason the quiz wasn't saved."
- Justification:
  - On the main unexpected behavior, the results lost on reload, the student asked
    first what was stored where, then for the root cause. Only after that did they
    request the fix.
  - On the commit-naming error they caught, they accepted the AI's correction without
    asking more about the fix.
  - They did not respond to the AI reporting twice that it could not run the browser
    check.
  - Overall the probing was substantive on one episode, and the other two were taken
    as given.

**Episode tally:** `Error episodes: 3 (PROBED 1, ACCEPTED 2, LOOPED 0)`
- Results lost on reload (report Episode 3): PROBED, turns 2 and 4.
- Commit messages broke the convention (Episode 5): ACCEPTED. The student raised it,
  and the AI's reword was accepted without follow-up.
- Chrome not connected, so the manual UI check didn't run (Episode 2): ACCEPTED. The
  student did not respond to it.
- Not counted: Episodes 1, 4 and 6 (the CSRF 403 in the AI's curl script, the lint
  warning, the `cherry-pick -q` failure). The AI found and fixed each one inside a
  single turn, so the student had no chance to respond.

## 3. Notes for the Grader (neutral)
- **Where curiosity concentrated:** the student's questions centred on one concept,
  client-side versus server-side persistence. They moved from the specific bug (turns
  2, 4) to the mechanism (turn 5) to general background (turns 6, 7). Turns 2 and 5
  contained misconceptions that the AI corrected:
  - "not saved in disk": the backend did save the quiz.
  - "fetches everything from sessionStorage": only the id is stored there.
- **Where the student worked by approval:** the opening task list, the decision to fix
  in-ticket, and "ok. commits now." gave direction without questioning the
  implementation.
- **The student brought their own plan:** they arrived with a written task list,
  including the reload check that later found the bug, and set a gate that no commits
  happen without confirmation.
- **Verification:** the planned manual browser check was not observed as completed in
  this session. The AI reported twice that it could not run it and listed the steps
  for the student. This is recorded as a fact, not a fault.

## 4. AI Sycophancy — No grade impact, for your awareness
- **No flattery or over-praise** was observed in the AI's turns.
- **Correctly holding ground:** the AI corrected the student's misconceptions instead
  of agreeing with them:
  - "Not quite. The backend does save quizzes to disk." (turn 2)
  - "A small correction first: a reload doesn't get everything from `sessionStorage`."
    (turn 5)
- **Correctly reversing under a correct challenge:** on the naming pattern, the AI
  first checked git history ("I'll check the convention in the history before
  rewording."), then conceded ("I missed that."). It verified before changing course.
- **Not caving:** the AI had recommended a follow-up ticket for the reload fix. When
  the student chose to fix it in this ticket, the AI did so. That was a scope decision
  that belonged to the student, not the AI giving in on a factual claim.

## 5. Performativity (preliminary)
The questions look specific and real, not for show:
- They refer to concrete artifacts: quiz id, `sessionStorage`, the commit pattern.
- They state the student's working hypotheses, sometimes wrongly ("The sessionstorage
  didn't save quiz id??"). That is typical of genuine model-building.
- Turns 6 and 7 are more general-knowledge questions, but they follow directly from
  the code discussed.

This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV Score-Row
```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
gqq14,Gaurav Paneru,SCRUM-51 (part 2 results UI),2,3,2,2,3,2,2,3,1,2,0,2026-10-29
```
