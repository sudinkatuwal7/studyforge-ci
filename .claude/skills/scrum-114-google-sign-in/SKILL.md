---
name: scrum-114-google-sign-in
description: Shared context for SCRUM-114 (Google sign-in and sign-up) in StudyForge, covering the team's decisions, the as-built backend endpoint, Google button and sign-in lock, test approach, pitfalls, follow-up tickets, and the Sprint 2 Git workflow with the GitHub-Actions-then-Bitbucket push procedure. Use when working on GoogleLoginView, google_sub, GoogleSignIn, useSignInLock, LoginPage, RegisterPage or the auth env variables, or when committing, pushing, rebasing, or opening a PR for this task.
---

# SCRUM-114: Google sign-in and sign-up

## Purpose

Keep durable task context available to the user and teammates across sessions. Guide implementation and explain the reasoning as work proceeds. This file is not proof that an implementation decision is approved or that code is complete.

## Start and end each session

1. Read this file and the latest SCRUM-114 acceptance criteria. The Jira issue is the source of truth if it conflicts with notes here.
2. Inspect the active branch, working tree, and current code before editing. The owner often applies steps ahead of the plan, so check `git status` and `git diff` first and build on what is there.
3. Follow the working style below.
4. At session handoff, add newly learned durable, task-relevant context: clarified criteria, agreed decisions, repository discoveries, pitfalls, and verified progress. Exclude secrets, tokens, personal data, and transient conversation details. Never write the real OAuth client ID here.

## Working style (confirmed by the task owner; last updated October 30, 2026)

