---
name: scrum-115-profile-signout-session
description: Shared context for SCRUM-115 (user profile menu, secure sign-out, persistent JWT authentication) in StudyForge, covering the team's decisions, the session architecture, pitfalls, and the Sprint 2 Git workflow (rebase + PR + squash fast-forward) with the GitHub-Actions-then-Bitbucket push procedure. Use when working on auth/session code (AuthContext, api/auth.ts, users views, ProfileMenu) or when committing, pushing, rebasing, or opening a PR for this task.
---

# SCRUM-115: Profile menu, secure sign-out, persistent authentication

## Purpose

Keep durable task context available to the user and teammates across sessions. Guide implementation and explain the reasoning as work proceeds. This file is not proof that an implementation decision is approved or that code is complete.

## Start and end each session

1. Read this file and the latest SCRUM-115 acceptance criteria. The Jira issue is the source of truth if it conflicts with notes here.
2. Inspect the active branch, working tree, and current code before editing. Do not assume earlier branch changes are present.
3. Follow the working style below.
4. At session handoff, add newly learned durable, task-relevant context: clarified criteria, agreed decisions, repository discoveries, pitfalls, and verified progress. Exclude secrets, tokens, personal data, and transient conversation details.

## Working style (confirmed by the task owner; last updated October 24, 2026)

