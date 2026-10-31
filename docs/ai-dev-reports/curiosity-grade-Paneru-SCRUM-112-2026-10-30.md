# Curiosity Grade

- Report graded: `curiosity-report-Paneru-SCRUM-112-2026-10-30.md`
- Student: Gaurav Paneru (gqq14)
- Assignment: SCRUM-112: Implement Multi-Material AI Study Notes
- Session date: 2026-10-30
- Self-context: none given
- Independence note: the same AI session that did the work wrote the report and this grade, so a human grader should check the quotes and labels. Turn numbers do not count the two automatic "Tool loaded." messages.

## 1. Executive Summary
The student worked on SCRUM-112, generating organized notes from several selected course materials. Over 11 student messages, the AI analyzed dependencies and gaps, implemented the feature, tested it with the real OpenAI model, fixed what that test found, and pushed to GitHub, where CI passed.

The student's questions covered scope, alternatives, one specific API decision, a build error, and how to verify the work without AI. They asked for the analysis before any commits and made the scope decision themselves. They did not dispute a specific AI claim, and they reported no errors from their own testing.

## 2. Curiosity Rubric

Scores: **(i) 2, (ii) 2, (iii) 3, (iv) 2.** These are four raw numbers with no composite.

### (i) Clarification / requests for detail: 2 (substantive)
- **Evidence (turn 4):** "for the build error on aashish code, can you explain more on what's wrong?"
- **Evidence (turn 5):** "What does code 422 return?"
- **Depth:** both follow up on a specific item in the AI's previous answer, the second by quoting the line in question. They ask for detail on the answer given without testing it.
- **Events (ungraded):** 4

### (ii) Challenge / skepticism [PRIORITY]: 2 (substantive)
- **Evidence (turn 2):** "For the gaps in the current code, are they different from the task 112?"
- **Evidence (turn 7):** "First, compare all the commits with what it does and what gaps it fulfills along with what code changes it does. Then, test with the real model."
- **Depth:** the student examined the AI's framing of the gaps and asked for the commits to be checked against them and tested for real. They did not directly challenge a claim or say the AI was wrong, and the real-model test was already on the AI's list of next steps, so this stops short of 3.
- **Supporting evidence:** the requested test exposed silent content loss and a failed merge after unit tests had passed (Evidence Appendix rows 15 and 18). The AI ran these tests at the student's direction. Nothing in the report shows the student running checks themselves.
- **Events (ungraded):** 3

### (iii) Why / tradeoffs: 3 (incisive)
- **Evidence (turn 2):** "Do these gaps big enough for the follow up ticket for upcoming sprint or do they need immediate handle for this sprint?"
- **Evidence (turn 5):** "What does code 422 return? Why 422"
- **Evidence (turn 1):** "Why those changes? Any other ways ?"
- **Depth:** turn 2 weighs a real scope tradeoff, and the answer redirected the work: "I've decided to not create a follow up ticket" (turn 3). Turn 5 asks why about one specific design decision, and the answer conceded that "409 would also have been defensible."
- **Events (ungraded):** 3

### (iv) Error-response behavior [PRIORITY]: 2 (substantive)
- **Evidence (turn 4):** "for the build error on aashish code, can you explain more on what's wrong?"
- **Evidence (turn 8):** "Fix those problems you found. Further explain what would've been the problem."
- **Depth:** the student asked what was wrong before approving the calendar fix, and asked about consequences for the real-model failures. They did not challenge a proposed fix or ask for alternatives to it, including the thin-output heuristic or the new limits.
- **Episodes (ungraded):** 2

**Error episodes: 2 (PROBED 1, ACCEPTED 1, LOOPED 0)**

| Episode | Label | Basis |
|---|---|---|
| 1. `CalendarMonth.tsx` build error | PROBED | Asked what was wrong before asking for the fix (turns 4 and 6). |
| 2. Real-model failures | ACCEPTED | Told the AI to apply its proposed fixes in the same message that asked for an explanation (turn 8). A grader could reasonably read this as PROBED; the score would not change. |

Section 3's third item, the AI's own test and tooling problems, is excluded. The student did not see those as separate episodes or respond to them.

## 3. Notes for the Grader (neutral)
- **Where curiosity concentrated:** scope and planning before implementation, then specific decisions in the AI's explanations.
- **Where the student worked by approval:** most implementation choices, including the model design, batching, deletion behavior and thresholds, were accepted after being explained.
- **Student decisions:** declined follow-up tickets, got a teammate's permission before the calendar fix (the student's statement, not verified in the session), and told the AI where the API key was for the real-model test.
- **Later question:** "How I, as a developer, should navigate it myself in future without AI?" (turn 9) is not scored under a dimension, but it is a concrete request about verifying the work independently.

## 4. AI Sycophancy — No grade impact, for your awareness
- **Flattery:** none observed.
- **Caving to an incorrect challenge:** none observed. The student made no incorrect technical challenge.
- **AI not correcting wording:** the student called SCRUM-104 "the blocker 104" (turn 2), after the AI had listed it under "Not blockers." The AI did not point out the difference in its reply.
- **AI overstatement, later contradicted by its own testing:** "SCRUM-112 is implemented and all its acceptance criteria are covered." The same message noted that real-model testing was still needed, and that testing later showed: "Don't merge with 'handles large inputs' marked as done yet."
- **Correct self-corrections:** "This corrects what I suggested earlier: `as React.CSSProperties` is the same cast" and "about 2 minutes, not the 'little over a minute' I estimated earlier."

## 5. Performativity (preliminary)
The questions look specific and tied to the work. They quote an exact line, name a specific ticket and build error, and affected a real decision about scope. *This is a preliminary signal, not a definitive judgment of intent.*

## 6. CSV Score-Row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
gqq14,Gaurav Paneru,SCRUM-112: Implement Multi-Material AI Study Notes,2,2,3,2,4,3,3,2,1,1,0,2026-10-30
```
