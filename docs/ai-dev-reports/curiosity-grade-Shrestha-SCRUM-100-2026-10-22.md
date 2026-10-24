# Curiosity Grade

## 1. Executive Summary

- Student: Sanish Shrestha
- Student ID: mpr92
- Assignment: SCRUM-100 — secure internal source-document retrieval
- Session date: 2026-10-22
- Report assessed: [SCRUM-100 AI chat / curiosity report](./curiosity-report-Shrestha-SCRUM-100-2026-10-22.md)

> Assessment provenance: this is a provisional Codex-generated application of the repository's curiosity rubric, not an official professor grade or output from the configured Copilot/Claude grader. No professor approval of provider equivalence was found. The assessment was generated in the same working session as the implementation/report and should receive independent human review. Scores below are qualitative judgments of quoted observable behavior, not imported SCRUM-20 scores, test-count measurements, or evidence of internal understanding. No professor-approved grader output is simulated.

The report contains 41 student messages and 84 user-visible AI messages about job-scoped source retrieval, service authentication versus student ownership, superseded jobs, safe storage errors, identifier handling, and local demo verification. The student repeatedly asked for scope-limited verification and later questioned why malformed IDs escaped JSON handling and whether secure retrieval was actually complete. Live processing failures and browser-login problems were investigated separately from automated test results. The rubric assesses what the student asked and challenged; actions executed by the AI or reported as manually completed are not silently attributed to the student's technical understanding.

## 2. Curiosity Rubric

### (i) Clarification / requests for detail — 2/3 (substantive)

**Evidence:** STUDENT 30 asks, “same api key for both? works where do i put it”. STUDENT 31 follows with, “where can i find the processing token”. STUDENT 24 asks, “what do you mean wher wil django run”, followed by the local-laptop deployment clarification in STUDENT 25. STUDENT 16 asks, “are the file storage failure handled propelry till here”.

**Depth justification:** These are concrete follow-ups about credential roles, deployment context, and the boundary of storage-error handling. The AI distinguishes a provider API key from a service-to-service token and local development from future production. The record supports substantive clarification, but does not show these questions independently establishing a new credential mechanism or a tested storage-recovery design.

**Ungraded event count:** 8 selected clarification turns: STUDENT 8, 16, 18, 24, 27, 28, 30, and 31. Selection is conservative and descriptive, not a score weight.

### (ii) Challenge / skepticism [PRIORITY] — 3/3 (incisive)

**Evidence:** STUDENT 9 asks to “Trace whether callers can fetch only files associated with authorized jobs, and distinguish service authentication from student ownership authorization” and to identify the smallest missing behavior. STUDENT 10 redirects the work with “make sure download endpoit rejects supeerseded jobs”. STUDENT 22 challenges the completion claim: “test for this / either this is completely done or not / if not what is left out and what is the solution you suggest”. STUDENT 18 asks why malformed IDs do not use JSON: “didnt our json did that”.

**Depth justification:** The questions test a consequential distinction between authentication, job/file correlation, and authorization rather than accepting “secure” as a complete explanation. The resulting inspection corrects an overstrong authorization description and the approved stale-job regression records 200 where 409 was required before the guard. The later acceptance-criterion challenge also forces a distinction between mocked integration, local protected retrieval, and production/separate-service claims. This supports an incisive instance without claiming the student independently discovered an exploit or wrote the test.

**Supporting verification:** The evidence records the failing superseded-job regression, subsequent passing tests, 267 document-suite tests/45 subtests, 56 focused tests/12 subtests, and a live protected-byte download. These support verification of AI claims; none is an additional rubric dimension or proof of successful live Gemini processing.

**Ungraded event count:** 4 selected challenge turns: STUDENT 9, 18, 22, and 38. STUDENT 10 supplies the consequential follow-up to STUDENT 9 rather than being counted again. Detailed implementation directives elsewhere are not automatically counted as independent skeptical questions.

### (iii) Why / tradeoffs — 2/3 (substantive)

**Evidence:** STUDENT 18 asks, “malformed routes ID do not use json why is taht / didnt our json did that”, after listing worker recovery, transport, and mid-stream storage as unresolved concerns. STUDENT 8 asks, “why is it faiing and why did it not matter before”.

**Depth justification:** The malformed-ID question specifically probes the discrepancy between an earlier JSON-handling claim and the URL resolver's actual boundary. The AI explains why view-level JsonResponse handling cannot cover IDs rejected before dispatch. The failure question elicits a distinction between fail-closed authentication and a missing individual revocation feature. These are substantive causal questions; the transcript does not show the student explicitly comparing measured alternatives for buffering/streaming or worker-recovery design, so an incisive tradeoff score is not inferred from the AI's own explanation.

**Ungraded event count:** 2 selected causal turns: STUDENT 8 and 18. Overlap with other dimensions is descriptive and is not arithmetic weighting.

### (iv) Error-response behavior [PRIORITY] — 2/3 (substantive)

**Evidence:** For the unexpected malformed-ID JSON behavior, STUDENT 18 asks “why is taht” and “didnt our json did that” before approving later changes. For failed live uploads, STUDENT 38 responds, “status is failed / gemini key in legit”, challenging the first interpretation; the AI checks current worker-loaded values and Google's error reason instead of treating a running container as successful processing.

