# Git Workflow

StudyForge uses short-lived feature branches that map to Jira tasks.

```text
main
 ↓
feature/STUD-XX-description
 ↓
Pull Request
 ↓
main
```

Do not use permanent domain branches such as:

```text
feature/users
feature/courses
feature/documents
```

One Jira task should normally equal one branch.

## Branch examples

```text
feature/STUD-12-jwt-login
feature/STUD-18-create-course-api
feature/STUD-24-document-upload-backend
```

## Starting work

```bash
git switch main
git pull origin main
git switch -c feature/STUD-XX-short-description
```

## Finishing work

```bash
git add .
git commit -m "feat: concise description"
git push -u origin feature/STUD-XX-short-description
```

Then open a Pull Request into `main`.

After that task is merged, start the next branch from the newest `main`.
