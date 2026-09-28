import { API_BASE_URL } from "./client";
import type { StudyGuide } from "../types/studyGuide";

export class StudyGuideError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "StudyGuideError";
    this.status = status;
  }
}

/**
 * Generate (or regenerate) the study guide for one document.
 *
 * The backend persists the result, so calling this twice replaces the
 * guide rather than creating a second one.
 */
export async function generateStudyGuide(
  documentId: number,
  accessToken: string,
): Promise<StudyGuide> {
  if (!API_BASE_URL) {
    throw new StudyGuideError("VITE_API_BASE_URL is not configured");
  }

  const response = await fetch(
    `${API_BASE_URL}/documents/${documentId}/study-guide/`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (response.ok) {
    return (await response.json()) as StudyGuide;
  }

  // Turn status codes into something a student can act on.
  switch (response.status) {
    case 401:
      throw new StudyGuideError("Your session has expired. Sign in again.", 401);
    case 404:
      throw new StudyGuideError("That document could not be found.", 404);
    case 409:
      throw new StudyGuideError(
        "This document is still processing. Try again once it is ready.",
        409,
      );
    default:
      throw new StudyGuideError(
        "Notes could not be generated right now. Please try again.",
        response.status,
      );
  }
}