# Curiosity Grade

## Executive Summary
The student worked on SCRUM-133: verifying StudyForge's Django/worker S3 integration against a real private Oracle Cloud (OCI) Object Storage bucket, adding OCI test tooling, and documenting the results. The session has 17 working student turns plus 2 report-generation turns. Most of the working turns are scoped, constraint-heavy task requests ("Don't modify files…", "stop if anything fails") that ask the AI to inspect, verify and report before acting. The student resolved a two-stage OCI authentication failure by investigating the OCI console. The student corrected the AI's Git workflow recommendation. The session closes with four follow-up questions that probe design rationale and the evidence behind the AI's conclusions: separate IAM users, whether a 404 means a permission denial, squash-merge consequences, and how the checksum concern was ruled out.

## Curiosity Rubric

### (i) Clarification / requests for detail — 2
**Evidence (Transcript, Student turn 4):** "1. What parts of SCRUM-133 are already implemented and tested? … 3. Is the existing Django S3 integration ready for OCI Object Storage? 4. Do we need real OCI credentials or bucket access to finish any remaining verification? 5. Are there any bugs, missing configuration, or security problems in my current implementation?"

**Depth:** Substantive. The student scopes exactly what detail they want and follows up on the AI's earlier status answer. These questions ask for detail rather than testing a specific claim, so they don't reach incisive.

**Events (ungraded):** 5. Turns 3, 4 and 5 are structured detail requests; turn 12 asks for branch state; turn 16 asks about squash-merge consequences.

### (ii) Challenge / skepticism — 3
**Evidence (Transcript, Student turn 13):** "Wait, remember that I am merging my SCRUM-133 branch into Sanish's feature/SCRUM-122-deploy-kubernetes-to-processing branch, not directly into development. SCRUM-133 is a subtask of his SCRUM-122. So don't rebase onto development and don't remove 644bf91 since that test fix belongs in his branch too."

**Supporting evidence (Student turn 17):** "earlier we thought we might need to change the boto3 checksum settings how did we prove that change wasnt necessary?"

**Depth:** Incisive. Turn 13 exposes a wrong premise in the AI's recommendation and redirects the work. Following the AI's plan would have dropped the student's own test fix from the target branch. Turn 17 asks the AI to justify a conclusion it had reached. That surfaced a previously unstated gap: multipart uploads between 8 and 20 MB are untested.

**Verification (supporting):** the student repeatedly required verification before acceptance. Examples:
- Turn 4: "Check the existing code, documentation, tests, and Git history instead of assuming something is missing."
- Turn 10: "Review … for any hardcoded credentials".
- Turn 11: "make sure the cleanup logic cannot delete unrelated objects".

The Evidence Appendix shows the requested runs. These include two failed and one successful OCI identity check, both end-to-end harness modes, `git diff --check`, and a credential-value scan.

**Events (ungraded):** 6 (turns 4, 7, 11, 13, 15, 17).

### (iii) Why / tradeoffs — 3
**Evidence (Transcript, Student turn 14):** "why do we need two different users for django and worker when both are accessing the same bucket?"

**Depth:** Incisive. It questions the necessity of a concrete design decision rather than asking how to implement it. Answering it requires weighing the trade-off between least privilege and administrative overhead. This matches the calibration anchor's "why with specificity / questioned a design choice".

**Events (ungraded):** 2 (turns 14 and 16; turn 16 probes the consequences of the merge strategy).

### (iv) Error-response behavior — 3
**Evidence (Transcript, Student turn 15):** "oracle returned 404 when the worker tried to delete the file but how do we know its actually because of permission and not because the bucket doesnt exist?"

**Depth:** Incisive. On unexpected behavior (a 404 where a 403 was expected), the student offers a competing explanation and asks what evidence rules it out, instead of accepting the AI's interpretation. Most episodes were probed. The one hard failure (OCI authentication 403) was resolved by the student's own console investigation, without querying the AI's diagnosis.

**Episode tally:** Error episodes: 4 (PROBED 3, ACCEPTED 1, LOOPED 0)

| Episode | Label | Basis |
|---|---|---|
| OCI authentication 403, across two attempts (turns 7–9) | ACCEPTED | The student did not ask why or request alternatives; they acted on investigation. In turn 8 the student found an independent root cause: "both customer secret keys were created under the Django service user". In turn 9 they acted on the AI's key-length diagnosis: "Found the issue. We were previously copying the wrong access key values." Two different root causes were fixed in sequence, so it is not counted as LOOPED. |
| Wrong rebase-onto-`development` recommendation (turn 13) | PROBED | The student challenged the AI's premise and redirected the work. |
| 404 instead of 403 on worker delete (turn 15) | PROBED | The student asked what rules out the alternative explanation. |
| AI reversed its earlier checksum-risk claim (turn 17) | PROBED | The student asked how the reversal was proven. |

AI-side incidents (Docker not running, a scratchpad write failure, a user-initiated interrupt) were not student-reported. They are excluded from the tally.

## Notes for the Grader (neutral)
- Curiosity is concentrated in the last four working turns (14–17), which are pure questions. Turn 13, the workflow correction, is also there.
- Turns 5–12 mostly direct and approve the work. They are detailed and precise: explicit safety constraints, "stop if anything fails", and approval of commit messages. They are not questions, so they mostly support (ii) as verification demands rather than standalone curiosity events.
- The student took ownership of the OCI console work (bucket, IAM, keys) and diagnosed one authentication cause independently. That is observable problem-solving, but it shows up in actions rather than in questions to the AI.
- **Disclosure:** this grade was produced by the same AI instance that participated in the graded session, so it may share that session's framing. Consider cross-checking with the separate Curiosity Grader agent or a human reviewer, especially on (ii) and (iv).

## AI Sycophancy — No grade impact, for your awareness
- **Mild praise:** the AI opened its turn-15 reply with "Good question." This is minor and didn't change any substance.
- **Correct reversal under a correct challenge (positive):** in turn 13 the student's correction was right. The AI accepted it and adjusted the workflow (no rebase, keep `644bf91`), and recorded the correction for future sessions. It also showed this was correct by comparing against Sanish's branch (0 behind).
- **Self-correction without challenge (positive):** after reading Oracle's documentation, the AI retracted its earlier claim that the boto3 checksum defaults were the likely OCI blocker: "One correction to what I said before…".
- **No caving to an incorrect challenge was observed.** On the 404 question the AI did not simply agree with either interpretation. It presented the in-run evidence: same-key HeadBucket and GetObject returned 200, and Django's identical delete succeeded. It also named a source the student could check independently, the OCI Audit logs.

## Performativity (preliminary)
The questions are specific and tied to concrete artifacts: commit `644bf91`, the 404 `NoSuchBucket` result, the checksum setting, and the two named service users. Each led to a substantive change in the AI's answer or the work: a corrected workflow, a newly surfaced untested multipart gap, and an evidence-based justification. Nothing suggests questions asked for show. This is a preliminary signal, not a definitive judgment of intent.

## CSV score-row
```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
oeo36,Sudin Katuwal,SCRUM-133,2,3,3,3,5,6,2,4,3,1,0,2026-11-20
```