- **Provide code in chat; do not edit project source files** unless the task owner explicitly asks ("apply", "make the changes"). Applying on request is a one-off each time.
- **One file per message, most important file first** (source before tests). Wait for "next" or a question before sending the next file. Keep each message self-contained (code, why, what's next), so the owner never has to scroll back.
- For each change, give the exact path and say whether it is a new file, a full replacement, or a named edit.
- Explain the why: React state and effects, auth/security reasoning, accessibility, tests. Answer questions before moving on.
- Before handing over code, verify it in a scratch copy (lint, `tsc -b`, tests; mutation-check the key behaviors) unless the owner says not to.
- End each step with a suggested commit message (`feat(SCRUM-115): ...`).
- **Scope:** the owner flagged scope creep on October 24. Point out anything beyond the acceptance criteria **before** suggesting it, and offer it as a separate Jira task.

## Jira task

- **SCRUM-115**, parent story SCRUM-54 (User Authentication), Sprint 2, assignee Nischal Rimal.
- Description: Implement a user profile menu, secure sign-out, and persistent authentication using the existing JWT system.
- Acceptance criteria:
  - Displays user name, email, and profile options.
  - Sign-out securely ends the session.
  - Authentication persists across page refreshes.
  - Expired or invalid sessions are handled correctly.
- Related:
  - SCRUM-117 (application shell) is also owned by Nischal, so there is no AppShell conflict.
  - **Profile editing** (`PATCH /auth/me/`, change password) is out of scope. The owner will file a separate Jira task. The menu shows a disabled "Edit profile / Coming soon" placeholder for it. That future task should also revoke all sessions on password change.

## Team decisions (October 23–24, 2026)

- **Expired sessions:** add a proactive refresh timer plus the existing 401 fallback, rather than moving every API module to `authenticatedFetch` (a possible follow-up).
- **First and last name are required at registration,** in both the serializer and the form. Older accounts may still have blank names, so the UI falls back to the email.
- **Sign-out always clears the local session,** even if the logout request fails. Accepted trade-off: if the request never reached the server, the HttpOnly cookie survives and a reload signs the user back in.
- **Sign-out in one tab signs out every tab.** An expiry does the same.
- **Refresh-token rotation is on,** with `ROTATE_REFRESH_TOKENS` and `BLACKLIST_AFTER_ROTATION`.
- **Reuse detection:** a validly signed but already-blacklisted refresh token blacklists all of that user's outstanding tokens, which signs out every device. The owner approved this. It goes beyond the acceptance criteria; see Scope.
- **Show a message on the login screen when a session ends:** "You've been signed out." or "Your session expired. Please sign in again." There is no message on a first visit.
- **Log out moved from the sidebar into the top-bar profile menu.**
- **AuthContext tests follow the README list** (login, logout, restored session, token refresh), plus the new behaviors.

## Scope mapping (for the PR description)

- **Core to the criteria:**
  - sign-out always ends the session, with a reason message (Step 4)
  - the refresh timer, with expiry handling (Step 6)
  - the profile menu (Step 7)
  - restoring with a single refresh (Step 3, needed because of rotation)
- **Supporting, decided by the team:** required names (Step 1), sign-out across tabs (Step 5), rotation (Step 2).
- **Beyond the criteria, approved hardening:** reuse detection (Step 2) and the cross-tab refresh lock (Step 3).
- In the PR, put the hardening under a heading like "Security hardening (agreed with team, beyond the acceptance criteria)".

## Architecture (as built)

### Backend (`backend/apps/users/`, `backend/config/settings.py`)
- `RegisterSerializer`: `first_name` and `last_name` are `CharField(max_length=150)`, so they're required and can't be blank. There's no migration; the model still allows blank values.
- `SIMPLE_JWT`: 15-minute access tokens, 7-day refresh tokens (sliding with rotation), `ROTATE_REFRESH_TOKENS=True`, `BLACKLIST_AFTER_ROTATION=True`.
- `views.py`:
  - `REFRESH_COOKIE`, `REFRESH_COOKIE_PATH`, `set_refresh_cookie()` and `clear_refresh_cookie()` are shared by Login, Refresh and Logout.
  - `revoke_all_sessions_if_reused()` runs **before** the refresh serializer. It calls `token_backend.decode(verify=True)`, checks `token_type == "refresh"`, then checks the blacklist, then bulk-blacklists the user's other outstanding tokens.
  - `RefreshView` puts the rotated refresh token **only** in the HttpOnly cookie, never in the response body.
- Tests: `backend/tests/users/test_refresh_rotation.py` (rotation, reuse revokes all sessions, reuse affects only that user, a forged token can't trigger revocation).

### Frontend (`frontend/src/`)
- `api/auth.ts`:
  - `refreshAccessToken()` runs the request inside `navigator.locks.request("studyforge-refresh", …)`, falling back to no lock when the API is missing.
  - `restoreSession(refresh = refreshAccessToken)` takes the refresh function as a parameter.
  - `accessTokenLifetimeMs(token)` returns `(exp − iat)` from the JWT payload (base64url), or `null`.
- `context/AuthContext.tsx`:
  - `storeSession(next, reason = null)` is the only way to change the session. It bumps `sessionVersionRef` and sets `signedOutReason`.
  - `signOut()` awaits `logout()`, ignores errors, and then calls `endSession("signed_out")` in `finally`.
  - `endSession(reason)` calls `storeSession` and posts `{ type: "session_ended", reason }` on the `BroadcastChannel("studyforge-auth")`. A receiving tab validates the message with `isSessionEndedMessage`, and only if it has a session calls `storeSession`. It **never re-broadcasts**.
  - Restore uses `sharedRefresh`, so StrictMode's double effect sends one request.
  - The refresh-timer effect is keyed on `session?.access`. It fires 60 s before `exp − iat`. Rejection → `endSession("expired")`. Other errors → retry after 30 s. Cleanup sets `stopped` and clears the timer.
  - `replaceAccessToken()` is shared by the timer and the 401 retry.
  - The context exposes `isSigningOut`, `signedOutReason`, `saveLogin`, `signOut` and `authenticatedFetch`. `clearSession` was removed.
- `App.tsx`: during render, `if (user && authView !== "login") setAuthView("login")`, so a session that ends always lands on the login card. It passes `user`, `isSigningOut` and `onSignOut` to AppShell.
- `pages/LoginPage.tsx`: `SIGNED_OUT_MESSAGES` is a `Record<SignedOutReason, string>`, shown as `.auth-notice` with `role="status"`. A login error replaces it.
- `components/dashboard/ProfileMenu.tsx`:
  - It uses the disclosure pattern (`aria-expanded` and `aria-controls`, with the panel always in the page and `hidden` when closed), not ARIA `role="menu"`.
  - It closes on Escape (returning focus to the button), on an outside `pointerdown`, on Tab out, and when an option is chosen.
  - The options are Edit profile (disabled, Coming soon), Calendar, and Sign out ("Signing out..." while busy).
- `AppShell.tsx` renders `ProfileMenu` in the top bar. The sidebar Log out button and `LogoutIcon` were removed. The styles are in `styles/dashboard.css`, and on screens ≤ 64rem the panel aligns left.

## Progress (October 24, 2026)

- Branch: `feature/SCRUM-115-profile-signout-session`, created from `development` at `23ac3d1`. Commit `4e3c5cb` is pushed to GitHub and Bitbucket.
- Commits:
  - `a2b01b6`: required names
  - `11e8927`: ignore `.venv312`
  - `0acca10`: rotation and reuse detection
  - `2ecee95`: restore dedupe and lock
  - `f03ed7a`: signOut and reason
  - `d13c651`: sign-out across tabs
  - `e101456`: refresh timer
  - `3085118`: profile menu
  - `4e3c5cb`: AI reports in `docs/ai-dev-reports/`
- Verified: full local check passed (561 backend tests, 231 frontend tests, system checks, migrations, lint, and build). GitHub Actions passed on `4e3c5cb`. After fetching Bitbucket `development`, it was already an ancestor of the task branch, so no rebase was needed.
- Remaining:
  1. Browser checks:
     - the menu, Escape, and phone width
     - sign-out message
     - offline sign-out
     - sign up, then sign out, landing on the login card
     - two-tab sign-out
     - reload 5× and stay signed in
     - with `ACCESS_TOKEN_LIFETIME` temporarily set to 90 s, a refresh about every 30 s. Don't commit that setting.
  2. Push this skill-file commit to GitHub and Bitbucket; confirm CI on the new branch tip before merge.
  3. Open a PR into `development` whose description:
     - maps each change to a criterion
     - lists the hardening extras separately
     - names the teammate test files that changed:
       - `CourseForm.test.tsx`, `TodoForm.test.tsx`, `TodoPanel.test.tsx`: mocks updated for the new `AuthContextValue` shape
       - `CourseDetailPage.test.tsx` (Sudin's): the mocked user now has names

## Pitfalls learned

- **StrictMode runs effects twice in development.** With single-use refresh tokens, two restore requests look like token reuse and can sign the user out everywhere. Always refresh through `sharedRefresh`.
- **Parallel refreshes from several tabs** have the same effect. Keep the refresh inside the `navigator.locks` lock.
- **`vi.mock("../api/auth")` does not intercept calls within the same module.** For example, `restoreSession` calls `refreshAccessToken` internally. Stub `fetch` and count the requests instead.
- **jsdom has no `navigator.locks`.** Add it with `Object.defineProperty(navigator, "locks", { value, configurable: true })` and remove it in `afterEach`. `BroadcastChannel` *is* available in Vitest and delivers messages between instances, so two `AuthProvider`s can act as two tabs.
- **Timer tests:** use `vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })`, `act(() => vi.advanceTimersByTimeAsync(ms))`, and `getBy*` queries (avoid `findBy*` under fake timers).
- **Forged-token tests must use a well-formed token signed with a different key** (`jwt.encode(payload, other_key)`, with a key of 32+ bytes to avoid PyJWT's warning). A reversed signature is malformed and passes even without signature verification.
- **Tests that build a full fake `useAuth()` value** (`vi.mocked(useAuth).mockReturnValue({...})`) break when `AuthContextValue` changes. Tests that render `App` with a loose user mock need `first_name` and `last_name`, because `ProfileMenu` trims them.
- **Mutation checks:** keep the backup inside the scratch folder. A backup written to `/tmp` caused mutations to stack on top of each other.

## Commands

- Frontend: `cd frontend && npm run lint && npm test && npm run build`. One lint warning, `only-export-components` on `useAuth`, was there before.
- Backend: start Docker Desktop, then run `backend/.venv312/Scripts/python.exe scripts/check.py --component backend --suite identity-courses`. Use `--component backend` to run everything. The system Python is 3.11 and the tests need 3.12, which is `.venv312` (git-ignored).
- Scratch verification: copy the tracked files into the session scratchpad and junction `frontend/node_modules` into it. A scratch backend copy lacks `processing_service`, so the 7 `test_worker_integration.py` errors there are expected.

## Team Git workflow (Sprint 2)

Strategy: rebase + pull request + squash fast-forward merge. Each Jira task becomes one commit on the integration branch, and the task branch keeps its individual commits for grading.

- **Branch naming:** the workflow document says "dev", but the repository branch is named `development` (`origin/development`). Use `development` in commands.
- No domain branches. Each Jira task has its own branch, created from the latest `development`, for example `feature/SCRUM-115-profile-signout-session`.

Steps:

1. **Create the task branch:** pull the latest `development`, then branch from it (never from `main`).
2. **Work and commit:** commit regularly, with each commit representing meaningful progress. Commit message format: `feat(SCRUM-115): ...` (or `fix`, `test`, `style`, `docs`, `refactor`). Do not squash locally.
3. **Rebase before the PR:** run `git fetch origin`, then `git rebase origin/development`. Resolve conflicts locally and re-run tests. Never rebase `development` onto a task branch.
4. **Push:** push the task branch. If a rebase rewrote commits that were already pushed, use `git push --force-with-lease`, and only on your own task branch. Never force-push `development` or `main`.
5. **Pull request:** open a PR from the task branch into `development`, assign reviewers, and have teammates review the commits, code, and AI reports. If `development` changes before the merge, rebase again and push.
6. **Merge:** after approval, use the Bitbucket strategy **Squash, fast forward**. Edit the squash message to contain the Jira ID and task name, for example `SCRUM-115: User profile menu, secure sign-out, and persistent authentication`.
7. **Keep the task branch** after merging. Do not delete it.

Rules:

- Never commit or push directly to `development`.
- Every PR must be reviewed before merging.
- The task owner chose a separate final report commit. The AI curiosity report and grade are under `docs/ai-dev-reports/`, labeled with the Jira ID, and were committed in `4e3c5cb`.

Flow: `development → task branch → commits → rebase onto development → push → PR → review → squash fast-forward merge → development`.

## Build verification: push to GitHub first, then Bitbucket

Remotes in this clone:

- `github`: `github.com/sudinkatuwal7/studyforge-ci`. GitHub Actions CI runs here.
- `origin`: `bitbucket.org/mth115_super/studyforge`. This is the team's main repository, where PRs are opened.

```bash
git push github feature/SCRUM-115-profile-signout-session
# Check GitHub -> Actions; confirm the build and tests pass
git push origin feature/SCRUM-115-profile-signout-session
```

- After a rebase, both remotes need `--force-with-lease` if the branch was pushed before.
- CI (`.github/workflows/ci.yml`) runs on pushes to `feature/**`, `chore/**`, `development`, and `main`:
  - Backend: Python 3.12 with a pgvector Postgres service, running `python scripts/check.py --component backend --database service`.
  - Frontend (in `frontend/`): `npm ci`, `npm run lint`, `npm run test:ci`, `npm run build`.

## Prior context

This skill was previously `scrum-113-polish-login-ui` (SCRUM-113, merged in PR #70), and before that `scrum-99-course-document-authorization`. Their notes are in git history: SCRUM-113 at commit `23ac3d1`, path `.claude/skills/scrum-113-polish-login-ui/SKILL.md`, and SCRUM-99 at commit `3b087a0`.
