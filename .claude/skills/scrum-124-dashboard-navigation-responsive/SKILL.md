---
name: scrum-124-dashboard-navigation-responsive
description: Shared context for SCRUM-124 (dashboard home base, main navigation, responsive layouts, empty states) in StudyForge, covering the agreed acceptance criteria, team decisions (course section URLs and ?pandu, history rules, last opened course and quick links, /courses and /tasks pages, per-account keys), the as-built architecture, the test approach, pitfalls, follow-up tickets, and the Sprint 2 Git workflow with the GitHub-Actions-then-Bitbucket push procedure. Use when working on App routing, AppShell navigation, DashboardPage, QuickLinks, CourseDetailPage, CourseWorkspace, CoursesPage, TasksPage, empty states, dashboard.css or course-workspace.css, or when committing, pushing, rebasing, or opening a PR for this task.
---

# SCRUM-124: Dashboard, navigation and responsive layouts

## Purpose

Keep durable task context available to the user and teammates across sessions. Guide implementation and explain the reasoning as work proceeds. This file is not proof that an implementation decision is approved or that code is complete.

## Start and end each session

1. Read this file and the latest SCRUM-124 acceptance criteria. The Jira issue is the source of truth if it conflicts with notes here.
2. Inspect the active branch, working tree, and current code before editing. The owner often commits or applies steps ahead of the plan, so check `git status`, `git log` and `git diff` first and build on what is there.
3. Follow the working style below.
4. At session handoff, add newly learned durable, task-relevant context here: clarified criteria, agreed decisions, repository discoveries, pitfalls, and verified progress. Exclude secrets, tokens, personal data, and transient conversation details. **Keep task notes in this file, not in a separate memory file.**

## Working style (confirmed by the task owner; last updated November 15, 2026)

