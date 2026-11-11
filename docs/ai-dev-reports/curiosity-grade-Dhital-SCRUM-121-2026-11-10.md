# Curiosity Grade — Dhital, SCRUM-121 (2026-11-10)

- Report graded: `curiosity-report-Dhital-SCRUM-121-2026-11-10.md`
- Student: Aashish Dhital (`wor21`)
- Assignment: SCRUM-121 — Pandu agent architecture design
- Self-context (ungraded): blank

## 1. Executive summary

The student designed the Pandu tool-calling agent architecture and recorded it in `docs/architecture/pandu-agent.md` (linked from `docs/architecture.md`). The session covers tool inventory from a handwritten sketch, ownership rules, `ConversationMessage` memory, JSON replies, hybrid scope checking, document-selection policy, and per-tool I/O contracts. Curiosity shows up as pushback on calendar tools, browser vs DB memory, package boundaries, Gemini vs fixed rules / hybrid tradeoffs, retrieval vs citations, send-button UX, and failure modes. No product error/test-failure episodes were indexed. The student reported discussing the response format with Nischal and planned team review.

## 2. Curiosity rubric

Four raw scores (no composite): **(i) 3 · (ii) 3 · (iii) 3 · (iv) N/A**

### (i) Clarification / requests for detail — **3**

- **Evidence (student turn after DB-access explanation):** “so the pandu agent tool does not access the db?”
- **Evidence (later):** “What happens if document retrieval fails? Can Pandu still answer without citations?”
- **Evidence:** “how idoes the agent determine that its out of context?”
- **Depth:** Best instances are consequential clarifications that pin down failure modes and the model-vs-handler DB distinction, not bare “explain more.” The retrieval/citations question forces the SCRUM-23 vs empty-evidence split.
- **Events (ungraded count):** 14

### (ii) Challenge / skepticism [PRIORITY] — **3**

- **Evidence:** “why is Calendar / study sessions necessary? i would rather not have that , i think its overengineering”
- **Evidence:** “and sicne we are changing pandu into an tool calling agent why is it necessary can we just change and move it into the agent folder ?”
- **Evidence:** “are we done? i have already discussed with nischal” (with Jira acceptance criteria pasted)
- **Depth:** Calendar pushback tests the AI’s “add calendar because README lists it” claim and redirects the design (calendar removed from v1). Package-move challenge tests domain-boundary advice. Done-check against Jira ACs verifies completeness rather than accepting an implied finish.
- **Events (ungraded count):** 5
- **Supporting evidence:** Evidence Appendix shows codebase/docs inspection grounding the design; no student-run test suite (design-doc task).

### (iii) Why / tradeoffs — **3**

- **Evidence:** “isnt it a better practice to keep it in brwser memory and not have. a seperate db for context,whats the industry oractice?”
- **Evidence:** “Should we implement database storage now instead of migrating later?”
- **Evidence:** “is this better than having fixed set of rules?” / “lets make it a hybrid aproach ? give me the pros and cons”
- **Depth:** Explicit industry-practice and now-vs-later tradeoffs, plus Gemini vs fixed vs hybrid comparison with requested pros/cons — weighs real architecture choices, not only how-to steps.
- **Events (ungraded count):** 6

### (iv) Error-response behavior [PRIORITY] — **N/A — no error episodes (no opportunity to observe)**

- Section 3: “None observed.” Ask-mode edit blocks are mode limits, not product bugs/failing tests.
- **Error episodes:** 0 (PROBED 0, ACCEPTED 0, LOOPED 0)

## 3. Notes for the grader (neutral)

Curiosity concentrated on architecture tradeoffs (memory placement, scope classification, calendar scope, package boundaries) and on clarifying agent failure/selection semantics. Large stretches are implementation direction (“make the md file,” “update in the md file,” “do both and explain each”) after agreements were reached — description of workflow style, not a fault. Self-context field is blank and does not affect scores.

## 4. AI Sycophancy — No grade impact, for your awareness

- No heavy flattery patterns noted (“Great question!” / “Excellent point!” style praise absent from the condensed AI turns).
- **Held ground (positive):** On moving `conversations` under `agent/`, the AI kept the domain-boundary position (“No. Keep separate…”) after the student argued for relocating.
- **Correct reverse under correct challenge (positive):** After the student called calendar tools over-engineering, the AI dropped them from v1 — consistent with README-as-wishlist, not an incorrect cave.
- **No observed case** of the AI caving to an *incorrect* student technical claim in this report.

## 5. Performativity (preliminary)

Questions are specific to StudyForge artifacts (JWT/ownership, SCRUM-23, `conversations` vs `agent/`, README calendar bullet, send-button/`document_ids`, Jira ACs). They change design decisions (no calendar; hybrid scope; DB messages; doc-selection policy). This does not look like generic filler questioning.

*This is a preliminary signal, not a definitive judgment of intent.*

## 6. CSV score-row

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
wor21,Aashish Dhital,SCRUM-121 — Pandu agent architecture design,3,3,3,NA,14,5,6,0,0,0,0,2026-11-10
```
