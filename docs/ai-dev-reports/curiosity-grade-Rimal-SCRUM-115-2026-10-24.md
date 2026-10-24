# Curiosity Grade — Rimal, SCRUM-115 (2026-10-24)

Source: `curiosity-report-Rimal-SCRUM-115-2026-10-24.md`

> Transparency note for the human grader: this grade was produced by the same AI session that wrote the AI side of the transcript and generated the report. Every score below rests on quoted student text; check the quotes against the report if you are concerned about bias.

## 1. Executive summary
The student implemented SCRUM-115 (profile menu, secure sign-out, persistent JWT sessions) across seven steps in a Django/React codebase.
- **Before any code:** they asked what to settle with the team, then reported back the team's decisions.
- **How the work went:** mostly one file per message (a pacing the student requested), with frequent "next" and "apply" turns.
- **Questions:** concentrated on token and session mechanics (rotation and blacklisting, `navigator.locks`, limiting stolen tokens, JWT payload decoding, React effect cancellation), plus one standalone authorization-design question.
- **Notable moments:** the student pasted a failing-test output with their own hypothesis, and later stopped the work to raise scope creep against the acceptance criteria.

## 2. Curiosity rubric (four raw numbers, no composite)

### (i) Clarification / requests for detail — **2**
- Evidence:
  - "i meant 115, help me understand rotate_refresh_tokens and blacklist after rotation" (turn: "i meant 115…")
  - "what does navigator.lock exactly do, and is there a way to limit the use of stolen token mentioned in step 4" (next student turn)
  - "re tell the cancelled line again" (Step 3, file 2 follow-up)
- Depth: **substantive.** The student follows up on specific parts of answers already given: a concept the AI introduced, and a single line of code. No clarification request in this dimension tests a claim or exposes a gap.
- Events (ungraded): 7

### (ii) Challenge / skepticism [PRIORITY] — **3**
- Evidence:
  - "[Screenshot of the SCRUM-115 description and the four acceptance criteria] i think we are going out of scope in our task" (turn after "lets move with your suggestion…")
  - Also: "i think this is because we have written studyforge_refresh here instead of the REFRESH_TOKEN we created, is it?" (pasted test output turn)
  - Also: "so the first serializers were set to required = false, thats why they did not require names right?"
- Depth: **incisive.** The student compared the AI's accumulated plan with the source of truth (the ticket's acceptance criteria) and redirected the work. This led the AI to classify parts of its own suggestions as out of scope and change how it proceeded. The other two are hypothesis-checks, one of which was incorrect and was corrected.
- Supporting evidence (not separately scored): the student ran the backend tests themselves and pasted the failing output (`2 failed, 70 passed`). The Evidence Appendix shows the student's commits after each step.
- Events (ungraded): 4

### (iii) Why / tradeoffs — **3**
- Evidence:
  - "is there a way to limit the use of stolen token mentioned in step 4" (navigator.lock turn)
  - "For conversation upload/list/status/delete/question endpoints, should access require the authenticated conversation owner, plus course ownership when the conversation is course-scoped? And should foreign/nonexistent conversations return the same private 404 behavior so we don't expose whether they exist?"
  - Also: "is the new backend work necessary right now, if so I will add a jira task"; "what should i add next and why"; "what is the significance of decofing the middle part"
- Depth: **incisive.**
  - The stolen-token question probes a limitation the AI had disclosed and asks for alternatives. It redirected the work: "include option 1 in step 2 code" followed.
  - The conversation question weighs a security tradeoff (information leakage through response differences) and states its rationale.
- Events (ungraded): 5

### (iv) Error-response behavior [PRIORITY] — **2**
- Evidence:
  - "i think this is because we have written studyforge_refresh here instead of the REFRESH_TOKEN we created, is it?" (failing tests)
  - After the StrictMode double-refresh fix: "re tell the cancelled line again"
- Depth: **substantive.** On the failing test, the student offered a specific causal hypothesis and asked for it to be checked, rather than just asking for a fix. The hypothesis was wrong, and after the AI's explanation the student applied the fix without a further question. In three other episodes, the student moved on or asked the AI to apply the fix ("make the changes", "apply the changes", "apply the codes").
- Episode tally: **Error episodes: 5 (PROBED 2, ACCEPTED 3, LOOPED 0)**
  1. Step 1 incomplete; the test file would not parse ("what should i add next and why" → "try checking again" → "make the changes"): **ACCEPTED**
  2. Two failing rotation tests, `KeyError: 'studyforge_refresh'` (student-reported, with hypothesis): **PROBED**
  3. StrictMode sending two refreshes per reload with single-use tokens (AI-found; student asked about the fix's `cancelled` mechanism): **PROBED**
  4. Applied Step 4 files with a duplicate import and declaration and a stale `logoutError` (AI-found during "apply the changes"): **ACCEPTED**
  5. `CourseDetailPage.test.tsx` crash on a mocked user without names (AI-found; fix delivered in file 5, then "apply the codes"): **ACCEPTED**
- Excluded from the tally: the forged-token test weakness and the stacked mutation checks were found and fixed inside AI tool runs, with no student response opportunity. The scope concern is scored under (ii), not treated as an error.

## 3. Notes for the grader (neutral)
- **Where curiosity concentrated:** security and session mechanics (token rotation, the reuse/stolen-token threat, cross-tab locking, JWT structure) and project scope.
- **Where the student worked by approval:** about 20 turns are "next", "sure", "okay", or "start". The student asked for files one at a time and chose to have verified code applied directly six times ("make the changes", "apply the changes", "apply these changes", "apply this", "apply the codes"). Code was applied directly for all of Steps 4–7.
- **Team-coordination behavior is visible:** the session opens with "what are the discussions i have to have with my team", and the second turn reports the team's decisions.
- **One student instruction was partly overridden:** for Step 7 the student wrote "you dont need to test it first". The AI sent file 1 untested, but tested files 1–4 before sending the test file, and found a teammate-test crash.

## 4. AI Sycophancy — No grade impact
- **Flattery:** minimal. One mild instance: "Good idea." in response to the one-file-per-message request. No praise of questions.
- **Held its ground under an INCORRECT student challenge (correct behavior):** the student's hypothesis "is this because we have written studyforge_refresh here instead of the REFRESH_TOKEN…" was answered with "No, the name isn't the problem. `REFRESH_COOKIE = "studyforge_refresh"`…", followed by the actual cause (the cookie was never set).
- **Correctly reversed under a CORRECT challenge (noted positively):** on "i think we are going out of scope", the AI agreed partly and explicitly took ownership: "some of that extra was my suggestion". It classified reuse detection as out of scope and changed its behavior.
- **Self-corrections without student prompting:** it changed its earlier arrow-key menu plan to the disclosure pattern, and it found its own forged-token test ineffective through mutation testing.
- **No instance of the AI caving to an incorrect student claim was observed.**

## 5. Performativity (preliminary)
The questions are specific and tied to concrete artifacts: a named constant (`REFRESH_TOKEN`), a prop (`label =`), one line of code (`cancelled`), a numbered point in a prior answer ("stolen token mentioned in step 4"), and the ticket's own criteria. Several questions changed what was built (reuse detection was added; scope was narrowed). This pattern looks substantive rather than for-show. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV score-row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
mth115,Nischal Rimal,SCRUM-115,2,3,3,2,7,4,5,5,2,3,0,2026-10-24
```
