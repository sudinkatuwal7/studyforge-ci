# Curiosity Grade

- **Student:** Nischal Rimal (mth115)
- **Assignment:** SCRUM-114 — Google sign-in and sign-up
- **Report graded:** `curiosity-report-Rimal-SCRUM-114-2026-10-30.md`
- **Session date:** 2026-10-30 (the report says the work ran from 2026-10-28 to 2026-10-30)
- **Student self-context:** none provided

**Scores: (i) 3 · (ii) 3 · (iii) 3 · (iv) 3**

## 1. Executive summary

The student built Google sign-in for StudyForge over 61 turns: a Django endpoint that verifies Google ID tokens, and a React frontend that renders Google's button. The student had the AI hand over code one file at a time, which explains the 18 short "next" or "file N" turns.

The questioning focused on failure paths and on whether the AI's claims and tests were true. The clearest results:

- **Turn 23:** the student's question led the AI to test its Vite claim and admit it was wrong.
- **Turn 18:** the student rejected the AI's dismissal of an account-mismatch risk, which led to a redesign.
- **Turn 49:** the student's question led the AI to find that an assertion in its test could not fail.
- **Turn 42:** the student's question exposed a test gap that the AI then confirmed by experiment.

All four dimensions reach the top anchor. The grader should read two caveats before relying on the numbers:

- Dimensions (ii) and (iv) share much of the same evidence (see the tally notes).
- Twelve student turns are in quotation marks, and the writing style varies (see Performativity).

## 2. Curiosity rubric

Event counts are descriptive and are not part of the scores. A turn counts under two dimensions only when separate clauses of it do different things.

### (i) Clarification / requests for detail — **3**

- **Evidence (turn 3):** "if a google user's email matches an existing password account, when exactly will they be linked"
- **Evidence (turn 32):** "If registration succeeds but automatic login fails, what is the recovery path?"
- **Evidence (turn 7):** "firstl give the codes you wrote in chat so that i can ask questions about it"
- **Depth:** these requests for precise detail changed the work. Turn 3 led the AI to withdraw its automatic-linking recommendation over a pre-hijacking risk, and turn 32 led it to find a login capitalisation bug that affects all password users.
- **Events:** 14 (turns 1, 3, 4, 7, 9, 10, 13, 14, 28, 29, 32, 35, 41, 44)

### (ii) Challenge / skepticism [PRIORITY] — **3**

- **Evidence (turn 23):** "Does Vite's ImportMetaEnv index signature actually make a misspelled variable a compile error?"
- **Evidence (turn 18):** "If password and Google requests both succeed, the last response can set the refresh cookie for a different account than the one shown in the app."
- **Evidence (turn 49):** "How closely does refreshCookieOwner model a browser cookie?"
- **Evidence (turn 42):** "Which tests confirm a failed Google login leaves the existing StudyForge session untouched?"
- **Depth:** turn 23 tested a specific factual claim and forced a correction, which matches the professor's calibration example. Turn 18 rejected a risk the AI had waved off, and turn 49 tested whether a test could detect the bug it was written for.
- **Supporting verification:**
  - The student reported running `npm ci` and `npx tsc -b` (turn 37) and a real Google sign-in (turn 60).
  - The student also reported a CI pass (turn 61). The AI could not confirm it because `gh` was not installed.
  - The Evidence Appendix records the AI's commands, so it shows none of the student's own runs. These items rest on the student's statements.
- **Events:** 7 (turns 18, 20, 21, 23, 42, 49, 50)

### (iii) Why / tradeoffs — **3**

- **Evidence (turn 8):** "why are we verifying google token in google.py instead of view"
- **Evidence (turn 5):** "keep the stored StudyForge email when a returning user's google email changes, using sub for login makes that safe, and it avoids silently changing their profile or colliding with another accounts email"
- **Evidence (turn 33):** "It affects all password users and deserves its own test and review; SCRUM-114 can stay focused on Google sign-in."
- **Evidence (turn 53):** "Could these tests select the two 'Log in' controls by their location or role instead of CSS classes?"
- **Depth:** turn 8 is a specific "why" about a design choice, as in the calibration example. Turns 5 and 33 weigh real tradeoffs in the student's own reasoning, and turn 53 proposed an alternative that the AI then adopted.
- **Events:** 6 (turns 4, 5, 8, 24, 33, 53)

### (iv) Error-response behavior [PRIORITY] — **3**

- **Evidence (turn 18):** "Please prevent overlapping sign-in requests, or otherwise ensure the displayed user and refresh cookie always come from the same completed attempt."
- **Evidence (turn 50):** "One limit remains: because the lock permits only one POST, the alternate response-order steps are no-ops."
- **Depth:** the student challenged the AI's handling of a bug, set the condition a fix had to meet, and then questioned what the fix's test really proved (turns 49 and 50). Most episodes were probed and none looped.
- **Tally:** `Error episodes: 9 (PROBED 6, ACCEPTED 3, LOOPED 0)`

