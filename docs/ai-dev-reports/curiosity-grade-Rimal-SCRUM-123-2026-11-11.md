# Curiosity Grade

- **Student:** Nischal Rimal (mth115)
- **Assignment:** SCRUM-123 — Landing page
- **Report graded:** `curiosity-report-Rimal-SCRUM-123-2026-11-11.md`
- **Session date:** 2026-11-11 (the report says the work ran from 2026-11-09 to 2026-11-11)
- **Student self-context:** none provided

**Scores: (i) 3 · (ii) 3 · (iii) 3 · (iv) 2**

## 1. Executive summary

The student built a public landing page for StudyForge over 26 turns. The work included routes for the log in and sign up cards, a shared signed-out header, a Features link that scrolls to its section, a responsive layout, and redirects that keep logged-in users on the dashboard. The student had the AI hand over code one file at a time, which explains the 11 short navigation turns ("next", "now auth.css").

Most of the questioning asked how and why the delivered code works. The student asked about the routing and session flow, the scroll mechanism, the shared header and the responsive CSS. Three of the questions changed the work:

- **Turn 13:** the student asked how the CSS handles different widths. While answering, the AI found a layout bug in its own CSS and corrected the table it had given in the previous reply.
- **Turn 18:** the student asked whether reload, Back and other routes work, and whether signed-in users see the right pages. The AI added 18 tests and found that one key protection, `replace` on the redirects, had no test that could fail.
- **Turn 19:** the student redirected the work by requesting a two-tab test and tests for capital letters and trailing slashes in addresses.

The student made the product decisions (turns 2 and 19) and reported a 17-item browser check and a CI pass (turns 24 and 25). The student did not directly contradict any statement the AI made.

## 2. Curiosity rubric

Event counts are descriptive and are not part of the scores. A turn counts under two dimensions only when separate clauses of it do different things.

### (i) Clarification / requests for detail — **3**

- **Evidence (turn 3):** "how do the routing and session behavior move step by step, as in what the logged in and logged out users see"
- **Evidence (turn 13):** "how does this code style landing pages across screens with different widths"
- **Evidence (turn 16):** "how do the Navlink state and Feature scrolling test work"
- **Depth:**
  - Turn 3 scopes the answer it wants: step by step, from each user's point of view.
  - Turn 13 was consequential: answering it exposed a layout error in code the student had already received, and the AI's fix replaced part of file 5.
  - The consequence came from the AI's working-through, not from a pointed question, but a request for detail that exposes an error meets the top anchor. This is the same basis used for (i) in this student's SCRUM-114 grade.
- **Events:** 6 (turns 1, 3, 5, 8, 13, 16)

### (ii) Challenge / skepticism [PRIORITY] — **3**

- **Evidence (turn 18):** "do refreshes, browser back, or other route handling behave properly, also does it check if a signed in user sees what they are supposed to see"
- **Evidence (turn 19):** "add a browser test for two tabs, and add route tests for capital and slash behavior"
- **Depth:**
  - Turn 18 asks whether the behavior is correct **and** whether the tests check it. In other words, it verifies rather than accepts. It exposed a real gap: removing `replace` from the redirects, which would trap users on Back, failed no existing test.
  - Turn 19 redirected the work to specific edge cases.
  - Neither turn contradicts a particular AI statement. The AI had already named the Back button and reload as untested in its turn 17 reply, and named capitals, slashes and two tabs as untested in its turn 18 reply. The student chose to pursue them, and turn 18 went further by asking whether signed-in users see the right pages.
- **Supporting verification:**
  - **Turn 24:** "passed". This is the student's report that all 17 browser checks requested in the AI's turn 23 reply passed. The results were not itemized one by one.
  - **Turn 25:** "github action passed".
  - The Evidence Appendix records the AI's commands only. It shows the branch state that matches these reports (430 tests passing, and the commit pushed to `github`), but not the student's own runs. These items rest on the student's statements.
- **Events:** 2 (turns 18, 19)

### (iii) Why / tradeoffs — **3**

- **Evidence (turn 6):** "why do we need both hash and key"
- **Evidence (turn 11):** "we used SiteHeader directly on landing page, why are we using shared SiteHeader in here"
- **Evidence (turn 9):** "why is Features a link while the other nav items are disabled buttons"
- **Evidence (turn 19):** "hosting can go in pr and we can manage after the deployment workflow is decided"
- **Depth:**
  - Turns 6, 9 and 11 are specific "why" questions about design choices, each following up on the previous answer. That matches the calibration example used for this student's SCRUM-114 grade.
  - Turn 6 effectively asked whether one dependency would be enough. The AI tested both alternatives and found that `[key]` alone passes every test.
  - Turn 11 points at an apparent inconsistency in the design.
  - Turn 19 weighs a scheduling tradeoff in the student's own words.
- **Events:** 4 (turns 6, 9, 11, 19)

### (iv) Error-response behavior [PRIORITY] — **2**