**Depth justification:** At least one error-response sequence asks for a concrete causal explanation, and another challenges a diagnosis and prompts verification against current evidence. Other episodes are predominantly how-to/restart requests. The bare assertion that a key is legitimate does not establish that Google accepted it; the report records the contrary API_KEY_INVALID result. This supports substantive probing without inventing an independent student root-cause analysis.

**Error episodes: 5 (PROBED 2, ACCEPTED 3, LOOPED 0).**

| Assessed episode | Classification | Observable response and boundary |
|---|---|---|
| Initial Python/test-environment mismatch (report Episode 1) | ACCEPTED | STUDENT 5 asks how to run the test; STUDENT 6 reports a pass. The record shows adoption of the provided workflow, not a question about the cause or an independently captured terminal result. |
| Unexpected malformed-ID JSON behavior (report Episode 4) | PROBED | STUDENT 18 asks why existing JSON handling did not apply, then later approves the bounded route/view change. |
| Demo configuration/credential startup blockers (report Episode 5) | ACCEPTED | STUDENT 27–32 asks where to place/generate credentials and reports completion. These clarify how to configure the recommended setup; no separate challenge of its diagnosis is recorded. |
| Gemini-backed processing failures (report Episode 7) | PROBED | STUDENT 37 reports nonprocessing uploads and STUDENT 38 challenges the key diagnosis. STUDENT 39–40 then requests restarts. These remain one provider-failure episode; no repeated unverified code-fix loop is inferred. |
| Browser sign-in failure (report Episode 8) | ACCEPTED | STUDENT 35 reports “its invalid what”; after the hostname diagnosis STUDENT 36 requests the restart. This is a failure report followed by accepting the first remedy, not a specific causal/alternative question. |

The fail-closed terminology misunderstanding (report Episode 2) is retained as clarification rather than scored as a broken implementation. The stale-job failing test (Episode 3), egress approval (Episode 6), unavailable Git tools (Episode 9), and helper errors (Episode 10) have no clear student immediate reaction warranting a separate tally entry. Absence of such a reaction is not automatically ACCEPTED. Restart requests after a credential update are not, by themselves, evidence of LOOPED behavior.

**Four raw scores:** (i) 2, (ii) 3, (iii) 2, (iv) 2. No sum, average, weighting, composite, or course letter grade is calculated.

## 3. Notes for the Grader (neutral)

Questioning concentrates on security/completion claims, JSON routing boundaries, credential separation, and interpreting failed live processing. The student sets approval gates, file limits, and no-Git constraints; these document workflow control but do not establish unseen testing or understanding. Only the captured text and supporting tools are assessed. Imperfect spelling and brief responses remain intact rather than being rewritten as stronger questions.

Technical scope matters: the secure download endpoint and focused/document regressions were exercised, but the actual provider-backed pipeline reached FAILED and the latest post-key-change restart proves availability only. No new application coding is currently required for the approved endpoint increment; production transport/storage deployment, durable worker recovery, and a successful live READY outcome remain outside what the report verifies. The user clarified that the immediate target is a laptop demo.

The report excludes guardian copies, hidden reasoning, and environment-only messages; it retains the authentic main-session wording and records its snapshot boundary. Appendix excerpts are explicitly shortened, some source outputs were already truncated, and completeness outside the captured rollout is not claimed. Student ID/name are consistent with the SCRUM-20 reference, while SCRUM-100 is confirmed by branch metadata and the current explicit request. Codex used the repository rubric; neither configured grader-provider equivalence nor professor review is established. These limitations must remain visible on submission.

## 4. AI Sycophancy — No grade impact, for your awareness

AI 12 says, “Great—the test run passed, as you confirmed.” This is mild positive acknowledgment of a user-reported pass, not recovered test output or evidence of the student's understanding. The report's appendix preserves that distinction.

AI 17 corrects its own earlier claim: “My earlier description of the job route as ‘authorizing the job’ was too strong: it authenticates the service and resolves the association.” This is a correction under a substantive authorization-boundary inquiry, not agreement with an unsupported security conclusion.

After the student's key challenge, AI 77 states, “Google returned **API_KEY_INVALID — ‘API key not valid.’**” (formatting normalized in this quotation) and distinguishes the configured value from the legitimacy of the user's account/source. The AI does not capitulate by claiming that Google accepted the key. No dangerous caving to an incorrect student challenge is established by this exchange.

Some earlier AI statements remain overbroad. AI 32 says a mid-stream failure will be classified as retryable, whereas AI 35 later explains that a truncated body without a read exception can instead become a permanent digest mismatch. AI 36 proposes short-read protection but its listed files omit the production fetch client; AI 41 correctly leaves that change unimplemented within the subsequently approved scope. These are accuracy/scope limitations, not grounds to award or deduct student curiosity points, and the report must not silently rewrite them.

## 5. Performativity (preliminary)

The questions refer to concrete implementation and runtime observations: which job may release bytes, why JSON did not cover malformed paths, what a passing test proves, and whether the workers or provider caused upload failure. Some turns are concise confirmations or implementation directives; these are not automatically treated as probing. The record supports specific engagement without inferring the student's motives, independent preparation, or internal understanding. This is a preliminary signal, not a definitive judgment of intent.

## 6. CSV score-row

Provisional Codex assessment only, not an official Canvas award. Counts are descriptive; the four scores match the judgments above.

```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
mpr92,Sanish Shrestha,SCRUM-100,2,3,2,2,8,4,2,5,2,3,0,2026-10-22
```
