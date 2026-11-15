# Curiosity Grade — Rimal, SCRUM-124 (2026-11-15)

Graded file: `docs/ai-dev-reports/curiosity-report-Rimal-SCRUM-124-2026-11-15.md`

Student turns are cited as S1–S30 in transcript order. For example, S3 is "how will a course URL represent both…" and S9 is "do the tests you have written make sure…".

## 1. Executive summary
Nischal Rimal worked on SCRUM-124 (dashboard home base, main navigation, responsive layouts, empty states) in one long Claude Code session of about 30 student messages. The AI implemented every change and ran every test; the student directed the design, reviewed the work through questions, and made the key product decisions.

Notable student moments:
- asked how one URL could hold both the tab and the Pandu panel across refresh and Back (S3), then changed the AI's proposed history rule (S4);
- asked whether the tests actually met the agreed acceptance criteria (S9), which exposed untested criteria;
- checked whether a "course no longer available" message existed (S13);
- raised a possible cross-account data exposure (S16);
- questioned what "+ New" added (S20);
- weighed a review workflow tradeoff (S22);
- stopped the AI creating memory files (S24);
- overrode the AI's recommendation to keep a previous sprint's team decision (S27).

No self-context was given.

## 2. Curiosity rubric (four raw numbers, no composite)

### (i) Clarification / requests for detail — **3**
- Evidence (S3): *"how will a course URL represent both the selected tabl and the Pandu panel? i need to make sure of the state after refresh or back button too"*
- Supporting (S8): *"in courseSections.ts , how will the app handle the old URL, and a course ID the student cant access, how would the redirection, and error showing function"*
- Supporting (S15): *"explain the flow of the quick links in quicklinks.tsx"*
- Depth: incisive. S3 names the exact risks it wants addressed (refresh and Back state) and redirected the work: it produced four new acceptance criteria (10–13) and the URL and history design. S8 asks about two specific edge cases. Its premise was that `courseSections.ts` handles them, and the AI corrected that. S15's walkthrough led directly to the student spotting a flaw (S16).
- Events (ungraded): 7: S3, S6, S7, S8, S12, S15, S17.

### (ii) Challenge / skepticism [PRIORITY] — **3**
- Evidence (S9): *"do the tests you have written make sure that they follow the acceptance criteria we agreed on,"*
- Supporting (S13): *"keep as it is, does our code make sure that it shows the course no longer available message after a course is deleted"*
- Supporting (S16): *"yes i noticed that too, it might make one user see other person's information if they login before the mount, can you fix it"*
- Supporting (S20): *"what is +New adding extra to our functionality"*
- Depth: incisive. S9 tests the AI's implied claim that its tests were adequate. It exposed real gaps: criterion 13 had no test, and history at narrow widths was only partly covered. The follow-up "add those" (S10) led to new tests and a further page-level gap. S13 verifies behaviour rather than assuming it, and found the message did not exist. S16 is a security challenge. Its premise was only partly right: the AI found no names could leak, and that the app could not reach that state. It still led to a fix in two places. S20 questioned the value of an existing element and changed it.
- Verification (supporting evidence only): every compile and test run in the Evidence Appendix was done by the AI. The student's verification was through questions, and by asking to see each changed file (S7, S11, S19), not by running checks themselves.
- Events (ungraded): 6: S9, S13, S16, S20, S24, S27.

### (iii) Why / tradeoffs — **3**
- Evidence (S20): *"what is +New adding extra to our functionality, and also i think my courses can be header 1 because it has a own page"*
- Supporting (S22): *"do you think it would be more token efficient if you first decide a order of files, create one file , and give me to review, change it if i recommend change and then move to next file, and at the end run tests … give your opinion"*
- Supporting (S27): *"bring the list back because 104 was previous sprint and the new sprint decisions and criterion are to be met, especially 1 to 5"*
- Depth: incisive. S20 asks what a design element is for and proposes an alternative heading structure. It weighed the AI's reasoning (one `<h1>` per page) and chose option A, and it redirected the work. S22 weighs a real process tradeoff (incremental review against batch build-and-test) and asks for an opinion; after the answer the student chose the original flow (S23). S27 is a stated tradeoff: the previous sprint's team decision against this sprint's criteria. It is a decision with a reason rather than a question.
- Events (ungraded): 4: S20 (two parts), S22, S27.

