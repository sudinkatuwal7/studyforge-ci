# Curiosity Grade

## 1. Executive Summary

Student: Aashish Dhital  
Student ID: wor21  
Assignment: SCRUM-104 — Build Dashboard Course, To-Do & Calendar Widgets  
Session date: 2026-10-30

The report combines a Codex session and the Cursor session that continued it. The work is the signed-in dashboard and course page: course ownership, a 3/2/1 card grid, Pandu images, course tasks, a sidebar calendar, a date cloud, and course-page layout, logo, and materials. Curiosity shows up on whether `request.user` filtering actually blocks other students, whether the frontend filter is enough, `useLayoutEffect` versus `useEffect`, `fixed` versus `absolute`, and why material status text was hidden. Many other turns direct layout, colors, logo size, and commit text. Four error or unexpected-behavior episodes are scored below; one is probed. A prior-session test failure is in the tool log only, with no student message about it, so it is not one of those four. The optional self-context field is blank and does not affect any score.

## 2. Curiosity Rubric

Event counts are descriptive, not scores. Counts are distinct student turns. One turn may count in more than one dimension. Locations are line numbers in `curiosity-report-Dhital-SCRUM-104-2026-10-30.md`.

### (i) Clarification / requests for detail — 2/3

Evidence: After the AI showed `Course.objects.filter(owner=request.user)`, the student wrote, “Course.objects.filter(owner=request.user) where is this and explain me more about this code” (line 85). After the bearer explanation, they checked the wording: “so bearer means to carry jwt token in our case?” (line 205). After the `--tail` explanation, they wrote “i still dont get it” (line 756). They also scoped a block: “@CourseWorkspace.tsx (34-40)  explain this code” (line 942).

These name a specific expression, a prior answer, or a line range, and two of them follow an explanation that was already given. They ask for a clearer account of code or terms. They do not themselves test whether a claim is wrong.

Ungraded event count: 13 (lines 85, 183, 205, 287, 355, 436, 491, 642, 736, 756, 790, 919, 942).

### (ii) Challenge / skepticism [PRIORITY] — 3/3

Evidence: After the AI said another student’s courses never reach the browser and that a direct open returns 404, the student wrote, “Does filtering by `request.user` completely prevent students from accessing other students courses? i mean how is authorization nad authentication mainted so that one use cannot accesss other person's course” (line 124). Later they wrote, “is filtering courses only in frontend enouugh to make sure other user's courses is not acccesssed? sure?” (line 475). They also asked, “let me know if we are replacing a code written by other teammate” (line 247).

The first question tests the claim that the list filter is enough, and it separates authentication from authorization. The AI then said the list filter does not protect every endpoint. The “sure?” question tests frontend-only filtering; the AI answered “No.” The teammate question checks authorship before treating the grid edit as theirs. The AI reported that the tablet and mobile rule was last changed by Nischal Rimal.

Supporting verification: the student wrote “is todo and calender connected? just ans” (line 378) and then “check” (line 386). They asked “Calendar: Mark dates containing tasks or study sessions and show items for the selected day we already have this right?” (line 822), “are these fulfilled?” (line 861), and, after pasting the acceptance criteria, “this good right?” (line 1216). Before a push they wrote “run all the tests” (line 1233). Evidence row 66 is `npm test` in the Cursor session; the assistant stated that 304 tests across 36 files passed (line 1239). Evidence row 32 records an earlier “Test Files 2 failed (2)” and row 36 a later “Test Files 2 passed (2)” and “Tests 8 passed (8)”. Those commands are in the appendix as assistant runs. The student did not write about the failed run.

Ungraded event count: 9 (lines 124, 247, 378, 475, 811, 822, 861, 1173, 1216). Line 386 is the follow-up to line 378 and is not counted separately.

### (iii) Why / tradeoffs — 3/3

Evidence: “Why are we using useLayoutEffect instead of useEffect?” (line 717). “okay also what the difference between fixed and absolute isnt abslute better/” (line 768). “also why are we hiding the status messages instead of showing a shorter status indicator?” (line 1173).

The hook question names the alternative the code did not use. The positioning question asks for the difference and suggests `absolute` may be better; the AI kept `fixed` and tied that to the `18rem` calendar box with `overflow: auto`. The status question asks why the sentences were removed and names a shorter indicator instead. That indicator is what the next edit added.

Ungraded event count: 3 (lines 717, 768, 1173).

### (iv) Error-response behavior [PRIORITY] — 2/3

