# Curiosity Grade

## 1. Executive Summary

Student: Aashish Dhital  
Student ID: not provided  
Assignment: SCRUM-87 — Course To-Do list  
Session date: 2026-10-16

The student's curiosity concentrated on API design, framework choices, verification scope, and retry reliability. They questioned why the endpoint was top-level rather than course-nested, whether `APIView` was preferable to a ViewSet, whether SQLite results establish PostgreSQL compatibility, how duplicate submission prevention was verified, and whether idempotency was necessary. The student also requested repeated explanations of concrete code and asynchronous behavior. Four error or unexpected-behavior episodes are indexed in the report; two received observable probing, while two were accepted or left unresolved in the transcript. The optional self-context field is blank.

## 2. Curiosity Rubric

Event counts are descriptive, not scores. Counts represent distinct student turns with relevant behavior; one turn may count in more than one dimension.

### (i) Clarification / requests for detail — 2/3

Evidence: After the AI described the backend pieces, the student asked, “explain me more on django rest framework model/viewset im confused.” Later, they asked, “def patch(*self*, *request*, *todo_id*): *if* not 0 < todo_id <= 9223372036854775807: *raise* Http404 in views.py explain this” and then followed up with “http404 is an http error?”

These requests identify specific constructs and follow up on the explanation. The student sought enough detail to understand the implementation, but the clarification questions generally ask for explanation rather than testing a disputed claim or exposing a consequential gap.

Ungraded event count: 18.

### (ii) Challenge / skepticism [PRIORITY] — 3/3

Evidence: The student challenged the proposed API shape: “why did you choose api/v1/todos endpoint instead of api/v1/couses/todo since todo belongs to courses? which enpiunt design is better?” They also challenged the implementation choice: “Why did we implement separate GET, POST, and PATCH operations instead of using modelsetview then isnt it more easier and better?”

These questions test design assumptions rather than accepting the first implementation. The ViewSet challenge caused the AI to acknowledge that its earlier explanation had overstated the advantage of `APIView`, and to discuss a restricted `GenericViewSet` alternative. The student also asked whether SQLite passing was enough for production PostgreSQL and requested a separate PostgreSQL check.

Supporting verification: the Evidence Appendix records the student-provided PostgreSQL run as 33 tests and 43 subtests passed, in addition to the reported SQLite tests and frontend tests.

Ungraded event count: 5.

### (iii) Why / tradeoffs — 3/3

Evidence: The student asked, “whats the advantage or cons of this?” after comparing `APIView`, `ModelViewSet`, and `GenericViewSet` with mixins. They also asked, “is this necessary? whats the pros and cons?” about idempotency protection after learning that a lost response could create a duplicate.

These questions explicitly weigh alternatives, costs, scope, and reliability consequences. The idempotency discussion was consequential: the AI recommended deferring the extra work because it was outside SCRUM-87, and the student then deliberately redirected the work by saying, “no i wnat it now.”

Ungraded event count: 4.

### (iv) Error-response behavior [PRIORITY] — 2/3

The report records four episodes:

- **Episode 1 — PROBED:** The standard PostgreSQL check runner stopped because it required Python 3.12 while the environment used Python 3.14. The student asked whether SQLite behavior would be the same on PostgreSQL and whether changes were needed, then approved inspection of the environment.
- **Episode 2 — PROBED:** After restarting Docker, the student pasted the PostgreSQL and Redis logs and ended with “??”. This prompted an explanation of whether the services had started and what blocker remained.
- **Episode 3 — ACCEPTED:** After the environment diagnosis, the student said “fix it.” The transcript shows no challenge to the proposed isolated Python 3.12 setup before the AI reported the PostgreSQL checks passed.
- **Episode 4 — ACCEPTED:** The Codex session ended with a usage-limit error while idempotency edits were in progress. The student moved to requesting report formatting; no probing of the failure or alternative recovery is recorded.

The student did probe the database-engine compatibility question and the ambiguous Docker output, which is substantive error-response behavior. However, the actual remediation of the Python-version blocker was accepted through “fix it,” and the usage-limit interruption was not investigated in the transcript. No LOOPED episode is observed.

Error episodes: 4 (PROBED 2, ACCEPTED 2, LOOPED 0).

**Four raw scores:** (i) 2  (ii) 3  (iii) 3  (iv) 2. No composite score is calculated.

## 3. Notes for the Grader (neutral)

Curiosity was concentrated in API and framework design, verification boundaries between SQLite and PostgreSQL, and the reliability tradeoff between a simple form and idempotent creation. The student also requested detailed, plain-language explanations of serializers, `PATCH`, `async`, Promises, and the dashboard update workflow. The session used an approval-driven workflow for many edits; several implementation steps were accepted after the AI's proposal. The final idempotency change was requested but was interrupted by the usage-limit error, so its completion and tests are not established by the report.

## 4. AI Sycophancy — No grade impact

- **Correct reversal under a correct challenge:** After the student questioned the separate-method implementation, the AI said, “You’re right: **`ModelViewSet` can make this shorter, and manually writing each method is not automatically better.** My earlier explanation overstated that advantage.” This was a warranted revision in response to a valid design challenge.
- **Correctly holding its ground:** On the API URL question, the AI explained that `/api/v1/courses/todo/` does not identify a specific course and that either URL design still requires server-side ownership checks. The transcript does not show the AI caving to an incorrect student claim.
- **Affirming language:** The AI repeatedly used approval phrases such as “Your point is valid” and “That output is normal.” These are ordinary conversational confirmations here; no dangerous agreement with an incorrect student challenge is observed.

## 5. Performativity (preliminary)

The questioning appears specific and task-grounded rather than shallow or for-show. The student named concrete API paths, DRF abstractions, HTTP methods, database engines, test behavior, and the failure mode of a lost save response. The student also weighed whether idempotency belonged in the current scope and redirected the implementation based on that tradeoff. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV Score-Row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
,Aashish Dhital,SCRUM-87 — Course To-Do list,2,3,3,2,18,5,4,4,2,2,0,2026-10-16
```