### (iv) Error-response behavior [PRIORITY] — **2**
- Evidence (S13, an unexpected gap in behaviour): *"does our code make sure that it shows the course no longer available message after a course is deleted"*. The student probed, then scoped the fix (S14: *"a generic message is fine, but the student not being able to delete a course is something i will add on a later ticket"*).
- Evidence (S27, a conflict the AI found with SCRUM-104): the student challenged the AI's recommendation, giving a reason.
- Depth: substantive. Where the unexpected behaviour concerned the product or its requirements (episodes 4, 5, 8, 9, 10, 11, 15), the student probed. They also scoped the follow-up and moved out-of-scope work (course deletion) to a later ticket. But the student did not query any of the failures the AI reported in its own work:
  - the test that timed out again and again (episode 2);
  - the AI's admitted `git stash` on their working tree (episode 3);
  - the Notes/Quizzes loading bug the AI found and fixed (episode 13);
  - the window off-by-one the dashboard test missed (episode 16).

  Many of the accepted episodes were tooling or test-harness problems that the AI had already resolved and verified before reporting them. That limits how much querying was called for, but the student did not, for example, ask why the slow test keeps failing or whether it hides a real problem.

**Error episodes: 17 (PROBED 7, ACCEPTED 10, LOOPED 0)**

| # | Episode (report §3) | Label |
|---|---|---|
| 1 | Vitest from Git Bash failed; PowerShell worked | ACCEPTED |
| 2 | Recurring slow upload-test timeout | ACCEPTED |
| 3 | AI used `git stash` without asking | ACCEPTED |
| 4 | AI corrected two earlier claims (prompted by S8, S17) | PROBED |
| 5 | Tests vs agreed criteria showed gaps (S9) | PROBED |
| 6 | Mutation showed a page-`key` remount slipped through | ACCEPTED |
| 7 | Bash heredoc "unexpected EOF" | ACCEPTED |
| 8 | No "course no longer available" message; course deletion doesn't exist (S13) | PROBED |
| 9 | Possible cross-account exposure (S16) | PROBED |
| 10 | "+ New" only scrolled and didn't focus (S20) | PROBED |
| 11 | Student stopped the memory-file approach (S24) | PROBED |
| 12 | Stray CR from a `sed` edit | ACCEPTED |
| 13 | Notes/Quizzes showed the empty message while loading | ACCEPTED |
| 14 | 25 test failures after the empty-state changes | ACCEPTED |
| 15 | Upcoming list removed in SCRUM-104; student overrode the AI (S27) | PROBED |
| 16 | Window off-by-one caught only by unit tests | ACCEPTED |
| 17 | Skill edit duplicated an item | ACCEPTED |

## 3. Notes for the grader (neutral)
- **Where curiosity concentrated:** URL and history behaviour (S3–S4), test adequacy (S9–S10), how the code works (S8, S12, S15, S17), data and account safety (S16), and scope and process decisions (S14, S22, S24, S27).
- **Where the student worked by approval:** many turns are short go-aheads, for example S5 "sure lets move forward with this", S10 "add those", S18 "sure next pages", S25 "yes move to next empty states", S26 "add your recommendations", S28 "sure,". Implementation choices made inside these steps (UI wording, CSS, test design, the 7-day window definition, and whether picking a course in the picker navigates) were accepted as delivered. The AI did flag the 7-day window and the picker behaviour as its own choices.
- **Two challenges rested on a partly incorrect premise:** S8 (that `courseSections.ts` handled redirects) and S16 (that another person's information could be shown). Both still led to useful clarification or a defensive fix.
- **A grader conflict to note:** this grade was produced by the same AI that took part in the session and wrote the report. A human grader may want to spot-check the quotes against the transcript.

## 4. AI Sycophancy — No grade impact, for your awareness
- **Flattery:** none observed. Replies opened with substance ("Partly.", "No.", "That works with how the app is built now."), not praise.
- **Caving to an incorrect challenge:** none observed.
- **Correctly holding ground, or partly correcting:**
  - S8: *"First, a correction: `courseSections.ts` doesn't handle any of this itself."*
  - S16: the AI agreed the code should be fixed, but corrected the risk: *"No names could leak through the quick links… The bigger risk was the dashboard."*
  - S20: it disagreed with making "My Courses" a second `<h1>`, with reasons (*"The page already has an `<h1>`…"*), and offered option A.
  - S22: it answered "Partly", and disagreed with running tests only at the end.
- **Correct self-reversals:** the AI withdrew its earlier statement that no test pinned the 404-vs-403 contract (*"I also need to correct something I told you earlier… The backend does have one"*). It also called its own unasked `git stash` *"a misstep"*.
- **Deferring on a decision, not caving:** at S27 the AI went along with the student's product decision after flagging the conflict with SCRUM-104. This was a scope or priority decision, not a correctness dispute, and the AI asked that the PR note it.

## 5. Performativity (preliminary)
The questions are specific and tied to concrete files, criteria and outcomes: `courseSections.ts`, `quicklinks.tsx`, refresh and Back state, criterion numbers "1 to 5". Several directly changed the code or the criteria (S3, S4, S9, S13, S16, S20, S24, S27). Little looks like questioning for show. The short approvals (S5, S18, S25, S28) are go-aheads, not filler questions. *"This is a preliminary signal, not a definitive judgment of intent."*

## 6. CSV score-row
```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
mth115,Nischal Rimal,SCRUM-124,3,3,3,2,7,6,4,17,7,10,0,2026-11-15
```
