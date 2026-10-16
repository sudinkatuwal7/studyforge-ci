# Curiosity Grade

## 1. Executive Summary

Student: Gaurav Paneru (`gqq14`)  
Assignment: SCRUM-38 — Implement Quiz Database Models & Migrations (StudyForge Sprint 2)  
Session date: 2026-10-15

The student used the AI to add Django `Quiz` and `Question` models, a migration, tests and documentation, and approved each file change and test run along the way. Their curiosity centered on two things: why the AI made its design recommendation (JSON list vs. Option table), and how the code works, line by line (`__init__.py`, `Meta`, `clean()`, `related_name`, primary and foreign keys, `MIN_OPTIONS`, test storage). Each answer drew a follow-up. The most consequential moment came near the end: the student asked the AI to re-check whether its commits were meaningful rather than "a big giant commit". The AI then split a mixed feature commit. Four environment or unexpected-behavior episodes occurred, and the student acted on or moved past the AI's diagnosis each time without asking further questions. The final backend run passed 230 tests. The optional self-context field is blank.

## 2. Curiosity Rubric

Event counts are descriptive, not scores. They count distinct student turns with the relevant behavior, and one turn may count in more than one dimension.

### (i) Clarification / requests for detail — 2/3

Evidence: After the AI explained foreign keys and the auto-generated `id`, the student followed up with: "When you said Django adds id field automatically, which entities uses the id attribute? What id are we talking? Are we talking about quiz id ? So, quizID is the primary key and it's foreign key is user's id?" (Transcript turn 13). In the same turn: "What do you mean by related_name = "quizzes" lets you go the other way with user.quizzes.all()."

The student went back to specific phrases in the AI's earlier answer and stated their own understanding to be checked. That surfaced a misconception about keys, which the AI corrected. This is substantive follow-up on an answer already given. It does not expose an error or gap in the AI's own reasoning, so it isn't scored as incisive.

Ungraded event count: 4.

### (ii) Challenge / skepticism [PRIORITY] — 3/3

Evidence: "Double check if the commits you made are meaningful and not a big giant commit. Commits are to track history and debugging. Double make sure." (Transcript turn 15). Earlier, more mildly: "you can add it unless it's purposely left missing" (Transcript turn 7).

The commit challenge questioned work the AI had already presented as finished. It exposed a real problem (production code and tests in one commit) and redirected the work: the history was split into feat, test and docs commits, and the AI then verified that the feat commit works on its own. The student also stated the reason (history and debugging), so this is a consequential challenge rather than a formality.

Supporting verification: the Evidence Appendix shows the student required the build and test steps and approved them before they ran (rows 11–13: system checks, migration check, fresh PostgreSQL migrations, 230 passing tests).

Ungraded event count: 2.

### (iii) Why / tradeoffs — 2/3

Evidence: "For 4.q3, What do you mean by option table being "heavier"? Why is your suggestion JSON list?" (Transcript turn 3). Also: "why __init__.py is empty for this task and why is it necessary?" and "Why is class Meta inside class Question?" (Transcript turn 11).

The student asked for the reasoning behind the AI's design recommendation before deciding, and the AI's answer laid out the tradeoff. The student then chose "JSON" without weighing the alternatives themselves or testing the stated costs. That makes it substantive rather than incisive.

Ungraded event count: 2.

### (iv) Error-response behavior [PRIORITY] — 1/3

Evidence:
- **Docker could not run:** the student fixed it and replied, "Now, my docker is up. You can check on your end." (Transcript turn 3).
- **pytest was missing:** the student approved the install with "OK" (Transcript turn 9).
- **SQLite migration history:** no student response is recorded (Transcript turn 8).
- **Commit hashes changed unexpectedly:** no student response before the report was requested (Transcript turns 18–19).

The student acted on the AI's diagnoses: they started Docker and approved the dependency install. They did not ask why any of these happened, question the diagnosis, or ask for alternatives. This matches the "accepts the first answer" anchor. Note on scope: Section 3's Episode 4 (the commit challenge) is a student challenge, not an error episode. It is scored under (ii) and excluded here.

Error episodes: 4 (PROBED 0, ACCEPTED 4, LOOPED 0).

Ungraded event count: 4 episodes.

**Four raw scores:** (i) 2 (ii) 3 (iii) 2 (iv) 1. No composite score is calculated.

## 3. Notes for the Grader (neutral)

- **Where curiosity concentrated:** understanding the produced code, through a two-round walkthrough with follow-ups, and the quality of the git history. The design decision (JSON vs. Option table) was questioned once, then decided.
- **Where the student worked by approval:** the student set an explicit gate at the start ("Ask me before you make any file change and running tests"). Several later turns are approvals ("JSON", "OK", "Ok, ready for the commits."). The environment problems were all raised by the AI, and the student responded by acting rather than questioning.
- **AI errors the student did not catch:** in turn 6 the AI claimed serializers call `full_clean()`. The AI corrected this itself in turn 12 (DRF's `ModelSerializer` does not), without being prompted by the student.
- **Outside the transcript:** reflog evidence in turn 18 shows that someone outside the chat ran an interactive rebase that removed the AI attribution trailer from the commits. The transcript does not attribute it to the student, so it is not scored.
- **Consistency flag for the human grader:** (iv) was scored 1 because the student acted on the AI's diagnoses without querying them, which the anchor-1 wording describes. The existing SCRUM-97 grade scored a similar no-probing pattern 0/3. Please align these if your policy differs.
- **Same-session generation:** this grade was produced by the same AI session that did the work and wrote the report. Treat it as a draft for professor review.

## 4. AI Sycophancy — No grade impact

- **Correct reversal under a correct challenge (positive):** after the commit challenge, the AI said, "You were right that the feature commit was too mixed," and gave concrete reasons tied to the team's history (`feat(notes)` then `test(notes)`). It then verified the split. This agreement was warranted.
- **Correctly holding its ground:** on the student's key misconception, the AI said, "So you're nearly right, with one correction. A quiz's **primary key is `quiz.id`**. Its foreign keys are **two other columns**." It corrected the student instead of affirming them.
- **Unprompted self-correction:** "A correction to something I said earlier. I told you serializers call `full_clean()` … **not of DRF's `ModelSerializer`**" (turn 12).
- No flattery or over-praise was observed, and the AI did not give in to any incorrect challenge.

## 5. Performativity (preliminary)

The questions are specific and tied to the artifacts in the session. They name exact files and constructs (`__init__.py`, `class Meta`, `related_name`, `MIN_OPTIONS`) and quote the AI's own phrasing back ("heavier", "lets you go the other way"). The key question restates the student's own understanding so it can be corrected. The commit challenge states its purpose. These features suggest substantive rather than for-show questioning. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV Score-Row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
gqq14,Gaurav Paneru,SCRUM-38,2,3,2,1,4,2,2,4,0,4,0,2026-10-15
```