- **For SCRUM-124 the owner asked for the changes to be applied** (unlike SCRUM-123, where code was given in chat only).
- **Flow (owner's choice, kept after considering a plan-first, file-by-file loop):** build the whole step, run targeted tests while working, then the full suite, `tsc -b` and lint at the end. Then put **each changed file's code in chat one by one** (new files in full, edits as diffs, tests summarised by what they check) so the owner can ask about any of it. Do not stop for approval after each file.
- Raise genuine design choices as questions when they come up (with a recommendation), rather than deciding silently.
- Explain the why, and answer questions before moving on. Correct earlier statements plainly when they turn out to be wrong.
- Mutation checks for key behaviours: back up the file, mutate, run the tests, restore from the backup and **verify the hash**. Never use `git stash`/`git checkout` on the owner's working tree for this without asking.
- **The owner makes the commits.** Do not commit, and do not offer commit messages unless asked.
- **Scope:** point out anything beyond the acceptance criteria **before** doing it, and offer it as a separate Jira task.
- **The owner reviews closely and expects claims to be tested.** Say what a test does not show (jsdom has no CSS or layout).

## Jira task

- **SCRUM-124**, branch `feature/SCRUM-124-dashboard-navigation-responsive`. Code review: Gaurav (runs the branch locally, records a short walkthrough in `docs/`, requests changes before approving); then squashed into the integration branch (confirm the target with Gaurav).
- Scope: dashboard as home base (courses, upcoming to-dos and study sessions, quick links to Pandu, notes and quizzes); shared navigation with a mobile menu; responsive courses, documents, Pandu, notes, quizzes and calendar; empty states with a next step.

### Acceptance criteria

Numbering (changed November 15, 2026): 1–5 are the **original Jira criteria, word for word** (Jira cannot be edited), each with the interpretation agreed with the owner. 6–13 are the criteria added with the owner. Earlier notes and the SCRUM-124 curiosity report used an older numbering (added criteria were 2–5 and 10–13; Jira's were 1 and 6–9).

**Original (Jira)**

1. After login, the dashboard shows the student's courses, upcoming to-dos and study sessions.
   - Agreed: opening `/` while signed in shows the courses, pending to-dos, and to-dos and study sessions in the next 7 days (today and the next 6), soonest first.
2. Every major feature can be reached from the navigation on every page.
   - Agreed: Dashboard, Courses, Tasks and Calendar are in the main nav on every signed-in page; the current item is highlighted; Courses is highlighted inside a course. Materials, Notes, Quizzes and Pandu are course sections reached from within a course.
3. Navigation collapses into a mobile menu on small screens.
   - Agreed: at 1024px wide or less the nav becomes a drawer; Esc, backdrop and navigation close it; focus is trapped and returned.
4. All major pages are usable at phone, tablet and desktop widths without horizontal scrolling.
   - Agreed: checked at 375, 768 and 1440px for the dashboard, Courses, every course section including Pandu, Tasks and Calendar; no horizontal scrolling or cut-off content.
5. Empty states show a helpful message and an action.
   - Agreed: covers courses, to-dos, upcoming, calendar, and the course Materials, Notes and Quizzes; loading and error states look different from empty ones.

**Added (agreed with the owner)**

6. Opening a course records it as the student's last opened course.
7. With a last opened course, the dashboard shows its name and links to its Materials, Notes, Quizzes and Pandu; each opens that course with that section showing.
8. With no last opened course (or it was deleted / is no longer theirs), the quick links show the course list to choose from, or "Create your first course" when there are none.
9. Each course section has its own URL; reload, sharing and Back/Forward keep it.
10. Section and Pandu open/closed state are in the URL; reload restores both.
11. Each section switch and each Pandu open/close adds a history entry; Back/Forward restore section and Pandu at every width without losing the Pandu conversation or an in-progress quiz.
12. A bare or unknown course section URL redirects to Materials without adding a history entry.
13. Switching sections does not reset an in-progress quiz or note generation.

Out of scope: standalone Notes/Quizzes/Pandu pages across courses; course deletion (owner will add it on a later ticket).

## Team decisions (November 2026)

- **Pandu, Notes, Quizzes, Materials, Tasks are course workspace sections**, reached from inside a course. Main nav is **Dashboard, Courses, Tasks, Calendar** ("Home" was renamed "Dashboard").
- **URL shape:** `/courses/:courseId/:section?pandu=open|closed`, section ∈ `materials | notes | quizzes | tasks` (path), Pandu in the query. No `?pandu` → breakpoint default (open on desktop, closed at ≤64rem), computed once at mount. Unknown `?pandu` values are ignored.
- **History:** section switch = push; **every Pandu toggle = push at every width** (owner's choice, so Back restores the previous view); section switch keeps `?pandu`; clicking the current tab adds nothing; bare/unknown section = `replace` redirect.
- **Quick links use the last opened course**, saved in `localStorage` under `studyforge:lastCourse:<userId>` (only the ID; per account; survives closing the browser). Saved only after a course loads successfully; forgotten on 404 only (not 500/401) and only if it is still the saved ID. Picking in the picker sets the quick-links course **without navigating**. Ask Pandu → `/courses/:id/materials?pandu=open`.
- **Missing saved course:** generic message "Your last opened course is no longer available." (owner chose generic over storing the name), shown with the picker or the create-first-course action, for that visit only.
- Kept as is (owner): quick links wait for the course list before showing links (brief loading), and do not live-update from other tabs.
- **Per-account reset:** `DashboardPage`, `CoursesPage` and `TasksPage` are keyed by `user.id` in `App`; `QuickLinks` also re-reads storage when `userId` changes (render-time "previous value" pattern, like `previousUser` in `App`). Today a user switch always goes through `user = null` (the only cross-tab message is session-ended), so this is defensive.
- **`/courses` page title is the top bar `<h1>` "My Courses"** (option A): no duplicate page heading; the nav item stays "Courses". Only one `<h1>` per page (the top bar).
- **"+ New" and "Create your first course" are buttons** that call `focusCourseForm()` (scroll smoothly unless reduced motion, then focus `#course-name`; no URL/history change), not `#course-name` anchors.
- "← My courses", "Return to my courses" and the calendar's "Create a course" go to `/courses`; the dashboard banner "View my tasks" goes to `/tasks`. Old `/#courses` and `/#tasks` still land on the dashboard (anchors kept).

## Architecture (as built)

- `App.tsx`: signed-in routes `/` (Dashboard, keyed), `/courses` (CoursesPage, keyed), `/tasks` (TasksPage, keyed), `/courses/:courseId/:section?` (CourseDetailPage), `/calendar`, `*` not-found.
- `components/courses/courseSections.ts`: section list, `isCourseSection`, `coursePath(id, section = "materials")`.
- `pages/CourseDetailPage.tsx`: validates `section` (else `<Navigate replace>` keeping `search`), key `${courseId}:${userId}` (**no section**, so the workspace stays mounted), loads the course, saves/forgets the last course, maps 404/401/other to messages.
- `components/courses/CourseWorkspace.tsx`: tab from the `section` prop, `showSection` → `navigate` (push, keeps search), Pandu from `useSearchParams`, `toggleAssistant` → `setSearchParams` (push). Hidden panels stay mounted.
- `components/courses/lastCourse.ts`: `readLastCourse`, `saveLastCourse`, `forgetLastCourse` (all try/catch).
- `components/courses/focusCourseForm.ts`: shared create-course shortcut.
- `components/dashboard/QuickLinks.tsx`: props `courses | null`, `loadFailed`, `userId`; state `chosenId`, `picking`, `chosenFor`; derived `course`, `stale`, `showLinks`; effect forgets a stale ID.
- `components/courses/CourseList.tsx`: new `onLoadFailed` so the dashboard's quick links stop "Loading" on failure. `DashboardPage` passes stable `useCallback` handlers.
- `components/dashboard/AppShell.tsx`: `onDashboard / onCourses (/courses or /courses/*) / onTasks / onCalendar`; `pageTitle`: `/courses/*` → "Course", `/courses` → "My Courses", `/tasks` → "Tasks".
- `pages/CoursesPage.tsx` (toolbar hint + "+ New", CourseList, CourseForm), `pages/TasksPage.tsx` (TodoPanel).
- CSS in `styles/dashboard.css`: `.quick-links*`, `.courses-toolbar`, `.link-button`; quick-link grid 4 columns, 2 at ≤64rem.

## Backend facts relied on

- Every course-scoped endpoint returns **404, never 403**, for another student's course (`get_object_or_404(..., owner=request.user)` / `apps/identity/ownership.py`); notes and quizzes check the course before validating the body. Pinned by `apps/courses/tests.py::test_other_students_course_is_hidden_like_a_missing_course` (identical bodies).
- 404 bodies differ by app (DRF `detail`, documents `RESOURCE_NOT_FOUND`, router HTML for non-integer IDs); the frontend reads only the status.

## Tests

- `CourseWorkspace.test.tsx`: renders through a real route with an `AddressProbe` (URL + Back/Forward); URL state, desktop and narrow history walks, Pandu messages survive history, criterion 13 (quiz answers/current question; note generation not aborted; `getQuiz`/`getNotes` never called).
- `CourseDetailPage.test.tsx`: redirects without history entries; 403/500/401 messages and no workspace; workspace not remounted on section change (page level — the workspace-level tests alone missed a key mutation); last course saved/forgotten/kept.
- `QuickLinks.test.tsx`, `lastCourse.test.ts`, `focusCourseForm.test.ts`, `DashboardPage.test.tsx` (quick links with real CourseList; both shortcuts focus the real form), `AppShell.test.tsx` (nav order, hrefs, single highlight and title per path), `App.dashboardAccount.test.tsx` (pages remount per account; `/#tasks`; not-found link), `CoursesPage.test.tsx`, `TasksPage.test.tsx`.
- jsdom does not load CSS or do layout: widths, drawer visuals and Pandu covering content on phones are browser checks.

## Pitfalls learned

- **Run Vitest from PowerShell (or a `C:\` path).** From Git Bash the `c:` vs `C:` drive letter loads Vitest twice: "Vitest failed to find the current suite".
- `CourseDetailPage.test.tsx > opens the selected course, uploads…` sometimes times out (~5.0s) under full-suite load; it does the same on the original code and passes alone.
- Long Python heredocs in Git Bash can fail to parse; write the script to the scratchpad and run it.
- Line endings are mixed (some files LF, some CRLF); check with Python byte counts before `sed` edits, and keep each file consistent.
- Mocks of `../api/courses` must keep the real exports (`NotLoggedInError`), or `CourseList`'s `instanceof` check breaks on failures.
- Earlier tasks: restore after each mutation and verify the restore; untracked files are not restored by `git checkout --`; a test can pass without being able to fail; `react(immutability)` lint fires on test probes that write module variables during render (existing pattern, warnings only).

## Known limits (accepted so far)

- Refresh during a quiz or note generation restores the section and Pandu state, not the in-progress work.
- Not-found pages show the top-bar title "Dashboard" while no nav item is highlighted (one-line fix if wanted).
- `.new-link` periwinkle `#7387e8` on white is about 3.4:1 contrast (pre-existing); candidate fix `#4f63c9` in the responsive/empty-states pass.

## Follow-up tickets (suggested; the owner creates them)

1. Course deletion (owner plans it): after a successful delete call `forgetLastCourse(userId, courseId)` and test the picker fallback.
2. Playwright end-to-end tests: real widths, drawer, Pandu on phones, reload, two tabs.
3. Backend cleanup: one `get_owned_course` in `apps/identity/ownership.py` (copies in notes and quizzes selectors); consistent 404 bodies.
4. Optional: store the course name to name it in the "no longer available" message; live-update quick links across tabs via the `storage` event.

## Progress (November 15, 2026)

- Committed by the owner: `a797042` feat(SCRUM-124): add URL routes for course sections and Pandu state.
- Done, **uncommitted**: last opened course + dashboard quick links (with missing-course message and per-account fix); `/courses` and `/tasks` pages and nav; "My Courses" title; `focusCourseForm` shortcuts; empty states; Upcoming list; compact-calendar empty state (all below). Last full run: 535/536 tests (the one failure is the known slow upload test), `tsc -b`, lint (no new warnings), build.
- **Empty states (criterion 5) as built:** shared `components/shared/EmptyState.tsx` (message + actions, CSS `.empty-state*` in `styles/index.css`) and `revealAndFocus.ts` (smooth scroll unless reduced motion, then focus; `focusCourseForm` uses it). Courses → "Create a course" (focus form); to-dos → "Add your first task" (focus title) or, with no courses, "Create a course" → `/courses`; course Tasks tab → "Add a task" → `/tasks`; Calendar → "Plan a study session" (focus session title; named to avoid "Add study session" submit) + "Add a task with a due date" → `/tasks`, or "Create a course" with no courses; Materials → "Upload your first material" (focus Choose files); Notes/Quizzes → "Go to Materials" (keeps `?pandu`). **Fixed:** Notes/Quizzes showed the empty message while materials loaded or after an error — `CourseMaterials` now reports `MaterialsLoadState` (`onLoadStateChange`) through the workspace to `MaterialPicker`.
- This skill was renamed from `scrum-123-landing-page` with `git mv` (uncommitted).
- **Upcoming list (criteria 1 and 5) — built, owner's decision (November 15, 2026):** an Upcoming list was removed on purpose in SCRUM-104 (`eb2140f`, PR #81, approved by Gaurav and Sanish). The owner chose to bring it back because SCRUM-104 was the previous sprint and this sprint's criteria (especially 1–5, in the old numbering) must be met. **Mention this in the PR description so reviewers know it is intentional.** As built: `components/dashboard/UpcomingList.tsx`; `getUpcomingEvents(events, today, days?)` with `UPCOMING_DAYS = 7` in `calendarEvents.ts` (today + next 6 days; overdue and completed excluded); `addDaysToDate` in `calendarDates.ts` (UTC arithmetic). The "Upcoming" stat card counts the same window. Shows "Today"/"Tomorrow"/"Wed, Oct 21", `HH:MM` for timed sessions, type in words + course name. Loading, a sessions-failed note ("only tasks are shown"), and the empty state "Nothing due in the next 7 days." + "Add a task" (`/tasks`) and "Plan a study session" (`/calendar`). Placed in the main column after the quick links.
- Done: the dashboard compact calendar shows "No dated tasks or study sessions yet." + "Plan a study session" → `/calendar`, only once **both** to-dos and sessions have loaded, and not after a sessions error.
- **Contrast fix:** new token `--periwinkle-text: #4f63c9` (5.30:1 on white, 5.00:1 on cream; old `#7387e8` was 3.30:1) used for text only: global `a`, `.course-card-action`, `.new-link`, and `.auth-page .link-button`. `--periwinkle` stays for outlines, fills and icons. **Not changed (flagged to owner):** global `button` is white text on `#7387e8` (3.30:1), affecting every primary button.
- Remaining:
  1. Browser check at 375/768/1024/1440 using the checklist given in chat (criteria 2–4 plus visual checks jsdom cannot do).
  2. Gaurav's review walkthrough in `docs/`, AI report under `docs/ai-dev-reports/`, push and PR (mention the Upcoming list's return).

## Commands

- Frontend (PowerShell): `cd frontend; npx tsc -b; npm run lint; npm test; npm run build`. Single file: `npx vitest run src/components/dashboard/QuickLinks.test.tsx`.
- Backend: start Docker Desktop, then `backend/venv/Scripts/python.exe scripts/check.py --component backend`.

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
git push github feature/SCRUM-124-dashboard-navigation-responsive
# Check GitHub -> Actions; confirm the build and tests pass
git push origin feature/SCRUM-124-dashboard-navigation-responsive
```

- CI (`.github/workflows/ci.yml`) runs on pushes to `feature/**`, `chore/**`, `development`, and `main`. Frontend: `npm ci`, `npm run lint`, `npm run test:ci`, `npm run build`. Backend: Python 3.12 with pgvector Postgres, `python scripts/check.py --component backend --database service`.

## Prior context

This skill was previously `scrum-123-landing-page` (SCRUM-123, merged in PR #90); its notes are in git history at commit `0c7ba84`, path `.claude/skills/scrum-123-landing-page/SKILL.md`. Before that: `scrum-114-google-sign-in` at `01053d9`, `scrum-117-responsive-app-layout` at `34d6fa6`, `scrum-115-profile-signout-session` at `fa5faf1`, `scrum-113-polish-login-ui` at `23ac3d1`, and `scrum-99-course-document-authorization` at `3b087a0`.
