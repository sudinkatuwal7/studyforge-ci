import { request } from "./client";
import type { Quiz, QuizAnswer, QuizLength, QuizResult } from "../types/quiz";

/**
 * Carries the backend's `code` (for example DOCUMENT_NOT_READY) next to the
 * HTTP status, the same split studyGuide.ts uses: the API layer reports what
 * went wrong and the UI decides what the student reads. `code` is "" for
 * plain DRF errors such as 404 or 400, which have no code.
 */
export class QuizRequestError extends Error {
  status: number;
  code: string;
  documentIds: number[];

  constructor(status: number, code = "", documentIds: number[] = []) {
    super(`Quiz request failed with status ${status}`);
    this.name = "QuizRequestError";
    this.status = status;
    this.code = code;
    this.documentIds = documentIds;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;

  let code = "";
  let documentIds: number[] = [];
  try {
    const body = (await response.json()) as { code?: unknown; document_ids?: unknown };
    if (typeof body.code === "string") code = body.code;
    if (Array.isArray(body.document_ids)) documentIds = body.document_ids.filter((id): id is number => typeof id === "number");
  } catch {
    // A proxy error or server crash returns HTML. An empty code is right
    // here: callers fall back to a status-based message.
  }
  throw new QuizRequestError(response.status, code, documentIds);
}

const jsonPost = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
});

// POST /courses/{id}/quizzes/. Slow (it calls the LLM) and not idempotent, so
// callers must never retry it automatically: each success saves a new quiz.
export async function generateQuiz(
  courseId: number,
  documentIds: number[],
  numQuestions: QuizLength,
  accessToken: string,
  signal?: AbortSignal,
): Promise<Quiz> {
  return readJson<Quiz>(
    await request(
      `/courses/${courseId}/quizzes/`,
      jsonPost({ document_ids: documentIds, num_questions: numQuestions }, signal),
      accessToken,
    ),
  );
}

export async function submitQuiz(
  quizId: number,
  answers: QuizAnswer[],
  accessToken: string,
  signal?: AbortSignal,
): Promise<QuizResult> {
  return readJson<QuizResult>(
    await request(`/quizzes/${quizId}/submit/`, jsonPost({ answers }, signal), accessToken),
  );
}

export async function getQuizResults(quizId: number, accessToken: string, signal?: AbortSignal): Promise<QuizResult> {
  return readJson<QuizResult>(await request(`/quizzes/${quizId}/results/`, { signal, cache: "no-store" }, accessToken));
}

// GET /quizzes/{id}/. Never includes answers or explanations, even once submitted.
export async function getQuiz(quizId: number, accessToken: string, signal?: AbortSignal): Promise<Quiz> {
  return readJson<Quiz>(await request(`/quizzes/${quizId}/`, { signal, cache: "no-store" }, accessToken));
}