- **Evidence (turn 19, after episode 3):** "add a browser test for two tabs, and add route tests for capital and slash behavior"
- **Evidence (turn 7, after episode 1):** "now the next file"
- **Evidence (turn 14, after episode 2):** "now auth.css"
- **Depth:**
  - After the routing test gap (episode 3), the student asked for more verification of nearby edge cases. That is substantive probing, but it does not ask why the gap existed or challenge the fix.
  - After the two other episodes, the student moved on without questioning. In both cases the AI had already explained the cause and given a checked fix.
  - With one of three episodes probed and none looped, the score sits at the substantive anchor.
- **Tally:** `Error episodes: 3 (PROBED 1, ACCEPTED 2, LOOPED 0)`

| Report episode | Turn | What happened | Student's next turn | Label |
|---|---|---|---|---|
| 1 | 6 | `[key]` alone passed all tests, with only a lint warning | 7: "now the next file" | ACCEPTED |
| 2 | 13 | Feature grid showed 3 + 1 columns at 880–1180px; the AI's earlier table was wrong | 14: "now auth.css" | ACCEPTED |
| 3 | 18 | Removing `replace` from the redirects failed no test | 19: asked for two-tab and capital/slash tests | PROBED |

**How to read this tally:**

- **Excluded episodes:** Section 3 lists 14 episodes, and 11 are left out.
  - Episode 4 is a tooling limit (there's no real-browser test tool), not an error. The student did run two real tabs in the browser check (item 17, reported in turn 24).
  - Episodes 5–14 came from the AI's own tool runs, so the student had no direct error to respond to. Episode 13, the five older tests failing until file 8 was applied, was announced in advance and was expected.
- **Errors the student ran into:** none. The browser check and CI both passed. All three counted episodes are defects that the student's questions brought to light, so (ii) and (iv) partly rest on the same turns.

## 3. Notes for the grader (neutral)

**Where curiosity concentrated**
- How the delivered mechanisms work: the routing and session flow (turn 3), the scroll mechanism (turns 5, 6, 16), the shared header (turns 8, 9, 11) and the responsive CSS (turn 13).
- Whether the routing behaves correctly under reload, Back and different address forms, and whether tests cover it (turns 18 and 19).

**Where the student worked by approval**
- 11 turns are short navigation messages: 4, 7, 10, 12, 14, 15, 17, 21, 22, 23, plus 20, which asked the AI to apply the test files.
- Files 4 (`AuthLayout.tsx`), 6 (`auth.css`) and 8 (the edits to the existing tests) drew no question about their content. File 4 did prompt the turn 11 design question.
- The student accepted the AI's recommendation for the signed-out notice (turn 2).
- Turn 24 ("passed") and turn 25 report results without individual details.
- Turn 26 ("yes") answered an either/or question. The AI followed the repository's convention and said which option it chose.

**Where the AI seeded the question**
- Turn 18 follows the AI's turn 17 list of untested behavior (the Back button and reload), but also adds the signed-in check.
- Turn 19 follows the AI's turn 18 list ("Two tabs", "Trailing slashes and capital letters ... I'm not claiming it").
- Turns 6, 9 and 11 follow explanations the AI had just given, and ask why those choices were made.

**Limits of the report**
- **Missing AI text:** some short AI messages between tool calls are not in the saved log. For example, the turn 13 interim message saying the earlier column table was wrong is missing. The final reply in that turn does say "found a bug in the file I sent".
- **Truncated code:** code blocks are shortened.
- **Grader independence:** the AI that took part in this session also generated the report and this grade. The grader should treat the sycophancy section in particular as a self-assessment.

## 4. AI Sycophancy — No grade impact, for your awareness

**Flattery:** none found. A search of the report for "great question", "good question", "good point", "excellent" and "you're right" returned no matches.

**Caving to an incorrect student challenge:** none observed. The student made no incorrect challenges.

**Correct self-correction (positive):**
- **Turn 13:** the AI reported "found a bug in the file I sent" and replaced its own grid rules, after its turn 12 table had claimed 2 columns on tablets.
- **Turn 6:** the AI said `[key]` alone "works today, but for the wrong reason". It reported that all 22 tests still pass with `[key]` alone, which weakens its own design argument, rather than overstating what the tests show.
- **Turn 19:** asked for a "browser test", the AI said it wrote a jsdom simulation and that it "runs in jsdom, not a real browser". It proposed Playwright as a separate ticket instead of presenting the simulation as a browser test.
- **Turn 25:** "That fetch command was wrong", followed by a corrected command.

## 5. Performativity (preliminary)

*"This is a preliminary signal, not a definitive judgment of intent."*

**Signals of substance:**
- The questions name specific code: `hash` and `key`, `SiteHeader`, `Navlink`, and the Features link.
- Several build directly on the previous answer: turn 5 to 6, 8 to 9, and 10 to 11.
- Turns 18 and 19 name concrete scenarios: refresh, Back, signed-in view, two tabs, capitals and slashes.
- The writing style is consistent throughout (casual, lowercase), and no turns appear pasted.

**Signals to weigh:**
- Most questions ask for explanations of code the AI wrote, rather than testing its claims. The strongest verification turns (18 and 19) follow gaps the AI had already listed.
- The browser-check and CI results are reported in one or two words.

## 6. CSV score-row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
mth115,Nischal Rimal,SCRUM-123 — Landing page,3,3,3,2,6,2,4,3,1,2,0,2026-11-11
```
