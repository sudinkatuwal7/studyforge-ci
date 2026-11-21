import { request } from "./client";
import type { CourseNotes, CourseNotesSummary, NotesChanges, NotesOptions } from "../types/notes";

/**
 * Carries the backend's `code` next to the HTTP status, the same split
 * quizzes.ts uses: the API layer reports what went wrong and the UI decides
 * what the student reads. `code` is "" for plain DRF errors with no code.
 * `detail` is the backend's explanation of a rejected edit, or "" when there
 * is none: a structure rule from NOTES_INVALID_CONTENT, or the title's error.
 */
export class NotesRequestError extends Error {
  status: number;
  code: string;
  detail: string;

  constructor(status: number, code = "", detail = "") {
    super(`Notes request failed with status ${status}`);
    this.name = "NotesRequestError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function readError(response: Response): Promise<NotesRequestError> {
  let code = "";
  let detail = "";
  try {
    const body = (await response.json()) as { code?: unknown; detail?: unknown; title?: unknown };
    if (typeof body.code === "string") code = body.code;
    if (typeof body.detail === "string") detail = body.detail;
    else if (Array.isArray(body.title) && typeof body.title[0] === "string") detail = body.title[0];
  } catch {
    // A proxy error or server crash returns HTML. An empty code is right
    // here: callers fall back to a status-based message.
  }
  return new NotesRequestError(response.status, code, detail);
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  throw await readError(response);
}

// POST /courses/{id}/notes/. Slow (it calls the LLM) and not idempotent, so
// callers must never retry it automatically: each success saves new notes.
export async function generateNotes(
  courseId: number,
  documentIds: number[],
  options: NotesOptions,
  accessToken: string,
  signal?: AbortSignal,
): Promise<CourseNotes> {
  return readJson<CourseNotes>(
    await request(
      `/courses/${courseId}/notes/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the fixed option values are sent; the student never types prompt text.
        body: JSON.stringify({ document_ids: documentIds, ...options }),
        signal,
      },
      accessToken,
    ),
  );
}

export async function getNotes(notesId: number, accessToken: string, signal?: AbortSignal): Promise<CourseNotes> {
  return readJson<CourseNotes>(await request(`/notes/${notesId}/`, { signal, cache: "no-store" }, accessToken));
}

// GET /notes/, newest first. Without a course, every course's notes.
export async function listNotes(
  accessToken: string,
  courseId?: number,
  signal?: AbortSignal,
): Promise<CourseNotesSummary[]> {
  const query = courseId === undefined ? "" : `?${new URLSearchParams({ course: String(courseId) })}`;
  return readJson<CourseNotesSummary[]>(await request(`/notes/${query}`, { signal, cache: "no-store" }, accessToken));
}

// PATCH /notes/{id}/ with only the changed fields. The backend checks edited
// content with the same rules as generated notes and returns the saved notes.
export async function updateNotes(
  notesId: number,
  changes: NotesChanges,
  accessToken: string,
  signal?: AbortSignal,
): Promise<CourseNotes> {
  return readJson<CourseNotes>(
    await request(
      `/notes/${notesId}/`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
        signal,
      },
      accessToken,
    ),
  );
}

// DELETE /notes/{id}/. A 404 is reported like any failure; the UI decides
// whether notes already gone (deleted in another tab) count as deleted.
export async function deleteNotes(notesId: number, accessToken: string, signal?: AbortSignal): Promise<void> {
  const response = await request(`/notes/${notesId}/`, { method: "DELETE", signal }, accessToken);
  if (!response.ok) throw await readError(response);
}
