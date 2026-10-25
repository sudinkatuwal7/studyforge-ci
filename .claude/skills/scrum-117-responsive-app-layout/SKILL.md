---
name: scrum-117-responsive-app-layout
description: Shared context for SCRUM-117 (responsive application layout: sidebar navigation, header, profile menu, course navigation, collapsible AI Assistant panel) in StudyForge, covering the team's decisions, the as-built drawer and Pandu view-swap architecture, accessibility and focus rules, test approach, pitfalls, and the Sprint 2 Git workflow with the GitHub-Actions-then-Bitbucket push procedure. Use when working on AppShell, CourseWorkspace, dashboard.css or course-workspace.css, the mobile drawer, the Pandu toggle, or when committing, pushing, rebasing, or opening a PR for this task.
---

# SCRUM-117: Responsive application layout

## Purpose

Keep durable task context available to the user and teammates across sessions. Guide implementation and explain the reasoning as work proceeds. This file is not proof that an implementation decision is approved or that code is complete.

## Start and end each session

1. Read this file and the latest SCRUM-117 acceptance criteria. The Jira issue is the source of truth if it conflicts with notes here.
2. Inspect the active branch, working tree, and current code before editing. The owner often applies steps themselves ahead of the plan, so check `git status` and `git diff` first and build on what is there.
3. Follow the working style below.
4. At session handoff, add newly learned durable, task-relevant context: clarified criteria, agreed decisions, repository discoveries, pitfalls, and verified progress. Exclude secrets, tokens, personal data, and transient conversation details.

## Working style (confirmed by the task owner; last updated October 24, 2026)

