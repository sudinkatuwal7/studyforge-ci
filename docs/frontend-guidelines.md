# Frontend Guidelines

StudyForge frontend code should talk to the backend through a shared API layer, not through ad hoc `fetch` calls in UI components.

```text
React Component
      ↓
Feature API module
      ↓
Shared HTTP client
      ↓
Django API
```

## Folder responsibilities

| Folder | Responsibility |
|---|---|
| `pages/` | Page-level screens and coordination |
| `components/` | Reusable UI |
| `api/` | Backend communication |
| `types/` | TypeScript API / domain contracts |
| `context/` | Shared application state |
| `routes/` | Routing and protected route behavior |

Future API calls should live under `src/api/`.

Future TypeScript request and response interfaces should live under `src/types/`.

The backend base URL comes from environment configuration:

```text
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Copy `frontend/.env.example` to `frontend/.env` for local development. Do not commit `.env` files.

## Rules

- Use TypeScript.
- Use functional React components.
- Avoid `any`.
- Do not hard-code backend URLs.
- Do not place random API calls throughout UI components.
