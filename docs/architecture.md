# Architecture

StudyForge is a web application with a React frontend and a Django REST API backend.

```text
React + TypeScript
        ↓
REST API
        ↓
Django REST Framework
        ↓
Django ORM
        ↓
Database
```

The frontend talks to the backend only through the versioned REST API under `/api/v1/`. The backend uses Django REST Framework for request handling and Django ORM for persistence. The backend now uses PostgreSQL, configured through the `POSTGRES_*` process environment variables documented in `backend/.env.example`. SCRUM-9 verifies relational migrations on PostgreSQL; vector storage and processing remain separate work.

## Backend domain ownership

Backend apps under `backend/apps/` are ownership boundaries, not pre-built feature packages.

| Domain | Owner |
|---|---|
| `users` | Nischal |
| `courses` | Aashish |
| `documents` | Sudin |
| `processing` | Sanish |
| `knowledge` | Sanish |
| `notes` | Gaurav |

## Frontend ownership

Frontend work is organized by feature area rather than by matching backend folder names.

| Area | Owner |
|---|---|
| Authentication and Authorization | Nischal |
| Courses and Dashboard | Aashish |
| Document Upload and Status | Sudin |
| Processing and Knowledge Foundation | Sanish |
| Notes | Gaurav |

## Working agreements

- Domain folders represent ownership boundaries.
- Developers create their own files inside their domain when they start their Jira tasks.
- Developers should avoid modifying another developer's domain unnecessarily.
- Shared configuration should only be changed when necessary.
- Shared API contracts should be agreed before dependent features are implemented.
