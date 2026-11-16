# SCRUM-22 Real PR Review Feedback

## Reviewer

Sudin Katuwal

## Task

SCRUM-22 --- Making Citations Optional

## What I Tested

I ran StudyForge using the `feature/SCRUM-22-making-citation-optional`
branch and tested the feature through the actual application.

I selected a processed document in a course, generated notes from it,
and asked Pandu a question related to the selected document.

I also ran the validation checks for the PR:

-   SCRUM-22 conversation API tests: **4/4 passed**
-   Full frontend tests: **370/370 passed**
-   Frontend production build: **passed**
-   Backend AI-learning tests: **273 tests and 269 subtests passed**
-   Django system checks: **passed**
-   Migration checks: **passed**
-   Git working tree: **clean**

## Issue Found

Even though all of the automated tests and build checks passed, Pandu
did not return the answer during my runtime test. The request resulted
in a **503 error**.

During debugging, I found a citation-validation case where the retrieved
document contains the correct information and the model can generate the
correct answer, but the citation can still be rejected because of a
whitespace formatting difference.

For example, the stored PDF text can contain:

``` text
the cycle time is
250 ps
```

while the model can return the same citation as:

``` text
the cycle time is 250 ps
```

These contain the same words, but the current citation validation
expects an exact literal substring. The newline/space difference can
therefore cause the citation to be rejected and the answer not to reach
the user.

## Requested Change

Please investigate the 503 runtime failure and make a small fix in this
PR if it is coming from the citation handling.

The fix should:

1.  Allow whitespace-only differences, such as spaces and PDF line
    breaks, when validating a citation against the same retrieved chunk.
2.  Keep citation validation strict for incorrect text, incorrect chunk
    IDs, incorrect documents, or other genuinely invalid citations.
3.  Check the citation repair behavior as well. Since SCRUM-22 makes
    citations optional, the repair path should be consistent with that
    behavior instead of unnecessarily losing an otherwise supported
    answer because an exact citation cannot be produced.
4.  Add or update a test for the whitespace/newline citation case so the
    runtime issue is covered.

## After the Change

Once the change is made, I will pull the updated branch and rerun the
same runtime test and relevant automated tests. If Pandu returns the
supported answer correctly and the tests still pass, I can complete the
review and approve the PR.
