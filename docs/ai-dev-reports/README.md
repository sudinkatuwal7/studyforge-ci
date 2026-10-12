# Sprint 2 AI development reports

Every Sprint 2 coding task branch must include both reports in its final commit:

- `docs/ai-dev-reports/SCRUM-<actual-task-number>-chat-report.md`
- `docs/ai-dev-reports/SCRUM-<actual-task-number>-curiosity-report.md`

Replace the placeholder with the real Jira task ID; never invent one. Reports
belong to the same task as the code and should be reviewed with the code. Do not
include secrets, personal information, tokens, or unredacted environment files.

## Chat-report contents

Record the task ID, branch, date, developer, AI tool/model when known, and goal.
Keep a chronological log of meaningful prompts, constraints, recommendations,
accepted/rejected suggestions, human decisions, and resulting files. Summaries
must be labeled as summaries rather than verbatim transcripts. Include actual
test commands/results, failures and follow-up work. Distinguish assistant claims
from outcomes verified by a person or an executed check.

## Curiosity-report contents

Record questions explored, hypotheses, evidence or documentation consulted,
experiments performed, results, what you learned, and remaining uncertainties.
Explain at least the technical decisions that influenced the implementation.
Do not fabricate experiments, outcomes, or personal reflections for another author.

## Final review

Before the authorized final commit, verify that both filenames use the correct
Jira ID, reports match the final implementation, commands/results are accurate,
and sensitive content is removed. The developer supplies their own reflections
and confirms human review. This is a documented requirement, not an automated
claim that every commit already satisfies it.

The initial CI branch is pre-sprint work without an assigned Jira ID. Its files
use `pre-sprint-bitbucket-ci-*` names explicitly; they do not establish an exception
for Sprint 2 coding tasks.
