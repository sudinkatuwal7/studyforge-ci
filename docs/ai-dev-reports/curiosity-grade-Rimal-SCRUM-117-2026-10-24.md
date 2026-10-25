# Curiosity Grade — Rimal, SCRUM-117 (2026-10-24)

Source: `curiosity-report-Rimal-SCRUM-117-2026-10-24.md`

> Transparency note for the human grader: this grade was produced by the same AI session that wrote the AI side of the transcript and generated the report. Every score below rests on quoted student text; check the quotes against the report if you are concerned about bias.

## 1. Executive summary
The student implemented SCRUM-117 (responsive app shell: mobile navigation drawer, always-visible header and profile menu, and a collapsible Pandu AI Assistant with a content/assistant view swap below 64rem) in the React frontend.
- **Before any code:** they asked what to raise with teammates, then decided the first blocker was in scope ("we need to rework the display") and chose the drawer and overlay options from a multiple-choice prompt.
- **How the work went:** code was given in chat one file at a time at the student's request. The student applied it themselves and often implemented ahead of the plan (the AI found the student's own toggle, tests, and CSS in the working tree). The AI edited files only when asked at the end.
- **Questions:** concentrated on React state design (location key vs. boolean), accessibility (trade-offs, focus, screen readers), the breakpoint's coverage of tablets, state and scroll preservation, and what the jsdom tests can and cannot check.
- **Notable moments:** the student found a real bug in the AI's toggle handler, caught a mismatch between the AI's described layout and the CSS, noticed a test that checked too little, and wrote one turn as a precise requirements specification.

## 2. Curiosity rubric (four raw numbers, no composite)

### (i) Clarification / requests for detail — **3**
- Evidence:
  - "When the drawer closes because the window widens, where does keyboard focus go?" (turn ~22)
  - "Trace the drawer through four paths: clicking a nav link, pressing Back, tapping the backdrop, and resizing to desktop. For each path, explain what changes the location or state, when the drawer closes, and where focus ends up" (turn ~23)
  - Also: "what behaviors do the jsdoms test check, and how" (turn ~20); "What happens to keyboard focus, screen-reader access, and scroll position when I toggle Pandu and when I resize across 64rem?" (turn ~16)
- Depth: **incisive.** The focus-on-resize question targeted an edge case whose answer exposed that the correct behavior depended on an accident (browsers ignoring `focus()` on a hidden button; jsdom behaving differently), and it led to a code fix and a new test. The four-path trace request scopes exactly what the answer must cover. The toggle/resize question likewise surfaced a focus-on-hidden-element problem the student then chose to fix ("i kept option 1").
- Events (ungraded): 7

### (ii) Challenge / skepticism [PRIORITY] — **3**
- Evidence:
  - "the menu button calls setNavOpen(key) every time, will the user be able to close the button by pressing the key again" (turn ~5)
  - "You describe a full-view assistant on phones, but the current CSS places it below course content. What exact layout will the next CSS change create when it opens?" (turn ~11)
  - "the conversation checks only the users sent question, should it also wait for pandu's reply" (turn ~19)
  - Also: "check the final before i create a PR" (turn ~25)
- Depth: **incisive.** Each of the first three tests a claim or artifact the AI produced and exposes a real gap: a handler that could not close the drawer (an `aria-expanded` bug), a described layout that differed from both the current CSS and the option the student had chosen, and a test that would pass even if hiding cancelled the reply. All three changed the code or the plan.
- Supporting evidence (not separately scored): the student reported running CI checks themselves ("i have done CI checks"); this was not observed by the AI. The working tree showed the student wrote and ran their own tests ahead of the plan (Evidence Appendix rows 9–11).
- Events (ungraded): 4

### (iii) Why / tradeoffs — **3**
- Evidence:
  - "Why store the React Router location key instead of a boolean for the mobile drawer?" (turn ~4)
  - "should the view swap cover tablets up to 64rem, or phones only?" (turn ~15)
  - Also: "do we have any accesibility tradeoffs" (turn ~7); "the assistant is collapsed below 64 rem, so does it collapse for tablets too or just the phone" (turn ~9); "for three lets follow the authoring practices" (turn ~17, a choice between offered alternatives)
- Depth: **incisive.** The *why* question about the location key engaged the design's reasoning and led the AI to find a bug in its own code (Back reopening the drawer). The breakpoint question weighs a real layout trade-off; the student returned to it after the first answer. The accessibility question surfaced two real gaps.
- Events (ungraded): 4

