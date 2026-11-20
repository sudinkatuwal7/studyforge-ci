# Curiosity Grade

- **Student:** Nischal Rimal (mth115)
- **Assignment:** SCRUM-135 (Password reset)
- **Report graded:** `curiosity-report-Rimal-SCRUM-135-2026-11-20.md`
- **Session date:** 2026-11-19 to 2026-11-20
- **Student self-context:** none provided

**Scores: (i) 3 · (ii) 3 · (iii) 3 · (iv) 2.** These are four separate raw scores, not a composite or course grade.

Turn numbers below count the 23 `### STUDENT` entries in the report. Turns 1, 2, 11, 13, 18, and 20 are client context records, not student-authored messages; they are excluded from event counts.

## 1. Executive summary

The student worked through the StudyForge password-reset implementation and live Gmail delivery, then asked what would be needed for a future Vercel and Oracle Cloud deployment. They reported receiving a local reset email, questioned whether an IP limit would identify accounts or block students sharing a network, and identified the load risk left by a per-email-only limit. They corrected the AI when it began preparing deployment configuration for a question about future deployment. The AI ran the reported code checks; the transcript does not show the student running those tests personally.

## 2. Curiosity rubric

Event counts describe observed occasions of curiosity; they do not determine the scores. One turn can contribute to two dimensions when its clauses do different things.

### (i) Clarification / requests for detail — **3**

- **Student evidence (turn 14):** “can you elaborate on the IP limit,  i want to also make sure if students are identified correctly”
- **Student evidence (turn 17):** “walk me through the start to the end of pressing the button” and “with file involved at each step”
- **Depth:** Turn 14 asks about both the limit and account identification. The answer exposed the shared-proxy IP risk and clarified that a reset link identifies an account through its registered email. The student then changed the limit design. This is an incisive request for detail with a concrete consequence.
- **Events (ungraded):** 5 — turns 4, 7, 8, 14, and 17.

### (ii) Challenge / skepticism [PRIORITY] — **3**

- **Student evidence (turn 16):** “one person might try reset password for multiple non existent or even existent emails which might overload our server”
- **Student evidence (turn 12):** “the deployment configuration was a question i asked to learn for the time we actually deploy”
- **Depth:** Turn 16 exposes a gap in the per-email-only limit: one actor can rotate addresses. Turn 12 corrects the AI's interpretation of the requested work and causes the added deployment file to be removed. Both redirect consequential work, meeting the incisive anchor.
- **Supporting verification:** The student reported, “i received a reset email on my target mail account” (turn 8), then asked how to make it work after deployment. The report's test and build checks were run by the AI, so they are not counted as student-run verification.
- **Events (ungraded):** 4 — turns 12, 14, 15, and 16.

### (iii) Why / tradeoffs — **3**

- **Student evidence (turn 14):** “can you elaborate on the IP limit,  i want to also make sure if students are identified correctly”
- **Student evidence (turn 15):** “lets keep the per email limit, something like one email id can request specific numbers only in a timeline”
- **Student evidence (turn 16):** “can we limit multiple requests coming from  same device, for example one person might try reset password for multiple non existent or even existent emails which might overload our server”
- **Depth:** The student followed the shared-IP concern by choosing a per-email limit, then tested that choice against a different abuse pattern and requested a broader limit. That examines the consequences of one control and an alternative, and it changed the design. The student did not revisit the separate privacy tradeoff after asking for an explicit unknown-email message.
- **Events (ungraded):** 3 — turns 14, 15, and 16.

### (iv) Error-response behavior [PRIORITY] — **2**

- **Student evidence (turn 12):** “the deployment configuration was a question i asked to learn for the time we actually deploy”
- **Depth:** When the AI began adding a Vercel configuration file for a future-planning question, the student corrected the scope before the change remained. This is a substantive challenge to unexpected AI behavior. The student did not ask why the misinterpretation occurred or examine alternative fixes, so the evidence does not reach the incisive probing anchor for this dimension.
- **Events (ungraded):** 1 genuine episode.
- **Tally:** `Error episodes: 1 (PROBED 1, ACCEPTED 0, LOOPED 0)`.

| Episode | Student response | Label |
|---|---|---|
| AI prepared a Vercel config file in response to a deployment-planning question (report §3 episode 1) | Turn 12 corrected the scope; the AI removed the file. | PROBED |

Report §3 episode 2 is a clarification of an underspecified skill-file target after the AI asked for the path, so it is not tallied as a genuine error. The unrelated Survival quiz test failure and the temporary skill-validator dependency issue were AI-reported or AI-resolved tooling matters; the student did not encounter or troubleshoot them as part of this reset flow.

## 3. Notes for the grader (neutral)

- **Where curiosity concentrated:** Email delivery and deployment requirements (turns 4, 7, 8); IP limits, account identification, and abuse across addresses (turns 14–16); and a file-by-file explanation of the flow (turn 17).
- **Where the student directed work:** They specified the project Gmail sender (turns 5–6), deferred deployment configuration (turn 12), chose an explicit unknown-email message (turn 15), and clarified the skill-file rename and history requirement (turn 21).
- **Privacy tradeoff:** The original acceptance criteria required the same response for unknown and eligible addresses. Turn 15 requested an explicit message for unknown addresses. The AI warned that this enables account enumeration; the transcript shows no further student discussion of that warning.
- **Verification limit:** The student reported local email delivery. The appendix's automated tests and build were AI-run; no deployed end-to-end flow appears in the report.
- **Review context:** The same AI session produced the implementation, report, and this grade; the quoted student turns are available in the linked report for independent review.

## 4. AI Sycophancy — No grade impact, for your awareness

- **Flattery or over-praise:** none observed.
- **Caving to an incorrect challenge:** none observed. The explicit unknown-email response was a student-requested requirement change; the AI stated, “people will be able to check whether an email is registered,” rather than concealing the privacy cost.
- **Correct correction and reversal:** The AI explained that a Gmail mailbox is separate from a Google OAuth client ID, and after turn 12 said, “I removed the Vercel config file I added while investigating.”

## 5. Performativity (preliminary)

The questions name specific outcomes: a locally received email, account identification under an IP limit, requests across multiple addresses, and files involved in the reset flow. Several changed the implementation or scope. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV score-row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
mth115,Nischal Rimal,"SCRUM-135 (Password reset)",3,3,3,2,5,4,3,1,1,0,0,2026-11-20
```
