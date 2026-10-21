---
name: scrum-113-polish-login-ui
description: Shared context for SCRUM-113 (Polish Login and Registration UI) in StudyForge, plus the team's Sprint 2 Git workflow (rebase + PR + squash fast-forward) and the GitHub-Actions-then-Bitbucket push procedure. Use when working on the login/registration frontend or when committing, pushing, rebasing, or opening a PR for this task.
---

# SCRUM-113: Polish Login and Registration UI

## Purpose

Keep durable task context available to the user and teammates across sessions. Guide implementation and explain the reasoning as work proceeds. This file is not proof that an implementation decision is approved or that code is complete.

## Start and end each session

1. Read this file and the latest SCRUM-113 acceptance criteria. The Jira issue is the source of truth if it conflicts with notes here.
2. Inspect the active branch, working tree, and current code before editing. Do not assume earlier branch changes are present.
3. Follow the working style below.
4. At session handoff, add newly learned durable, task-relevant context: clarified criteria, agreed decisions, repository discoveries, pitfalls, and verified progress. Exclude secrets, tokens, personal data, and transient conversation details.

## Working style (confirmed by the task owner, October 19, 2026)

- **Provide code in chat; do not edit project source files.** For each change, give the full code with the exact file path and say whether it is a new file, a full replacement, or a specific edit (name the lines or function being replaced).
- The task owner adds the code themselves and asks questions to understand it. Explain what each piece does and why, especially React state, validation flow, error handling, accessibility attributes, and tests. Answer questions before moving to the next step.
- Go one plan step at a time, so each step can become its own meaningful commit. Suggest a commit message (`feat(SCRUM-113): ...`) at the end of each step.
- Read-only inspection (reading files, `git status`, running tests or lint when asked) is fine. Updating this skill file is fine.

## Jira task

- **SCRUM-113**, parent story SCRUM-54 (User Authentication), Sprint 2, 2 story points, assignee Nischal Rimal.
- Description: Improve the existing login and registration pages with responsive design, validation, error messages, and loading states.
- Acceptance criteria:
  - Uses existing authentication APIs.
  - Displays validation and login errors.
  - Works on desktop and mobile.
- Related but separate tasks (do not absorb their scope): SCRUM-114 Google sign-in, SCRUM-115 profile/sign-out/session, SCRUM-117 application shell.

## Repository findings (October 19, 2026)

