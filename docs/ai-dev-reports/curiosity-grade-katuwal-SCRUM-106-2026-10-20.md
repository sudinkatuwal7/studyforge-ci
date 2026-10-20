# Curiosity Grade

## Executive summary
The report captures a discussion about SCRUM-106’s multi-format upload and extraction design, including metadata, validation, chunk context, callback limits, content coverage, and how the architecture might accommodate future formats. The student’s questions repeatedly asked for concrete verification and surfaced potential correctness and reliability risks, particularly context loss during chunking and the mismatch between the upload limit and callback size limit. The report records one test-collection failure caused by missing Django in the active environment; the student did not report or follow up on that failure.

## Curiosity rubric

### (i) Clarification / requests for detail — 2
> “for pptx how are we working like are we only extracting the visible text boxes or is there a chance that we can miss the important text inside the table or shapes?” — Student turn 7

This asks for a concrete account of extraction behavior and its limits, engaging substantively with the implementation. Ungraded event count: **6**.

### (ii) Challenge / skepticism — 3
> “Since all three formats use the same chunker, can we check if DOCX headings or PPTX slide context can actually get lost when the text gets split?” — Student turn 5

The student asks to verify a specific potential failure rather than accept a general explanation; the check found later chunks could lack the structural marker. Ungraded event count: **5**.

### (iii) Why / tradeoffs — 3
> “If we add more file types later, does using the stored extension start becoming a bad design? Like at what point would adding a real document type field be worth it?” — Student turn 4

This probes a decision threshold and the tradeoff between current simplicity and future maintainability, rather than asking only whether a field exists. Ungraded event count: **6**.

### (iv) Error-response behavior — 3
> “we allow the uploads till 20 mib but is not the callback result limit is smaller?what happens if the docx or pptx uploads successfully but creates lots of chunks and embeddings to fit in the callback? what do you say” — Student turn 6

The student identifies a possible cross-component limit conflict and asks about its operational consequence. The student also explicitly requested verification of possible context loss in turn 5. These are proactive probes of potential failures, rather than a back-and-forth after a reported error.

Error episodes: **2 (PROBED 2, ACCEPTED 0, LOOPED 0)**. The report’s Section 3 also lists a pytest collection failure, but it was reported by the assistant, not the student, and did not receive a student response; it is not counted as a student error-response episode.

## Notes for the grader (neutral)
Curiosity concentrated on verifying whether metadata and extraction behavior could mislead downstream features or omit important study content, plus weighing future design choices. The student asked for implications and scope/prioritization guidance. No implementation change was requested or performed in this session. The student did not respond to the reported test-environment failure.

## AI Sycophancy — No grade impact.
No flattery or over-praise is evident in the report. There is no clear instance of the AI caving to an incorrect student challenge. The assistant’s agreement that the callback limits could cause valid uploads to fail is supported by the inspected service and backend limits described in the report. The assistant’s earlier answer that PPTX tables were not explicitly extracted is followed later in the report by inspection showing table extraction and tests; the report does not record an explicit acknowledgment of that change or correction.

## Performativity (preliminary)
The questions are specific to implementation details and consequences, including a request to verify an actual chunk-boundary behavior and a cross-service callback-size concern. This is a preliminary signal, not a definitive judgment of intent.

## CSV score-row
```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
oeo36,Sudin Katuwal,SCRUM-106 — Implement Multi-Format Upload & Text Extraction,2,3,3,3,6,5,6,2,2,0,0,2026-10-20
```
