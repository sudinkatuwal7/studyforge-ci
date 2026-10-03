import { ApiError, request } from "./client";
import type { StudyGuide } from "../types/studyGuide";

/**
 * Two different problems share status 409 on this endpoint, so the status
 * alone cannot pick a message. Carrying the backend's `code` lets the UI
 * word them apart without the API layer deciding what the student reads.
 */
export class StudyGuideError extends ApiError {
  code: string;

  constructor(status: number, code: string) {
    super(status);
    this.name = "StudyGuideError";
    this.code = code;
  }
}

export async function generateStudyGuide(
  documentId: number,
  accessToken: string,
  signal?: AbortSignal,
): Promise<StudyGuide> {
  const response = await request(
    `/documents/${documentId}/study-guide/`,
    { method: "POST", signal },
    accessToken,
  );

  if (response.ok) return (await response.json()) as StudyGuide;

  let code = "";
  try {
    const body = (await response.json()) as { code?: string };
    code = body.code ?? "";
  } catch {
    // A proxy error or a server crash returns HTML, not JSON. An empty code
    // is correct here — the caller falls back to a status-based message.
  }

  throw new StudyGuideError(response.status, code);
}