- Task branch: `feature/SCRUM-113-polish-login-UI`, rebased onto `development` at `426d8e6` (PR #66). No SCRUM-113 commits yet.
- `frontend/src/pages/LoginPage.tsx` is a plain form. It already disables the button and shows "Signing in..." while submitting. Any failure shows one generic credentials message, including network, CSRF, and 5xx errors.
- **No registration page exists in the frontend**, although the backend endpoint does. Building one is in scope because it uses an existing API.
- `frontend/src/App.tsx` renders `<LoginPage />` and also `<CourseList />` for signed-out users (around line 102). CourseList needs authentication, so that is a bug to remove.
- Auth API client: `frontend/src/api/auth.ts` (`login`, `refreshAccessToken`, `restoreSession`, `logout`). Each POST first calls `GET /api/v1/auth/csrf/` and sends `X-CSRFToken`.
- Session state: `frontend/src/context/AuthContext.tsx`. `saveLogin(result)` stores `{ access, user }`. The refresh token is an HttpOnly cookie.
- Styles: `frontend/src/styles/index.css` (`.auth-layout`, generic `form`, `.form-error`, palette variables such as `--navy`, `--periwinkle`, `--cream`, and a `48rem` mobile breakpoint).
- Backend auth routes (`backend/config/urls.py`):
  - `POST /api/v1/auth/register/` takes `email`, `password`, and optional `first_name`/`last_name`, and returns `201 { user }`. Errors are `400` with field lists, for example `{"email": ["An account with this email already exists."], "password": ["This password is too short...", "This password is too common."]}`. Password rules come from Django's validators: minimum length 8, not common, not numeric-only, not similar to user attributes. Registration does not log the user in.
  - `POST /api/v1/auth/token/` (login, CSRF-protected) takes `{email, password}` and returns `{ access, user }` and sets the refresh cookie. Bad credentials return 401.
  - `GET /api/v1/auth/me/`, `POST /api/v1/auth/token/refresh/`, `POST /api/v1/auth/logout/`.
- Frontend tests use Vitest + React Testing Library + user-event (`npm test`). Lint is `oxlint` (`npm run lint`). Build is `tsc -b && vite build`.

## Proposed plan (awaiting the task owner's go-ahead)

1. `api/auth.ts`: add `register()` that exposes backend field errors, and let `login()` distinguish bad credentials (400/401) from server or network failures.
2. `LoginPage.tsx`: card layout, inline validation, specific error messages, a loading indicator, a show/hide password toggle, and a link to registration.
3. New `RegisterPage.tsx`: optional names, email, password, and confirm password. Client checks (8+ characters, passwords match), backend field errors shown per field, and automatic sign-in after successful registration.
4. `App.tsx`: switch between sign-in and register in the signed-out view, and remove the stray `CourseList`.
5. `index.css`: responsive auth card, `aria-invalid` field styles, and mobile tap targets.
6. Tests: `LoginPage.test.tsx` and `RegisterPage.test.tsx` covering validation, API errors, loading state, and success.

## Design decisions (October 20, 2026)

- The task owner supplied a mockup: a split layout with a large serif "Welcome back" headline on the left and a white rounded "Log in to StudyForge" card on the right, plus a brand header pill on a cream background.
- **No illustration.** The task owner chose not to use the mockup's hand-drawn art. The hero is the headline and tagline only.
- **Unsupported extras are disabled placeholders** (task owner's choice):
  - Google button: disabled, with a "Coming soon" badge (SCRUM-114).
  - "Forgot password?": disabled, because there is no reset API.
  - "Remember me": checked and disabled, because sessions already persist through the refresh cookie.
  - Header Features/For Teams/About: disabled.
- The mockup's announcement banner was left out because it advertises a feature that does not exist.
- Implementation:
  - `components/auth/AuthLayout.tsx` holds the shared header, hero, and card slot.
  - `components/auth/icons.tsx` holds inline SVG icons.
  - `FormField` has an `icon` prop.
  - `styles/auth.css` is scoped under `.auth-page` and imported by AuthLayout.
  - The serif font is Instrument Serif from Google Fonts in `index.html`, with Georgia/Palatino fallbacks.
  - Mobile breakpoints are 60rem (single column) and 48rem (nav hidden).
- Plan change: the CSS and the App wiring for login moved into Step 2, so the design is visible before registration. Step 3 adds RegisterPage, the header Log in/Start free buttons, and the "Sign up" link wiring.
- Verification method: build a scratch copy under the session scratchpad and screenshot it with headless Chrome. Chrome's minimum window width distorts direct 390px shots, so wrap the page in an iframe for phone widths.

## Team Git workflow (Sprint 2)

Strategy: rebase + pull request + squash fast-forward merge. Each Jira task becomes one commit on the integration branch, and the task branch keeps its individual commits for grading.

- **Branch naming:** the workflow document says "dev", but the repository branch is named `development` (`origin/development`). Use `development` in commands.
- No domain branches. Each Jira task has its own branch, created from the latest `development`, for example `feature/SCRUM-113-polish-login-UI`.

Steps:

1. **Create the task branch:** pull the latest `development`, then branch from it (never from `main`).
2. **Work and commit:** commit regularly, with each commit representing meaningful progress. Commit message format: `feat(SCRUM-113): ...` (or `fix`, `test`, `style`, `docs`, `refactor`). Do not squash locally.
3. **Rebase before the PR:** run `git fetch origin`, then `git rebase origin/development`. Resolve conflicts locally and re-run tests. Never rebase `development` onto a task branch.
4. **Push:** push the task branch. If a rebase rewrote commits that were already pushed, use `git push --force-with-lease`, and only on your own task branch. Never force-push `development` or `main`. Do not rebase a shared task branch without coordinating.
5. **Pull request:** open a PR from the task branch into `development`, assign reviewers, and have teammates review the commits, code, and AI reports. If `development` changes before the merge, rebase again and push.
6. **Merge:** after approval, use the Bitbucket strategy **Squash, fast forward**. Edit the squash message to contain the Jira ID and task name: `SCRUM-113: Polish Login and Registration UI`.
7. **Keep the task branch** after merging. Do not delete it.

Rules:

- Never commit or push directly to `development`.
- Every PR must be reviewed before merging.
- Include the AI chat/curiosity reports in the **final coding commit**, under `docs/ai-dev-reports/`, labeled with the Jira ID. Existing naming: `curiosity-report-Rimal-SCRUM-113-YYYY-MM-DD.md` and `curiosity-grade-Rimal-SCRUM-113-YYYY-MM-DD.md`.
- Bitbucket repository settings (admin): Repository Settings → Workflow → Merge strategies → disable inherited settings → default strategy "Squash, fast forward" → Save.

Flow: `development → task branch → commits → rebase onto development → push → PR → review → squash fast-forward merge → development`.

## Build verification: push to GitHub first, then Bitbucket

Remotes in this clone:

- `github`: `github.com/sudinkatuwal7/studyforge-ci`. GitHub Actions CI runs here.
- `origin`: `bitbucket.org/mth115_super/studyforge`. This is the team's main repository, where PRs are opened.

Procedure:

```bash
# 1. Commit locally on the task branch
git add <files>
git commit -m "feat(SCRUM-113): ..."

# 2. Push to GitHub first
git push github feature/SCRUM-113-polish-login-UI

# 3. Check GitHub -> Actions and confirm the build and tests pass

# 4. If it passes, push the exact same commit to Bitbucket
git push origin feature/SCRUM-113-polish-login-UI
```

- After a rebase, both remotes need `--force-with-lease` if the branch was pushed before.
- CI (`.github/workflows/ci.yml`) runs on pushes to `feature/**`, `chore/**`, `development`, and `main`:
  - Backend: Python 3.12 with a pgvector Postgres service, running `python scripts/check.py --component backend --database service`.
  - Frontend (in `frontend/`): `npm ci`, `npm run lint`, `npm run test:ci`, `npm run build`.
- Run the frontend checks locally before pushing: `cd frontend && npm run lint && npm test && npm run build`.
- Backend tests need Python 3.12. The local venv is 3.11, so run backend checks through `scripts/check.py` in a `python:3.12-bookworm` container, or rely on CI. SCRUM-113 is frontend-only, so the backend checks should not be affected.

## Environment notes

- GitKraken's free plan wrongly reported this repository as private. Both remotes are publicly readable (the API returned 200 on October 19, 2026). The likely fix is connecting Bitbucket under Preferences → Integrations. GitKraken is not required.
- Old stashes from SCRUM-99 and earlier auth work were cleared on October 19, 2026. Their content was either merged or superseded.

## Prior context

This skill was previously `scrum-99-course-document-authorization` (SCRUM-99 internal service authorization, merged in PR #67). Those notes are in git history at commit `3b087a0`, path `.claude/skills/scrum-99-course-document-authorization/SKILL.md`.
