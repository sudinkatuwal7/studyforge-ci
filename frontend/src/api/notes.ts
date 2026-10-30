import { request } from "./client";
import type { CourseNotes } from "../types/notes";

/**
 * Carries the backend's `code` next to the HTTP status, the same split
 * quizzes.ts uses: the API layer reports what went wrong and the UI decides
 * what the student reads. `code` is "" for plain DRF errors with no code.
 */
export class NotesRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code = "") {
    super(`Notes request failed with status ${status}`);
    this.name = "NotesRequestError";
    this.status = status;
    this.code = code;
  }
}

async function readNotes(response: Response): Promise<CourseNotes> {
  if (response.ok) return (await response.json()) as CourseNotes;

  let code = "";
  try {
    const body = (await response.json()) as { code?: unknown };
    if (typeof body.code === "string") code = body.code;
  } catch {
    // A proxy error or server crash returns HTML. An empty code is right
    // here: callers fall back to a status-based message.
  }
  throw new NotesRequestError(response.status, code);
}

// POST /courses/{id}/notes/. Slow (it calls the LLM) and not idempotent, so
// callers must never retry it automatically: each success saves new notes.
export async function generateNotes(
  courseId: number,
  documentIds: number[],
  accessToken: string,
  signal?: AbortSignal,
): Promise<CourseNotes> {
  return readNotes(
    await request(
      `/courses/${courseId}/notes/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_ids: documentIds }),
        signal,
      },
      accessToken,
    ),
  );
}

export async function getNotes(notesId: number, accessToken: string, signal?: AbortSignal): Promise<CourseNotes> {
  return readNotes(await request(`/notes/${notesId}/`, { signal, cache: "no-store" }, accessToken));
}
