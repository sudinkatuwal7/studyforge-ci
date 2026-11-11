---
name: scrum-123-landing-page
description: Shared context for SCRUM-123 (public landing page) in StudyForge, covering the team's decisions, the as-built routes and signed-out notice, SiteHeader and the Features scroll, the test approach (route, reload, Back/Forward, two-tab and address tests), pitfalls, follow-up tickets, and the Sprint 2 Git workflow with the GitHub-Actions-then-Bitbucket push procedure. Use when working on App routing, LandingPage, SiteHeader, AuthLayout, landing.css or auth.css, or when committing, pushing, rebasing, or opening a PR for this task.
---

# SCRUM-123: Landing page

## Purpose

Keep durable task context available to the user and teammates across sessions. Guide implementation and explain the reasoning as work proceeds. This file is not proof that an implementation decision is approved or that code is complete.

## Start and end each session

1. Read this file and the latest SCRUM-123 acceptance criteria. The Jira issue is the source of truth if it conflicts with notes here.
2. Inspect the active branch, working tree, and current code before editing. The owner often applies steps ahead of the plan, so check `git status` and `git diff` first and build on what is there.
3. Follow the working style below.
4. At session handoff, add newly learned durable, task-relevant context: clarified criteria, agreed decisions, repository discoveries, pitfalls, and verified progress. Exclude secrets, tokens, personal data, and transient conversation details.

## Working style (confirmed by the task owner; last updated November 11, 2026)

