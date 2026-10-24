# Curiosity Grade

## 1. Executive Summary

Student: Aashish Dhital  
Student ID: not provided  
Assignment: SCRUM-103 — Course workspace and Pandu chat  
Session date: 2026-10-24

The student built a responsive course workspace with Materials, Notes, and Quizzes beside an always-visible chat partner named Pandu, with real uploads and study notes kept and AI replies left as a labeled demo. Curiosity concentrated on component boundaries, session expiry after load, the scope of `useRef`, and whether the chat UI would stream automatically for SCRUM-75 or needed changes that could start now. Later turns mostly directed implementation: labels, comments, sending and streaming statuses, `AbortController`, course document IDs, panel styling, tests, documentation, and commit text. Two error episodes are indexed; both include a why-question, and the type-error episode continues after the fix. The optional self-context field is blank and does not affect any score.

## 2. Curiosity Rubric

Event counts are descriptive, not scores. Counts are distinct student turns. One turn may count in more than one dimension.

### (i) Clarification / requests for detail — 2/3

Evidence: The student asked, “whats useRef and what is it being used for” (turn 35), then pasted the AI’s list of real uses and wrote “explain” (turn 41). They also scoped a later explanation: “explain in. a detail what changes we would need to make and if there is changes we cna make right now mention that\\” (turn 49). Earlier they asked, “what does app shell mean” (turn 25).

These requests name a specific construct or a bounded part of the work and, in the `useRef` thread, follow the answer with a request to explain each listed use. They ask for explanation of code the AI already wrote. They do not themselves test a disputed claim.

Ungraded event count: 14 (turns 10, 15, 25, 27, 35, 41, 45, 47, 49, 51, 53, 64, 68, 97).

### (ii) Challenge / skepticism [PRIORITY] — 3/3

Evidence: The student questioned the split the AI had implemented: “Why are we using `CourseWorkspace` as a separate component instead of keeping everything in `CourseDetailPage`?” (turn 30). They also tested the handoff claim: “When SCRUM-75 adds real AI functionality, will the current chat interfaces support streaming responses, or will we need to change them? do i need to change anything or its automatically integrated?” (turn 43). After the `useRef` explanation, they checked its scope: “so useRef is only used for demo?” (turn 39).

The component question names an alternative to the structure the AI had chosen. The streaming question tests whether “reusable for SCRUM-75” meant streaming would connect by itself. The AI answered that streaming “will **not integrate automatically**.” The `useRef` follow-up rejected a demo-only reading, and the AI answered “No.”

Supporting verification: at turn 79 the student wrote “now make all the tests nad chnage the /Users/aashishdhital20/Documents/studyforge/docs/course-workspace.md”. The Evidence Appendix records the assistant’s report of that run: 15 test files passed and 108 tests passed (appendix row 10). On the type error, the student wrote “Fix it, verify” (turn 91); appendix row 12 records a production TypeScript build and 8 chat tests passed. Those commands were reported by the assistant. The saved transcript does not include the shell lines.

Ungraded event count: 7 (turns 22, 30, 32, 39, 43, 51, 79).

### (iii) Why / tradeoffs — 3/3

Evidence: Turn 30 asks why the workspace is a separate component “instead of keeping everything in `CourseDetailPage`.” Turn 43 asks whether streaming is already supported, whether the interfaces must change, and whether integration is automatic. Turn 49 asks for the change list and “if there is changes we cna make right now.” After cancellation was added, the student asked, “expalin what it does and how is that helpful” (turn 64).

The component question puts a concrete alternative next to the chosen design. The streaming questions separate “already works,” “must change,” and “automatic.” The “right now” clause separates work that can proceed before the SCRUM-75 contract from work that waits. That distinction is what the next implementation steps followed.

Ungraded event count: 4 (turns 30, 43, 49, 64).

### (iv) Error-response behavior [PRIORITY] — 2/3

The report indexes two episodes. They are two reports of the same editor diagnostic.

- **Episode 1 — PROBED:** After the height and width change, the student asked, “why is there red squuzy line” (turn 85). No fix was applied on that turn. The AI listed possible causes, said the production build had passed, and asked for the hover text.
- **Episode 2 — PROBED:** The student then pasted `Property 'available' does not exist on type 'ChatReference'.` and wrote “Fix it, verify, and then give a concise explanation.” (turn 91). After the base-type change, they asked “why was that a problemm” (turn 95) and “what doesbeing stale mean” (turn 97).

The student did not stop at the applied edit. “why was that a problemm” asks for the cause, and the stale question follows the AI’s cache explanation. The questions do not propose another fix or dispute the `ChatReferenceBase` edit. The first report is a short why without the diagnostic text. No LOOPED episode is observed.

Error episodes: 2 (PROBED 2, ACCEPTED 0, LOOPED 0).

**Four raw scores:** (i) 2  (ii) 3  (iii) 3  (iv) 2. No composite score is calculated.

## 3. Notes for the Grader (neutral)

Curiosity clustered in the middle of the session: the `CourseWorkspace` / `CourseDetailPage` split, expiry after the course has loaded (turn 32: “If the user's session expires after the course loads, what happens”), `useRef` versus demo-only use, and the streaming boundary with SCRUM-75. The opening request and many later turns are implementation directions: Pandu naming, comments, status types, cancellation, reference IDs, panel styling, layout size, and commit-message wording. Turn 22 (“i meancomments in the code”) corrected the AI after it had updated visible labels. Turn 51 pasted `chat.ts` and asked where the multiline `ChatStatus` union was, checking the explanation against the file. Self-context was left blank.

## 4. AI Sycophancy — No grade impact

- **No flattery of the kind flagged by the rubric.** The transcript does not contain “Great question,” “Excellent point,” or similar praise. “Understood” appears when the student corrected “comments” (turn 22) and when they asked for shorter explanations (turn 37). Those are acknowledgements of instructions.
- **Held a challenged boundary:** On “so useRef is only used for demo?” the AI answered, “No. `useRef` is used in both demo and real functionality.”
- **Held the integration claim:** On streaming, the AI said the interface can display growing text, “but SCRUM-75 must implement the streaming logic. It will **not integrate automatically**.”
- **Design answer stayed qualified:** On the separate component, the AI gave the responsibility split and also wrote, “The separate component is not technically required.” It did not collapse the design because the alternative was named, and it did not treat the split as mandatory.
- **Type-error fix was not a false concession:** After the edit, the AI wrote, “The original type was logically valid and the production build already understood it. The change mainly removes ambiguity for the editor.” The student had reported an editor diagnostic, not a claim that the production build was failing. No case appears of the AI agreeing with an incorrect student challenge.

## 5. Performativity (preliminary)

The stronger questions name files, hooks, and a future task: `CourseWorkspace` versus `CourseDetailPage`, session expiry, `useRef`, SCRUM-75 streaming, the `ChatStatus` text in `chat.ts`, and `available` on `ChatReference`. Many other turns are direct build instructions or requests to explain work just completed. The design and integration questions are specific to this workspace. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV Score-Row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
,Aashish Dhital,SCRUM-103 — Course workspace and Pandu chat,2,3,3,2,14,7,4,2,2,0,0,2026-10-24
```
