# Authentication Flow and User Model

Status: design baseline for SCRUM-56. The endpoints and frontend behavior described here are not implemented by this document.

## Goals and scope

- Allow a student to create an account, sign in, and sign out.
- Protect authenticated API operations and frontend routes.
- Give each account ownership of its courses and, through them, its documents and notes.
- Keep authentication APIs under the versioned `/api/v1/` namespace.

Password reset, email verification, roles beyond the student account, and multi-factor authentication are outside this task unless separately agreed. Google sign-in was added later by SCRUM-114; see `docs/api-contract.md`.

## User account model

Use a project-owned custom user model extending Django's `AbstractUser`, configured through `AUTH_USER_MODEL` before creating migrations that depend on users. Use a unique, normalized email as the sign-in identifier. Retain Django's password hashing, authentication, and permission mechanisms. Do not store plaintext passwords or implement password hashing directly. The team should confirm this identity choice before the first migration because changing `AUTH_USER_MODEL` later is disruptive.

Proposed account data:

| Field | Rules |
|---|---|
| `id` | Django primary key |
| `email` | Required, normalized, unique; used to sign in |
| `username` | Remove it from the model if email-only identity is confirmed |
| `password` | Django-managed hash; never returned by an API |
| `first_name`, `last_name` | Optional profile fields inherited from `AbstractUser` |
| `is_active` | Django account status; inactive accounts cannot authenticate |
| `created_at`, `updated_at` | Add timestamps if the team wants the common schema fields on User |

The account is the owner of its courses through `Course.owner`. All course and downstream resource queries must be scoped to the authenticated user; knowing another user's object ID must not grant access.

## Token and session choice

Proposed API authentication is JWT access and refresh tokens, matching the planned `/auth/token/` and `/auth/token/refresh/` endpoints. The current backend requirements do not include a JWT package, so implementation requires the team to approve and pin a maintained JWT library (for example, `djangorestframework-simplejwt`) before adding these endpoints. Until that dependency and token storage policy are agreed, the token behavior below is a proposal.

- Access tokens are short-lived and sent as `Authorization: Bearer <access>` on protected API requests.
- Refresh tokens are longer-lived and used only to obtain a new access token.
- Prefer storing refresh tokens in `HttpOnly`, `Secure`, `SameSite` cookies; keep access tokens in memory where practical. Avoid persistent browser storage for bearer tokens because scripts running in the page can read it.
- If refresh tokens use cookies, configure CSRF protection for refresh and logout requests and set cookie flags appropriately for local development and production.
- Logout invalidates/revokes the refresh token where supported and clears its cookie. The frontend clears its in-memory access token and user state.
- Expired or invalid access tokens receive `401 Unauthorized`; authenticated users lacking permission receive `403 Forbidden`.

## Authentication flow

### Registration

1. Client submits email, password, and any agreed profile fields to `POST /api/v1/auth/register/` over HTTPS.
2. Server validates and normalizes the email, enforces password validation, creates an active user, and hashes the password through Django.
3. Return `201 Created` with a safe user representation. Never include password or token secrets in the response. Whether registration also signs the user in is an open decision; the safer initial contract is to require a separate login.
4. Duplicate email or invalid input returns `400 Bad Request` with field-level errors.

### Login and refresh

1. Client submits email and password to `POST /api/v1/auth/token/`.
2. On success, return an access token and establish the refresh-token cookie (subject to the agreed cookie policy). Return a safe user representation only if the response contract explicitly includes it.
3. Invalid credentials return a generic `401 Unauthorized` message that does not reveal whether an email exists.
4. When an API response is `401` because the access token expired, the shared frontend API layer makes one refresh request to `POST /api/v1/auth/token/refresh/`, then retries the original request once.
5. If refresh fails, clear client authentication state and route the user to login. Do not retry indefinitely.

### Logout

Provide `POST /api/v1/auth/logout/` as a proposed endpoint so the server can revoke the refresh token and clear its cookie. The endpoint is not in the current API contract and must be added there when the team approves it. Client logout clears in-memory auth state and returns to the public login screen even if the network request fails.

## Proposed API request and response formats

All endpoints below are planned or proposed; only `GET /api/v1/health/` is currently implemented.

### Register

`POST /api/v1/auth/register/`

```json
{
  "email": "student@example.edu",
  "password": "a-long-user-chosen-password",
  "first_name": "Sam",
  "last_name": "Student"
}
```

Success (`201 Created`):

```json
{
  "user": {
    "id": 12,
    "email": "student@example.edu",
    "first_name": "Sam",
    "last_name": "Student"
  }
}
```

### Login

`POST /api/v1/auth/token/`

```json
{
  "email": "student@example.edu",
  "password": "a-long-user-chosen-password"
}
```

Proposed success response (`200 OK`):

```json
{
  "access": "<short-lived-access-token>",
  "user": {
    "id": 12,
    "email": "student@example.edu",
    "first_name": "Sam",
    "last_name": "Student"
  }
}
```

The refresh token is set as a cookie and omitted from JSON if the cookie-based policy is approved. If the team instead chooses JSON refresh tokens, revise this contract and document the browser storage and CSRF implications before implementation.

### Refresh

`POST /api/v1/auth/token/refresh/`

With the proposed cookie policy, the browser sends the refresh cookie automatically and the response contains a new access token:

```json
{
  "access": "<new-short-lived-access-token>"
}
```

### Logout

`POST /api/v1/auth/logout/` (proposed; requires adding to `docs/api-contract.md`).

Success: `204 No Content`, with the refresh cookie cleared. The request must satisfy the chosen CSRF policy.

### Error shape

Use DRF validation errors for invalid registration fields. Authentication failures should have a stable, non-revealing shape, for example:

```json
{
  "detail": "Invalid email or password."
}
```

## Frontend behavior

- Add public login and registration pages and an authenticated application area when those features are implemented.
- A protected route checks for an authenticated user and redirects unauthenticated visitors to login, preserving the intended destination for after login.
- Keep auth state in a typed React context or equivalent shared state. Do not put API calls directly in page or reusable UI components; use feature API modules and the shared HTTP client under `src/api/`.
- The shared client attaches the access token to protected requests and coordinates at most one refresh attempt for concurrent expired-token responses.
- On logout or unrecoverable refresh failure, clear auth state and navigate to login.
- Frontend route protection is for user experience only. The backend must independently authenticate and authorize every protected request.

## Security and operational requirements

- Use HTTPS outside local development.
- Apply Django password validators and generic login failure messages.
- Never log passwords, access tokens, refresh tokens, or authorization headers.
- Set production cookie flags (`Secure`, `HttpOnly`, and an appropriate `SameSite` value); configure allowed origins and CSRF trusted origins explicitly.
- Replace the bootstrap development secret key with environment configuration before deployment.
- Restrict account data returned by serializers to fields required by the client.

## Decisions recorded for the design baseline

1. Email is the sole unique sign-in identifier; username is omitted.
2. Registration creates the account and requires a separate login.
3. JWT access and refresh tokens are the intended API mechanism. The JWT package and browser refresh-token storage/CSRF details remain implementation dependencies to agree with the team.
4. Logout is part of the user-facing flow. Add `POST /api/v1/auth/logout/` to the shared API contract when implementing it.
5. Include `created_at` and `updated_at` on User to follow the common model fields in `docs/database-schema.md`.

## Implementation follow-through

Implementation should update `docs/api-contract.md`, create the custom user model before dependent migrations, add Django migrations, serializers and authentication views, add typed frontend API contracts and protected-route behavior, and cover the contract with tests. This design does not implement those features.
