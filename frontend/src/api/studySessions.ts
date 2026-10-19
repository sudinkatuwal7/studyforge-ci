import { ApiError, getJson, postJson, request } from "./client";
import type {
  CreateStudySessionInput,
  StudySession,
  UpdateStudySessionInput,
} from "../types/studySession";

function requireAccessToken(accessToken: string | null): string {
  if (!accessToken) throw new Error("Log in to manage your study sessions.");
  return accessToken;
}

export async function listStudySessions(accessToken: string | null): Promise<StudySession[]> {
  return getJson<StudySession[]>("/study-sessions/", requireAccessToken(accessToken));
}

export async function getStudySession(
  accessToken: string | null,
  sessionId: number,
): Promise<StudySession> {
  return getJson<StudySession>(`/study-sessions/${sessionId}/`, requireAccessToken(accessToken));
}

export async function createStudySession(
  accessToken: string | null,
  input: CreateStudySessionInput,
): Promise<StudySession> {
  // Preserve the caller's creation key; both a new save and a matching retry return a session.
  return postJson<StudySession>("/study-sessions/", input, requireAccessToken(accessToken));
}

export async function updateStudySession(
  accessToken: string | null,
  sessionId: number,
  changes: UpdateStudySessionInput,
): Promise<StudySession> {
  const response = await request(
    `/study-sessions/${sessionId}/`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Omitted fields stay unchanged; an explicit null clears the optional time.
      body: JSON.stringify(changes),
    },
    requireAccessToken(accessToken),
  );
  if (!response.ok) throw new ApiError(response.status);
  return (await response.json()) as StudySession;
}

export async function deleteStudySession(
  accessToken: string | null,
  sessionId: number,
): Promise<void> {
  const response = await request(
    `/study-sessions/${sessionId}/`,
    { method: "DELETE" },
    requireAccessToken(accessToken),
  );
  if (!response.ok) throw new ApiError(response.status);
  // DELETE returns 204 with no JSON body to parse.
}
