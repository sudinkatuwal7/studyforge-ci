# SCRUM-124 Teammate Validation Report

## Report purpose

This report records an independent teammate's experience running and reviewing
the SCRUM-124 branch. The branch makes the dashboard the student's home base,
adds a shared navigation with a mobile drawer, gives every course section its
own URL, makes the main pages responsive, and adds empty states that tell the
student what to do next.

The teammate's feedback is the most important result. Record every problem they
encounter, including setup failures, unclear instructions, unexpected output,
slow behavior, missing prerequisites, and concerns about the design. Do not mark
the report complete only because automated tests pass. Most of this task is
layout and browser behavior, which the automated tests cannot check, so the
browser checklist below matters as much as the test run.

## Review status

- Reviewer: Gaurav
- Report status: `[not started / in progress / complete]`
- Overall result: `[satisfactory / satisfactory with changes / unsatisfactory]`
- Final recommendation: `[approve / approve with changes / do not approve]`

## Branch under review

```text
feature/SCRUM-124-dashboard-navigation-responsive
```

## What this branch does

- **Dashboard as home base.** Opening `/` shows the student's courses, pending
  to-dos, and an **Upcoming** list of to-dos and study sessions due in the next
  7 days, soonest first. The "Upcoming" stat card counts the same 7 days.
- **Quick links.** Opening a course saves it as the student's last opened
  course. The dashboard then shows that course's name with links to its
  Materials, Notes, Quizzes and Pandu. With no saved course, or if it was
  deleted, the quick links show a course picker, or "Create your first course"
  when the student has none.
- **Course section URLs.** Each section has its own address:
  `/courses/<id>/materials | notes | quizzes | tasks`, and Pandu's open or
  closed state is in `?pandu=open|closed`. Reload, sharing a link, and
  Back/Forward all keep the section and Pandu state. A bare `/courses/<id>`
  or an unknown section redirects to Materials without adding a history entry.
- **No lost work.** Switching sections does not reset an in-progress quiz or
  note generation, and Back/Forward do not lose the Pandu conversation.
- **Main navigation.** Dashboard, Courses, Tasks and Calendar are on every
  signed-in page, with the current item highlighted. Courses stays highlighted
  inside a course. New `/courses` ("My Courses") and `/tasks` pages.
- **Mobile drawer.** At 1024px wide or less the navigation becomes a drawer
  opened from a menu button. Esc, the backdrop and following a link close it;
  focus stays inside it while open and returns to the menu button.
- **Responsive layouts.** At 375, 768 and 1440px, the dashboard, Courses, every
  course section including Pandu, Tasks and Calendar have no horizontal
  scrolling or cut-off content.
- **Empty states.** Courses, to-dos, Upcoming, the calendar and the course
  Materials, Notes and Quizzes tabs each show a message and an action. Loading
  and error states look different from empty ones.
- **Contrast fix.** Link text uses a deeper blue (`--periwinkle-text: #4f63c9`,
  about 5.3:1 on white) instead of the old periwinkle (about 3.3:1).

