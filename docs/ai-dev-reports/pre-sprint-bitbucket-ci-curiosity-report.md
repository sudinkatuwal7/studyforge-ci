# Pre-sprint Bitbucket CI curiosity report

Jira ID: not assigned. These are technical investigation notes from the assistant;
the developer's personal reflections and final review remain theirs to supply.

| Question | Evidence / experiment | Finding and decision |
| --- | --- | --- |
| Can we switch branches without losing the deletion? | Compared HEAD and fetched origin/development trees for the deleted path. | Identical blob; normal switch preserved the deletion. No stash/reset/clean needed. |
| Are services already independently deployable? | Inspected settings, model relationships, worker imports, and tests. | One Django project; add domain test selection without claiming service independence. |
| Do tests need live Redis or paid AI? | Inspected document fixtures, embedding mocks, task tests, notes client selection. | Current suite can run against PostgreSQL only; force fake notes and block HTTPX calls. |
| Why can Celery tests affect unrelated tests? | The test module replaced sys.modules['celery'] during import. | Remove replacement; run the real bound task with scoped retry/request mocks and assert registration. |
| Should absent Chunk imports skip notes tests? | Chunk and its migrations are present in the integration branch. | Missing imports should fail visibly; remove obsolete optional-import skips. |
| Which Node version fits the lockfile? | Inspected locked jsdom engine requirements and verified the Node 24.19.0 Docker manifest. | Use the explicit Node 24.19.0 image, rather than an older generic CI example. |
| Does a green pipeline enforce merging rules? | Consulted Atlassian trigger and merge-check documentation. | Cloud protections and plan enforcement must be verified by an administrator. |

The executed baseline was green; results are recorded in the chat report. Final
verification and unresolved limits are in `../ci-validation.md`. Future work
includes real-worker/browser integration and service contract tests; those were
not silently added to the scope of this setup task.