- **Provide code in chat; do not edit project source files** unless the task owner explicitly asks ("apply", "make the changes"). Applying on request is a one-off each time.
- **One file per message, most important file first** (source before tests). Wait for "next" or a question before sending the next file. Keep each message self-contained (code, why, what's next).
- For each change, give the exact path and say whether it is a new file, a full replacement, or a named edit.
- Explain the why: React state and effects, accessibility, CSS layout, tests. Answer questions before moving on.
- End each step with a suggested commit message. On this branch the owner uses `SCRUM-117 Verb phrase` (for example `SCRUM-117 Swap course content and Pandu on small screens`).
- **Scope:** point out anything beyond the acceptance criteria **before** suggesting it, and offer it as a separate Jira task.

## Jira task

- **SCRUM-117**, Sprint 2, assignee Nischal Rimal.
- Description: Build a responsive React application layout with sidebar navigation, header, profile menu, course navigation, and a collapsible AI Assistant panel.
- Acceptance criteria:
  - Dashboard and course pages share the same layout.
  - Navigation and profile access work.
  - AI panel can collapse and expand.
  - Layout works on desktop and mobile.
- Starting point: most of the shell already existed from SCRUM-103 (Aashish, course workspace) and SCRUM-115 (Nischal, profile menu). This task finishes and fixes that work rather than rebuilding it.

## Team decisions (October 24, 2026)

- **One small-screen breakpoint: 64rem (1024px).** Phones, tablets (iPad portrait and regular iPad landscape), and zoomed desktops all get the drawer and the Pandu view swap. Tablets were included deliberately: side by side leaves only ~410px for course content at 768px. Put this in the PR description.
- **Navigation on small screens: hamburger drawer.** The header (menu button, title, profile menu) is always visible. This fixed a SCRUM-103 rule that hid the header, and with it the profile menu, on course pages below 64rem.
- **Pandu on small screens: view swap, not a modal overlay.** Course content *or* Pandu fills the workspace; the app header and course title stay visible. A true overlay was rejected because it needs a modal focus trap across `AppShell` and `CourseWorkspace`, hides navigation and the profile menu, and requires editing `CourseChat` (Sudin's, SCRUM-75).
- **Pandu starts collapsed below 64rem and open above it.** Resizing never changes the user's open/closed choice; only the layout follows.
- **Toggle label follows the ARIA disclosure pattern:** fixed visible text "AI Assistant" plus `aria-expanded`, with a chevron (up when open, down when closed, matching ProfileMenu). The name does not change between states, which also satisfies WCAG 2.5.3 (Label in Name).
- **Backend health on phones (≤40rem):** the routine "Backend connected." status is hidden; a backend error stays visible on its own header row.
- **Menu button is 2.75rem** (44px touch target).

## Open items to raise with teammates

- **Aashish (SCRUM-103):** his compact course layout in `course-workspace.css` (stacked 55/45 rows, row-style sidebar, hidden header) was replaced.
- **Sudin (SCRUM-75, real chat):** keep the real chat mounted inside `#course-assistant`; never render it conditionally on whether Pandu is open, or hiding would cancel a streaming reply. Pandu's `aria-live` log is not announced while hidden, so consider a "new reply" indicator on the toggle.
- **Team / PO:** should Pandu appear outside course pages (dashboard, calendar)? What does "course navigation" mean (a per-course list in the sidebar)?

## Architecture (as built)

### `components/dashboard/AppShell.tsx`
- **Drawer state is the location key it was opened on:** `navOpenAt` holds `useLocation().key`; `navOpen = navOpenAt === key`. Any navigation (link, Back, `navigate()`) produces a different key, so the drawer closes in the same render as the new page, with no effect and no flash. React Router gives every push and replace a fresh key (`createLocation` falls back to `createKey()`), and a link to the current URL becomes a replace, so it also closes.
- **Render-time reset:** `if (navOpenAt !== null && navOpenAt !== key) setNavOpenAt(null)`. History entries keep their keys, so without this, Back to the page the drawer was opened on would reopen it. Same "adjust state during render" pattern as `App.tsx`'s `authView`.
- The menu button toggles (`setNavOpenAt(navOpen ? null : key)`), because `aria-expanded` promises that a second press collapses.
- While open: `<main inert>`, the sidebar gets `role="dialog"`, `aria-modal`, `aria-label="Navigation"`, and the shell's `onKeyDown` handles Escape and wraps Tab between the first and last sidebar links.
- **Focus effect** (keyed on `navOpen`): on open, reset `returnFocusOnClose = true` and focus the brand link; on close, focus the menu button only if `wasNavOpen && returnFocusOnClose`. It runs after the re-render, when `inert` is already gone.
- **Resize to desktop:** a `matchMedia("(min-width: 64.0625rem)")` change listener sets `returnFocusOnClose = false` and closes the drawer, so the page is not left inert and focus stays on the (now visible) sidebar link. The flag is reset on open, not on close, because a resize while closed calls `setNavOpenAt(null)` without re-rendering.
- The backdrop is the last child (so it never takes a desktop grid cell), `aria-hidden`, and closes on click.

### `components/courses/CourseWorkspace.tsx`
- `assistantOpen` uses a lazy initializer: `!window.matchMedia?.(compactQuery).matches` (`compactQuery = "(max-width: 64rem)"`). jsdom has no `matchMedia`, so tests start open without mocking.
- One toggle `<button>` for all widths, placed **after** the course content in the DOM so Tab order matches the visual order when it floats bottom-right. `onClick` toggles and then calls `toggleRef.current?.focus()` (iOS Safari does not focus buttons on tap).
- Pandu's wrapper `#course-assistant` uses `inert={!assistantOpen}`, **not** `hidden`: the file's `.course-workspace [hidden] { display: none !important }` would destroy the scroll position. The chat stays mounted, so drafts, messages, and a pending reply survive.
- **Focus rescue:** while Pandu is open, a `matchMedia(compactQuery)` change listener moves focus to the toggle if it was inside the course content (`contentRef`), which becomes hidden in the view swap. Example: rotating an iPad Pro from 1366px to 1024px.

### `styles/dashboard.css` (≤64rem)
- The sidebar becomes a fixed drawer: `transform: translateX(-100%)` plus `visibility: hidden` (removes closed links from Tab and screen readers; visibility flips at the end of the slide-out and the start of the slide-in). `z-index`: header 10, backdrop 20, drawer 30.
- `body:has(.app-shell-nav-open) { overflow: hidden }` locks page scroll. A sticky header with `html { scroll-padding-top: 5rem }` prevents focused elements being hidden under it (WCAG 2.4.11).
- `prefers-reduced-motion` removes the drawer transitions.

### `styles/course-workspace.css`
- `--toggle-row: 2.75rem` fixes the toggle row height so a hidden panel's box can match its open slot exactly. **Scroll positions are preserved because hidden panels keep their size:** `visibility: hidden` plus `position: absolute`, never `display: none`.
- Desktop collapsed: `.course-assistant[inert]` sits at `top: calc(var(--toggle-row) + .5rem)`, `width: max(20rem, calc((100% - 1.2rem) / 3))` (the open `minmax(20rem, 1fr)` column of a 2fr/1fr grid).
- ≤64rem open: grid areas `"toggle" "assistant"`; `.course-content` is hidden with `inset: 0`. ≤64rem collapsed: grid area `"content"`; the toggle floats (`position: absolute`, bottom-right, `z-index: 2`), and `.course-content-scroll` gets 4rem of bottom padding so the toggle never covers the last item.
- Absolutely positioned children whose grid area is missing from the current template are placed against the whole grid (`position: relative` on `.course-workspace-grid`).

### Breakpoint lives in four places
`dashboard.css` and `course-workspace.css` (`max-width: 64rem`), `CourseWorkspace.tsx` (`compactQuery`), and `AppShell.tsx` (`min-width: 64.0625rem`). Changing it means updating all of them; the tests cannot detect a mismatch.

## Tests

- `AppShell.test.tsx`: drawer open/close, `inert`, dialog role, Tab wrap, Escape, double-press toggle, closing on a nav link, **no reopen after Back** (`MemoryRouter` + a `BackButton` child calling `navigate(-1)`), backdrop, widening to desktop (focus stays on the sidebar link), and Escape still returning focus after a resize while closed.
- `CourseWorkspace.test.tsx`: tabs without refetching, collapse/restore, starting collapsed when narrow, **draft + conversation + a pending reply survive hiding** (waits for the 600ms demo reply while hidden; `toBe(message)` proves the textarea node was never remounted), focus returns to the toggle, focus rescue on resize (and not stealing focus from Pandu), and keeping the open/closed choice across resizes.
- `mockCompactScreen` / `mockDesktopScreen`: a stub `matchMedia` with a listener set; the returned `resize(next)` fires the real listener inside `act()`. Note AppShell's query is `min-width`, so `true` there means desktop.
- Mutation-checked: removing the render-time reset fails the Back test; moving the `returnFocusOnClose` reset out of the open branch fails the resize-while-closed test.

## Pitfalls learned

- **jsdom does not load CSS or calculate layout.** `toBeVisible()` only sees the `hidden` attribute and inline styles. Scroll positions, the floating toggle's position, and the visibility-based hiding of course content on phones can only be checked in a browser.
- **jsdom treats `inert` as an attribute only:** it does not block focus. Tests assert `toHaveAttribute("inert")` and rely on the browser to enforce it. Queries inside a hidden panel may need `{ hidden: true }`.
- **`fireEvent` does not do browser default actions:** a click does not focus, and a Tab keydown does not move focus. The drawer's Tab test passes because AppShell's own handler wraps focus.
- **`focus()` on a `display: none` element is silently ignored in browsers but works in jsdom.** Code that accidentally relies on that difference (as the drawer's resize close once did) passes or fails tests for the wrong reason; make the intent explicit with a flag.
- **`display: none` resets scroll positions.** Use `visibility: hidden` and take the element out of layout instead, keeping its box the same size.
- **Stub `matchMedia` with `addEventListener`/`removeEventListener`** whenever Pandu starts open or the drawer is tested; a `{ matches }`-only stub works only while the listener effect exits early.
- **`.course-workspace button:hover` has high specificity** `(0,3,1)`; restyled buttons inside the workspace need a matching hover rule or keep the default light style.

## Progress (October 24, 2026)

- Branch: `feature/SCRUM-117-responsive-app-layout`, created from `origin/development` at `fa5faf1` (SCRUM-115 merged in PR #73).
- Commits:
  - `185a405`: responsive shared navigation shell (drawer, header, a11y fixes)
  - `afa7f29`: collapsible course assistant
  - `cd578fb`: swap course content and Pandu on small screens
  - `8f93de6`: keep sidebar focus when the drawer closes on resize
  - `e2cb3ac`: drawer close-path and resize-focus tests
  - `1317f9e`: tidy comments, shared `compactQuery`
- Verified locally on `1317f9e`: 253 frontend tests, `tsc -b`, `vite build`, and lint (only the three older warnings in `AuthContext.tsx` and `CalendarMonth.tsx`). `e2cb3ac` was pushed to GitHub and Bitbucket.
- Remaining:
  1. Manual browser checks (DevTools device toolbar):
     - desktop: send ~8 demo messages, Hide/Show at the bottom and halfway up; the scroll position is unchanged
     - ≤1024px: scroll Materials, open Pandu (only the header, toggle, and Pandu are reachable by Tab), close it (same scroll, focus on the floating toggle)
     - ≤1024px with Pandu open, widen past 1024px: side by side, still open; close, shrink, still closed
     - the floating toggle never covers the last material's buttons
     - the drawer on dashboard and calendar: backdrop, Escape, menu button, a link, and Back all close it
     - a real phone: the composer stays above the on-screen keyboard (if not, consider `interactive-widget=resizes-content` in the viewport meta)
  2. Push the latest commits to GitHub, confirm CI, then push to Bitbucket.
  3. Open the PR into `development`, noting the 1024px decision and the four places the breakpoint lives, and raise the open items above.

## Commands

- Frontend: `cd frontend && npm run lint && npm test && npm run build`.
- Single file: `npx vitest run src/components/courses/CourseWorkspace.test.tsx`.

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
6. **Merge:** after approval, use Bitbucket's **Squash, fast forward**. Edit the squash message to contain the Jira ID and task name, for example `SCRUM-117: Responsive application layout`.
7. **Keep the task branch** after merging.

Rules: never commit or push directly to `development`; every PR must be reviewed. The AI curiosity report and grade go under `docs/ai-dev-reports/`, labeled with the Jira ID, in a separate final commit.

## Build verification: push to GitHub first, then Bitbucket

- `github`: `github.com/sudinkatuwal7/studyforge-ci`, where GitHub Actions CI runs.
- `origin`: `bitbucket.org/mth115_super/studyforge`, the team's main repository, where PRs are opened.

```bash
git push github feature/SCRUM-117-responsive-app-layout
# Check GitHub -> Actions; confirm the build and tests pass
git push origin feature/SCRUM-117-responsive-app-layout
```

- After a rebase, both remotes need `--force-with-lease` if the branch was pushed before.
- CI (`.github/workflows/ci.yml`) runs on pushes to `feature/**`, `chore/**`, `development`, and `main`. Frontend job (in `frontend/`): `npm ci`, `npm run lint`, `npm run test:ci`, `npm run build`.

## Prior context

This skill was previously `scrum-115-profile-signout-session` (SCRUM-115, merged in PR #73); its notes are in git history at commit `fa5faf1`, path `.claude/skills/scrum-115-profile-signout-session/SKILL.md`. Before that: `scrum-113-polish-login-ui` at `23ac3d1` and `scrum-99-course-document-authorization` at `3b087a0`.