**Note for reviewers: the Upcoming list is back on purpose.** It was removed in
SCRUM-104 (PR #81). This sprint's acceptance criteria 1–5 need it, so it was
rebuilt here as a separate `UpcomingList` component.

## Acceptance criteria

1. Opening `/` while signed in shows the student's courses, pending to-dos, and
   to-dos and study sessions in the next 7 days, soonest first.
2. Opening a course records it as the student's last opened course.
3. With a last opened course, the dashboard shows its name and links to its
   Materials, Notes, Quizzes and Pandu; each opens that course with that section
   showing.
4. With no last opened course (or it was deleted or is no longer theirs), the
   quick links show the course list to choose from, or "Create your first
   course" when there are none.
5. Each course section has its own URL; reload, sharing and Back/Forward keep it.
6. Dashboard, Courses, Tasks and Calendar are reachable from the main nav on
   every signed-in page; the current item is highlighted; Courses is
   highlighted inside a course.
7. At 1024px wide or less the nav becomes a drawer; Esc, backdrop and
   navigation close it; focus is trapped and returned.
8. At 375, 768 and 1440px the dashboard, Courses, every course section including
   Pandu, and Calendar have no horizontal scrolling or cut-off content.
9. Each listed empty state (courses, to-dos, upcoming, calendar, course
   Materials, Notes, Quizzes) shows a message and an action; loading and error
   states look different from empty ones.
10. Section and Pandu open/closed state are in the URL; reload restores both.
11. Each section switch and each Pandu open/close adds a history entry;
    Back/Forward restore section and Pandu at every width without losing the
    Pandu conversation or an in-progress quiz.
12. A bare or unknown course section URL redirects to Materials without adding a
    history entry.
13. Switching sections does not reset an in-progress quiz or note generation.

Out of scope: standalone Notes, Quizzes or Pandu pages across courses, and
course deletion (planned for a later ticket).

## Main files touched

All under `frontend/src/`.

- Routing and pages
  - `App.tsx`: routes `/`, `/courses`, `/tasks`, `/courses/:courseId/:section?`
    and `/calendar`. Dashboard, Courses and Tasks are keyed by the user id so
    nothing from one account shows for another.
  - `pages/CourseDetailPage.tsx`: checks the section (else redirects to
    Materials with `replace`), loads the course, saves or forgets the last
    opened course.
  - `pages/CoursesPage.tsx`, `pages/TasksPage.tsx`: new pages.
  - `pages/DashboardPage.tsx`, `pages/CalendarPage.tsx`: quick links, Upcoming,
    empty states.
- Course workspace
  - `components/courses/courseSections.ts`: the section list and `coursePath`.
  - `components/courses/CourseWorkspace.tsx`: tab from the URL, Pandu from
    `?pandu`, history pushes. Hidden panels stay mounted so work is not lost.
  - `components/courses/lastCourse.ts`: the saved last course, in
    `localStorage` under `studyforge:lastCourse:<userId>`.
  - `components/courses/focusCourseForm.ts`, `components/shared/revealAndFocus.ts`:
    the "create a course" shortcuts (smooth scroll unless reduced motion, then
    focus).
  - `components/courses/GoToMaterialsLink.tsx`, `CourseMaterials.tsx`,
    `CourseTasks.tsx`, `CourseList.tsx`: empty states and load reporting.
- Dashboard
  - `components/dashboard/AppShell.tsx`: nav items, highlighting, page titles.
  - `components/dashboard/QuickLinks.tsx`, `components/dashboard/UpcomingList.tsx`.
- Shared and other panels
  - `components/shared/EmptyState.tsx`: the shared empty-state message and
    actions.
  - `components/documents/MaterialPicker.tsx`, `notes/NotesPanel.tsx`,
    `notes/NotesSetup.tsx`, `quizzes/QuizPanel.tsx`, `quizzes/QuizSetup.tsx`,
    `todos/TodoList.tsx`, `todos/TodoPanel.tsx`,
    `calendar/StudySessionForm.tsx`: empty and loading states.
  - `calendar/calendarEvents.ts`, `calendar/calendarDates.ts`: the 7-day
    Upcoming window (`getUpcomingEvents`, `addDaysToDate`).
- Styles: `styles/dashboard.css`, `styles/index.css`, `styles/auth.css`,
  `components/calendar/Calendar.css`.
- Tests: listed under Test cases below.

## Prerequisites

- Windows PowerShell (the commands below are written for it), or adapt them for
  bash.
- Node.js and npm, with `frontend/node_modules` installed (`npm install`).
- Python 3.12 and the repository's `backend\venv` with dependencies installed.
- Docker Desktop running Linux containers, for the local Postgres.
- Chrome or Edge, for DevTools and the device toolbar.
- Two student accounts: one with a course that has a `READY` document (for
  Notes, Quizzes and Pandu), and one brand-new account with no courses (for the
  empty states). Setup step 5 below creates the `READY` document.

No paid AI provider is needed: the backend runs with the fake notes, quiz and
Pandu generators.

## Local setup

Use two terminals: Terminal 1 runs the backend, Terminal 2 runs the frontend.

### 1. Get the branch (Terminal 1, repository root)

```powershell
cd <repository root>
git fetch origin
git checkout feature/SCRUM-124-dashboard-navigation-responsive
git pull
git log -1 --format="%h %an %ad %s" --date=short
```

Record the commit hash for the Environment section.

### 2. Start the database

```powershell
docker compose up -d
docker compose ps
```

**If another Postgres is installed on your machine** and already uses port 5432,
Django will connect to it instead of Docker's and fail with "password
authentication failed for user studyforge". Check with:

```powershell
Get-NetTCPConnection -LocalPort 5432 -State Listen | ForEach-Object { (Get-Process -Id $_.OwningProcess).ProcessName }
```

If this prints `postgres`, move Docker's database to 5433 for this session, and
set the same variable in every terminal that runs Django:

```powershell
$env:POSTGRES_PORT = '5433'
docker compose up -d
```

### 3. Start the backend with the fake AI generators (Terminal 1)

```powershell
cd backend
$env:NOTES_LLM_BACKEND = 'fake'
$env:QUIZ_LLM_BACKEND = 'fake'
$env:RAG_LLM_BACKEND = 'fake'
venv\Scripts\python.exe manage.py migrate
venv\Scripts\python.exe manage.py runserver
```

Leave it running.

### 4. Start the frontend (Terminal 2)

```powershell
cd <repository root>\frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm run dev
```

`frontend\.env` must contain `VITE_API_BASE_URL=http://localhost:8000/api/v1`.
Open the address Vite prints (usually `http://localhost:5173`).

### 5. Create the test accounts and a READY document

Register **Student A** and **Student B** through the app's sign-up page. Sign in
as Student A and create one course. Uploading a real file needs the document
processing worker, so instead mark a document `READY` with this script (it adds
one `READY` document with text to Student A's first course). Run it in a third
terminal, with `$env:POSTGRES_PORT = '5433'` first if you used it in step 2:

```powershell
cd <repository root>\backend
$seed = "$env:TEMP\scrum124_seed.py"
@'
import os, sys
sys.path.insert(0, os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()
from django.contrib.auth import get_user_model
from apps.courses.models import Course
from apps.documents.models import Document
from apps.knowledge.models import Chunk
EMAIL = sys.argv[1]
user = get_user_model().objects.get(email=EMAIL)
course = Course.objects.filter(owner=user).order_by("pk").first()
document, made = Document.objects.get_or_create(
    owner=user, course=course, title="Review notes",
    defaults=dict(sha256="a" * 64, file="documents/2026/11/review.pdf", status="READY", page_count=1))
if made:
    Chunk.objects.create(owner=user, document=document, page_number=1, content="Content.")
print(EMAIL, "course", course.pk, "doc", document.pk, "status", document.status)
'@ | Set-Content -Path $seed -Encoding ascii
venv\Scripts\python.exe $seed "<student A email>"
```

Keep Student B with no courses until the empty-state checks (section E).

## Validation commands

From `frontend\`, in PowerShell. Run Vitest from PowerShell, not Git Bash: from
Git Bash the `c:` vs `C:` drive letter can load Vitest twice and fail with
"Vitest failed to find the current suite".

```powershell
npx tsc -b
npm run lint
npm test
npm run build
```

Run one test file on its own:

```powershell
npx vitest run src/components/dashboard/QuickLinks.test.tsx
```

## Test cases

jsdom does not load CSS or lay out the page, so these tests prove behavior,
URLs, history and focus, but not widths, the drawer's look, or Pandu covering
the content on a phone. Those are in the browser checklist.

| Test file | What it proves | Criteria |
|---|---|---|
| `pages/DashboardPage.test.tsx` | Courses, to-dos and Upcoming render; quick links work with the real course list; both "create a course" shortcuts focus the real form | 1, 3, 4, 9 |
| `components/dashboard/UpcomingList.test.tsx` | Next 7 days only, soonest first, Today / Tomorrow / weekday labels, timed sessions, overdue and completed excluded, loading, sessions-failed note, empty state | 1, 9 |
| `components/calendar/calendarEvents.test.ts`, `calendarDates.test.ts` | The 7-day window and date arithmetic | 1 |
| `components/dashboard/QuickLinks.test.tsx` | Saved course shows its links; picker when none; "no longer available" message when the saved course is gone; picking does not navigate | 3, 4 |
| `components/courses/lastCourse.test.ts` | Saving, reading and forgetting the last course per account; storage errors are safe | 2, 4 |
| `pages/CourseDetailPage.test.tsx` | Bare and unknown sections redirect to Materials without a history entry; 403 / 500 / 401 messages; the workspace is not remounted on a section change; the last course is saved only after a successful load and forgotten only on 404 | 2, 5, 12, 13 |
| `components/courses/CourseWorkspace.test.tsx` | Section and Pandu state in the URL; every switch and toggle adds a history entry; Back/Forward walks on desktop and narrow widths; Pandu messages survive history; an in-progress quiz keeps its answers and current question; note generation is not aborted | 5, 10, 11, 13 |
| `components/dashboard/AppShell.test.tsx` | Nav order and links; exactly one highlighted item and the right title for each path; Courses highlighted inside a course | 6 |
| `App.dashboardAccount.test.tsx` | Pages reset when the account changes; old `/#tasks` links still work; the not-found page link | 4, 6 |
| `pages/CoursesPage.test.tsx`, `pages/TasksPage.test.tsx` | The new pages and their empty states | 6, 9 |
| `components/courses/focusCourseForm.test.ts` | The shortcut scrolls smoothly, or jumps with reduced motion, then focuses "Course name"; the URL does not change | 9 |
| `CourseMaterials.test.tsx`, `CourseTasks.test.tsx`, `CourseForm.test.tsx`, `TodoPanel.test.tsx`, `CalendarPage.test.tsx` | Empty states with their actions; Notes and Quizzes show "Loading materials..." rather than "No materials yet" while materials load | 9 |

## Browser checklist

Setup: run the app, sign in, and open DevTools. Use the device toolbar at these
widths: **375** (phone), **768** (tablet), **1024** (the drawer breakpoint) and
**1440** (desktop).

To check for horizontal scrolling on any page, paste this in the console. It
should print `0`:

```js
document.documentElement.scrollWidth - document.documentElement.clientWidth
```

If it doesn't, this lists the elements that stick out:

```js
[...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
```

Report each item as pass or fail by its number, with a screenshot of any
failure.

### A. Navigation (criteria 6 and 7)

| # | Check | Expected |
|---|---|---|
| A1 | At 1440, look at the sidebar, then click each item | Dashboard, Courses, Tasks, Calendar; the clicked item is highlighted and the top-bar title matches ("Dashboard", "My Courses", "Tasks", "Calendar") |
| A2 | Open a course | Courses stays highlighted; the title says "Course" |
| A3 | Narrow to 1024 and below | The sidebar is hidden and the menu button appears; clicking it opens the drawer |
| A4 | With the drawer open, press Tab and Shift+Tab, then Esc | Focus stays inside the drawer; Esc closes it and focus returns to the menu button |
| A5 | Open the drawer, click the backdrop; open it again, follow a nav link | Both close the drawer |
| A6 | Open the drawer at 1024, then widen to 1440 | The drawer closes and the sidebar is back |

### B. No horizontal scroll (criterion 8), at 375, 768 and 1440

| # | Page | Expected |
|---|---|---|
| B1 | Dashboard: welcome banner, stat cards, quick links, Upcoming, My Courses, calendar, to-dos | Console check prints `0`; nothing cut off |
| B2 | `/courses`, including a course with a long name | As B1 |
| B3 | A course: Materials, Notes, Quizzes and Tasks tabs | As B1. At 375, opening Pandu covers the content and closing it brings the content back |
| B4 | `/tasks` and `/calendar`, including the day pop-up from clicking a date | As B1 |
| B5 | The Upcoming list at 375 | The date moves under the title |

### C. Course URLs and history in a real browser (criteria 5 and 10–13)

| # | Check | Expected |
|---|---|---|
| C1 | Open `/courses/<id>/notes?pandu=open` and reload | Still on Notes, with Pandu open |
| C2 | Switch tabs and toggle Pandu a few times, then use Back and Forward | Each step is restored |
| C3 | Type `/courses/<id>` in the address bar | It changes to `/courses/<id>/materials`, and Back doesn't return to the bare URL |
| C4 | Start a quiz and answer one question, switch to Notes, then press Back | The quiz is still on the same question |

### D. Dashboard (criteria 1–4)

| # | Check | Expected |
|---|---|---|
| D1 | Look at Upcoming and the "Upcoming" stat card | The next 7 days, soonest first, labelled Today / Tomorrow / weekday; the stat card shows the same number |
| D2 | Complete a task in the to-do panel | It disappears from Upcoming without a reload |
| D3 | Open a course, then go back to the dashboard | The quick links show that course; each link opens the right section; "Ask Pandu" opens Pandu |
| D4 | Simulate a deleted course: in the console run `localStorage.setItem("studyforge:lastCourse:<yourUserId>", "999999")` and reload the dashboard | "Your last opened course is no longer available." with the course picker |
| D5 | Sign out and sign in as another student | The first student's quick-links course does not appear |

To find `<yourUserId>` for D4, open DevTools → Application → Local Storage and
look for the existing `studyforge:lastCourse:<number>` key after opening a
course.

### E. Empty states (criterion 9), using Student B with no courses

| # | Check | Expected |
|---|---|---|
| E1 | Dashboard | Quick links show "Create your first course"; My Courses shows "Create a course"; Upcoming shows "Nothing due…"; the calendar shows "No dated tasks…" |
| E2 | `/tasks` and `/calendar` | Both say to create a course first |
| E3 | Click each "create a course" button | It scrolls smoothly to the form and puts the cursor in "Course name"; the address bar doesn't change |
| E4 | In a course with no materials, Materials tab: click "Upload your first material" | Focus moves to Choose files |
| E5 | Notes and Quizzes tabs: click "Go to Materials" | Materials opens, and Pandu stays as it was |
| E6 | Tasks tab: click "Add a task" | It goes to `/tasks` |
| E7 | DevTools → Network → Slow 3G, then open a course's Notes tab right away | It shows "Loading materials...", not "No materials yet" |
| E8 | Turn on the OS reduce-motion setting, then use the shortcut buttons | They jump to the form instead of scrolling smoothly |

### F. Colours and contrast

| # | Check | Expected |
|---|---|---|
| F1 | Links, "+ New" and "Open calendar" on the dashboard, landing page and sign-in cards | They are the deeper blue and fit the design |
| F2 | The empty-state buttons (navy with white text) | Readable; on a phone each is at least about 44px tall |

## Success criteria for SCRUM-124

The task is successful when every acceptance criterion passes both its automated
tests and its browser checks, and `tsc -b`, lint, the tests and the build all
pass.

| # | Acceptance criterion | Automated tests | Browser checks |
|---|---|---|---|
| AC1 | Dashboard shows courses, to-dos and the next 7 days | DashboardPage, UpcomingList, calendarEvents | D1, D2 |
| AC2 | Opening a course records it | CourseDetailPage, lastCourse | D3 |
| AC3 | Quick links to the last course's sections | QuickLinks, DashboardPage | D3 |
| AC4 | Picker or "Create your first course" when there is no usable last course | QuickLinks, lastCourse, App.dashboardAccount | D4, D5, E1 |
| AC5 | Each section has its own URL | CourseWorkspace, CourseDetailPage | C1, C2 |
| AC6 | Main nav on every page, correct highlight | AppShell, App.dashboardAccount | A1, A2 |
| AC7 | Drawer at 1024px or less, focus trapped and returned | none (layout) | A3–A6 |
| AC8 | No horizontal scroll at 375, 768, 1440 | none (layout) | B1–B5 |
| AC9 | Empty states with an action; loading and errors look different | EmptyState users, CourseMaterials, TodoPanel, CalendarPage, CoursesPage, TasksPage | E1–E8 |
| AC10 | Section and Pandu state in the URL survive reload | CourseWorkspace | C1 |
| AC11 | History entries for each switch and toggle; nothing lost | CourseWorkspace | C2, C4 |
| AC12 | Bare or unknown section redirects without a history entry | CourseDetailPage | C3 |
| AC13 | Switching sections keeps a quiz or note generation | CourseWorkspace, CourseDetailPage | C4 |

## Expected results

- `npx tsc -b`, `npm run lint` and `npm run build` finish without errors. Lint
  may show existing `react(immutability)` warnings on test probes; no new ones.
- `npm test`: all tests pass. The author's last full run: 535 of 536 passed. The
  one failure was the known slow test `CourseDetailPage.test.tsx > opens the
  selected course, uploads…`, which sometimes times out at about 5 seconds under
  full-suite load. It does the same on the code before this branch and passes
  when run alone:

  ```powershell
  npx vitest run src/pages/CourseDetailPage.test.tsx
  ```

- Every browser check passes at the widths it lists.

These are expected results, not a record of the teammate's run.

## Known limits (accepted)

- Reloading during a quiz or note generation restores the section and Pandu
  state, not the in-progress work.
- The not-found page shows the top-bar title "Dashboard" while no nav item is
  highlighted.
- Primary buttons are still white text on the old periwinkle (about 3.3:1). Only
  link text was changed in this branch.
- Quick links do not update live when another tab opens a different course.

## Teammate chat feedback — required

After the teammate has tried the setup, tests and browser checks, ask only:

> Do you have any improvements, concerns, or suggestions for this branch?

Let the teammate explain freely in chat. Do not require answers to a question
list. Ask follow-up questions only when their feedback needs clarification, such
as the exact step that failed, the expected behavior, or the change they
recommend.

The teammate does not need to edit this file while answering. The facilitator
should turn the conversation into the documentation record below afterward.

## Validation report from the chat

After the conversation, replace the placeholders below with a concise account of
the teammate's answers. Preserve important disagreement and uncertainty. The
teammate's feedback is the primary outcome of this exercise.

### Environment

- Name: `[teammate name]`
- Date: `[date]`
- Operating system: `[answer]`
- Browser and version: `[answer]`
- Node.js version: `[answer]`
- Python version: `[answer]`
- Branch/commit tested: `[answer]`

### Results

- `tsc -b`: `[PASS / FAIL / NOT RUN]`
- Lint: `[PASS / FAIL / NOT RUN]`
- Frontend tests: `[PASS / FAIL / NOT RUN]` (`[passed / total]`)
- Build: `[PASS / FAIL / NOT RUN]`
- A. Navigation (A1–A6): `[PASS / FAIL / NOT RUN]`
- B. No horizontal scroll (B1–B5): `[PASS / FAIL / NOT RUN]`
- C. Course URLs and history (C1–C4): `[PASS / FAIL / NOT RUN]`
- D. Dashboard (D1–D5): `[PASS / FAIL / NOT RUN]`
- E. Empty states (E1–E8): `[PASS / FAIL / NOT RUN]`
- F. Colours and contrast (F1–F2): `[PASS / FAIL / NOT RUN]`
- Failed item numbers: `[list or none]`

### Teammate feedback summarized

`[Summarize the teammate's open-ended feedback, including improvements,
concerns, positive observations, and suggested changes.]`

## Problems encountered

Record every problem reported by the teammate, including problems that were
resolved during the session.

| # | Problem or unexpected behavior | Where it occurred | Evidence | Impact | Resolved? | Recommended action |
|---|---|---|---|---|---|---|
| 1 | `[description]` | `[setup / routing / navigation / dashboard / layout / empty states / tests / docs]` | `[output, screenshot or checklist item]` | `[low / medium / high]` | `[yes / no / partial]` | `[action]` |

If no problems were found, write:

```text
No problems were reported during the teammate validation.
```

## Positive observations

`[Record what the teammate found clear, useful, reliable, or well designed.]`

## Suggested improvements

| # | Suggested improvement | Reason given by teammate | Priority | Planned action |
|---|---|---|---|---|
| 1 | `[suggestion]` | `[reason]` | `[high / medium / low]` | `[action or decision]` |

## Evidence collected

Paste concise evidence from the teammate's run. Never include secrets, API keys,
tokens, passwords, or private connection strings.

```text
Commands run:

Test, type-check, lint and build results:

Browser checks (item numbers, widths, pass/fail):

Screenshots of failures:

Error messages or console logs:
```

### Facilitator conclusion

`[Convert the conversation into a clear conclusion. List accepted suggestions,
required fixes, unresolved questions, and the next action.]`

## Final decision

- Problems requiring fixes before merge: `[list or none]`
- Accepted improvements: `[list or none]`
- Deferred improvements: `[list or none]`
- Follow-up owner: `[name]`
- Follow-up issue or task: `[identifier]`
- Final recommendation: `[approve / approve with changes / do not approve]`
