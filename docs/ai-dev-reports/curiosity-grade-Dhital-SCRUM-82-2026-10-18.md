# Curiosity Grade

## 1. Executive Summary

Student: Aashish Dhital  
Student ID: wor21  
Assignment: SCRUM-82 — Basic Study Calendar  
Session date: 2026-10-18

The student built a course-owned study-session API and a calendar that shows dated to-dos and study sessions on a full page and on the dashboard. Curiosity concentrated on ownership, date validation, whether the calendar actually stays in step with saved tasks, lost delete responses, and what an expired login should do. The student also asked for line-level explanations of `UUIDField`, serializer setup, `useEffect`, and the access-token dependency. Six error or unexpected-behavior episodes are indexed. Three were probed, including the year `-1` validation hole, and three environment failures were handled by applying the first fix. The optional self-context field is blank.

## 2. Curiosity Rubric

Event counts are descriptive, not scores. A turn may be counted in more than one dimension.

### (i) Clarification / requests for detail — 2/3

Evidence: After the dashboard explanation, the student asked, “accessToken is in the effect's dependency list what does this mean” (report line 1849), then followed with “useeffect is usestate fxn that store the changes right?” (line 1879). Earlier they asked “whats UUIDField?” (line 281) and pasted the serializer `__init__` with “exaplin this code” (line 442). After an ownership answer about the backend, they wrote “thats backend im asking about frontend” (line 1818).

These requests name a specific construct and, in the effect and frontend follow-ups, narrow the explanation they want. They ask for the meaning of code that was already written. They do not, by themselves, test a disputed claim or change the design.

Ungraded event count: 14.

### (ii) Challenge / skepticism [PRIORITY] — 3/3

Evidence: After being told how `buildMonthGrid` treats a year, the student asked, “so -1 passes thrugh? isnt that a bug” (report line 948). The assistant then agreed that year `-1` getting through is a bug. The student also checked a sync claim: “Okay, but what if the backend successfully saves a new task and the parent doesn't update the events array? Would the calendar still show old data?” (line 1283), then “ist not synched yet?” (line 1305). The assistant confirmed the to-do list and the calendar were not connected.

The year question tests the validation claim and gets a correction. The sync questions test the “it updates automatically” answer and expose that the calendar was not wired to saved tasks.

Supporting verification: the Evidence Appendix records the student’s frontend Vitest run (182 tests, then 35 calendar tests) and the Python 3.12 identity-courses check (64 passed, 132 subtests passed). The student also asked to “test with postgre as well” (line 654) and later to “mention any bugs found” (line 2057).

Ungraded event count: 9.

### (iii) Why / tradeoffs — 3/3

Evidence: The student asked, “i see you used courses as ownership determinaton why should study sessions belong to courses and not directly to users?” (report line 309). They also asked, “Why do we need idempotency keys when creating study sessions, and hw does it actualy work when a user sends the same request at the same time” (line 544), and later, “so if jwt expires, a usser is asked to log in again? is this necessary how does it help/” (line 1577).

The ownership question proposes the alternative of a direct user relationship and asks why the course path was chosen. The idempotency question asks why the key exists and what a simultaneous duplicate request does. The login question asks whether the new behavior is necessary and what it is for.

Ungraded event count: 6.

### (iv) Error-response behavior [PRIORITY] — 3/3

The report records six episodes:

- **Episode 1 — PROBED:** Activating `venv` and `.venv` from the repo root failed. The student pasted the three `source: no such file or directory` lines and ended with “?” (lines 333–338), asking what the failure meant.
- **Episode 2 — PROBED:** Year `-1` passed the month-grid check. The student asked “isnt that a bug” (line 948), then, after the year-range fix was described, asked “what about the month and date?” (line 1040).
- **Episode 3 — PROBED:** The student noticed a second hole and asked, “getLocalMonth() doesn't reject an invalid Date?” (line 1161), before saying to throw on an invalid date.
- **Episode 4 — ACCEPTED:** `npm test` from the repo root failed with ENOENT (terminal 19.txt:7-19, line 2179). The next student turn is the same test run from `frontend/`, which passed. The transcript has no question about the missing `package.json`.
- **Episode 5 — ACCEPTED:** `python3.12` was not found (terminal 20.txt:7-9, line 2200). The student wrote “install python 3.12” and did not ask why the checker requires that version.
- **Episode 6 — ACCEPTED:** The same check then failed with `No module named 'psycopg'` (terminal 20.txt:7-13, line 2208). The student ran the separate Python 3.12 environment commands that had been given. A later “how to solve this” (line 2263) repeats the request after that check had already passed.

The year and invalid-date episodes query the failure and follow it into a related case. The three environment episodes take the first fix. No LOOPED episode is observed. The score follows the depth of the validation probes.

Error episodes: 6 (PROBED 3, ACCEPTED 3, LOOPED 0).

**Four raw scores:** (i) 2  (ii) 3  (iii) 3  (iv) 3. No composite score is calculated.

## 3. Notes for the Grader (neutral)

Curiosity was concentrated in ownership, date bounds, calendar-to-task synchronization, lost delete responses, and expired-login behavior. Many other turns are implementation steps, commit-text requests, and “explain this code” after a feature was added. The student often approved the next slice with messages such as “Lets implement the CRUP API endpoints now” and “do now,” then returned with a specific question once that slice existed.

## 4. AI Sycophancy — No grade impact

- **Correct reversal under a correct challenge:** After “isnt that a bug,” the assistant said, “Yes. For this calendar, year `-1` getting through is a bug.” That matches the validation hole the student named.
- **Correctly holding its ground:** When the student asked whether `useEffect` stores changes, the assistant said, “`useState` is the one that stores a value. `useEffect` is the function that runs after the screen updates.” It did not adopt the student’s description. On course ownership, the assistant kept course-based ownership and explained when a direct user field would be a different design, rather than dropping the course relationship.
- **Agreement on a product preference:** After “isnt it better to to aske for log in again?”, the assistant said, “Yes. An expired login should ask you to sign in again.” That agrees with a reasonable recovery choice. It is not agreement with an incorrect technical claim.
- **Flattery:** No “Great question” or “Excellent point” phrasing appears in the report.

## 5. Performativity (preliminary)

The questions name concrete objects: `UUIDField`, course ownership versus a user owner, year `-1`, `getLocalMonth`, the access-token dependency, a lost `DELETE` response, and a second delete that returns 404. The follow-ups respond to the previous answer rather than repeating a generic prompt. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV Score-Row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
wor21,Aashish Dhital,SCRUM-82 — Basic Study Calendar,2,3,3,3,14,9,6,6,3,3,0,2026-10-18
```
