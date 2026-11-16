# Curiosity Grade

- Report graded: `curiosity-report-Paneru-SCRUM-52-2026-11-13.md`
- Student: Gaurav Paneru · Student ID: gqq14 · Assignment: SCRUM-52 Survival Quiz backend
- Self-context: none provided (that's fine; it's optional)

## 1. Executive summary

Over about 15 substantive student turns (2026-11-11 to 2026-11-13), the student directed an AI to plan and build a Django/DRF "Survival Quiz" backend: lives, score, game state on the server, endpoints, tests and docs. They then had the AI reorganize git commits and write reviewer documentation. The AI wrote the code. The student made the decisions, set the process limits ("Don't commit yet", run the tests before committing), and asked questions at decision points. Their curiosity is mostly in three places: a long clarifying-question turn before approving the plan (turn 3), a challenge to the game design (turn 11), and a request for the rationale and alternatives behind each commit (turn 21). There were two unexpected-behavior episodes: Docker wouldn't start, and teammates' reports were missing from `docs/`.

## 2. Curiosity rubric (four raw numbers; no composite)

### (i) Clarification / requests for detail: **2 (substantive)**
- Evidence (turn 3): *"What is stale tabs. How no.4 decision catches it? … What is refresh in edge case? How do GET rebuild the state? What does double answer or two tabs mean? How can a student go into another student's session?"*
- Evidence (turn 5): *"For 10 questions, so earlier what was your plan on decision 8. So, client (a student) could decide if he wants 5 questions or 10 questions?"* and *"Explain the problems you expect during implementation in much better words."*
- Depth justification: The student goes past "what does this term mean" and asks how a specific design decision handles a specific case (decision 4 vs. stale tabs; how GET rebuilds the state). In turn 5 they trace back to the AI's earlier plan. These questions engage the AI's reasoning but don't test it, so they score 2 rather than 3.
- Events (ungraded): about 7.

### (ii) Challenge / skepticism [PRIORITY]: **3 (incisive)**
- Evidence (turn 11): *"If survival quiz also has 5 or 10 question, then what's the point of lives? Don't you think survival quiz should be unlimited until the lives get finished? Whats your verdict?"*
- Evidence (turn 21): *"The commits look too much for the files changed."* Turn 3: *"Also, the commits are only 4. I recommend it making more."*
- Supporting verification: in turn 11 the student blocked commits until tests had run (*"Then, we can run the tests. Then, only commit."*). The Evidence Appendix shows the full backend check suite ran and passed (732 tests) before the code commits.
- Depth justification: The turn 11 question exposes a real gap in the design the AI built. With 5 questions and 3 lives, the lives barely matter. The AI conceded "Partly, yes" and proposed a follow-up "Endless Survival" ticket. The challenge was consequential and changed the work.
- Events (ungraded): about 4.

### (iii) Why / tradeoffs: **3 (incisive)**
- Evidence (turn 21): *"Explain what you changed for each commits. Then explain why you did that? What were the alternatives for the code?"*
- Evidence (turn 3): *"In very rare case, is it a good idea to include one question from the regular quiz where student couldn't answer correct or abandoned the question? Is there any problem implementing the code?"*
- Depth justification: The student explicitly asked for the rationale and the alternatives, and proposed a feature idea of their own. They weighed the AI's tradeoffs and decided to defer it to a follow-up ticket (turn 5: *"I will decide later with further implementation in follow up ticket"*). The turn 11 fixed-length vs. endless tradeoff also redirected the scope discussion.
- Events (ungraded): about 5.

### (iv) Error-response behavior [PRIORITY]: **2 (substantive)**
- Evidence (turn 27, PROBED): *"why don't i see the other two reports inside docs? Are they inside .gitignore?"* The student asked why and offered their own hypothesis, which the AI then checked and ruled out.
- Evidence (turn 9, ACCEPTED): *"I have plugged in ssd but docker is not opening. I don't know the problem."* The student asked for a diagnosis and then applied it without further questions (turn 17: *"can you run the tests now."*).
- Depth justification: One episode was probed with a testable hypothesis. In the other, the student followed the first diagnosis, which worked, without engaging its reasoning. That mix lands at 2.
- **Error episodes: 2 (PROBED 1, ACCEPTED 1, LOOPED 0)**

## 3. Notes for the grader (neutral)

- Curiosity concentrated on design semantics (stale tabs, refresh, double answers, ownership), game design (the purpose of lives), and repository and commit structure. The commit structure got repeated attention in turns 3, 9, 19 and 21.
- The student worked by approval on the implementation itself (*"For the decisions, I will go with your recommendations"*, turn 3). The AI wrote all of the code and tests, and the transcript contains no student questions about specific code lines. This describes how the work was divided; it is not a deficiency.
- The student set process controls throughout, such as asking before commits, testing before commits, and keeping the validation doc uncommitted. This is workflow ownership, not a curiosity dimension, so it isn't scored.

## 4. AI Sycophancy (no grade impact; for your awareness)

- **Reversal following the student's lean (mild, flag).** In turn 3 the student floated *"Let's do 10 questions for survival quiz? Any verdict?"*. The AI answered *"Fixed at 10 is a good call"* and dropped its own decision 8 (the student chooses 5 or 10). In turn 5 the student leaned back toward the original plan, and the AI reverted to 5-or-10. Neither option was wrong, but the AI's verdict tracked the student's framing both times instead of holding a position.
- **Correct partial concession (positive).** On the turn 11 challenge, the AI agreed *"Partly, yes"* and gave concrete reasons (5 questions with 3 lives). It held its ground that endless mode is out of the ticket's scope and gave reasons: the acceptance criteria, generation latency, repeated questions, and cost.
- **Held ground on the student's idea (positive).** On reusing missed regular-quiz questions, the AI opened with *"It's a good idea"* (mild validation). It then gave four concrete objections (a cheating loophole, free points, a model conflict, scope), and the student accepted deferring the idea.
- No flattery phrases such as "great question" or "excellent" were found.

## 5. Performativity (preliminary)

The questioning is specific and tied to the artifact. It names decision numbers, endpoint behavior and concrete scenarios, and several questions changed what was built or planned: the endless-survival follow-up, the commit restructuring, and the deferred missed-question feature. Nothing looks generic or asked for show. *This is a preliminary signal, not a definitive judgment of intent.*

## 6. CSV score-row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
gqq14,Gaurav Paneru,SCRUM-52 Survival Quiz backend,2,3,3,2,7,4,5,2,1,1,0,2026-11-13
```