### (iv) Error-response behavior [PRIORITY] — **3**
- Evidence:
  - "the menu button calls setNavOpen(key) every time, will the user be able to close the button by pressing the key again" (student-found bug)
  - "the conversation checks only the users sent question, should it also wait for pandu's reply" (student-found test gap)
  - After the focus-fragility finding: "Trace the drawer through four paths…" (follow-up verifying the fix across all close paths)
- Depth: **incisive.** Most episodes were raised by the student, and after fixes the student kept probing the affected behavior (a four-path trace after the focus fix; a second breakpoint question after the tablet correction; focus and scroll questions after the CSS fix) rather than only applying them.
- Episode tally: **Error episodes: 8 (PROBED 6, ACCEPTED 2, LOOPED 0)**
  1. AI's step 1 code would reopen the drawer after Back (AI-found while answering the student's *why* question; reset line added; the student moved on): **ACCEPTED**
  2. Menu button could not close the drawer on a second press (student-found): **PROBED**
  3. Two accessibility gaps in steps 1–2: focus leaving the drawer, sticky header covering focus (AI-reported in answer to the student's trade-off question; the student moved on): **ACCEPTED**
  4. Inaccurate code comment: 64rem covers tablets, not just phones (surfaced by the student's question; the student later re-asked about the breakpoint): **PROBED**
  5. Described "full-view" layout did not match the CSS or the chosen preview (student-found; the student then wrote a requirements spec): **PROBED**
  6. Three sizing gaps in the student's own step 4b CSS (AI-found; the student followed up on focus, screen-reader, and scroll behavior): **PROBED**
  7. Conversation test checked only the sent question (student-found; AI rewrote it and flagged one of its own assertions as weak): **PROBED**
  8. Drawer resize-close focus relied on browsers ignoring `focus()` on a hidden button (surfaced by the student's question; the student followed with the four-path trace): **PROBED**
- Excluded from the tally: the AI discovering the student had implemented work ahead of the plan (turn ~8) is not an error.

## 3. Notes for the grader (neutral)
- **Where curiosity concentrated:** accessibility and focus management (drawer, toggle, resize), the breakpoint's coverage of tablets, state and scroll preservation across hiding, and what the test environment can actually verify.
- **Where the student worked by approval:** about 6 turns are short continuations ("next", "sure lets move into it", "now the tests", "let us move on…", "give the final insertions"). The student asked for one file per message and applied the code themselves; the AI applied edits only on the final explicit request ("apply these and write the relevant works we did in the skill file and commit").
- **The student often worked ahead of the plan:** at turns ~8 and ~14 the working tree already contained the student's own toggle, tests, accessibility fixes, and CSS, which the AI then reviewed instead of supplying.
- **One turn was a specification** (turn ~12), stating requirements for focus, screen-reader hiding, scroll preservation, and resize behavior rather than asking a question.
- **Team coordination is visible:** the session opens with "what are the blockers if i have any that i need to discuss with teammates".

## 4. AI Sycophancy — No grade impact
- **Flattery:** minimal. Openers such as "You're right to ask." and "You're right: as written, pressing the button again does **not** close the drawer." accompany correct concessions rather than praise. "You're ahead of the plan." is factual. No praise of the student's questions as such.
- **Correctly reversed under a CORRECT challenge (noted positively):** on the toggle bug ("You're right"), on the layout mismatch ("This differs from the preview you picked", with reasons and an offer to build the overlay instead), and on the test gap ("Yes. Checking only the question misses the riskiest case").
- **Self-corrections disclosed:** the Back-reopen bug in its own step 1 code ("Your question also turned up a bug in what I gave you"), two accessibility gaps ("Two are real gaps I should have caught"), an inaccurate comment ("The comment I gave you in step 3 … is wrong"), and a weak assertion in its own test.
- **Held its ground where appropriate:** recommended keeping the 64rem breakpoint when asked again, with stated reasons, rather than switching to agree.
- **No instance of the AI caving to an incorrect student claim was observed.**

## 5. Performativity (preliminary)
The questions are specific and tied to concrete artifacts: a named handler (`setNavOpen(key)`), a breakpoint value (64rem), a particular test's assertion, a stated mismatch between prose and CSS, and enumerated close paths. Several questions changed what was built (the toggle fix, the view-swap specification, the rewritten pending-reply test, the `returnFocusOnClose` fix). This pattern looks substantive rather than for-show. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV score-row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
mth115,Nischal Rimal,SCRUM-117,3,3,3,3,7,4,4,8,6,2,0,2026-10-24
```