Section 3 lists seven items. Four are treated as episodes because the student responded. The commit-format correction (Section 3, episode 2) is a style pushback and is scored under (ii), not here. “i still dont get it” (Section 3, episode 3) is a clarification follow-up and is scored under (i). The calendar test failure (Section 3, episode 7) has no student message, so it has no response to label.

- **Usage limit — ACCEPTED:** The Codex session stopped with “You've hit your usage limit… try again at Oct 30th, 2026 1:19 AM.” The student continued in Cursor and wrote, “use this as this as resference this is my full chat with codex before it ran out oftoken, i want you to keep this as we will need this for curiosity as well” (line 588). They did not ask why the limit happened or what to change about it.
- **Hidden status text — PROBED:** After the row was shortened and the status sentences were removed, the student wrote, “also why are we hiding the status messages instead of showing a shorter status indicator?” (line 1173). That asks for the cause and names an alternative before the short PENDING / PROCESSING / READY / FAILED label was added.
- **Upcoming criterion — ACCEPTED:** The AI said the next-three list was not met because that section had been removed. The student wrote, “it was a team decision to remove that. other than that am i ready to push run all the tests” (line 1233). They did not ask why that criterion existed or what else could satisfy it.
- **Off-task sidebar — ACCEPTED:** After the student asked to include the prior chat, the assistant started inspecting an 82/18 sidebar (lines 1268–1271). The student’s next message restated the report request with the saved-chat path and “id=wor21” (line 1274). They did not ask why the layout work had started.

The status turn engages the reason and names another UI. The other three episodes move on without a why or an alternative. No LOOPED episode is observed. The probed turn does not check whether the one-word labels were the right fix after they were added (“perfect give me commit summary”, line 1187).

Error episodes: 4 (PROBED 1, ACCEPTED 3, LOOPED 0).

**Four raw scores:** (i) 2  (ii) 3  (iii) 3  (iv) 2. No composite score is calculated.

## 3. Notes for the Grader (neutral)

Curiosity clusters on access control (`request.user`, bearer versus JWT, frontend versus backend task filters), on the calendar cloud (`useLayoutEffect`, `--tail`, `fixed` versus `absolute`), and on checking acceptance criteria after the Upcoming list was removed. The opening of the Codex session asks for step-by-step approval (“do not change all at once… i will learn and approve it”, line 44). Later Cursor turns are mostly implementation directions: cloud instead of a full-screen popup, a cross instead of Close, Pandu height, logo sizes from 5rem through 9rem, cream colors, upload layout, and commit summaries. Self-context was left blank.

## 4. AI Sycophancy — No grade impact

- **No flattery of the kind flagged by the rubric.** The transcript does not contain “Great question,” “Excellent point,” or similar praise of the student.
- **Held the security claims:** On whether `request.user` filtering completely prevents access, the AI said the list is protected and that “The list filter alone cannot protect those operations.” On “sure?” about frontend-only filtering, the AI answered “No. Frontend-only filtering is not secure.”
- **Held `fixed` over `absolute`:** On “isnt abslute better/”, the AI said `fixed` is the better fit for this popup because an `absolute` cloud is trapped in the scrolling `18rem` card. On “so fixed is so that it changes based on screen?”, the AI said a `fixed` cloud “does not resize or move on its own when the screen changes.”
- **Correct reversal on the commit prefix:** The student wrote “no accoding to our previous formatting this is scrum 104” (line 811). The AI rewrote the summary with `feat(SCRUM-104):`.
- **Correct reversal on hidden status:** The student asked why status sentences were hidden instead of a shorter indicator. The AI agreed the clipping had removed the only pending/processing/ready/failed signal and added one-word labels.
- **Upcoming gap was not denied, then was set aside:** The AI twice said the next-three list was not met. After “it was a team decision to remove that”, the AI wrote “The upcoming-list removal is set aside” and treated the rest as ready to push. That follows a scope decision the student stated. It is not the AI agreeing that the criterion was already implemented.
- **No case appears of the AI agreeing with an incorrect technical challenge.**

## 5. Performativity (preliminary)

The stronger questions name code that was just written or claimed: `Course.objects.filter(owner=request.user)`, frontend versus backend filtering, `key={course.id}`, `useLayoutEffect` versus `useEffect`, `--tail`, `fixed` versus `absolute`, teammate authorship, and the acceptance criteria. Other turns specify pixels, colors, and button copy. The access-control and popup questions are specific to this dashboard. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV Score-Row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
wor21,Aashish Dhital,"SCRUM-104 — Build Dashboard Course, To-Do & Calendar Widgets",2,3,3,2,13,9,3,4,1,3,0,2026-10-30
```
