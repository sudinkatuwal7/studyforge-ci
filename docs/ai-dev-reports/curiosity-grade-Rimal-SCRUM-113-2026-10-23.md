# Curiosity Grade

- Report graded: `curiosity-report-Rimal-SCRUM-113-2026-10-23.md`
- Student: Nischal Rimal (mth115)
- Assignment: SCRUM-113 — Polish Login and Registration UI
- Session date: 2026-10-23 (started 2026-10-22)
- Graded by: /curiosity-grade

## 1. Executive Summary
The student continued SCRUM-113 from a skill-file handover. The AI wrote and verified the Step 6 tests. At the student's request, the AI then aligned the login and registration pages with the dashboard: the panda illustration, colors, fonts, and logo. The AI made four commits and pushed to GitHub (CI passed) and then Bitbucket. The session had 11 student turns plus one multiple-choice answer, and most were short directives. The student's questions concentrated on process:
- the difference between committed tests and the temporary check code they had used in Sprint 1, and when temporary code is appropriate
- why GitHub Actions still showed a run as in progress after the AI reported success (backed by the student's own screenshot)
- whether the AI knew the team's merge workflow

The AI surfaced the code-level problems itself: a test timeout that appeared only sometimes, a header that overflowed on phones, and edits that were still missing before the commit. The student accepted the fixes by approval.

## 2. Curiosity Rubric

Four raw scores. They are not combined. (ii) and (iv) are the professor's priority dimensions.

### (i) Clarification / requests for detail — **2**
> "what is the difference between test files and test code, when can we apply the second" (turn 5)
> "i meant the code, previously along the way with another chat, for my sprint one , i wrote some code, ran the whole app to check and deleted the code before pushing" (turn 6)

**Depth justification:** When the AI misread the first question, the student narrowed it to the practice they actually meant and grounded it in their own Sprint 1 experience. That is a follow-up that scopes the answer. The question did not go further into the reasoning of the answer. Substantive, not incisive.
**Events (ungraded):** 2

### (ii) Challenge / skepticism [PRIORITY] — **2**
> "[screenshot: GitHub Actions run #21 … 'In progress' … 5m 17s] why is it still showing run incomplete" (turn 9)
> "are you familiar with the merging workflow, we have set" (turn 10)

**Depth justification:** The student checked the AI's claim that CI had passed against independent evidence (their own view of the Actions page) and asked for an explanation. They also checked that the AI knew the team workflow before letting it continue. The challenge tested a claim, but it turned out to be a stale page. The student did not follow up on the AI's explanation or contest the AI's technical decisions (CSS changes, the test fix, splitting commits). Substantive verification, not a deep challenge.
**Supporting evidence:** The screenshot is student-side verification of CI. The Evidence Appendix shows the AI, not the student, ran the builds and tests.
**Events (ungraded):** 2

### (iii) Why / tradeoffs — **2**
> "when can we apply the second" (turn 5, clarified in turn 6 as temporary check code that is "deleted … before pushing")

**Depth justification:** The student asked when temporary, deleted verification code is appropriate compared with committed tests. That is a question about when to use which practice, not only how to do something. It does not compare alternatives inside this task's design (for example, the theme or logo approach). Substantive.
**Events (ungraded):** 1

### (iv) Error-response behavior [PRIORITY] — **1**
> "why is it still showing run incomplete" (turn 9)
> "fill in the miniature changes of step 5 and 6, and give next  step to match the logo" (turn 4)
> "Apply them for me (Recommended)" (turn 8)

**Depth justification:** In the one episode the student ran into themselves (the CI status), they asked why and attached evidence. The three episodes the AI found were resolved by having the AI apply its fixes, with no questions about the cause or alternatives. Most episodes were ACCEPTED, none LOOPED.

**Error episodes:** 4 (PROBED 1, ACCEPTED 3, LOOPED 0).
1. The RegisterPage tests sometimes timed out under the full parallel suite (AI-surfaced, turn 3 AI reply). The student asked the AI to apply the `paste` fix ("fill in … step 5 and 6", turn 4). Turn 5 asked about the commit, not the cause. **ACCEPTED.**
2. The header pills wrapped and then overflowed at phone widths (AI-surfaced, turn 3 AI reply). The fix was applied by request in turn 4. **ACCEPTED.**
3. Step 3 and the logo step were missing from the working tree when commits were requested (AI-surfaced, turn 7 AI reply). The student chose "Apply them for me (Recommended)" (turn 8). **ACCEPTED.**
4. GitHub Actions showed "In progress" after the AI reported success (student-reported, turn 9). The student asked why and supplied a screenshot. **PROBED.**

Excluded: the tooling events internal to the AI (a `vite preview` port conflict, `gh` not installed). The student had no chance to respond to them.

## 3. Notes for the Grader (neutral)
- **Where curiosity concentrated:** development process and verification: test practice (turns 5–6), CI status (turn 9), and the merge workflow (turn 10). This matches the pattern in the SCRUM-99 report, where curiosity also centered on git and CI process.
- **Work by direction and approval:** the design direction was the student's own ("lets bring the panda, and the text and fonts too", turn 3; asking for consistent themes, turn 2). Implementation was delegated, and code edits and commits went ahead by approval ("fill in …", "lets do the new commits and push it'", "Apply them for me", "sure", "sure").
- **Working style:** the student's standing preference (recorded in the task skill) was to apply code themselves and ask questions. In this session the student applied steps 1, 2, 4, and 5a by hand, then asked the AI to apply the rest.
- No self-context line was supplied.

## 4. AI Sycophancy — No grade impact
- **No flattery or over-praise observed.** AI replies were factual.
- **The AI held its ground correctly** on the incorrect CI challenge (turn 9). It re-queried the GitHub API and answered with timestamps: run completed 05:11:13 UTC, backend job about 2 minutes. It did not agree that the run was incomplete. Positive.
- **The AI misread turn 5.** It answered about commit splitting. After the student's clarification (turn 6), it answered the intended question without defending the first reading. Appropriate correction.
- **The AI disclosed process choices it made on its own:** adding a `Co-Authored-By` trailer that earlier commits lacked, and committing the skill-file notes as an extra `docs` commit. It told the student about both. Noted for awareness.

## 5. Performativity (preliminary)
The questions that were asked are specific and grounded in the student's own work: a screenshot of their CI page, and their own Sprint 1 habit of writing and deleting check code. They do not read as generic or for show. The volume of questioning is low compared with the directive turns. That is described here, not counted against the student. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV Score-Row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
mth115,Nischal Rimal,SCRUM-113 — Polish Login and Registration UI,2,2,2,1,2,2,1,4,1,3,0,2026-10-23
```
