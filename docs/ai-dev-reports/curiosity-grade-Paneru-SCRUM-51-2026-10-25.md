# Curiosity Grade

- Report graded: `curiosity-report-Paneru-SCRUM-51-2026-10-25.md`
- Student: Gaurav Paneru (gqq14)
- Assignment: SCRUM-51, part 1: quiz scoring backend
- Session date: 2026-10-25

## 1. Executive Summary
The student set out a three-PR workflow for two interdependent tasks (SCRUM-45 and
SCRUM-51). They asked the AI to check that the workflow was accurate, build the
SCRUM-51 backend, and explain why and how it made its decisions. The AI built the
models, scoring service, submit and results endpoints, and 28 tests. It committed
the work and pushed it to GitHub, where CI passed.

Over about 7 turns, the student asked three follow-up questions:
- whether the venv changes would be pushed
- why `python-docx` was missing despite a rebase
- for an explanation of each file

They also questioned a 5-file commit, which led the AI to restructure it into three
commits. Later they reported that deleting the backup branch had not removed the old
commits, and asked the AI to fix it. The report covers only part of SCRUM-51; the
frontend work is outside this session.

## 2. Curiosity Rubric (four raw numbers, no composite)

### (i) Clarification / requests for detail — **2**
- Evidence (STUDENT turn 2, Q3): "Explain each files on what each class and function does."
- Evidence (STUDENT turn 4): "For a single commit 743cac, 5 files are changed. Explain your commit."
- Justification: Both requests ask for more detail about specific artifacts the AI
  produced. The commit request follows up on a particular earlier output instead of
  asking for general help. Both are substantive, but neither on its own tests a claim.
- Events (ungraded): 2

### (ii) Challenge / skepticism [PRIORITY] — **2**
- Evidence (STUDENT turn 2, Q1): "requirements-dev.txt on the venv will not be pushed right? venv is inside .gitignore, right?"
- Evidence (STUDENT turn 2, Q2): "Why backend/venv was missing python-docx if I already rebased my branch and is at the top?"
- Justification:
  - Q1 checks a side effect of the AI's action, the venv install, against the
    student's own understanding of `.gitignore`.
  - Q2 sets the AI's diagnosis against the student's belief that a rebased branch
    should already be complete. That makes the AI justify its claim.
  - Both engage the AI's reasoning. Neither exposed an AI error: the AI's claims held
    up. That makes them substantive rather than incisive.
- Supporting evidence: the student checked the outcome themselves. In turn 5 they had
  tried deleting the backup branch and noticed the old commits were still visible.
- Events (ungraded): 3

### (iii) Why / tradeoffs — **3**
- Evidence (STUDENT turn 4): "You are free to make 2/3 separate commits if thats better."
- Evidence (STUDENT turn 1): "Also explain why and how you came up with those decisions."
- Justification: The turn-4 question raises a real tradeoff: one cohesive commit
  against several commits that each map to a criterion. It leaves the decision open
  ("if thats better") instead of dictating it. It **redirected the work**: the AI
  agreed the commit was too broad and rebuilt it as three commits. Turn 1 asks for
  the *why* behind the design up front, not only the *how*.
- Events (ungraded): 2

### (iv) Error-response behavior [PRIORITY] — **2**
- Evidence (PROBED, STUDENT turn 2, Q2): "Why backend/venv was missing python-docx if I already rebased my branch and is at the top?"
- Evidence (ACCEPTED, STUDENT turn 5): "I tried to delete backup/SCRUM-51-before-split but the old commits still remain there. Can you delete the old commits and backup branch and keep the new final commits."
- Justification:
  - The `python-docx` episode was handled by asking *why*. That revealed the root
    cause: git tracks the requirements list, not the installed packages. The answer
    also gave the student a habit for the future.
  - The leftover-commits episode was reported with a request to fix it. The student
    did not ask why the commits persisted. The AI explained anyway.
  - With one probed episode and one accepted, the student engaged the reasoning in
    one of two cases.
- Error episodes: 2 (PROBED 1, ACCEPTED 1, LOOPED 0)
- Note: the AI also hit errors the student never raised: Docker not running, a
  missing module, a failed Bitbucket password prompt, and a blocked force push.
  These are not student episodes and are not scored.

## 3. Notes for the Grader (neutral)
- The student's curiosity focused on **repository and workflow mechanics**: what
  gets pushed, why dependencies drift, and commit granularity. They asked less about
  the domain design.
- The design decisions were the one-submission-per-quiz rule, allowing skipped
  answers, and revealing answers only through `/results/`. The student accepted these
  without follow-up after asking for the reasoning up front. The AI flagged the
  skipped-answers choice as easy to change; the student did not take it up. This may
  mean the student agreed with the decisions, not that they lacked curiosity.
- The AI raised the workflow risk unprompted: rebasing after a squash merge.
- The last turn (asking for this report "to be on safe side") is administrative and
  was not counted as a curiosity event.

## 4. AI Sycophancy — No grade impact, for your awareness
- **Flattery / over-praise:** none observed. The AI's replies are factual.
- **Caving to an incorrect challenge:** none observed.
- **Correctly holding ground:** on Q2 the AI kept its diagnosis (the venv is not
  updated by a rebase) and backed it with commit evidence (`3ff83a7`, SCRUM-106,
  2026-10-22), instead of accepting the premise that a rebased branch must be complete.
- **Correct reversal under a correct challenge:** on the 5-file commit the AI agreed
  its own grouping was "too broad" and restructured it. This was an appropriate
  response to a valid prompt, not capitulation. The AI showed the final code was
  unchanged (`git diff` was empty).

## 5. Performativity (preliminary)
The questions are specific and tied to concrete artifacts: a named commit hash
(`743cac`), a named package, a named branch and a `.gitignore` rule. Each one changed
what happened next. The questioning looks substantive rather than for show.
*This is a preliminary signal, not a definitive judgment of intent.*

## 6. CSV Score-Row
```csv
student_id,student_name,assignment,dim_i,dim_ii,dim_iii,dim_iv,events_i,events_ii,events_iii,err_episodes,probed,accepted,looped,date
gqq14,Gaurav Paneru,SCRUM-51 (part 1 backend),2,2,3,2,2,3,2,2,1,1,0,2026-10-25
```
