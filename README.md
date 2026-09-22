# StudyForge

StudyForge is an AI-powered study platform for college students. This repository is the shared starting point for a 5-person team: a runnable Django backend, a runnable React frontend, and the architecture contracts the team will implement through Jira tasks.

## Local setup

### Backend

```bash
cd backend

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt

python manage.py migrate
python manage.py runserver
```

On Windows, activate the virtual environment with:

```bash
venv\Scripts\activate
```

### Frontend

```bash
cd frontend

npm install
npm run dev
```

Copy `frontend/.env.example` to `frontend/.env` before making API calls from the frontend. Do not commit `.env` files.

## Expected URLs

```text
Frontend:
http://localhost:5173

Backend:
http://localhost:8000

Health endpoint:
http://localhost:8000/api/v1/health/
```

## Git workflow

After cloning, update `main` and create a branch for your Jira task:

```bash
git switch main
git pull origin main
git switch -c feature/STUD-XX-short-description
```

See `docs/git-workflow.md` for the full convention.