- **Provide code in chat; do not edit project source files** unless the task owner explicitly asks ("apply", "make the changes"). Applying on request is a one-off each time (in SCRUM-123 the owner asked once, for the three new test files).
- **One file per message, most important file first** (source before tests). Wait for "next" or a question before sending the next file. Keep each message self-contained (code, why, what's next).
- For each change, give the exact path and say whether it is a new file, a full replacement, or a named edit. Existing files are CRLF, so give small hand-applied edits rather than multi-line replacements.
- Explain the why, and answer questions before moving on.
- Verify code in a scratch copy before handing it over: lint, `tsc -b`, tests, and mutation checks of the key behaviors. A detached `git worktree` in the scratchpad with a junction to `frontend/node_modules` works; **delete the junction first** (`(Get-Item ...).Delete()`) before `git worktree remove --force`, so the real `node_modules` is never touched.
- **The owner makes the commits.** Do not commit, and do not offer commit messages unless asked.
- **Scope:** point out anything beyond the acceptance criteria **before** suggesting it, and offer it as a separate Jira task.
- **The owner reviews closely and expects claims to be tested.** Say what a test does not show, and do not describe a test as proving more than it does.
- When the owner's answer to an either/or question is just "yes", follow the established repository convention and say which option was taken.

## Jira task

- **SCRUM-123**, Sprint 3, parent SCRUM-102 (Landing Page, Dashboard and Responsive...). Priority Medium.
- Scope: public landing page at the site root for logged-out visitors; introduction, main features (Pandu, notes, quizzes, course management) and calls to action; sign-up and log-in buttons; logged-in users go to the dashboard; responsive.
- Acceptance criteria:
  1. Logged-out visitors see the landing page at the site root.
  2. The sign-up and log-in buttons open the correct pages.
  3. Logged-in users who visit the root are taken to the dashboard.
  4. The page is usable at phone, tablet and desktop widths without horizontal scrolling.

## Team decisions (November 2026)

- **Frontend only.** No backend changes.
- **Cards are routes:** `/login` and `/register` replace the old `authView` state, so the buttons are real links.
- **Deep links keep working:** a logged-out visitor at any other path (`*`, e.g. `/courses/5`) gets the login card at that URL, and the page opens after login.
- **Signed-in `/login` and `/register` redirect to `/` with `replace`.** Without the redirect, logging in on `/login` shows "Page not found"; without `replace`, Back gets stuck.
- **Signed-out notice at `/` (owner chose the recommended option):** when a session ends at `/` (sign-out, expiry, or another tab's broadcast), `/` shows the login card with the notice instead of the landing page. Implemented by recording `location.key` at the moment `user` becomes null (`sessionEndedAt`, set during render like `createdEmail`). Any navigation gives a new key and shows the landing page again; Back to that entry shows the notice again; reload shows the landing page. Do **not** key it on `signedOutReason` alone: that stays set until the next login and would trap the user away from the landing page.
- **Header "Features" is a link to `/#features`** (owner's choice). "For Teams" and "About" stay disabled "Coming soon" buttons (an `<a>` cannot be disabled, and a link to `/about` would hit the `*` login card).
- **Brand is not a link** (beyond scope; offered as a follow-up).
- **Hosting fallback** (`index.html` for `/login`, `/register`) goes in the PR description and is handled once the deployment workflow is decided.

## Architecture (as built)

- `App.tsx`: signed-out `<Routes>`: `/` → `showNoticeAtRoot ? loginCard : <LandingPage>`, `/login` → login card, `/register` → register card, `*` → login card. Signed-in routes add `/login` and `/register` → `<Navigate to="/" replace />`. `signInLock` and `createdEmail` still live in `App`, so the lock survives switching between the `/login` and `/register` routes. `onCreateAccount` / `onSignIn` call `navigate()`.
- `components/auth/SiteHeader.tsx`: shared signed-out header. Features is a `Link` (no chevron); pills are `NavLink`s, which add `aria-current="page"` only when active. Note: an `aria-current` **prop** on a `NavLink` is the value used *when active*, not a forced value.
- `components/auth/AuthLayout.tsx`: `SiteHeader` + hero + card + footer. The `headerActions` prop was removed.
- `pages/LandingPage.tsx`: introduction, `#features` section (4 cards in a `<ul>`), call to action ("Create a free account"), optional `footer`. Scroll effect: `getElementById(hash)?.scrollIntoView()` with deps `[hash, key]` — `key` makes a repeat click scroll, `hash` is required by exhaustive-deps and covers browser-made hash changes (whose key is `"default"`).
- `styles/landing.css`: builds on `.auth-page`. Feature grid uses fixed counts: 1 column, 2 from `40rem`, 4 from `68rem`. (`auto-fit` gave 3 + 1 between about 880 and 1180px.) `scroll-margin-top: 1.5rem` on the features section.
- `styles/auth.css`: three lines for links: `text-decoration: none` on `.auth-nav-item` and `.auth-pill`, `display: inline-block` on `.auth-pill`.

## Tests

- `pages/LandingPage.test.tsx` (7): sections, all link targets, no current pill on `/`, Features `href`, scroll on `/#features` and on repeated clicks (`scrollIntoView` faked on `Element.prototype`; `mock.contexts` checks the element).
- `App.landing.test.tsx` (50): mocked `useAuth` driven by a shared `auth` object; `BrowserProbe` records path, hash and `location.key` and gives Back/Forward via `navigate(-1/1)`. Groups: signed out, signed in, notice at `/`, reload (`isRestoring` then result), signed-in pages, Back/Forward (including `browser.key === "default"` to prove Back is not stuck), capitals and trailing slashes.
- `App.twoTabs.test.tsx` (4): two real `AuthProvider` + `App` trees under `StrictMode`, each with its own `MemoryRouter`, connected by Node's real `BroadcastChannel`, with a shared fake `fetch`. **Simulated in jsdom, not real browser tabs.**
- `App.recoveryEmail.test.tsx`, `App.signInLock.test.tsx`: now start at `/login` and find the header pills as links.
- React Router matching is case-insensitive and ignores trailing slashes; `NavLink` matches the same way. A case-sensitive signed-out `/login` route is an equivalent mutant (falls through to the `*` login card).
- jsdom does not load CSS or do layout: layout, pill styling and real scrolling are browser checks.

## Pitfalls learned

- **Restore after each mutation, and verify the restore.** One run copied the backup to a different path, so mutations piled up and the results were invalid.
- **Untracked files are not restored by `git checkout --`.** Back them up explicitly.
- **perl/sed on CRLF files:** patterns with `\n` silently fail; use `\r?\n` and check the diff.
- **Equivalent mutants pass for a reason:** investigate before calling it a test gap (e.g. `NavLink` `aria-current` prop, case-sensitive `/login`).
- **Duplicate text in queries:** the sidebar also says "Dashboard", so stubs use unique text ("Dashboard page").
- **`react(immutability)` lint:** test helpers that write to module variables must do it in `useEffect`, not during render.
- **`git fetch origin github`** treats `github` as a branch name; fetch each remote separately.
- Carried from SCRUM-114: a test can pass without being able to fail; `rerender` with the same element does nothing; PowerShell `Get-Content`/`Set-Content` can corrupt UTF-8.

## Known limits (accepted)

- The notice at `/` disappears on reload (state is not persisted, as before).
- On deep links such as `/courses/5`, neither header pill is marked current.
- Phone widths (48rem and under) hide the header nav, including Features; visitors scroll to the features.
- Scroll is instant (no smooth animation), which respects reduced motion without extra code.
- Disabled "For Teams" and "About" are not focusable, and their `title` may not be announced (pre-existing).

## Follow-up tickets (suggested; the owner creates them)

1. Playwright end-to-end tests: two real tabs, reload, responsive widths.
2. "For Teams" and "About": link when pages exist, or remove.
3. Make the header brand a link to `/`.
4. Hosting SPA fallback once the deployment workflow is decided.
5. Existing from SCRUM-114: tabs can show different accounts after one tab logs back in; email case; npm audit; link Google / password reset.

## Progress (November 11, 2026)

- Branch `feature/SCRUM-123-landing-page`, rebased on `origin/development` at `d47469f` (PR #88). Commits: `e9efb0a` feat(SCRUM-123): add public landing page and auth routes; `97bd0ef` test(SCRUM-123): cover auth navigation and session flow. (`App.landing.test.tsx` and `LandingPage.test.tsx` landed in the feat commit; the owner may reorder.)
- Local checks: 430 frontend tests (61 new), `tsc -b`, lint (only the four older warnings: `AuthContext.tsx`, two in `CalendarMonth.tsx`, `CourseTasks.tsx`), `vite build`.
- Pushed to `github` at `97bd0ef`; the owner reported GitHub Actions passed. **Not yet on Bitbucket.**
- Browser check: the owner reported all 17 items passed (layout at 375/768/1024/1280, header styling, Features scrolling incl. reload, login/Back, sign-out notice and reload, signed-in `/login`, deep link, `/LOGIN` and `/login/`, Google sign-in from both cards, two real tabs).
- The PR description was drafted in chat (criteria table, behavior notes, tests, 17 browser results, deployment note, follow-ups).
- Remaining:
  1. Optionally reorder test files between the two commits (then `--force-with-lease` to `github`).
  2. AI report under `docs/ai-dev-reports/` labeled SCRUM-123, plus this skill's move, in a separate final commit.
  3. Push to `github`, confirm CI, then push to `origin` (new branch there).
  4. Open the PR into `development` with reviewers; squash message `SCRUM-123: Landing page`.
  5. Create the follow-up tickets.

## Commands

- Frontend: `cd frontend && npx tsc -b && npm run lint && npm test && npm run build`. Single file: `npx vitest run src/App.landing.test.tsx`.
- Backend (not changed by this task): start Docker Desktop, then `backend/venv/Scripts/python.exe scripts/check.py --component backend`.

## Team Git workflow (Sprint 2, still in use)

Strategy: rebase + pull request + squash fast-forward merge. Each Jira task becomes one commit on the integration branch, and the task branch keeps its individual commits for grading.

- **Branch naming:** the workflow document says "dev", but the repository branch is `development` (`origin/development`). Task branches are `feature/SCRUM-<id>-<short-description>`, created from the latest `origin/development` (never from `main`).
- Work and commit regularly, each commit a meaningful step. Do not squash locally.
- **Rebase before the PR:** `git fetch origin`, then `git rebase origin/development`. Re-run tests. Never rebase `development` onto a task branch.
- **Push:** after a rebase rewrote pushed commits, `git push --force-with-lease`, only on your own task branch. Never force-push `development` or `main`.
- **PR** into `development` with reviewers. If `development` changes before the merge, rebase again and push.
- **Merge:** Bitbucket **Squash, fast forward**, message `SCRUM-<id>: <task name>`. Keep the task branch.
- Never commit or push directly to `development`; every PR must be reviewed. The AI curiosity report and grade go under `docs/ai-dev-reports/`, labeled with the Jira ID, in a separate final commit.

## Build verification: push to GitHub first, then Bitbucket

- `github`: `github.com/sudinkatuwal7/studyforge-ci`, where GitHub Actions CI runs.
- `origin`: `bitbucket.org/mth115_super/studyforge`, the team's main repository, where PRs are opened.

```bash
git push github feature/SCRUM-123-landing-page
# Check GitHub -> Actions; confirm the build and tests pass
git push origin feature/SCRUM-123-landing-page
```

- CI (`.github/workflows/ci.yml`) runs on pushes to `feature/**`, `chore/**`, `development`, and `main`. Frontend: `npm ci`, `npm run lint`, `npm run test:ci`, `npm run build`. Backend: Python 3.12 with pgvector Postgres, `python scripts/check.py --component backend --database service`.

## Prior context

This skill was previously `scrum-114-google-sign-in` (SCRUM-114, merged in PR #83); its notes are in git history at commit `01053d9`, path `.claude/skills/scrum-114-google-sign-in/SKILL.md`. Before that: `scrum-117-responsive-app-layout` at `34d6fa6`, `scrum-115-profile-signout-session` at `fa5faf1`, `scrum-113-polish-login-ui` at `23ac3d1`, and `scrum-99-course-document-authorization` at `3b087a0`.
