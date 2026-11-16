# Curiosity Grade

- **Student:** Nischal Rimal (mth115)
- **Assignment:** SCRUM-24 (Pandu chat threads, tools used and citations)
- **Report graded:** `curiosity-report-Rimal-SCRUM-24-2026-11-16.md`
- **Session date:** 2026-11-15 to 2026-11-16
- **Student self-context:** none provided

**Scores: (i) 3 · (ii) 3 · (iii) 3 · (iv) 2**

Turn numbers below count the STUDENT turns in the report's transcript, 1 to 31.

## 1. Executive summary

The student built SCRUM-24 (Pandu chat threads, tools used and citations) for StudyForge in one session of 31 student turns and 35 AI turns. The opening blocker check found three backend gaps: no saved messages, no record of the tools Pandu used, and no way to download a cited file. The student chose to build all three on this ticket (turn 8), against the AI's recommendation to split them into a separate ticket. The student then made the main design decisions:

- save a question before answering, so a refresh keeps a failed one (turn 9, overriding the AI's revised recommendation)
- a retry that re-answers the same question, and a 2-minute timeout (turn 10)
- one authenticated file endpoint, with citation details added when the response is built (turn 20)
- only the chat ID and selected sources kept in browser storage (turn 23)

Six questions changed the work:

- **Turn 12:** asked what a refreshed "couldn't find that" reply would display. The AI found that the saved reply has empty text and would show as an empty bubble, and planned the frontend fix and a test for it.
- **Turn 13:** asked which answer wins when a two-minute-old attempt finishes after a retry. This exposed an untested end-to-end race and a consequence: the answer may come from the older attempt's sources. The student chose the policy (turn 14), and an end-to-end test was added.
- **Turn 17:** asked whether the search trace accurately described one combined search, and whether failed answers should keep a trace. The AI agreed the trace misrepresented the search and reshaped it; the student approved both answers (turn 18).
- **Turn 21:** asked how the frontend would open an authenticated file, and asked the AI to check the PowerPoint download agreement. The AI ran the real slide parser on a generated deck and added a CORS round-trip test.
- **Turn 23:** asked for chat switching and deletion to be verified against questions still being answered. The AI added a test for each case, with mutation checks.
- **Turn 24:** asked what `refreshThreads()` does. Re-reading it, the AI found two bugs in its own fix: a chat created during a refresh could vanish from the list, and the refresh used a stale token. Both were fixed after turn 25.

Many other turns approved the AI's proposals or moved the work on ("sure", "yes to both of these", "apply the fix", "fix it", "continue"). The student made the commits (turns 15 and 22); the AI ran every test and check in the session.

## 2. Curiosity rubric

Event counts are descriptive and are not part of the scores. A turn counts under two dimensions only when separate clauses of it do different things.

### (i) Clarification / requests for detail — **3**

- **Evidence (turn 12):** "in services.py what will a refreshed INSUFFICIENT_CONTEXT display"
- **Evidence (turn 24):** "what does refreshThreads() do on ConnectedCourseChat.tsx"
- **Evidence (turn 21):** "how will the frontend open the authenticated file"
- **Depth:** Turns 12 and 24 each target one named file and one state or function, and each exposed a gap: an empty reply bubble after a refresh, and two bugs in the chat-list refresh. That meets the incisive anchor ("exposes a gap or error").
- **Events:** 5 (turns 1, 10, 12, 21, 24).

### (ii) Challenge / skepticism [PRIORITY] — **3**

- **Evidence (turn 17):** "the trace you wrote , can it describe a single combined search accurately"
- **Evidence (turn 13):** "if a two minute old attempt finishes after a retry starts which answer will win"
- **Evidence (turn 9):** "for blocker one , save the question before answer, a refresh should preserve a failed question."
- **Evidence (turn 3):** "creating branch from scrum 124 is not feasible because we are to follow consistent workflow along branches"
- **Depth:**
  - Turn 17 tested the accuracy of the AI's own design, and the AI conceded that the trace misled.
  - Turn 13 tested the design under a race and exposed an untested path.
  - Turn 9 overrode the AI's revised recommendation with a stated requirement, and turn 3 rejected an AI suggestion that broke the team's branch workflow.
  - These test claims and redirect the work: incisive.
- **Supporting evidence (verification):** the student asked for checks rather than accepting claims: "can you check the pptx download agreement we decided works" (turn 21) and "please verify thread switching and deletion against in-flight sends" (turn 23). The Evidence Appendix shows the resulting runs (rows 36–37 and 41–44). The AI ran all of them; the student did not run tests in this session.
- **Events:** 7 (turns 2, 3, 9, 13, 17, 21, 23).

### (iii) Why / tradeoffs — **3**

- **Evidence (turn 17):** "and should failed answers retain a trace"
- **Evidence (turn 5):** "i believe doing both backend and frontend for this ticket will result into a large number of file changes?"
- **Evidence (turn 8):** "let s do it on the same ticket neatly, i will arrange relevant commits together,"
- **Evidence (turn 20):** "since a citation already has document id one URL keeps opening sources simple"
- **Depth:**
  - Turn 5 asked about the cost of a scope choice. After the AI recommended splitting the ticket, turn 8 weighed that and kept the work together, with a mitigation (arranging the commits).
  - Turn 17 asked whether a design alternative was warranted, and turn 20 gave the student's own reason for choosing between alternatives.
  - These weigh real tradeoffs and redirect the work: incisive.
- **Events:** 4 (turns 5, 8, 17, 20).

### (iv) Error-response behavior [PRIORITY] — **2**

- **Evidence (turn 24, after episode 12):** "what does refreshThreads() do on ConnectedCourseChat.tsx"
- **Evidence (turn 25, after episode 14):** "apply the fix"
- **Evidence (turn 28, after episode 15):** "fix it"
- **Evidence (turn 18, after episode 5):** "yes to both of these"
- **Depth:**
  - After the AI reported fixing stale chat titles with a new list refresh (episode 12), the student questioned that mechanism, and the answer exposed two bugs in the fix. That is incisive probing of a fix.
  - After the five other defects, the student approved the AI's proposed fix without asking why or for alternatives. In each case the AI had already explained the cause, and for episode 5 it had set out options.
  - With one of six episodes probed (incisively) and none looped, the score sits at the substantive anchor.
- **Tally:** `Error episodes: 6 (PROBED 1, ACCEPTED 5, LOOPED 0)`

| Report episode | Where it surfaced | What happened | Student's next turn | Label |
|---|---|---|---|---|
| 3 | AI turns after turn 11 | A chat deleted during a failing answer returned 500 instead of 404 (the AI's own bug) | 12: asked about a different reply state | ACCEPTED |
| 5 | AI answer to turn 17 | The search trace split one combined search into two entries | 18: "yes to both of these" | ACCEPTED |
| 11 | AI turn after turn 23 | An access-token refresh reloaded the history and the chat list | 24: asked about a different part of that message | ACCEPTED |
| 12 | AI turn after turn 23 | Chat titles would go stale (fixed with a list refresh); a StrictMode cancel bug | 24: "what does refreshThreads() do…" | PROBED |
| 14 | AI answer to turn 24 | The list refresh could drop a chat created during it, and used a stale token | 25: "apply the fix" | ACCEPTED |
| 15 | AI turn after turn 27 | Deleting the open chat while offline showed two errors | 28: "fix it" | ACCEPTED |

**How to read this tally:**
- **Excluded episodes:** Section 3 lists 15 episodes, and 9 are left out.
  - Episodes 1 and 2 are not errors. Episode 1 resolved an ambiguous instruction before any rebase ran. Episode 2 is the AI changing a recommendation; the student's response (turn 9) is counted under (ii).
  - Episodes 4, 6, 7, 8, 9, 10 and 13 came from the AI's own tooling and test code: scripts, a slow background run, file locking during test cleanup, a known flaky test, and mistakes in newly written tests. They were not defects in the delivered work, and the student had no error to respond to.
- **Errors the student ran into:** none; the student did not run code in this session. Episodes 5 and 14 were brought to light by the student's own questions (turns 17 and 24), so (i), (ii) and (iv) partly rest on the same turns.

## 3. Notes for the grader (neutral)

**Where curiosity concentrated**
- Backend correctness in edge cases: the refreshed "couldn't find that" reply (turn 12), the retry race (turn 13), and the accuracy of the search trace (turn 17).
- Verification of agreed behavior: the PowerPoint download agreement (turn 21), and switching or deleting chats while a question is being answered (turn 23).
- One frontend mechanism after delivery: `refreshThreads()` (turn 24).

**Where the student worked by approval**
- Many turns approved proposals or moved the work on: turns 11 ("sure"), 14 ("i think a would be good"), 18 ("yes to both of these"), 19, 25 ("apply the fix"), 28 ("fix it"), 29 ("continue") and 31 ("yes"). Most followed an AI message that set out options with a recommendation.
- Of the ten frontend design choices, nine were accepted as recommended; the student changed the browser-storage choice (turn 23).

**Decisions the student made**
- Kept the backend work on this ticket, against the AI's recommendation to split it (turn 8).
- Saved questions before answering, overriding the AI's revised recommendation (turn 9).
- Set the retry and 2-minute rules (turn 10), chose one file endpoint with a stated reason (turn 20), and limited browser storage to the chat ID and selected sources (turn 23).
- Process: kept the team's branch workflow (turn 3), started Docker (turn 10), and made the commits (turns 15 and 22).

**Context**
- The student did not run tests or the app in this session. Every command in the Evidence Appendix was run by the AI, several at the student's request.
- The same AI session did the work, wrote the curiosity report and produced this grade. The quotes above come from the report's transcript, which was checked against the session log.

## 4. AI Sycophancy — No grade impact, for your awareness

- **Flattery:** none observed. The AI did not praise the student's questions.
- **Held its ground under a partly incorrect challenge (turn 2):** the student said SCRUM-75 was merged and "we should have relevant information we require". The AI checked and replied, "But it doesn't give you saved messages." The same reply opened with "Of the three blockers, two still stand; the third is smaller than I said", while its list showed all three as "still blocked". That is a mixed message that slightly softened toward the student's view.
- **Correct reversals under correct challenges:** turn 3 (branching from SCRUM-124 broke the team's workflow, and the AI branched from development instead) and turn 17 (the AI answered "No" and agreed that its own trace misrepresented the search).
- **Changed its recommendation without being challenged (reply to turn 8):** "last time I recommended saving the question before the answer and marking failed ones. Having looked at the code, I now recommend saving both together only after a successful answer." When the student overrode it (turn 9), the AI complied but named the consequence (a retry would save the question twice) and proposed a retry endpoint, rather than dropping its concern.
- **Self-reported errors:** the AI reported bugs in its own code without being asked, in the AI turns after turns 11, 23 and 27.

## 5. Performativity (preliminary)

The questions read as specific and substantive. They name concrete files, functions and states ("in services.py what will a refreshed INSUFFICIENT_CONTEXT display", "what does refreshThreads() do on ConnectedCourseChat.tsx", "a two minute old attempt finishes after a retry starts"), and several changed the work: a redesigned trace, new tests, and two bug fixes. The many short approval turns are workflow acknowledgments, not questions asked for show. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV score-row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
mth115,Nischal Rimal,"SCRUM-24 (Pandu chat threads, tools used and citations)",3,3,3,2,5,7,4,6,1,5,0,2026-11-16
```
