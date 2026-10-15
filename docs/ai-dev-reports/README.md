# AI coursework reports

Use the professor's curiosity-report and grading workflow when a coursework
report is requested. This directory does not impose an additional requirement
to generate reports for every coding branch or commit.

## Report and grade

| File | Purpose |
|---|---|
| `curiosity-report-<lastname>-<assignment>-<YYYY-MM-DD>.md` | Chronological student/AI transcript and evidence appendix, produced from the actual working session. |
| `curiosity-grade-<lastname>-<assignment>-<YYYY-MM-DD>.md` | Separate assessment of that report using the professor's grading instructions. |

For example, Sudin's SCRUM-97 files for October 14, 2026 use the suffix
`Katuwal-SCRUM-97-2026-10-14`. A generated grade is not a claim that the professor
has reviewed or awarded a final course grade.

Follow the [report prompt](../../.github/prompts/curiosity-report.prompt.md)
and its [full instructions](../../.github/skills/curiosity-report/SKILL.md).
Invoke the report workflow in the session where the work occurred, with the
student name, ID, and assignment. The supplied prompt writes to the workspace
root; existing coursework reports are stored here. Follow the professor's
submission instructions for the final location.

Preserve the exact required headings, chronological `STUDENT`/`AI` turns, and
the student's questions. Redact secrets as instructed. Do not invent missing
exchanges, test results, personal reflections, or approvals. A review-session
transcript documents that review session; it is not a substitute for a missing
implementation-session transcript. Do not rewrite an exported transcript to
improve its grade or remove references to files that existed during the session.

Grading is a separate step using the professor's grading workflow and the actual
report as input. Do not generate or change grades automatically during coding.

## Coding documentation

Keep setup instructions, implementation decisions, and verified test results in
the relevant service or testing documentation. Do not automatically create the
former `SCRUM-<task>-chat-report.md` and `SCRUM-<task>-curiosity-report.md` summary
pair. Those summaries are not the professor's transcript-and-grade format.

The existing `pre-sprint-bitbucket-ci-*` files are historical development notes,
not coursework transcript templates or requirements for future branches.
