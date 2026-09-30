# Git Workflow

StudyForge uses shared domain branches and one short-lived branch per Jira task.
The integration branch is named `development`; team references to `dev` mean
this branch.

```text
Branch from:
main -> development -> domain branch -> Jira task branch

Merge completed work through pull requests:
Jira task branch -> domain branch -> development -> main

Receive shared work:
development -> domain branch -> active Jira task branch
```

## Domain branches

| Domain | Owner | Branch |
|---|---|---|
| Authentication | Nischal | `feature/user-authentication` |
| Courses | Aashish | `feature/courses` |
| Document upload and status | Sudin | `feature/document-upload-status` |
| Processing | Sanish | `feature/processing` |
| Study guides | Gaurav | `feature/study-guide` |

Keep unfinished work on its Jira task branch. Merge reviewed, completed tasks
into their domain branch. A domain owner can share completed tasks with
`development` before all tasks for that domain are finished, then share more
completed tasks later.

A merge includes all changes on the source branch. Before merging a domain
branch into `development`, review the full diff and ensure it contains only work
ready to share. Run the relevant checks before merging. Integrate tested work
from `development` into `main` through a pull request.

## Starting a Jira task

Start with a clean working tree. Update your domain branch, then create the
task branch from it. For example, for Person 3:

```bash
git fetch origin
git switch feature/document-upload-status
git pull --ff-only origin feature/document-upload-status
git switch -c feature/SCRUM-10-pdf-upload-api
```

Use `feature/SCRUM-XX-short-description` for new Jira task branches. If the
domain needs shared changes first, follow the update steps below before
creating the task branch. If a fast-forward pull fails, inspect the divergence
and reconcile it before continuing.

## Finishing a Jira task

Review the diff, run the task's checks, and commit and push the task branch when
ready. Include the Jira key in the commit message. Open a pull request from the
task branch into its domain branch, for example:

```text
feature/SCRUM-10-pdf-upload-api -> feature/document-upload-status
```

After review and merge, update the domain branch before creating the next task
branch. Share completed domain work through a separate pull request into
`development`.

## Receiving another domain's completed work

The other owner first merges their completed task into their domain branch,
then merges that domain branch into `development`. Fetch those shared changes
and merge `development` into your own domain branch.

For example, to bring shared authentication work into courses:

```bash
git fetch origin
git switch development
git pull --ff-only origin development
git switch feature/courses
git pull --ff-only origin feature/courses
git merge development
```

This direction brings shared work into courses without publishing the courses
branch's work to `development`. Resolve any conflicts, run the relevant checks,
and push the updated domain branch when ready.

If a Jira task is already in progress, merge its updated domain branch into it
as well. For Person 3, after updating `feature/document-upload-status` using the
same steps:

```bash
git switch feature/SCRUM-10-pdf-upload-api
git merge feature/document-upload-status
```

Receive teammate implementations through `development`; inspect their task or
domain branches as needed to understand interfaces. Use merges to update shared
branches. Avoid rebasing or force-pushing shared domain branches, because that
rewrites history teammates may already use.