- **Provide code in chat; do not edit project source files** unless the task owner explicitly asks ("apply", "make the changes"). Applying on request is a one-off each time. The backend for this task was edited directly before these notes were read; the owner chose to keep it.
- **One file per message, most important file first** (source before tests). Wait for "next" or a question before sending the next file. Keep each message self-contained (code, why, what's next).
- For each change, give the exact path and say whether it is a new file, a full replacement, or a named edit.
- Explain the why, and answer questions before moving on.
- Verify code in a scratch copy before handing it over: lint, `tsc -b`, tests, and mutation checks of the key behaviors.
- **The owner makes the commits.** Do not commit, and do not offer commit messages unless asked.
- **Scope:** point out anything beyond the acceptance criteria **before** suggesting it, and offer it as a separate Jira task.
- **The owner reviews closely and expects claims to be tested.** Say what a test does not show, and do not describe a test as proving more than it does.

## Jira task

- **SCRUM-114**, Sprint 2.
- Acceptance criteria:
  - Students can sign up or log in using Google.
  - New users automatically receive StudyForge accounts.
  - Returning users can log in without duplicate accounts.
  - Existing email/password authentication remains functional.
  - Authentication is handled securely.
  - Successful login or sign-up redirects to the dashboard.

## Team decisions (October 2026)

- **Google's own button (Option A).** Only `google.accounts.id.renderButton` or One Tap gives an ID token, and the backend needs no client secret. A custom-styled button would need the authorization-code flow and a secret.
- **Popup only.** `ux_mode` is typed as just `"popup"`, because redirect mode would never call our callback.
- **Identify Google users by `sub`, never by email.** It is permanent and never reused.
- **Keep the stored StudyForge email** when a returning user's Google email changes. This avoids silently changing the profile or colliding with another account's email.
- **Never auto-link an existing password account (Option B).** Registration does not verify email ownership, so linking would allow account pre-hijacking: someone registers the victim's email with a password and keeps access after the victim links Google. These users get a generic 409. A "link Google" profile option is a possible follow-up.
- **Exact messages:**
  - 409: `An account with this email already exists.` (deliberately no "log in with your password", because the person may not have one)
  - 403 for a `sub` matching an inactive account: `This account has been deactivated.`
  - An inactive account matched only by **email** gets the generic 409, because that person has not proven they own that StudyForge account.
- **Redirect:** the same as password login. `App` shows the signed-in app at the current URL, so `/` shows the dashboard and deep links are kept. There is no `navigate()` call.
- **The card shows one error at a time.** Each message appears next to its cause. Google errors stay beside the button because the top of the form can be scrolled off a phone screen.
- **Only one sign-in request at a time** (see the lock below). The owner chose to prevent overlap, because a mismatch between the displayed user and the refresh cookie could switch accounts on reload.
- **`strictImportMetaEnv` is on,** so a misspelled `import.meta.env` variable is a compile error. New `VITE_` variables must be declared in `vite-env.d.ts`.
- **Recovery after a failed automatic login:** the login card prefills the saved lowercase email. It is cleared once someone signs in.

## Architecture (as built)

### Backend
- `apps/users/google.py`: `verify_google_credential()` wraps `id_token.verify_oauth2_token` (signature, expiry, issuer, audience), then requires `sub`, `email`, and `email_verified is True`. It raises `InvalidGoogleCredential` (becomes 401) or `GoogleSignInUnavailable` (becomes 503).
- `apps/users/views.py`: `GoogleLoginView` at `POST /api/v1/auth/google/`, CSRF-protected. Order: verify, look up by `google_sub`, otherwise check the email (409) or create. Then `is_active`, then tokens and `set_refresh_cookie`.
- `RefreshToken.for_user` does **not** check `is_active`, so the view must.
- `create_user` handles the race: `transaction.atomic()` plus `except IntegrityError`, then looks up by `sub` again. The unique constraints stop duplicates; the `exists()` check is only the fast path.
- `User.google_sub` is a nullable unique `CharField` (migration `0003_user_google_sub`). Google users get an unusable password.
- A failed Google request neither sets nor clears the refresh cookie and does not revoke an existing session.

### Frontend
- `api/auth.ts`: `loginWithGoogle()` follows `login()`. A failed CSRF check is also a 403, so it reads the body and only reports "deactivated" on the exact message.
- `components/auth/useSignInLock.ts`: `lockedRef` is the real lock, because it changes immediately. `locked` state is only for the screen. `App` owns it, so a request on one card still blocks the other. Every `acquire()` needs a `release()`, on success too, or the login card is stuck after sign-out.
- `components/auth/GoogleSignIn.tsx`:
  - Takes `error`, `onError` and `signInLock` as props; the page owns the error text.
  - `gisLoading` is module-level, so the script loads once. A failed load is forgotten and retried on the next mount. A script that loads without `window.google` stays failed until reload.
  - Google keeps the callbacks it was given, so they call through refs.
  - `cancelled` is checked in `.then` (leaving before load, and StrictMode) and in `callback` (a popup returning after the card has gone).
  - The slot gets `inert` while locked. Keyboard users can reach the iframe despite `pointer-events: none`.
  - A credential that arrives while locked is dropped: nothing is sent or stored, and the user can click again.
  - `click_listener` clears the card's error on click; `handleCredential` clears it again as a backup.
- `LoginPage` and `RegisterPage`: `disabled={signInLock.locked}` on submit, and `showGoogleError` clears the form error. `RegisterPage` holds the lock across **both** `register()` and `login()`, because only `login()` sets the cookie.
- `App.tsx` owns `signInLock` and `createdEmail`. `DocumentUploadPreview.tsx` also renders `LoginPage`, so it creates its own lock.
- `styles/auth.css`: `.auth-google-signin`, `.auth-google-slot`, `.auth-google-status`. The old `.auth-google` rules stay for the "Unavailable" button.

### Configuration
- Frontend: `VITE_GOOGLE_CLIENT_ID` in `frontend/.env` (git-ignored; Vite reads it at startup and copies it in at build time).
- Backend: `GOOGLE_OAUTH_CLIENT_ID` must be set in the shell that runs Django. Django does **not** load `backend/.env`.
- Google Cloud authorized JavaScript origins must include both `http://localhost` and `http://localhost:5173`.
- Backend environments need `pip install -r requirements.txt` and `manage.py migrate`.

## Tests

- Backend: `tests/users/test_google_login.py` mocks `apps.users.google.id_token.verify_oauth2_token`, so CI never contacts Google. It covers new and returning users, email change via `sub`, 409, recreated Google accounts, inactive accounts, the race, CSRF, 503, and an existing session surviving each failure.
- Frontend:
  - `api/auth.test.ts`: status mapping, CSRF failures.
  - `components/auth/GoogleSignIn.test.tsx`: the component with a fake `window.google`.
  - `components/auth/GoogleSignIn.scriptLoad.test.tsx`: separate file, because its failure stays in the module-level `gisLoading`.
  - `pages/LoginPage.test.tsx`, `pages/RegisterPage.test.tsx`: errors and the lock, using `LoginCard` and `RegisterCard` parents that own the lock.
  - `pages/LoginPage.signInRace.test.tsx`: real `api/auth` against a fake server that stores the cookie at headers and reads the body later.
  - `App.signInLock.test.tsx`: switching cards during a request.
  - `App.recoveryEmail.test.tsx`: prefill and clearing.
  - `test/viteEnv.typecheck.ts`: `@ts-expect-error` on a misspelled variable, checked by `tsc -b`.
- **Describe the race test accurately:** with the lock working only one POST exists, so the alternate response-order steps do nothing. It is a regression guard. The PR should say "prevents overlapping sign-in requests, with tests that fail if the protection is removed", not "handles both response orders".
- Tests use a fake Google. **No test has used a real Google token or button.**

## Pitfalls learned

- **A test can pass without being able to fail.** Mutation-check it. Examples from this task: submitting an empty form never reaches the lock, clicking a disabled button does nothing, and a fake that sets the cookie and resolves together can never show a mismatch.
- **Vite's default `ImportMetaEnv` lets any key through as `any`,** so a declaration alone does not catch typos.
- **`rerender` with the same element does nothing.** Build a new element each time.
- **jsdom only sees `inert` as an attribute,** and does not load CSS. `inert`, `pointer-events`, and layout need a browser check.
- **PowerShell:** `Try` is reserved, so it cannot name a function. `Get-Content`/`Set-Content` can corrupt UTF-8, so use `[IO.File]`. Multi-line replacements fail silently on CRLF files, so always report whether a replacement applied.
- **Password login is case-sensitive; registration lowercases.** The automatic login uses the saved email to avoid this. Fixing it for everyone is on the email-case ticket.

## Known limits (accepted)

- A credential dropped by the lock shows no message. The form's own result still shows.
- If a request fails after the user switches cards, its error is lost, though the controls work again.
- A credential already being sent when the card unmounts is not cancelled.
- "Unavailable" does not say why, and nothing is logged.
- `getCsrfToken` reads `document.cookie`, so an API on an unrelated domain would fail every sign-in, password login included. Check this at deployment.

## Follow-up tickets (written; the owner creates them)

1. **Email case:** case-insensitive password login, the concurrent registration 500, and a `Lower("email")` unique constraint.
2. **Two tabs:** signing in on a second tab can leave tabs showing different accounts.
3. **npm audit:** three high-severity findings (`vite` 8.3.0, `undici`, `source-map-js`). Not caused by this task.
4. Possible later: a "link Google" profile option, and password reset. Without reset, people who forgot a password, or who recreated their Google account, have no way in.

## Progress (October 30, 2026)

- Branch: `feature/SCRUM-114-google-sign-in-sign-up`, five commits on top of `origin/development` at `025fef1` (SCRUM-112, PR #82). HEAD is `035c650`:
  - `da1be40` feat: Google sign-in endpoint and user identity
  - `052bd0e` test: Google sign-in and existing sessions
  - `5f91a1e` feat: connect Google sign-in to the auth pages
  - `4f46f13` test: Google sign-in and auth races
  - `035c650` docs: Google sign-in API and auth scope
- Pushed to `github` at `035c650`, and the owner reported that CI passed. **Not yet on Bitbucket:** `origin/feature/SCRUM-114-google-sign-in-sign-up` is still the old `a6b509a`, which is why `git status` says "ahead 13".
- This skill's move is **still uncommitted**: the new `.claude/skills/scrum-114-google-sign-in/` folder and the deletion of `scrum-117-responsive-app-layout/SKILL.md`.
- The owner requested dropping the local safety stash after the work was committed; it was dropped on October 30, 2026.
- The owner reported on October 30, 2026 that a real Google sign-in worked on localhost and that the browser check "looks good". Individual browser results were not itemized, so ask the owner for them when writing the PR description.
- Local checks before committing: 369 frontend tests, `tsc -b`, `vite build`, and lint (only four older warnings: `AuthContext.tsx`, two in `CalendarMonth.tsx`, and `CourseTasks.tsx`, which came from `development`). `scripts/check.py --component backend` on Postgres: 678 tests, system checks, migration drift, and fresh migrations all passed.
- `npm audit` was unchanged at the last check: three high-severity findings, `vite` still 8.3.0.
- Remaining:
  1. Add the AI reports under `docs/ai-dev-reports/` in a separate final commit, and commit this skill's move.
  2. `git fetch origin`, and rebase if `development` has moved. Re-run the checks and confirm CI on GitHub, then push the same commits to Bitbucket. A push with no rebase is a fast-forward; after a rebase, use `--force-with-lease`.
  3. Open the PR into `development`. Map changes to the criteria, explain the lock as "prevents overlapping sign-in requests, with tests that fail if the protection is removed", list the browser results, and mention the new rule for `VITE_` variables.
  4. Create the follow-up tickets.
  5. Find out from the team how the Django API and frontend are deployed. The only Kubernetes manifest found is `services/document-processing/kind-worker.yaml`, which is the worker and does not need the client IDs. Wherever they are deployed, `GOOGLE_OAUTH_CLIENT_ID` and a build-time `VITE_GOOGLE_CLIENT_ID` must be set, and the production address added as an authorized origin.

## Commands

- Frontend: `cd frontend && npm run lint && npm test && npm run build`. Single file: `npx vitest run src/components/auth/GoogleSignIn.test.tsx`.
- Backend: start Docker Desktop, then `backend/venv/Scripts/python.exe scripts/check.py --component backend`. Add `--suite identity-courses` for the auth suite only. Tests need Python 3.12. `backend/venv` is git-ignored and also needs `pytest` and `pytest-django`.
- Quick backend run without Docker, for `tests/users` only: from `backend/`, set `DJANGO_SETTINGS_MODULE=config.settings`, `DATABASE_ENGINE=sqlite3`, `NOTES_LLM_BACKEND=fake`, and `QUIZ_LLM_BACKEND=fake`, then run `venv/Scripts/python.exe -m pytest tests/users -q -p no:cacheprovider`. CI uses Postgres, so treat this as a shortcut only.

## Team Git workflow (Sprint 2)

Strategy: rebase + pull request + squash fast-forward merge. Each Jira task becomes one commit on the integration branch, and the task branch keeps its individual commits for grading.

- **Branch naming:** the workflow document says "dev", but the repository branch is named `development` (`origin/development`). Use `development` in commands. Task branches are `feature/SCRUM-<id>-<short-description>`.
- No domain branches. Each Jira task has its own branch, created from the latest `development` (never from `main`).

Steps:

1. **Create the task branch** from the latest `origin/development`.
2. **Work and commit** regularly, each commit a meaningful step. Do not squash locally.
3. **Rebase before the PR:** `git fetch origin`, then `git rebase origin/development`. Resolve conflicts locally and re-run tests. Never rebase `development` onto a task branch.
4. **Push:** if a rebase rewrote pushed commits, use `git push --force-with-lease`, only on your own task branch. Never force-push `development` or `main`.
5. **Pull request** into `development`, with reviewers assigned. If `development` changes before the merge, rebase again and push.
6. **Merge:** after approval, use Bitbucket's **Squash, fast forward**. Edit the squash message to contain the Jira ID and task name, for example `SCRUM-114: Google sign-in and sign-up`.
7. **Keep the task branch** after merging.

Rules: never commit or push directly to `development`; every PR must be reviewed. The AI curiosity report and grade go under `docs/ai-dev-reports/`, labeled with the Jira ID, in a separate final commit.

## Build verification: push to GitHub first, then Bitbucket

- `github`: `github.com/sudinkatuwal7/studyforge-ci`, where GitHub Actions CI runs.
- `origin`: `bitbucket.org/mth115_super/studyforge`, the team's main repository, where PRs are opened.

```bash
git push github feature/SCRUM-114-google-sign-in-sign-up
# Check GitHub -> Actions; confirm the build and tests pass
git push origin feature/SCRUM-114-google-sign-in-sign-up
```

- After a rebase, both remotes need `--force-with-lease` if the branch was pushed before.
- CI (`.github/workflows/ci.yml`) runs on pushes to `feature/**`, `chore/**`, `development`, and `main`. Backend: Python 3.12 with a pgvector Postgres service, running `python scripts/check.py --component backend --database service`. Frontend (in `frontend/`): `npm ci`, `npm run lint`, `npm run test:ci`, `npm run build`.

## Prior context

This skill was previously `scrum-117-responsive-app-layout` (SCRUM-117, merged in PR #75); its notes are in git history at commit `34d6fa6`, path `.claude/skills/scrum-117-responsive-app-layout/SKILL.md`. Before that: `scrum-115-profile-signout-session` at `fa5faf1`, `scrum-113-polish-login-ui` at `23ac3d1`, and `scrum-99-course-document-authorization` at `3b087a0`.
