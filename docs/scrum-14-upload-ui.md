# SCRUM-14: PDF upload and status UI

`DocumentUpload` accepts an existing course ID and uses the shared `AuthProvider`.
Course creation and dashboard selection remain in the courses domain.

```tsx
import DocumentUpload from "./components/documents/DocumentUpload";

// Inside the authenticated course screen:
<DocumentUpload courseId={selectedCourse.id} />
```

The component has its own scoped styles and does not modify the course form,
login screen, application layout, or global stylesheet.

## Behavior

- Select one nonempty `.pdf` file, up to 20 MiB inclusive. The backend remains
  authoritative for PDF structure, encryption, authentication, and ownership.
- Upload one `file` part with the current Bearer token. The browser sets the
  multipart boundary. Upload requests are never automatically repeated.
- Show the saved filename and status. Poll every two seconds after the preceding
  request finishes while `PENDING` or `PROCESSING`; stop at `READY` or `FAILED`.
- Keep the last known status during connection failures. Pause after three
  consecutive failures; an explicit refresh resumes status checks.
- Stop on authentication/access failures and document `404`. Authentication
  recovery belongs to the shared auth flow; this component does not refresh tokens.
- For saved-upload `503` responses, preserve the returned document ID and offer
  **Refresh status**. Do not assume an uncertain handoff means processing failed.
- Abandon timers and abort/ignore outstanding requests when changing courses,
  accounts, documents, or unmounting, including React Strict Mode cleanup.
- Starting another upload switches the tracked document. Document listing,
  rename, delete, and processing implementations are outside SCRUM-14.

## Development preview

Run the existing backend, PostgreSQL, Redis, and processing worker. Set the
ignored `frontend/.env` API URL to the running backend. Start Vite, then open:

```text
http://localhost:5173/upload-preview.html?courseId=<owned-course-id>
```

Sign in through the existing login form. Use a local test account and a course
owned by that account. You can also open `/upload-preview.html` without a query
parameter, enter the course ID on the page, and select **Open upload form**.
No credentials or fixed course IDs are stored in source.
The preview is a separate development entry; the normal app and production build
continue to use `index.html`. The normal course screen will display the uploader
when its owner integrates the component as shown above.

## Checks

From `frontend`:

```text
npm test
npm run build
npm run lint
```

Tests exercise upload validation and multipart/auth headers, saved-upload errors,
terminal and transient polling states, manual recovery, and stale-request cleanup.
Live processing still depends on the shared backend and worker implementation.

Verified locally: 28 automated tests pass, the TypeScript/production build passes,
and lint reports only the existing Fast Refresh warning in `AuthContext.tsx`.
A browser check using the temporary account and an owned course confirmed login,
HTTP 201 upload, and polling through to `READY`. The preview was also checked at
390px width without horizontal overflow. The processing fixture PDF needed to be
rewritten into a valid temporary PDF for upload because its original reference
table is rejected by strict upload validation; the repository fixture is unchanged.