| Report episode | Turn | What happened | Label |
|---|---|---|---|
| 2 | 18 | Account mismatch from overlapping sign-ins | PROBED |
| 3 | 20 | `ux_mode: "redirect"` allowed by the type | PROBED |
| 4 | 23 | Claim that a misspelled Vite variable is a compile error | PROBED |
| 5 | 35 | `initialEmail` and `onAccountCreated` missing from the pages | PROBED |
| 6 | 37 | `tsc` test-file errors and three audit findings | ACCEPTED |
| 7 | 49 | Fake cookie assertion could not fail | PROBED |
| 8 | 50 | Response-order steps are no-ops while the lock works | PROBED |
| 9 | 57 | OAuth client ID never set | ACCEPTED |
| 10 | 58–59 | `frontend/.env` was empty on disk | ACCEPTED |

**How to read this tally:**

- **Excluded episodes:** Section 3 lists 18 episodes, and 9 are left out. Episode 1 is a system notice. Episodes 11–18 came from the AI's own tool runs, so the student had no direct error to respond to.
- **Overlap with (ii):** episodes 3, 4, 7 and 8 are defects the student raised by questioning, so the same evidence supports both (ii) and (iv).
- **Errors the student ran into:** episodes 6, 9 and 10 are the ones that came up while the student was running or setting up the project, and all three were ACCEPTED. They were routine setup and tooling problems with direct fixes, so they did not call for much probing. The score rests on the depth of the probed episodes, as the rubric directs.

## 3. Notes for the grader (neutral)

**Where curiosity concentrated**
- Security and account-identity decisions (turns 3–6).
- Failure paths and concurrency (turns 9, 13, 18, 28, 29, 32, 41, 44).
- Whether the tests prove what they claim (turns 42, 49, 50, 53).

**Where the student worked by approval**
- 18 turns are short "next" or "file N" messages.
- Files 4, 9, 10, 11, 14 and 17 drew no question about their content. File 4 did prompt the student's two-tab ticket decision.
- The student took the AI's recommendations on the Google button (turn 12), the ticket drafts (turns 26 and 33), and deferring the audit findings (turns 37–38).
- Turn 61 reports "looks good" with no individual browser-check results. The AI asked what happened in check 10, the one case it could not predict, and the report ends before any answer.

**Where the AI seeded the question**
- These questions follow limits the AI had already disclosed: turn 18 (its "Both methods succeed at once" note), turn 41 (untested CSRF path), turn 44 (`window.google` missing), turn 49 (fake cookie timing), turn 50 (response order) and turn 53 (CSS class selectors).
- The student still chose to pursue them, and turns 18 and 49 went further than the AI's disclosure.
- Turns 20, 23 and 42 have no such prompt in the retained text.

**Limits of the report**
- AI turns are incomplete, and code blocks are truncated, so some context is missing. The turn 10 reply, for example, refers to a table that was not retained.
- I graded the report as written and did not check it against the original session log.

## 4. AI Sycophancy — No grade impact, for your awareness

**Flattery:** none of substance. The nearest examples are mild openers: "Good news." (turn 61) and "Good, that confirms the app code compiles." (turn 37).

**Caving to an incorrect student challenge:** none observed. Each challenge the AI agreed with was correct on the available evidence.

**Correct reversals under a correct challenge (positive):**
- **Turn 23:** the AI tested the claim on the project's Vite version, then said "No, it doesn't, so what I told you in file 3 was wrong."
- **Turn 20:** "You're right, and it also contradicts what I said about the file listing only what StudyForge uses."
- **Turn 49:** the AI tested its own assertion with the lock off and reported "So when I said that assertion checked your mismatch, I was wrong."
- **Turn 18:** "Agreed, that's a real bug." The AI withdrew its earlier "the later response becomes the session" position and gave a reason. The turn 49 test later reproduced the mismatch against a fake server, not a real browser.

**Correctly holding its ground or checking first (positive):**
- **Turn 58:** after "i ve added it", the AI checked the file and reported that it was 0 bytes on disk.
- **Turn 56:** the student described the branch as rebased, and the AI pointed out that it had "no commits of its own yet."
- **Turn 61:** the AI recorded the CI pass as the student's report because it could not confirm it.

## 5. Performativity (preliminary)

*"This is a preliminary signal, not a definitive judgment of intent."*

**Signals of substance:** the questions name specific identifiers and scenarios, such as `refreshCookieOwner`, `ImportMetaEnv` and `/auth/csrf/`. Several build on the previous answer (turns 49 to 50, 23 to 24, and 14 to 18). The student also turned down extra work with a reason (turn 9) and made decisions that held for the rest of the session (turns 4–6).

**Signals to weigh:**
- Twelve student turns are wrapped in quotation marks, as if copied from elsewhere: 13, 14, 20, 21, 23, 28, 29, 32, 41, 42, 49 and 53.
- Some turns are polished prose (18, 24, 33, 47, 50), while others are casual and lowercase (4, 8, 12, 35).
- Section 2 of the report says paste wrapper tags were removed, so at least some turns may have been pasted.

The report does not show where any pasted text came from. It could be the student's own notes or another tool, and this does not establish that the questions were not the student's own. These turns include some of the strongest evidence for (ii) and (iv), so the grader may want to ask the student about them.

## 6. CSV score-row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
mth115,Nischal Rimal,SCRUM-114 — Google sign-in and sign-up,3,3,3,3,14,7,6,9,6,3,0,2026-10-30
```
